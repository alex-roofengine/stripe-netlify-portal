// netlify/functions/outbound-client-charge-now.js
// One-time admin-initiated charge. Do NOT set `setup_future_usage` here.
// For saving a new card/bank for future use, use a SetupIntent flow separately.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

exports.handler = async (event) => {
  try {
    // Preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    let { customerId, paymentMethodId, amount, currency = 'usd', description, statementDescriptor } = body;

    // Basic validation
    if (!customerId || !paymentMethodId || amount == null) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: 'Missing customerId, paymentMethodId, or amount' }),
      };
    }

    // Amount normalizer:
    // - If amount is a reasonably large integer (>= 50), assume it's already in cents (e.g., UI sent 250000).
    // - Otherwise, treat as dollars and convert to cents.
    let amtNum = Number(amount);
    if (!Number.isFinite(amtNum)) {
      // try to strip symbols and retry
      amtNum = Number(String(amount).replace(/[$,\s]/g, ''));
    }
    const amountInCents = Number.isInteger(amtNum) && amtNum >= 50 ? amtNum : Math.round(amtNum * 100);
    if (!Number.isFinite(amountInCents) || amountInCents < 50) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid amount' }) };
    }

    // Retrieve PM to branch card vs ACH + basic ACH verification check
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm || pm.customer !== customerId) {
      // It can still be valid if attached as default; we’ll let Stripe enforce, but give an early hint
      // Not failing hard here; just an extra check you can tighten later if desired.
    }

    if (pm.type === 'us_bank_account') {
      const b = pm.us_bank_account || {};
      const rawStatus =
        b.status ||
        b.verification_status ||
        (b.financial_connections && b.financial_connections.verification_status) ||
        null;

      const verified =
        rawStatus === 'verified' ||
        rawStatus === 'instant_verified' ||
        rawStatus === 'succeeded';

      if (!verified) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: `Bank account not verified (status: ${rawStatus || 'unknown'})` }),
        };
      }
    }

    // Stripe statement descriptor must be <= 22 chars
    const sd = statementDescriptor ? String(statementDescriptor).slice(0, 22) : undefined;

    // Create & confirm (off_session). NOTE: No setup_future_usage here.
    // If authentication is required (card), Stripe will throw and we map that to a helpful message.
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency,
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        description: description || undefined,
        statement_descriptor: sd,
        payment_method_types: pm.type === 'us_bank_account' ? ['us_bank_account'] : ['card'],
        metadata: { portal: 'outbound' },
      }
      // Optional idempotency key can be added here for retried POSTs.
    );

    // Happy paths
    if (intent.status === 'succeeded') {
      const isACH = intent.charges?.data?.[0]?.payment_method_details?.type === 'us_bank_account';
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          ok: true,
          id: intent.id,
          status: intent.status,
          settlement_notice: isACH ? 'ACH debit submitted. Settlement can take up to 7 business days.' : undefined,
        }),
      };
    }

    if (intent.status === 'processing' || intent.status === 'requires_capture') {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ ok: true, id: intent.id, status: intent.status }),
      };
    }

    // Anything else: surface a helpful message
    return {
      statusCode: 402,
      headers: CORS,
      body: JSON.stringify({
        error: `PaymentIntent is ${intent.status}. The payment may require on-session confirmation.`,
        intent_status: intent.status,
        intent_id: intent.id,
      }),
    };
  } catch (err) {
    // Special handling for off_session auth requirements or card errors
    const code = err?.raw?.code || err?.code;
    if (code === 'authentication_required' || code === 'off_session_payment_requires_action') {
      return {
        statusCode: 402,
        headers: CORS,
        body: JSON.stringify({
          error:
            'This card requires customer authentication. Please charge on-session or save the card first via SetupIntent.',
          code,
          payment_intent: err.raw?.payment_intent?.id || null,
        }),
      };
    }

    // Common misconfiguration (the one you hit previously)
    if (
      String(err?.message || '').includes('off_session=true') &&
      String(err?.message || '').includes('setup_future_usage')
    ) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({
          error:
            'Server attempted off_session + setup_future_usage together. This handler no longer sets setup_future_usage. Re-deploy and try again.',
        }),
      };
    }

    console.error('outbound-client-charge-now error:', err);
    return { statusCode: err.statusCode || 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

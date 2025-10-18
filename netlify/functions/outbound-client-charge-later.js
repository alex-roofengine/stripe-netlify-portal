// netlify/functions/outbound-client-charge-later.js
// Diagnostic-enhanced 'Charge Later' endpoint.
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

function parseBody(event){
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  let bodyStr = event.body || '';
  if (event.isBase64Encoded) {
    try { bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8'); } catch {}
  }
  if (ct.includes('application/json')) {
    try { return JSON.parse(bodyStr || '{}'); } catch (e) { return { __parseError: 'invalid_json', raw: bodyStr }; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(bodyStr);
    const obj = {};
    for (const [k,v] of params.entries()) obj[k] = v;
    return obj;
  }
  try { return JSON.parse(bodyStr || '{}'); } catch { return { __raw: bodyStr }; }
}

function cleanAmount(a){
  if (a === undefined || a === null) return null;
  if (typeof a === 'number') return a;
  const s = String(a).trim().replace(/[$,\s,]/g, '');
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

exports.handler = async (event) => {
  const reqId = (event.headers['x-request-id'] || event.headers['x-nf-request-id'] || `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const body = parseBody(event);
    const { customerId, paymentMethodId, currency = 'usd' } = body || {};
    const amountInDollars = cleanAmount(body.amount ?? body.total ?? body.value);
    const missing = [];
    if (!customerId) missing.push('customerId');
    if (!paymentMethodId) missing.push('paymentMethodId');
    if (amountInDollars === null) missing.push('amount');

    if (missing.length) {
      return {
        statusCode: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: 'Missing required fields',
          missing,
          received: {
            hasBody: !!event.body,
            contentType: event.headers['content-type'] || event.headers['Content-Type'] || null,
            customerId: !!customerId,
            paymentMethodId: !!paymentMethodId,
            amountRaw: body.amount ?? body.total ?? body.value,
          }
        })
      };
    }

    const amountCents = Math.round(Number(amountInDollars) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return {
        statusCode: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({ error: 'Invalid amount', amountInDollars, amountCents })
      };
    }

    // Retrieve and ensure PM attached to customer
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } else if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }

    const pmType = pm.type === 'us_bank_account' ? 'us_bank_account' : 'card';

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: false,
      off_session: true,
      setup_future_usage: 'off_session',
      payment_method_types: [pmType],
      description: body.description || undefined,
      statement_descriptor: body.statementDescriptor || undefined,
    }, { idempotencyKey: `charge-later_${reqId}` });

    return { statusCode: 200, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: true, paymentIntent: intent }) };
  } catch (err) {
    console.error('outbound-client-charge-later error:', { reqId, message: err.message, type: err.type, code: err.code });
    return { statusCode: err.statusCode || 500, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: err.message, code: err.code, type: err.type, reqId }) };
  }
};

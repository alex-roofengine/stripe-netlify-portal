// netlify/functions/outbound-client-charge-later.js
// Create a PaymentIntent to confirm later (scheduled).
// Accepts either { amount } in dollars OR { priceId } OR { productId } to derive amount.
// Stores schedule in metadata: date (YYYY-MM-DD), time (HH:mm), tz (IANA).

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
};

function parseBody(event){
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  let bodyStr = event.body || '';
  if (event.isBase64Encoded) {
    try { bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8'); } catch {}
  }
  if (ct.includes('application/json')) {
    try { return JSON.parse(bodyStr || '{}'); } catch { return {}; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(bodyStr);
    const obj = {}; for (const [k,v] of params.entries()) obj[k] = v; return obj;
  }
  try { return JSON.parse(bodyStr || '{}'); } catch { return {}; }
}

function cleanAmount(a){
  if (a === undefined || a === null || a === '') return null;
  if (typeof a === 'number') return a;
  const s = String(a).trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

exports.handler = async (event) => {
  // Handle preflight for CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const body = parseBody(event);
    const {
      customerId,
      paymentMethodId,
      currency = 'usd',
      description,
      statementDescriptor,

      // scheduling inputs from UI
      date,                      // "YYYY-MM-DD" (required for scheduling)
      time = '09:00',            // optional, defaults to 09:00
      timezone,                  // "America/New_York" etc (required for scheduling)

      // ways to specify amount:
      amount,                    // dollars string or number
      priceId,                   // or a Stripe price
      productId                  // or a product (we'll pick one active price)
    } = body || {};

    const missingTop = [];
    if (!customerId) missingTop.push('customerId');
    if (!paymentMethodId) missingTop.push('paymentMethodId');
    if (!date) missingTop.push('date');
    if (!timezone) missingTop.push('timezone');

    if (missingTop.length) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing required fields', missing: missingTop }) };
    }

    // Resolve amount in cents (try amount -> priceId -> productId)
    let amountCents = null;

    const amtDollars = cleanAmount(amount);
    if (amtDollars !== null) amountCents = Math.round(amtDollars * 100);

    if (amountCents === null && priceId) {
      const price = await stripe.prices.retrieve(priceId);
      if (!price || price.active !== true || price.currency !== currency) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid or inactive priceId for currency' }) };
      }
      if (price.unit_amount == null) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Price has no unit_amount. Provide amount instead.' }) };
      }
      amountCents = price.unit_amount;
    }

    if (amountCents === null && productId) {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
      const usable = prices.data.filter(p => p.currency === currency && p.unit_amount != null);
      if (usable.length === 0) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No active prices with unit_amount for product. Provide priceId or amount.' }) };
      }
      if (usable.length > 1) {
        // Avoid guessing (monthly vs yearly etc.)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({
          error: 'Multiple prices for product. Provide priceId or amount.',
          priceCandidates: usable.map(p => ({ id: p.id, unit_amount: p.unit_amount, recurring: p.recurring || null }))
        }) };
      }
      amountCents = usable[0].unit_amount;
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing amount. Provide amount, priceId, or productId with a single active price.' }) };
    }

    // Ensure PM is attached to this customer (avoids surprises later)
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } else if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }
    const pmType = pm.type === 'us_bank_account' ? 'us_bank_account' : 'card';

    // Create PI to be confirmed later by the scheduler
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: false,                       // key for "charge later"
      off_session: true,
      setup_future_usage: 'off_session',
      payment_method_types: [pmType],
      description: description || undefined,
      statement_descriptor: statementDescriptor || undefined,
      metadata: {
        charge_later: 'true',
        schedule_date: date,                // YYYY-MM-DD
        schedule_time: time,                // HH:mm (24h)
        schedule_tz: timezone,              // IANA TZ string
        // Optional trace for your UI
        productId: productId || '',
        priceId: priceId || ''
      }
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, paymentIntent: intent }) };
  } catch (err) {
    console.error('outbound-client-charge-later error:', err);
    return { statusCode: err.statusCode || 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

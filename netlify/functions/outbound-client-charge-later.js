// netlify/functions/outbound-client-charge-later.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const VERSION = 'CL-2025-10-18-a'; // <— visible in responses
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Function-Version': VERSION,
  'Content-Type': 'application/json; charset=utf-8',
};

function parseBody(event) {
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  let bodyStr = event.body || '';
  if (event.isBase64Encoded) { try { bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8'); } catch {} }
  if (ct.includes('application/json')) { try { return JSON.parse(bodyStr || '{}'); } catch { return {}; } }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(bodyStr); const obj = {}; for (const [k,v] of params.entries()) obj[k]=v; return obj;
  }
  try { return JSON.parse(bodyStr || '{}'); } catch { return {}; }
}

function cleanAmount(a) {
  if (a === undefined || a === null) return null;
  if (typeof a === 'number') return a;
  const s = String(a).trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}
function toUnixUtc({ date, time = '09:00' }) {
  try { const [y,m,d]=date.split('-').map(Number); const [hh,mm]=time.split(':').map(Number);
        return Math.floor(Date.UTC(y,m-1,d,hh,mm,0)/1000); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed', version: VERSION }) };

  try {
    const body = parseBody(event);
    const {
      customerId, paymentMethodId, currency='usd',
      description, statementDescriptor,
      date, time, timezone,
      amount, priceId, productId
    } = body || {};

    if (!customerId || !paymentMethodId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing customerId or paymentMethodId', version: VERSION }) };
    }

    // Amount resolution (keep it simple for diagnostics)
    let amountCents = null;
    const amtDollars = cleanAmount(amount);
    if (amtDollars !== null) amountCents = Math.round(amtDollars * 100);

    if (amountCents === null && priceId) {
      const price = await stripe.prices.retrieve(priceId);
      if (!price || !price.active || price.currency !== currency || price.unit_amount == null) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid priceId', version: VERSION }) };
      }
      amountCents = price.unit_amount;
    }

    if (amountCents === null && productId) {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
      const usable = prices.data.filter(p => p.currency === currency && p.unit_amount != null);
      if (usable.length !== 1) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Ambiguous product prices; send priceId or amount', version: VERSION }) };
      }
      amountCents = usable[0].unit_amount;
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing/invalid amount', version: VERSION }) };
    }

    let desiredUnix = null;
    if (date) {
      desiredUnix = toUnixUtc({ date, time: time || '09:00' });
      if (!desiredUnix) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid date/time', version: VERSION }) };
    }

    // Ensure PM is attached
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } else if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }

    const pmType = pm.type === 'us_bank_account' ? 'us_bank_account' : 'card';

    // *** CREATE: NO off_session HERE ***
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: false, // create-only; confirm later
      setup_future_usage: 'off_session',
      payment_method_types: [pmType],
      description: description || undefined,
      statement_descriptor: statementDescriptor || undefined,
      metadata: {
        charge_later: 'true',
        desired_charge_at_unix: desiredUnix != null ? String(desiredUnix) : '',
        desired_charge_date: date || '',
        desired_charge_time: time || '09:00',
        desired_charge_tz: timezone || '',
        productId: productId || '',
        priceId: priceId || '',
      }
    });

    // add an explicit diagnostic echo to prove this build ran
    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      ok: true, version: VERSION,
      paymentIntent: { id: intent.id, status: intent.status, amount: intent.amount, currency: intent.currency },
      diagnostics: { offSessionPassedAtCreate: false }
    }) };
  } catch (err) {
    return { statusCode: err.statusCode || 500, headers: CORS, body: JSON.stringify({ error: err.message, version: VERSION }) };
  }
};

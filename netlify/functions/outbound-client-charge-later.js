// netlify/functions/outbound-client-charge-later.js
// Create a PI to be charged LATER (not confirmed now). Supports amount OR product/price.
// Stores desired charge time in metadata; a scheduled function will confirm it when due.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

function parseBody(event) {
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

function cleanAmount(a) {
  if (a === undefined || a === null) return null;
  if (typeof a === 'number') return a;
  const s = String(a).trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

/** Convert 'YYYY-MM-DD' + 'HH:mm' → UNIX seconds (UTC). */
function toUnixUtc({ date, time = '09:00' }) {
  try {
    const [y, m, d] = (date || '').split('-').map(Number);
    const [hh, mm] = (time || '09:00').split(':').map(Number);
    const utcMs = Date.UTC(y, (m - 1), d, hh, mm, 0);
    return Math.floor(utcMs / 1000);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  // Preflight
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

      // scheduling (later)
      date,         // 'YYYY-MM-DD' (required for scheduling)
      time,         // 'HH:mm' (optional; default 09:00)
      timezone,     // IANA tz string (stored for reference)

      // amount or price/product
      amount,
      priceId,
      productId
    } = body || {};

    if (!customerId || !paymentMethodId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing customerId or paymentMethodId' }) };
    }

    // Resolve amountCents:
    let amountCents = null;

    // 1) explicit amount (dollars)
    const amtDollars = cleanAmount(amount);
    if (amtDollars !== null) amountCents = Math.round(amtDollars * 100);

    // 2) explicit priceId
    if (amountCents === null && priceId) {
      const price = await stripe.prices.retrieve(priceId);
      if (!price || price.active !== true || price.currency !== currency) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid or inactive priceId for this currency' }) };
      }
      if (price.unit_amount == null) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Price has no unit_amount. Provide amount instead.' }) };
      }
      amountCents = price.unit_amount;
    }

    // 3) productId fallback → pick one active price (if unique)
    if (amountCents === null && productId) {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
      const usable = prices.data.filter(p => p.currency === currency && p.unit_amount != null);
      if (usable.length === 0) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Product has no active prices with unit_amount; provide priceId or amount.' }) };
      }
      if (usable.length > 1) {
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

    // Compute scheduled time (UTC epoch seconds) — if no date, we still save for manual later confirm
    let desiredUnix = null;
    if (date) {
      desiredUnix = toUnixUtc({ date, time: time || '09:00' });
      if (!desiredUnix) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid date/time format' }) };
      }
    }

    // Ensure PM is attached to this customer
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } else if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }

    const pmType = pm.type === 'us_bank_account' ? 'us_bank_account' : 'card';

    // Create PI (not confirmed)
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: false,                 // key for "charge later"
      off_session: true,
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

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, paymentIntent: intent }) };
  } catch (err) {
    console.error('outbound-client-charge-later error:', err);
    return { statusCode: err.statusCode || 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

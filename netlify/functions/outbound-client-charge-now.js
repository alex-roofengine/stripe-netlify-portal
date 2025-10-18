// netlify/functions/outbound-client-charge-now.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const body = JSON.parse(event.body || "{}");
    const { customerId, paymentMethodId, amount, currency = 'usd', description, statementDescriptor } = body;

    if (!customerId || !paymentMethodId || amount == null) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId, paymentMethodId, or amount' }) };
    }

    const amt = Math.round(Number(String(amount).replace(/[$,\s]/g, '')) * 100);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount' }) };
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.type === 'us_bank_account') {
      const status = pm.us_bank_account?.status;
      if (!['verified', 'instant_verified'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ error: `Bank account not verified (status: ${status})` }) };
      }
    }

    const intent = await stripe.paymentIntents.create({
      amount: amt,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      setup_future_usage: 'off_session',
      description: description || undefined,
      statement_descriptor: statementDescriptor || undefined,
      payment_method_types: pm.type === 'us_bank_account' ? ['us_bank_account'] : ['card'],
    });

    return { statusCode: 200, body: JSON.stringify({ paymentIntent: intent }) };
  } catch (err) {
    console.error('outbound-client-charge-now error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

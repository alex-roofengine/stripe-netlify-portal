// netlify/functions/create-setup-intent.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { customerId } = body;
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }
    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['us_bank_account', 'card'],
      usage: 'off_session',
    });
    return { statusCode: 200, body: JSON.stringify({ clientSecret: si.client_secret, setupIntentId: si.id }) };
  } catch (err) {
    console.error('create-setup-intent error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

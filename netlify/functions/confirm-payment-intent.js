// netlify/functions/confirm-payment-intent.js
// Confirms a previously created PaymentIntent by ID (for 'charge later' flow).
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const body = JSON.parse(event.body || "{}");
    const { paymentIntentId, offSession = true } = body;

    if (!paymentIntentId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing paymentIntentId' }) };
    }

    const intent = await stripe.paymentIntents.confirm(paymentIntentId, {
      off_session: !!offSession,
    });

    return { statusCode: 200, body: JSON.stringify({ paymentIntent: intent }) };
  } catch (err) {
    console.error('confirm-payment-intent error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

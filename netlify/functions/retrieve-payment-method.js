// netlify/functions/retrieve-payment-method.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

exports.handler = async (event) => {
  try {
    const { paymentMethodId } = event.queryStringParameters || {};
    if (!paymentMethodId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing paymentMethodId' }) };
    }
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const result = { id: pm.id, type: pm.type, livemode: pm.livemode, customer: pm.customer };
    if (pm.type === 'us_bank_account') {
      result.us_bank_account = pm.us_bank_account;
      result.verified = ['verified', 'instant_verified'].includes(pm.us_bank_account?.status);
    } else if (pm.type === 'card') {
      result.card = pm.card;
      result.verified = true;
    }
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('retrieve-payment-method error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

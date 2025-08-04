// netlify/functions/retrieve-payment-method.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async (event) => {
  try {
    const { paymentMethodId } = event.queryStringParameters;
    if (!paymentMethodId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'paymentMethodId is required' })
      };
    }
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    return {
      statusCode: 200,
      body: JSON.stringify(pm)
    };
  } catch (err) {
    console.error('retrieve-pm error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

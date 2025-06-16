// netlify/functions/list-subscriptions.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters;

    // Fetch every subscription for this customer
    const response = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',               // ← include active, canceled, paused, etc.
      expand: ['data.plan.product'] // ← get product name
    });

    // Log for debugging in Netlify logs
    console.log(`subs for ${customerId}:`, response.data.length);

    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

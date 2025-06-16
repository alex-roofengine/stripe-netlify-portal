// netlify/functions/list-subscriptions.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters;

    // List all subscriptions (active, canceled, paused, etc.)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.plan.product'],
    });

    return {
      statusCode: 200,
      body: JSON.stringify(subscriptions.data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

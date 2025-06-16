// netlify/functions/list-subscriptions.js
const Stripe = require('stripe');

// ← override to a version ≥ 2016-07-06 so `status: 'all'` is valid
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27'
});

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters;

    // List *all* subscriptions (active, canceled, paused, etc.)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.plan.product']
    });

    console.log(`Found ${subscriptions.data.length} subs for`, customerId);

    return {
      statusCode: 200,
      body: JSON.stringify(subscriptions.data)
    };
  } catch (err) {
    console.error('list-subscriptions error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

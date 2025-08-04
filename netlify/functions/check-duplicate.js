// netlify/functions/check-duplicate.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async (event) => {
  const email = event.queryStringParameters?.email;
  if (!email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'email query param is required' })
    };
  }
  // List customers by email
  const { data } = await stripe.customers.list({ email, limit: 1 });
  if (data.length > 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        exists: true,
        customerId: data[0].id,
        name: data[0].name
      })
    };
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ exists: false })
  };
};

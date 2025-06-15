const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ queryStringParameters }) => {
  const { customerId } = queryStringParameters;
  const subs = await stripe.subscriptions.list({ customer: customerId, expand: ['data.default_payment_method'] });
  return { statusCode: 200, body: JSON.stringify(subs.data) };
};

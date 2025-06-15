const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ queryStringParameters }) => {
  const { customerId } = queryStringParameters;
  // Expand plan.product to get product name
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    expand: ['data.plan.product']
  });
  return {
    statusCode: 200,
    body: JSON.stringify(subs.data)
  };
};

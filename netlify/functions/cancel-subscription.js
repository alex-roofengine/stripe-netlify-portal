const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ body }) => {
  const { subscriptionId } = JSON.parse(body);
  await stripe.subscriptions.del(subscriptionId);
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

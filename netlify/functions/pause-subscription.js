const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ body }) => {
  const { subscriptionId } = JSON.parse(body);
  const updated = await stripe.subscriptions.update(subscriptionId, { pause_collection: { behavior: 'keep_as_draft' } });
  return { statusCode: 200, body: JSON.stringify(updated) };
};

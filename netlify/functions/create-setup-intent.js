// For updating existing customer
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ body }) => {
  const { customerId } = JSON.parse(body);
  const intent = await stripe.setupIntents.create({ customer: customerId, usage: 'off_session', payment_method_types: ['card'] });
  return { statusCode: 200, body: JSON.stringify({ clientSecret: intent.client_secret }) };
};

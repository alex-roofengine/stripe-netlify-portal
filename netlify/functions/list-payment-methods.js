const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ queryStringParameters }) => {
  const { customerId } = queryStringParameters;
  const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
  return { statusCode: 200, body: JSON.stringify(pms.data) };
};

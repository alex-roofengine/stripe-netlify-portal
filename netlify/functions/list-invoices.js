const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ queryStringParameters }) => {
  const { customerId } = queryStringParameters;
  const inv = await stripe.invoices.list({ customer: customerId, limit: 10 });
  return { statusCode: 200, body: JSON.stringify(inv.data) };
};

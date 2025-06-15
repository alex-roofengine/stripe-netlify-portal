const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async () => {
  const { data } = await stripe.customers.list({ limit: 500 });
  return { statusCode: 200, body: JSON.stringify(
    data.map(c => ({ id: c.id, name: c.name || c.email || '—'}))
  )};
};

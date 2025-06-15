require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async () => {
  const { data } = await stripe.customers.list({ limit: 100 });
  // Map to id + name (instead of email)
  const customers = data.map(c => ({
    id: c.id,
    name: c.name || '(no name)'
  }));
  return {
    statusCode: 200,
    body: JSON.stringify(customers)
  };
};

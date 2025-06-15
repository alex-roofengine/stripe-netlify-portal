require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async () => {
  const { data } = await stripe.customers.list({ limit: 100 });
  return { statusCode: 200, body: JSON.stringify(data.map(c => ({
    id: c.id,
    email: c.email || '(no email)'
  }))) };
};

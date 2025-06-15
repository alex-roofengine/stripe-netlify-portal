require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const { customerId } = JSON.parse(event.body);
  if (!customerId) return { statusCode: 400, body: 'Missing customerId' };

  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
  });
  return {
    statusCode: 200,
    body: JSON.stringify({ clientSecret: intent.client_secret }),
  };
};

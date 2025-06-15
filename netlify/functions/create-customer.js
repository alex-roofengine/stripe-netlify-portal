const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async (event) => {
  const { email, phone } = JSON.parse(event.body);
  if (!email) return { statusCode: 400, body: 'Missing email' };
  // create customer
  const customer = await stripe.customers.create({ email, phone });
  // create SetupIntent
  const intent = await stripe.setupIntents.create({
    customer: customer.id,
    usage: 'off_session',
    payment_method_types: ['card'],
  });
  return {
    statusCode: 200,
    body: JSON.stringify({ customerId: customer.id, clientSecret: intent.client_secret })
  };
};

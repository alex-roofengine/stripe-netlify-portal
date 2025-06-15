const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ body }) => {
  const { name, email, phone, address } = JSON.parse(body);
  if (!name || !email || !address.line1) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  // Create customer with full billing info
  const customer = await stripe.customers.create({
    name,
    email,
    phone,
    address: {
      line1: address.line1,
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: 'US'
    }
  });
  // Create a SetupIntent for card
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

// netlify/functions/create-customer.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async (event) => {
  try {
    const {
      name,
      email,
      phone,
      line1,
      city,
      state,
      postal_code
    } = JSON.parse(event.body);

    // Validate required fields
    const missing = [];
    if (!name)        missing.push('name');
    if (!email)       missing.push('email');
    if (!phone)       missing.push('phone');
    if (!line1)       missing.push('address line');
    if (!city)        missing.push('city');
    if (!state)       missing.push('state');
    if (!postal_code) missing.push('postal_code');
    if (missing.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields: ' + missing.join(', ')
        })
      };
    }

    // Create the Stripe customer with full address
    const customer = await stripe.customers.create({
      name,
      email,
      phone,
      address: {
        line1,
        city,
        state,
        postal_code,
        country: 'US'
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ customerId: customer.id })
    };

  } catch (err) {
    console.error('create-customer error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

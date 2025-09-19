// netlify/functions/get-latest-outbound-customer.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async () => {
  try {
    // 1) Fetch customers sorted by created date (newest first)
    const customers = await stripe.customers.list({
      limit: 50, // fetch a batch, then filter
    });

    // 2) Find the most recent customer with client_type: outbound
    const outboundCustomer = customers.data.find(
      (c) => c.metadata && c.metadata.client_type === 'outbound'
    );

    if (!outboundCustomer) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No outbound client found.' }),
      };
    }

    // 3) Return customer details
    return {
      statusCode: 200,
      body: JSON.stringify({
        customerId: outboundCustomer.id,
        name: outboundCustomer.name,
        email: outboundCustomer.email,
        phone: outboundCustomer.phone,
        metadata: outboundCustomer.metadata,
      }),
    };
  } catch (err) {
    console.error('Error fetching outbound client:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// netlify/functions/get-latest-outbound-customer.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27'
});

exports.handler = async () => {
  try {
    // Pull customers sorted by creation date (most recent first)
    const customers = await stripe.customers.list({
      limit: 20, // fetch a few just in case
    });

    // Find the most recent with client_type: outbound
    const outboundCustomer = customers.data.find(
      (c) => c.metadata && c.metadata.client_type === 'outbound'
    );

    if (!outboundCustomer) {
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: 'No outbound client found. Please check Stripe.' 
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: outboundCustomer.id,
        name: outboundCustomer.name || outboundCustomer.email || 'Unnamed Client',
        email: outboundCustomer.email,
        metadata: outboundCustomer.metadata
      })
    };
  } catch (err) {
    console.error('Error fetching outbound customer:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async () => {
  try {
    const customers = await stripe.customers.list({
      limit: 20, // fetch a batch
    });

    // filter outbound clients
    const outbound = customers.data
      .filter(c => c.metadata.client_type === 'outbound')
      .sort((a, b) => b.created - a.created); // newest first

    if (!outbound.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No outbound client found.' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ customer: outbound[0] }) // most recent outbound customer
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

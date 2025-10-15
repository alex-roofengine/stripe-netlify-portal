// netlify/functions/list-charges.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // Pull recent charges (you can increase the limit if you’d like)
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 50
    });

    const formatted = charges.data.map(ch => ({
      id: ch.id,
      amount: (ch.amount / 100).toFixed(2),
      currency: (ch.currency || 'usd').toUpperCase(),
      status: ch.status, // succeeded | failed | pending, etc.
      description: ch.description,
      statement_descriptor: ch.statement_descriptor,
      created: ch.created,
      payment_method: ch.payment_method_details?.card
        ? {
            brand: ch.payment_method_details.card.brand,
            last4: ch.payment_method_details.card.last4,
            exp_month: ch.payment_method_details.card.exp_month,
            exp_year: ch.payment_method_details.card.exp_year
          }
        : null
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(formatted)
    };
  } catch (err) {
    console.error('list-charges error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

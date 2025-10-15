// netlify/functions/list-charges.js
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    let charges = [];
    let starting_after;

    // Pull every charge for this customer (100 at a time)
    while (true) {
      const page = await stripe.charges.list({
        customer: customerId,
        limit: 100,
        ...(starting_after ? { starting_after } : {}),
      });
      charges = charges.concat(page.data || []);
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1].id;
    }

    // Keep only card charges and map to a compact shape
    const shaped = charges
      .filter(ch => ch.payment_method_details && ch.payment_method_details.type === 'card')
      .map(ch => ({
        id: ch.id,
        amount: ch.amount,               // in cents
        currency: ch.currency,
        status: ch.status,               // 'succeeded' | 'failed' | 'pending'
        created: ch.created,             // unix (s)
        description: ch.description || '',
        statement_descriptor: ch.statement_descriptor || '',
        receipt_url: ch.receipt_url || '',
        failure_message: ch.failure_message || '',
        card: {
          brand: ch.payment_method_details.card?.brand || '',
          last4: ch.payment_method_details.card?.last4 || '',
          exp_month: ch.payment_method_details.card?.exp_month || '',
          exp_year: ch.payment_method_details.card?.exp_year || '',
        },
      }));

    // Ensure newest first (Stripe already returns desc, but sort just in case)
    shaped.sort((a, b) => b.created - a.created);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shaped),
    };
  } catch (err) {
    console.error('list-charges error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

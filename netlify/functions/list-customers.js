// netlify/functions/list-customers.js
const Stripe = require('stripe');

// Uses your Netlify env var STRIPE_SECRET_KEY (works for Test or Live)
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async () => {
  try {
    let all = [];
    let starting_after = undefined;

    // Pull EVERY customer (in pages of 100) until has_more = false
    while (true) {
      const page = await stripe.customers.list({
        limit: 100,
        ...(starting_after ? { starting_after } : {}),
      });

      all = all.concat(page.data || []);

      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1].id;
    }

    // Trim to the fields your frontend actually uses
    const trimmed = all.map(c => ({
      id: c.id,
      name: c.name || c.metadata?.company || '',
      email: c.email || '',
      phone: c.phone || '',
      metadata: c.metadata || {},
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trimmed),
    };
  } catch (err) {
    console.error('list-customers error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

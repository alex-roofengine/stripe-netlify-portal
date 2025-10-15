// netlify/functions/list-outbound-customers.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function listAllCustomersWithFilter(filterFn) {
  let results = [];
  let starting_after = undefined;

  while (true) {
    const page = await stripe.customers.list({
      limit: 100,
      ...(starting_after ? { starting_after } : {})
    });

    const filtered = page.data.filter(filterFn);
    results = results.concat(filtered);

    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return results;
}

exports.handler = async () => {
  try {
    const customers = await listAllCustomersWithFilter(c =>
      (c.metadata && (c.metadata.client_type || c.metadata.plan_type || '')
        .toString()
        .toLowerCase() === 'outbound')
    );

    // Return a trimmed payload
    const trimmed = customers.map(c => ({
      id: c.id,
      name: c.name || c.metadata?.company || '',
      email: c.email || '',
      phone: c.phone || '',
      metadata: c.metadata || {}
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trimmed)
    };
  } catch (err) {
    console.error('list-outbound-customers error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

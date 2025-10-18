// netlify/functions/list-outbound-customers.js
// FAST: Uses Stripe search to return only "outbound" customers + trimmed fields.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    // You mark outbound clients with metadata.client_type = "outbound"
    const query = "metadata['client_type']:'outbound'";

    let next_page = null;
    const out = [];

    do {
      const res = await stripe.customers.search({
        query,
        limit: 100,
        page: next_page || undefined,
      });

      for (const c of res.data) {
        out.push({
          id: c.id,
          name: c.name || c.metadata?.company || '',
          email: c.email || '',
          phone: c.phone || '',
          created: c.created || 0,
          metadata: c.metadata || {},
        });
      }
      next_page = res.next_page || null;
    } while (next_page);

    // Sort newest first, then A→Z as your UI expects
    out.sort((a, b) => (b.created || 0) - (a.created || 0) || (a.name || '').localeCompare(b.name || ''));

    return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
  } catch (err) {
    console.error('list-outbound-customers error:', err);
    return { statusCode: err.statusCode || 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

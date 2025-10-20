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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { customerId, limit = '10' } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // 1️⃣ Get direct charges
    const charges = await stripe.charges.list(
      { customer: customerId, limit: Math.min(parseInt(limit, 10) || 10, 50) },
      { apiKey: process.env.STRIPE_SECRET_KEY }
    );

    // 2️⃣ Get recent payment intents to include ACH or pending ones
    const paymentIntents = await stripe.paymentIntents.list(
      { customer: customerId, limit: Math.min(parseInt(limit, 10) || 10, 50) },
      { apiKey: process.env.STRIPE_SECRET_KEY }
    );

    // Normalize both sources
    const chargeRows = (charges.data || []).map(ch => ({
      id: ch.id,
      created: ch.created,
      description: ch.description || '—',
      status: ch.status,
      receipt_url: ch.receipt_url || null,
      amount: ch.amount,
      currency: ch.currency || 'usd',
      source: 'charge'
    }));

    const intentRows = (paymentIntents.data || [])
      .filter(pi => !chargeRows.find(c => c.id === pi.latest_charge)) // skip duplicates
      .map(pi => ({
        id: pi.id,
        created: pi.created,
        description: pi.description || pi.statement_descriptor || 'Payment Intent',
        status: pi.status === 'succeeded' ? 'succeeded' :
                pi.status === 'processing' ? 'processing' :
                pi.status,
        receipt_url: pi.latest_charge ? null : null, // no direct receipt yet
        amount: pi.amount || (pi.amount_received ?? 0),
        currency: pi.currency || 'usd',
        source: 'intent'
      }));

    const merged = [...chargeRows, ...intentRows]
      .sort((a, b) => b.created - a.created)
      .slice(0, Math.min(parseInt(limit, 10) || 10, 50));

    return { statusCode: 200, headers: CORS, body: JSON.stringify(merged) };
  } catch (err) {
    console.error('list-charges error:', err);
    return { statusCode: err.statusCode || 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// Helper: normalize us_bank_account PM
function normalizeBank(pm) {
  const bank = pm.us_bank_account || {};
  return {
    id: pm.id,
    type: 'us_bank_account',
    source_family: 'payment_method',
    bank_name: bank.bank_name || null,
    last4: bank.last4 || null,
    fingerprint: bank.fingerprint || null,
    account_holder_type: bank.account_holder_type || null,
    routing_number: bank.routing_number || null,
    status: bank.status || null,     // 'new' | 'validated' | 'verified' | 'verification_failed'
    verified: bank.status === 'verified' || bank.status === 'instant_verified',
    customer: pm.customer || null,
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
  };
}

// Helper: normalize card PM
function normalizeCard(pm) {
  const b = pm.card || {};
  return {
    id: pm.id,
    type: 'card',
    source_family: 'payment_method',
    brand: b.brand,
    last4: b.last4,
    exp_month: b.exp_month,
    exp_year: b.exp_year,
    verified: true, // cards are chargeable by definition if attached
    customer: pm.customer || null,
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
  };
}

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // List cards and us_bank_account payment methods
    const [cardsA, banksA] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' }),
    ]);

    // Legacy external bank accounts (sources) – sometimes attached to the customer directly
    const customer = await stripe.customers.retrieve(customerId);
    const legacyBanks = Array.isArray(customer.sources?.data)
      ? customer.sources.data.filter(s => s.object === 'bank_account')
      : [];

    const normalized = [
      ...cardsA.data.map(normalizeCard),
      ...banksA.data.map(normalizeBank),
      ...legacyBanks.map(b => ({
        id: b.id,
        type: 'bank_account',
        source_family: 'source',
        bank_name: b.bank_name,
        last4: b.last4,
        fingerprint: b.fingerprint,
        status: b.status, // 'new' | 'validated' | 'verified' | 'verification_failed'
        verified: b.status === 'verified',
        customer: b.customer || customerId,
        livemode: b.livemode,
        created: b.created,
      })),
    ];

    // sort: verified first, then cards, then banks
    normalized.sort((a, b) => {
      const av = a.verified ? 0 : 1;
      const bv = b.verified ? 0 : 1;
      if (av !== bv) return av - bv;
      return (a.type || '').localeCompare(b.type || '');
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        customerId,
        default_source: customer.default_source || null,
        payment_methods: normalized,
        counts: {
          cards: cardsA.data.length,
          banks: banksA.data.length,
          legacy_banks: legacyBanks.length,
        },
      }),
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// Build objects compatible with BOTH new (normalized) and existing frontend (nested) shapes
function shapeCard(pm){
  const card = pm.card || {};
  const shaped = {
    id: pm.id,
    type: 'card',
    // expected nested card object for UI
    card: {
      brand: card.brand || null,
      last4: card.last4 || null,
      exp_month: card.exp_month || null,
      exp_year: card.exp_year || null,
    },
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
    // normalized aliases
    source_family: 'payment_method',
    brand: card.brand || null,
    last4: card.last4 || null,
    exp_month: card.exp_month || null,
    exp_year: card.exp_year || null,
    verified: true,
  };
  return shaped;
}

function shapeBank(pm){
  const bank = pm.us_bank_account || {};
  const shaped = {
    id: pm.id,
    type: 'us_bank_account',
    // expected nested bank object for UI
    bank: {
      bank_name: bank.bank_name || null,
      last4: bank.last4 || null,
      account_type: bank.account_type || null,
      status: bank.status || null, // 'new' | 'validated' | 'verified' | 'verification_failed' | 'instant_verified'
    },
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
    // normalized aliases
    source_family: 'payment_method',
    bank_name: bank.bank_name || null,
    last4: bank.last4 || null,
    account_holder_type: bank.account_holder_type || null,
    routing_number: bank.routing_number || null,
    status: bank.status || null,
    verified: ['verified','instant_verified'].includes(bank.status),
  };
  return shaped;
}

// legacy customer bank sources (if any)
function shapeLegacyBank(source, customerId){
  const shaped = {
    id: source.id,
    type: 'us_bank_account', // present as ACH for UI consistency
    bank: {
      bank_name: source.bank_name || null,
      last4: source.last4 || null,
      account_type: source.account_type || null,
      status: source.status || null,
    },
    billing_details: { name: source.account_holder_name || null },
    livemode: source.livemode,
    created: source.created,
    source_family: 'source',
    bank_name: source.bank_name || null,
    last4: source.last4 || null,
    status: source.status || null,
    verified: source.status === 'verified',
    customer: source.customer || customerId,
  };
  return shaped;
}

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // Fetch customer to read defaults and maybe legacy sources
    const customer = await stripe.customers.retrieve(customerId);

    // New PMs
    const [cardsA, banksA] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' }),
    ]);

    // Legacy bank sources
    const legacyBanks = Array.isArray(customer.sources?.data)
      ? customer.sources.data.filter(s => s.object === 'bank_account')
      : [];

    // Shape all methods
    const shaped = [
      ...cardsA.data.map(shapeCard),
      ...banksA.data.map(shapeBank),
      ...legacyBanks.map(s => shapeLegacyBank(s, customerId)),
    ];

    // Sort: verified first, then card before bank for display
    shaped.sort((a,b)=>{
      const av = a.verified ? 0 : 1;
      const bv = b.verified ? 0 : 1;
      if (av !== bv) return av - bv;
      if (a.type === b.type) return (a.created||0) - (b.created||0);
      return a.type === 'card' ? -1 : 1;
    });

    // Expose BOTH old and new keys so either frontend works
    const response = {
      // new keys from earlier patches
      customerId,
      default_source: customer.default_source || null,
      payment_methods: shaped,
      counts: {
        cards: cardsA.data.length,
        banks: banksA.data.length,
        legacy_banks: legacyBanks.length,
      },
      // compatibility keys for existing outbound.html
      defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null,
      paymentMethods: shaped,
    };

    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

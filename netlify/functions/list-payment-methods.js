// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

function shapeCard(pm){
  const card = pm.card || {};
  return {
    id: pm.id,
    type: 'card',
    card: { brand: card.brand || null, last4: card.last4 || null, exp_month: card.exp_month || null, exp_year: card.exp_year || null },
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
    source_family: 'payment_method',
    brand: card.brand || null,
    last4: card.last4 || null,
    exp_month: card.exp_month || null,
    exp_year: card.exp_year || null,
    verified: true,
  };
}

function shapeBank(pm){
  const bank = pm.us_bank_account || {};
  return {
    id: pm.id,
    type: 'us_bank_account',
    bank: { bank_name: bank.bank_name || null, last4: bank.last4 || null, account_type: bank.account_type || null, status: bank.status || null },
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
    source_family: 'payment_method',
    bank_name: bank.bank_name || null,
    last4: bank.last4 || null,
    status: bank.status || null,
    verified: ['verified','instant_verified'].includes(bank.status),
  };
}

function shapeLegacyBank(source, customerId){
  return {
    id: source.id,
    type: 'us_bank_account',
    bank: { bank_name: source.bank_name || null, last4: source.last4 || null, account_type: source.account_type || null, status: source.status || null },
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
}

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    const customer = await stripe.customers.retrieve(customerId);
    const [cardsA, banksA] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' }),
    ]);
    const legacyBanks = Array.isArray(customer.sources?.data)
      ? customer.sources.data.filter(s => s.object === 'bank_account')
      : [];

    const shaped = [
      ...cardsA.data.map(shapeCard),
      ...banksA.data.map(shapeBank),
      ...legacyBanks.map(s => shapeLegacyBank(s, customerId)),
    ];

    shaped.sort((a,b)=>{
      const av = a.verified ? 0 : 1;
      const bv = b.verified ? 0 : 1;
      if (av !== bv) return av - bv;
      if (a.type === b.type) return (a.created||0) - (b.created||0);
      return a.type === 'card' ? -1 : 1;
    });

    const response = {
      // normalized
      customerId,
      default_source: customer.default_source || null,
      payment_methods: shaped,
      counts: { cards: cardsA.data.length, banks: banksA.data.length, legacy_banks: legacyBanks.length },
      // legacy camelCase + nested objects your UI expects
      defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null,
      paymentMethods: shaped,
    };

    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

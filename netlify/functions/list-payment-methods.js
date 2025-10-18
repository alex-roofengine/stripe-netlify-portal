// netlify/functions/list-payment-methods.js
// Shows ALL payment methods (default + non-default) and robustly detects ACH verification.
// Also returns lightweight diagnostics you can surface in the UI if desired.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

/** Normalize Stripe ACH verification across older and newer fields. */
function resolveAchStatus(usBankAccount = {}) {
  // Primary (classic)
  const status = usBankAccount.status; // 'new' | 'validated' | 'verified' | 'verification_failed' | 'errored'
  // Newer surfaces (some accounts use these)
  const v1 = usBankAccount.verification_status; // sometimes present
  const v2 = usBankAccount.financial_connections?.verification_status; // via Financial Connections

  // Pick the first meaningful value
  const raw =
    status ||
    v1 ||
    v2 ||
    null;

  // Decide verified boolean
  const verified =
    raw === 'verified' ||
    raw === 'instant_verified' || // defensive, if surface ever returns this
    raw === 'succeeded';          // some FC flows report 'succeeded'

  return { rawStatus: raw, verified };
}

/** Cards -> keep your existing shape, verified=true. */
function shapeCard(pm) {
  const card = pm.card || {};
  return {
    id: pm.id,
    type: 'card',
    card: {
      brand: card.brand || null,
      last4: card.last4 || null,
      exp_month: card.exp_month || null,
      exp_year: card.exp_year || null
    },
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
    source_family: 'payment_method',
    brand: card.brand || null,
    last4: card.last4 || null,
    exp_month: card.exp_month || null,
    exp_year: card.exp_year || null,
    verified: true, // card availability ≈ chargeable check happens at charge time
  };
}

/** ACH via PaymentMethod (modern). */
function shapeBank(pm) {
  const bank = pm.us_bank_account || {};
  const { rawStatus, verified } = resolveAchStatus(bank);

  return {
    id: pm.id,
    type: 'us_bank_account',
    bank: {
      bank_name: bank.bank_name || null,
      last4: bank.last4 || null,
      account_type: bank.account_type || null,
      status: rawStatus || bank.status || null, // expose normalized status
    },
    billing_details: pm.billing_details || {},
    livemode: pm.livemode,
    created: pm.created,
    source_family: 'payment_method',
    bank_name: bank.bank_name || null,
    last4: bank.last4 || null,
    status: rawStatus || bank.status || null,
    verified,
  };
}

/** Legacy bank sources (customer.sources -> bank_account). */
function shapeLegacyBank(source, customerId) {
  const legacyStatus = source.status; // 'new' | 'verified' | 'validated' | 'errored'
  const verified = legacyStatus === 'verified';

  return {
    id: source.id,
    type: 'us_bank_account',
    bank: {
      bank_name: source.bank_name || null,
      last4: source.last4 || null,
      account_type: source.account_type || null,
      status: legacyStatus || null,
    },
    billing_details: { name: source.account_holder_name || null },
    livemode: source.livemode,
    created: source.created,
    source_family: 'source',
    bank_name: source.bank_name || null,
    last4: source.last4 || null,
    status: legacyStatus || null,
    verified,
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

    // Fetch both modern PaymentMethods and legacy bank sources
    const [cardsA, banksA] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' }),
    ]);

    const legacyBanks = Array.isArray(customer.sources?.data)
      ? customer.sources.data.filter((s) => s.object === 'bank_account')
      : [];

    // Shape everything for the UI
    const shaped = [
      ...cardsA.data.map(shapeCard),
      ...banksA.data.map(shapeBank),
      ...legacyBanks.map((s) => shapeLegacyBank(s, customerId)),
    ];

    // Sort: verified first, then by type (cards first for convenience), then by created asc
    shaped.sort((a, b) => {
      const av = a.verified ? 0 : 1;
      const bv = b.verified ? 0 : 1;
      if (av !== bv) return av - bv;
      if (a.type === b.type) return (a.created || 0) - (b.created || 0);
      return a.type === 'card' ? -1 : 1;
    });

    // Everything (default + non-default) is always returned
    const response = {
      // normalized
      customerId,
      default_source: customer.default_source || null,
      payment_methods: shaped,
      counts: {
        cards: cardsA.data.length,
        banks: banksA.data.length,
        legacy_banks: legacyBanks.length
      },

      // legacy/camelCase for your existing UI
      defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null,
      paymentMethods: shaped,

      // optional debugging aids (can remove later)
      diagnostics: {
        apiVersion: '2023-10-16',
        totalReturned: shaped.length,
        defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null,
      }
    };

    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

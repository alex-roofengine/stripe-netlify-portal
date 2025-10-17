// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // --- list cards ---
    const cardsA = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      expand: ['data.card.three_d_secure_usage'],
    });

    // --- list ach (us_bank_account) ---
    const banksA = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
    });

    // Defensive: re-retrieve each bank PM to make sure `us_bank_account.status` is populated
    const banksFull = [];
    for (const pm of banksA.data) {
      try {
        const full = await stripe.paymentMethods.retrieve(pm.id);
        banksFull.push(full);
      } catch {
        banksFull.push(pm); // fallback
      }
    }

    // Also check the (rare) legacy sources path, and merge if present
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method', 'sources'],
    });

    const legacyBanks = [];
    if (customer.sources && customer.sources.data && customer.sources.data.length) {
      for (const src of customer.sources.data) {
        if (src.object === 'bank_account') {
          legacyBanks.push(src);
        }
      }
    }

    const defaultPm =
      (customer.invoice_settings && customer.invoice_settings.default_payment_method &&
        customer.invoice_settings.default_payment_method.id) || null;

    // Normalize for frontend
    const normalized = [];

    // cards
    for (const pm of cardsA.data) {
      const b = pm.card || {};
      normalized.push({
        id: pm.id,
        type: 'card',
        source_family: 'payment_method',
        brand: b.brand,
        last4: b.last4,
        exp_month: b.exp_month,
        exp_year: b.exp_year,
        verified: true, // cards are always "chargeable"
        _reason: 'pm_card',
      });
    }

    // bank PMs
    for (const pm of banksFull) {
      const bank = pm.us_bank_account || {};
      const status = bank.status || '';
      const verified = status === 'verified';

      normalized.push({
        id: pm.id,
        type: 'us_bank_account',
        source_family: 'payment_method',
        verified,
        bank: {
          bank_name: bank.bank_name || '',
          last4: bank.last4 || '',
          account_type: bank.account_type || '',
          status,
        },
        _reason: 'pm_bank',
      });
    }

    // legacy bank sources (very uncommon, but just in case)
    for (const src of legacyBanks) {
      const status = src.status || ''; // 'verified' when finished micro-deposits
      const verified = status === 'verified';
      normalized.push({
        id: src.id,
        type: 'bank_account',
        source_family: 'source',
        verified,
        bank: {
          bank_name: src.bank_name || '',
          last4: src.last4 || '',
          account_type: src.account_type || '',
          status,
        },
        _reason: 'legacy_source_bank',
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        paymentMethods: normalized,
        defaultPaymentMethod: defaultPm,
        _debug: {
          used_list_paymentMethods: { cardsA: cardsA.data.length, banksA: banksA.data.length },
          used_customers_listPaymentMethods: {
            cardsB: 0,
            banksB: banksFull.length,
          },
          legacy_banks: legacyBanks.length,
          default_source: customer.default_source || null,
        },
      }),
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

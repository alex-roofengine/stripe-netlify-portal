// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });

async function listAllPaymentMethods(customer, type) {
  let all = [];
  let starting_after;
  while (true) {
    const page = await stripe.paymentMethods.list({
      customer,
      type,
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
    });
    all = all.concat(page.data || []);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return all;
}

async function customersListAllPaymentMethods(customer, type) {
  // Alternate listing API; Stripe sometimes returns a different set here.
  let all = [];
  let starting_after;
  while (true) {
    const page = await stripe.customers.listPaymentMethods(customer, {
      type,
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
    });
    all = all.concat(page.data || []);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return all;
}

async function listLegacyBankSources(customer) {
  // Older ACH setups used the Sources API (bank_account objects: id starts with ba_).
  let all = [];
  let starting_after;
  while (true) {
    const page = await stripe.customers.listSources(customer, {
      object: 'bank_account',
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
    });
    all = all.concat(page.data || []);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return all;
}

function shapeCard(pm) {
  return {
    id: pm.id,
    type: 'card',
    card: {
      brand: pm.card?.brand || '',
      last4: pm.card?.last4 || '',
      exp_month: pm.card?.exp_month || '',
      exp_year: pm.card?.exp_year || '',
    }
  };
}

function shapeBankPM(pm, opts = {}) {
  // PaymentMethod object (pm_...) us_bank_account
  const verified = pm.us_bank_account?.status === 'verified';
  return {
    id: pm.id,
    type: 'us_bank_account',
    source_family: 'payment_method',
    verified,
    bank: {
      bank_name: pm.us_bank_account?.bank_name || 'Bank Account',
      last4: pm.us_bank_account?.last4 || '',
      account_type: pm.us_bank_account?.account_type || '',   // checking | savings
      status: pm.us_bank_account?.status || '',               // verified | pending | errored | ...
    },
    // if we force-included or default-merged, note it for debugging in UI if you want
    _reason: opts.reason || undefined
  };
}

function shapeBankSource(ba, opts = {}) {
  // Legacy bank account (ba_...) from Sources API
  const verified = ba.status === 'verified' || ba.status === 'new' || ba.status === 'validated';
  // Nacha-verified states vary; treat 'verified' as usable; 'new' may still need micro-deposits.
  return {
    id: ba.id,
    type: 'us_bank_account',
    source_family: 'source',
    verified: ba.status === 'verified',
    bank: {
      bank_name: ba.bank_name || 'Bank Account',
      last4: ba.last4 || '',
      account_type: ba.account_type || '', // checking | savings
      status: ba.status || '',
    },
    _reason: opts.reason || undefined
  };
}

exports.handler = async (event) => {
  try {
    const { customerId, includePmId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // 1) Retrieve customer, expanding default PM and default source
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method', 'default_source'],
    });
    const defaultPMObj = customer.invoice_settings?.default_payment_method || null;
    const defaultSourceObj = customer.default_source || null;

    // 2) List via BOTH APIs for redundancy
    const [
      cardsA,
      banksA,
      cardsB,
      banksB,
      legacyBanks
    ] = await Promise.all([
      listAllPaymentMethods(customerId, 'card'),
      listAllPaymentMethods(customerId, 'us_bank_account'),
      customersListAllPaymentMethods(customerId, 'card'),
      customersListAllPaymentMethods(customerId, 'us_bank_account'),
      listLegacyBankSources(customerId)
    ]);

    // Merge & de-dup cards
    const cardMap = new Map();
    [...(cardsA||[]), ...(cardsB||[])].forEach(pm => { if (!cardMap.has(pm.id)) cardMap.set(pm.id, pm); });

    // Merge & de-dup us_bank_account PMs (payment methods)
    const bankPmMap = new Map();
    [...(banksA||[]), ...(banksB||[])].forEach(pm => {
      if (pm.type === 'us_bank_account' && !bankPmMap.has(pm.id)) bankPmMap.set(pm.id, pm);
    });

    // 3) Verified only from PaymentMethods (we can *display* non-verified if force-included, but not for charging)
    let bankPMs = Array.from(bankPmMap.values());
    const bankPMsVerified = bankPMs.filter(pm => pm.us_bank_account?.status === 'verified');

    // 4) Legacy bank accounts (ba_...) -> treat as separate source family; we surface verified ones
    // Some older customers will ONLY have ba_ sources.
    const legacyBankShaped = (legacyBanks || []).map(ba => shapeBankSource(ba, { reason: 'legacy_source' }));

    // 5) Merge default PM if it’s a verified ACH and missing
    const bankIds = new Set(bankPMsVerified.map(b => b.id));
    if (defaultPMObj && defaultPMObj.object === 'payment_method' && defaultPMObj.type === 'us_bank_account') {
      const isVerified = defaultPMObj.us_bank_account?.status === 'verified';
      if (!bankIds.has(defaultPMObj.id)) {
        if (isVerified) {
          bankPMsVerified.push(defaultPMObj);
          bankIds.add(defaultPMObj.id);
          console.log('Merged missing verified ACH default PM:', defaultPMObj.id);
        } else {
          console.log('Default ACH PM present but not verified:', defaultPMObj.id, defaultPMObj.us_bank_account?.status);
        }
      }
    }

    // 6) Force-include a specific pm_... if requested (for your debugging)
    if (includePmId) {
      try {
        const forced = await stripe.paymentMethods.retrieve(includePmId);
        if (forced?.customer && forced.customer !== customerId) {
          console.warn('includePmId belongs to a different customer:', includePmId, 'owner:', forced.customer);
        } else if (forced && forced.type === 'us_bank_account') {
          if (!bankIds.has(forced.id)) {
            bankPMsVerified.push(forced);
            bankIds.add(forced.id);
            console.log('Force-included ACH PM:', forced.id, 'status:', forced.us_bank_account?.status);
          }
        } else if (forced && forced.type === 'card') {
          if (!cardMap.has(forced.id)) {
            cardMap.set(forced.id, forced);
            console.log('Force-included card PM:', forced.id);
          }
        }
      } catch (e) {
        console.warn('Failed to retrieve includePmId:', includePmId, e?.message || e);
      }
    }

    // 7) Shape unified payload:
    //    - Cards (always include)
    //    - Verified ACH PaymentMethods
    //    - Verified legacy bank sources (ba_...) if present
    const unified = [
      ...Array.from(cardMap.values()).map(shapeCard),
      ...bankPMsVerified.map(pm => shapeBankPM(pm, { reason: 'verified_pm' })),
      ...legacyBankShaped.filter(x => x.verified)  // only verified legacy sources
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethods: unified,
        defaultPaymentMethod: defaultPMObj?.id || customer.invoice_settings?.default_payment_method || null,
        // Debug breadcrumbs (optional to inspect in Network tab)
        _debug: {
          used_list_paymentMethods: { cardsA: (cardsA||[]).length, banksA: (banksA||[]).length },
          used_customers_listPaymentMethods: { cardsB: (cardsB||[]).length, banksB: (banksB||[]).length },
          legacy_banks: (legacyBanks||[]).length,
          default_source: defaultSourceObj ? { id: defaultSourceObj.id, object: defaultSourceObj.object } : null
        }
      })
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

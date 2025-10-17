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

function shapeBank(pm) {
  return {
    id: pm.id,
    type: 'us_bank_account',
    bank: {
      bank_name: pm.us_bank_account?.bank_name || 'Bank Account',
      last4: pm.us_bank_account?.last4 || '',
      account_type: pm.us_bank_account?.account_type || '',   // checking | savings
      status: pm.us_bank_account?.status || '',               // verified | ...
    }
  };
}

exports.handler = async (event) => {
  try {
    const { customerId, includePmId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // 1) List attached cards & us_bank_account PMs
    const [cardsList, banksRawList] = await Promise.all([
      listAllPaymentMethods(customerId, 'card'),
      listAllPaymentMethods(customerId, 'us_bank_account'),
    ]);

    // Keep only VERIFIED ACH bank accounts
    const banksVerified = (banksRawList || []).filter(pm => pm.us_bank_account?.status === 'verified');

    // 2) Retrieve customer (to know default PM)
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    const defaultPMObj = customer.invoice_settings?.default_payment_method || null;
    const defaultPmId = defaultPMObj?.id || null;

    // 3) If default PM is a verified ACH and not in banksVerified, merge it in
    const banksIds = new Set(banksVerified.map(b => b.id));
    if (defaultPMObj && defaultPMObj.object === 'payment_method' && defaultPMObj.type === 'us_bank_account') {
      const isVerified = defaultPMObj.us_bank_account?.status === 'verified';
      if (isVerified && !banksIds.has(defaultPMObj.id)) {
        banksVerified.push(defaultPMObj);
        banksIds.add(defaultPMObj.id);
        console.log('Added missing verified ACH default PM:', defaultPMObj.id);
      }
    }

    // 4) Optional: explicitly include a specific PM ID (for debugging/guaranteeing presence)
    if (includePmId) {
      try {
        const forced = await stripe.paymentMethods.retrieve(includePmId);
        if (forced?.customer === customerId) {
          if (forced.type === 'card') {
            // Add if not already there
            const exists = cardsList.some(c => c.id === forced.id);
            if (!exists) {
              cardsList.push(forced);
              console.log('Force-included card PM:', forced.id);
            }
          } else if (forced.type === 'us_bank_account') {
            // For ACH we still only expose verified accounts
            if (forced.us_bank_account?.status === 'verified' && !banksIds.has(forced.id)) {
              banksVerified.push(forced);
              banksIds.add(forced.id);
              console.log('Force-included verified ACH PM:', forced.id);
            }
          }
        } else {
          console.warn('includePmId provided but PM.customer mismatch or not found:', includePmId);
        }
      } catch (e) {
        console.warn('Failed to retrieve includePmId:', includePmId, e?.message || e);
      }
    }

    // 5) Shape unified payload
    const unified = [
      ...cardsList.map(shapeCard),
      ...banksVerified.map(shapeBank),
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethods: unified,
        defaultPaymentMethod: defaultPmId
      })
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

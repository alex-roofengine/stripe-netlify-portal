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

function shapeBankPM(pm, reason) {
  const status = pm.us_bank_account?.status || '';
  const verified = status === 'verified';
  return {
    id: pm.id,
    type: 'us_bank_account',
    source_family: 'payment_method',
    verified,
    bank: {
      bank_name: pm.us_bank_account?.bank_name || 'Bank Account',
      last4: pm.us_bank_account?.last4 || '',
      account_type: pm.us_bank_account?.account_type || '', // checking | savings
      status
    },
    _reason: reason || undefined
  };
}

exports.handler = async (event) => {
  try {
    const { customerId, includePmId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // Retrieve customer with default PM expanded
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    const defaultPMObj = customer.invoice_settings?.default_payment_method || null;
    const defaultPmId  = defaultPMObj?.id || null;

    // List via BOTH APIs for redundancy
    const [cardsA, banksA, cardsB, banksB] = await Promise.all([
      listAllPaymentMethods(customerId, 'card'),
      listAllPaymentMethods(customerId, 'us_bank_account'),
      customersListAllPaymentMethods(customerId, 'card'),
      customersListAllPaymentMethods(customerId, 'us_bank_account'),
    ]);

    // De-dup cards
    const cardMap = new Map();
    [...(cardsA||[]), ...(cardsB||[])].forEach(pm => { if (!cardMap.has(pm.id)) cardMap.set(pm.id, pm); });

    // De-dup banks
    const bankMap = new Map();
    [...(banksA||[]), ...(banksB||[])].forEach(pm => {
      if (pm.type === 'us_bank_account' && !bankMap.has(pm.id)) bankMap.set(pm.id, pm);
    });

    // Merge default PM if missing (even if not verified)
    if (defaultPMObj && defaultPMObj.object === 'payment_method' && defaultPMObj.type === 'us_bank_account') {
      if (!bankMap.has(defaultPMObj.id)) {
        bankMap.set(defaultPMObj.id, defaultPMObj);
        console.log('Merged default ACH PM not in list:', defaultPMObj.id, defaultPMObj.us_bank_account?.status);
      }
    }

    // Force include a specific PM for debugging if requested
    if (includePmId) {
      try {
        const forced = await stripe.paymentMethods.retrieve(includePmId);
        if (forced?.customer && forced.customer !== customerId) {
          console.warn('includePmId belongs to a different customer:', includePmId, 'owner:', forced.customer);
        } else if (forced) {
          if (forced.type === 'card' && !cardMap.has(forced.id)) {
            cardMap.set(forced.id, forced);
            console.log('Force-included card PM:', forced.id);
          } else if (forced.type === 'us_bank_account' && !bankMap.has(forced.id)) {
            bankMap.set(forced.id, forced);
            console.log('Force-included ACH PM:', forced.id, forced.us_bank_account?.status);
          }
        }
      } catch (e) {
        console.warn('Failed to retrieve includePmId:', includePmId, e?.message || e);
      }
    }

    const cards = Array.from(cardMap.values()).map(shapeCard);
    const banks = Array.from(bankMap.values()).map(pm => shapeBankPM(pm, 'listed_or_merged'));

    // Build debug status list so you can see what Stripe returns
    const bankStatuses = Array.from(bankMap.values()).map(pm => ({
      id: pm.id,
      status: pm.us_bank_account?.status || 'unknown'
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethods: [...cards, ...banks],
        defaultPaymentMethod: defaultPmId,
        _debug: {
          used_list_paymentMethods: { cardsA: (cardsA||[]).length, banksA: (banksA||[]).length },
          used_customers_listPaymentMethods: { cardsB: (cardsB||[]).length, banksB: (banksB||[]).length },
          bankStatuses
        }
      })
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

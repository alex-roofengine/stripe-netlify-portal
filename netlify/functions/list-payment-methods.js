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

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    // 1) List attached cards & us_bank_account PMs
    const [cards, banksRaw] = await Promise.all([
      listAllPaymentMethods(customerId, 'card'),
      listAllPaymentMethods(customerId, 'us_bank_account'),
    ]);

    // Keep only VERIFIED ACH bank accounts
    const banks = (banksRaw || []).filter(pm => pm.us_bank_account?.status === 'verified');

    // 2) Retrieve customer (to know default PM and possibly merge it if missing)
    //    We expand the default_payment_method so we can inspect it immediately.
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });

    const defaultPM = customer.invoice_settings?.default_payment_method || null;

    // 3) If default PM exists and is a verified ACH, but not in our banks list, merge it in.
    if (defaultPM && defaultPM.object === 'payment_method' && defaultPM.type === 'us_bank_account') {
      const isVerified = defaultPM.us_bank_account?.status === 'verified';
      const alreadyListed = banks.some(b => b.id === defaultPM.id);
      if (isVerified && !alreadyListed) {
        banks.push(defaultPM);
      }
    }

    // 4) Shape unified array for the frontend
    const unified = [
      ...cards.map(pm => ({
        id: pm.id,
        type: 'card',
        card: {
          brand: pm.card?.brand || '',
          last4: pm.card?.last4 || '',
          exp_month: pm.card?.exp_month || '',
          exp_year: pm.card?.exp_year || '',
        }
      })),
      ...banks.map(pm => ({
        id: pm.id,
        type: 'us_bank_account',
        bank: {
          bank_name: pm.us_bank_account?.bank_name || 'Bank Account',
          last4: pm.us_bank_account?.last4 || '',
          account_type: pm.us_bank_account?.account_type || '',   // checking | savings
          status: pm.us_bank_account?.status || '',               // verified (filtered)
        }
      })),
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethods: unified,
        defaultPaymentMethod: customer.invoice_settings?.default_payment_method?.id || null
      })
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

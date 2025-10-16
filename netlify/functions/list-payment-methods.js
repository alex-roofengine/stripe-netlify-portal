// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });

async function listAllPaymentMethods(customer, type) {
  let all = [];
  let starting_after = undefined;
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

    // 1) Cards
    const cards = await listAllPaymentMethods(customerId, 'card');

    // 2) US bank accounts (ACH)
    const banksRaw = await listAllPaymentMethods(customerId, 'us_bank_account');
    // Only keep VERIFIED bank accounts
    const banks = banksRaw.filter(pm => pm.us_bank_account?.status === 'verified');

    // 3) Customer (for default)
    const customer = await stripe.customers.retrieve(customerId);

    // 4) Shape a single unified list
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
          status: pm.us_bank_account?.status || '',               // verified (we filtered)
        }
      })),
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethods: unified,
        defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null
      })
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

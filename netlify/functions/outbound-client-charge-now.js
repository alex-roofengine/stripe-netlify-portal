// netlify/functions/outbound-client-charge-now.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount, statementDescriptor, description } = JSON.parse(event.body || '{}');

    if (!customerId || !paymentMethodId || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Retrieve PM to know its type
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

    let payment_method_types = [];
    if (pm.type === 'card') {
      payment_method_types = ['card'];
    } else if (pm.type === 'us_bank_account') {
      // You should only allow verified us_bank_account from the UI, which we do in list-payment-methods
      payment_method_types = ['us_bank_account'];
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: `Unsupported payment method type: ${pm.type}` }) };
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      payment_method_types,
      confirm: true,
      off_session: true,
      description: description || undefined,
      // Note: statement_descriptor is ignored for ACH at bank level, but allowed for card
      statement_descriptor: statementDescriptor || undefined,
    });

    const isAch = payment_method_types[0] === 'us_bank_account';

    return {
      statusCode: 200,
      body: JSON.stringify({
        payment_intent: intent,
        settlement_notice: isAch
          ? 'ACH debits can take up to 7 business days to settle and may show as processing until then.'
          : undefined
      })
    };
  } catch (err) {
    console.error('outbound-client-charge-now error:', err);

    // Bubble up Stripe error message if present
    const msg = err?.raw?.message || err.message || 'Charge failed';
    return { statusCode: 400, body: JSON.stringify({ error: msg }) };
  }
};

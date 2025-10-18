const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { customerId, paymentMethodId, amount, currency = 'usd', description, statementDescriptor } = body;
    if (!customerId || !paymentMethodId || !amount) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    const amt = Math.round(Number(amount) * 100);
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.type === 'us_bank_account') {
      const status = pm.us_bank_account && pm.us_bank_account.status;
      if (!['verified', 'instant_verified'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ error: `Bank account not verified (status: ${status})` }) };
      }
    }
    const intent = await stripe.paymentIntents.create({
      amount: amt, currency, customer: customerId, payment_method: paymentMethodId,
      confirm: true, off_session: true, setup_future_usage: 'off_session',
      description: description || undefined, statement_descriptor: statementDescriptor || undefined,
      payment_method_types: pm.type === 'us_bank_account' ? ['us_bank_account'] : ['card'],
    });
    return { statusCode: 200, body: JSON.stringify({ paymentIntent: intent }) };
  } catch (err) {
    console.error('outbound-client-charge-now error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};

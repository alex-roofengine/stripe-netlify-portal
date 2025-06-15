require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const { customerId, paymentMethodId } = JSON.parse(event.body);
  if (!customerId || !paymentMethodId) {
    return { statusCode: 400, body: 'Missing parameters' };
  }

  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

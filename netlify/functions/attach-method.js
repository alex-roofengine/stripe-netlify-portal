const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
exports.handler = async ({ body }) => {
  const { customerId, paymentMethodId } = JSON.parse(body);
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

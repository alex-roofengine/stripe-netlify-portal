// netlify/functions/set-default-method.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId } = JSON.parse(event.body);
    // Update the customer’s default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });
    return { statusCode: 200, body: '' };
  } catch (err) {
    return { statusCode: 400, body: err.message };
  }
};

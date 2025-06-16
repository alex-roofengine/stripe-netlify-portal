// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async function(event) {
  const { customerId } = event.queryStringParameters;

  // 1. List all card PMs
  const pmList = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  // 2. Fetch the customer so we know the default PM
  const customer = await stripe.customers.retrieve(customerId);

  return {
    statusCode: 200,
    body: JSON.stringify({
      paymentMethods: pmList.data,
      defaultPaymentMethod: customer.invoice_settings.default_payment_method
    })
  };
};

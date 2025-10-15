// netlify/functions/list-payment-methods.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' });

exports.handler = async (event) => {
  try {
    const { customerId } = event.queryStringParameters || {};
    if (!customerId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing customerId' })
      };
    }

    // 1) List card payment methods (raise limit so we see more)
    const pmList = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100
    });

    // 2) Fetch customer for default payment method (expanded safe)
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method']
    });

    // Normalize default PM to an ID string, regardless of expansion
    const def = customer?.invoice_settings?.default_payment_method;
    const defaultPaymentMethod =
      typeof def === 'string' ? def : def?.id || null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethods: pmList.data,
        defaultPaymentMethod
      })
    };
  } catch (err) {
    console.error('list-payment-methods error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};

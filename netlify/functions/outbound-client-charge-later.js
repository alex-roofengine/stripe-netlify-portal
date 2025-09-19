// netlify/functions/outbound-client-charge-later.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27'
});

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, priceId, startDate } = JSON.parse(event.body);

    if (!customerId || !paymentMethodId || !priceId) {
      throw new Error('Missing required fields: customerId, paymentMethodId, priceId');
    }

    // 1) Attach payment method if not already attached
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // 2) Convert startDate (YYYY-MM-DD) into trial_end timestamp
    let trial_end = 'now';
    if (startDate) {
      const scheduledTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      if (scheduledTimestamp <= now) {
        throw new Error('Start date must be in the future');
      }
      trial_end = scheduledTimestamp;
    }

    // 3) Get price details (so we can override the nickname/description)
    const price

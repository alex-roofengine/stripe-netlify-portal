// netlify/functions/schedule-charge.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27'
});

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, productId, date } = JSON.parse(event.body);

    // 1) Attach the payment method and set it as default
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // 2) Lookup an active price for your product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 1
    });
    if (!prices.data.length) {
      throw new Error('No active price found for product ' + productId);
    }
    const priceId = prices.data[0].id;

    // 3) Parse your chosen date (YYYY-MM-DD) into a UNIX timestamp (seconds)
    const scheduledTimestamp = Math.floor(new Date(date).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (scheduledTimestamp < now + 300) {
      throw new Error('Scheduled date must be at least 5 minutes in the future.');
    }

    // 4) Create a subscription that won't invoice until trial_end
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      default_payment_method: paymentMethodId,
      items: [{ price: priceId }],
      trial_end: scheduledTimestamp,
      proration_behavior: 'none',
      collection_method: 'charge_automatically',
      expand: ['latest_invoice.payment_intent']
    });

    return {
      statusCode: 200,
      body: JSON.stringify(subscription)
    };
  } catch (err) {
    console.error('schedule-charge error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};

// netlify/functions/outbound-client-charge-now.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27'
});

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, priceId } = JSON.parse(event.body);

    if (!customerId || !paymentMethodId || !priceId) {
      throw new Error('Missing required fields: customerId, paymentMethodId, priceId');
    }

    // 1) Attach payment method if not already attached
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // 2) Get price details so we can override description
    const price = await stripe.prices.retrieve(priceId);

    // 3) Create subscription (recurring immediately)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: priceId,
          metadata: { plan_type: 'outbound' },
          price_data: {
            currency: price.currency,
            product: price.product,
            unit_amount: price.unit_amount,
            recurring: price.recurring,
            nickname: 'RoofEngine Outbound'
          }
        }
      ],
      default_payment_method: paymentMethodId,
      proration_behavior: 'none',
      collection_method: 'charge_automatically',
      expand: ['latest_invoice.payment_intent']
    });

    return {
      statusCode: 200,
      body: JSON.stringify(subscription)
    };
  } catch (err) {
    console.error('outbound-client-charge-now error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};

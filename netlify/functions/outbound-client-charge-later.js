// netlify/functions/outbound-client-charge-later.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

exports.handler = async (event) => {
  try {
    const {
      customerId,
      paymentMethodId,
      amount,               // number in dollars
      currency = 'usd',
      date,                 // YYYY-MM-DD
      description,          // required
      productId,            // e.g. prod_TC1NUvIsUykBKs
    } = JSON.parse(event.body || '{}');

    if (!customerId || !paymentMethodId || !amount || !date || !description || !productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Attach & set default
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }).catch(() => {});
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Convert date to 9:00AM America/New_York -> unix seconds
    const target = new Date(`${date}T09:00:00-04:00`); // handles EDT; for EST months Stripe will still accept
    const trialEnd = Math.floor(target.getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (trialEnd <= now + 300) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Scheduled date must be at least 5 minutes in the future' }),
      };
    }

    // Create a price inline so you can pass any amount
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      default_payment_method: paymentMethodId,
      collection_method: 'charge_automatically',
      proration_behavior: 'none',
      trial_end: trialEnd,
      items: [
        {
          price_data: {
            currency,
            unit_amount: Math.round(Number(amount) * 100),
            product: productId,
            recurring: { interval: 'month' }, // needed by subscription API; we cancel immediately below
          },
        },
      ],
      // Ensure this reads properly on the charge
      payment_settings: {
        statement_descriptor: 'ROOFENGINE OUTBOUND',
      },
      description,
      metadata: {
        description,
        origin: 'outbound-later',
      },
      // Cancel after the first invoice finalizes so it acts like a "one-shot"
      cancel_at: trialEnd + 60,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ subscription }),
    };
  } catch (err) {
    console.error('outbound-client-charge-later error:', err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

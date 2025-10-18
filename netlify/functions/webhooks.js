// netlify/functions/webhooks.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  try {
    let stripeEvent;
    if (endpointSecret) {
      const sig = event.headers['stripe-signature'];
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
    } else {
      stripeEvent = JSON.parse(event.body);
    }

    const { type, data } = stripeEvent;
    const obj = data && data.object ? data.object : {};

    switch (type) {
      case 'payment_method.updated':
        if (obj.type === 'us_bank_account') {
          console.log(`ACH updated: ${obj.id} status=${obj.us_bank_account?.status}`);
        }
        break;
      case 'setup_intent.succeeded':
      case 'setup_intent.requires_action':
      case 'setup_intent.setup_failed':
      case 'payment_intent.processing':
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'charge.succeeded':
      case 'charge.failed':
      case 'charge.refunded':
      case 'charge.dispute.created':
        console.log(`Event ${type} id=${obj.id}`);
        break;
      default:
        // ignore the rest
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('webhooks error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

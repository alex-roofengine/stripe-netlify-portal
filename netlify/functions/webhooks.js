// netlify/functions/webhooks.js
// Minimal webhook receiver focused on ACH + off-session events.
// Set STRIPE_WEBHOOK_SECRET in Netlify to verify signatures.
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  try {
    let stripeEvent;

    if (endpointSecret) {
      const sig = event.headers['stripe-signature'];
      try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
      } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
      }
    } else {
      // Unsafe fallback for local testing
      stripeEvent = JSON.parse(event.body);
    }

    const { type, data } = stripeEvent;
    const obj = data && data.object ? data.object : {};

    switch (type) {
      case 'payment_method.updated': {
        if (obj.type === 'us_bank_account') {
          const status = obj.us_bank_account && obj.us_bank_account.status;
          console.log(`🔔 ACH payment_method.updated: ${obj.id} status=${status}`);
        }
        break;
      }
      case 'setup_intent.succeeded': {
        console.log(`✅ SetupIntent succeeded: ${obj.id}, customer=${obj.customer}, pm=${obj.payment_method}`);
        break;
      }
      case 'setup_intent.requires_action': {
        console.log(`🟡 SetupIntent requires_action: ${obj.id}`);
        break;
      }
      case 'setup_intent.setup_failed': {
        console.log(`❌ SetupIntent failed: ${obj.id}`);
        break;
      }
      case 'payment_intent.processing': {
        console.log(`⏳ PaymentIntent processing: ${obj.id}, amount=${obj.amount}, pm=${obj.payment_method}`);
        break;
      }
      case 'payment_intent.succeeded': {
        console.log(`✅ PaymentIntent succeeded: ${obj.id}, amount=${obj.amount}, pm=${obj.payment_method}`);
        break;
      }
      case 'payment_intent.payment_failed': {
        const err = obj.last_payment_error && obj.last_payment_error.message;
        console.log(`❌ PaymentIntent failed: ${obj.id}, error=${err || 'unknown'}`);
        break;
      }
      case 'charge.succeeded':
      case 'charge.failed':
      case 'charge.refunded':
      case 'charge.dispute.created': {
        console.log(`ℹ️ Charge event: ${type} id=${obj.id}`);
        break;
      }
      default: {
        console.log(`(ignored) Event ${type}`);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('webhooks error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

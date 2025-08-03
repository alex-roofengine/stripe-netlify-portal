// netlify/functions/create-setup-intent.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { customerId } = JSON.parse(event.body);
    // create a brand-new SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: setupIntent.client_secret })
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};

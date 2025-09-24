// netlify/functions/outbound-client-charge-later.js
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount, dueDate } = JSON.parse(event.body || "{}");
    if (!customerId || !paymentMethodId || !amount || !dueDate) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing fields." }) };
    }

    // 1) Attach PM and set as default for invoices (future off-session)
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // 2) Create a subscription that charges ONCE at future date.
    // We create an inline price for the exact amount you entered.
    const cents = Math.round(parseFloat(amount) * 100);
    const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      collection_method: "charge_automatically",
      trial_end: dueTimestamp,              // charge at this time
      expand: ["latest_invoice.payment_intent"],
      items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "RoofEngine Outbound Retainer (One-time scheduled)" },
            recurring: { interval: "month" }, // interval must exist, but we will cancel at first charge
            unit_amount: cents,
          },
        },
      ],
      // This helps Stripe prep PM for off-session when trial ends
      payment_settings: { save_default_payment_method: "on_subscription" },
      // Optional metadata to recognize this as a one-off scheduled charge
      metadata: { kind: "scheduled_one_time", scheduled_for: String(dueTimestamp) },
    });

    // NOTE:
    // - The customer is now "trialing". No charge happens until dueTimestamp.
    // - We'll cancel the subscription after first successful payment via webhook.

    return {
      statusCode: 200,
      body: JSON.stringify({ subscriptionId: subscription.id, status: subscription.status }),
    };
  } catch (err) {
    console.error("charge-later error:", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

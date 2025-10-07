// netlify/functions/outbound-client-charge-later.js
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

// Use your provided Stripe Product ID
const OUTBOUND_PRODUCT_ID = "prod_Sx2X1jtOt4xPzm";

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount, dueDate, requestId } = JSON.parse(event.body || "{}");

    // Basic validation
    if (!customerId || !paymentMethodId || !amount || !dueDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields." }),
      };
    }

    // 1️⃣ Attach the payment method to the customer and set it as default
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // 2️⃣ Convert amount and due date
    const cents = Math.round(parseFloat(amount) * 100);
    const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);

    // 3️⃣ Create a subscription that will automatically charge at trial_end
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      collection_method: "charge_automatically",
      trial_end: dueTimestamp, // charge when this date hits
      expand: ["latest_invoice.payment_intent"],
      items: [
        {
          price_data: {
            currency: "usd",
            product: OUTBOUND_PRODUCT_ID, // Fixed Product ID
            recurring: { interval: "month" }, // Required by Stripe, but we cancel after 1st charge
            unit_amount: cents,
          },
        },
      ],
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      description: "RoofEngine Outbound Retainer (Scheduled)",
      metadata: {
        kind: "scheduled_one_time",
        scheduled_for: String(dueTimestamp),
        created_by: "Netlify Function: outbound-client-charge-later",
      },
    },
    requestId ? { idempotencyKey: `sub-create-${requestId}` } : undefined);

    // ✅ Return confirmation to the frontend
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        nextInvoice: new Date(dueTimestamp * 1000).toISOString(),
      }),
    };
  } catch (err) {
    console.error("charge-later error:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

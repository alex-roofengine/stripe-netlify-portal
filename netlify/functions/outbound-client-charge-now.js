// netlify/functions/outbound-client-charge-now.js
const Stripe = require("stripe");
// Add the debug log here:
console.log("Stripe Key Value:", process.env.STRIPE_SECRET_KEY);

const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount } = JSON.parse(event.body);

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // Create one-time invoice item with custom amount
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: parseInt(amount) * 100, // cents
      currency: "usd",
      description: "RoofEngine Outbound Retainer"
    });

    // Create and pay invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: true,
    });

    return { statusCode: 200, body: JSON.stringify(invoice) };
  } catch (err) {
    console.error("charge-now error:", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

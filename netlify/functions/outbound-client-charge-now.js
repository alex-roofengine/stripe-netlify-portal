// netlify/functions/outbound-client-charge-now.js
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount } = JSON.parse(event.body || "{}");

    // Attach PM and set as default for invoices
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create invoice item
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: Math.round(parseFloat(amount) * 100),
      currency: "usd",
      description: "RoofEngine Outbound Retainer",
    });

    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: false, // we'll finalize + pay immediately ourselves
    });

    // Finalize and pay NOW
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    const paid = await stripe.invoices.pay(finalized.id, {
      // ensure the default_payment_method is used
      // (optional) expand to see the PaymentIntent on the response
      expand: ["payment_intent"],
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paid),
    };
  } catch (err) {
    console.error("charge-now error:", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

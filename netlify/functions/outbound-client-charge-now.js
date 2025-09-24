const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount, requestId } = JSON.parse(event.body || "{}");

    if (!customerId || !paymentMethodId || !amount || !requestId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing fields." }) };
    }

    // 1) Attach payment method and make it default for invoices
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // 2) Create line item
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: Math.round(parseFloat(amount) * 100), // cents
      currency: "usd",
      description: "RoofEngine Outbound Retainer", // line item label
    });

    // 3) Create invoice (we’ll finalize + pay immediately)
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: false, // we control finalization
      description: "RoofEngine Outbound Retainer",
      custom_fields: [{ name: "Service", value: "RoofEngine Outbound Retainer" }],
      metadata: { kind: "outbound_retainer" },
    }, { idempotencyKey: `inv-create-${requestId}` });

    // 4) Finalize the invoice now
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {
      idempotencyKey: `inv-finalize-${requestId}`,
    });

    // 5) Pay immediately (charges the default payment method)
    const paid = await stripe.invoices.pay(finalized.id, {
      expand: ["payment_intent"],
      idempotencyKey: `inv-pay-${requestId}`,
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

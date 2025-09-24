const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount, dueDate } = JSON.parse(event.body || "{}");

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    await stripe.invoiceItems.create({
      customer: customerId,
      amount: Math.round(parseFloat(amount) * 100),
      currency: "usd",
      description: "RoofEngine Outbound Retainer (Scheduled)",
    });

    // NOTE: Stripe only honors 'due_date' when collection_method === 'send_invoice'.
    // If you actually want an automatic charge at a future date, you'll need a different flow.
    const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      due_date: dueTimestamp,
      auto_advance: true, // finalize immediately so it’s viewable/payable
    });

    return { statusCode: 200, body: JSON.stringify(invoice) };
  } catch (err) {
    console.error("charge-later error:", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

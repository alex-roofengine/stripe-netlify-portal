const Stripe = require("stripe");
console.log("Stripe Key Value:", process.env.STRIPE_SECRET_KEY); // Debug log

const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount, dueDate } = JSON.parse(event.body);

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // Create invoice item
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: Math.round(parseFloat(amount) * 100), // Convert to cents
      currency: "usd",
      description: "RoofEngine Outbound Retainer (Scheduled)"
    });

    // Convert dueDate to UNIX timestamp (seconds)
    const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);

    // Create invoice with due date
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: false, // Don't finalize until ready
      due_date: dueTimestamp,
    });

    return { statusCode: 200, body: JSON.stringify(invoice) };
  } catch (err) {
    console.error("charge-later error:", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

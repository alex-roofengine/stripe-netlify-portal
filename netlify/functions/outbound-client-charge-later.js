// netlify/functions/outbound-client-charge-later.js
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-08-27" });

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, amount } = JSON.parse(event.body);

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // Create draft invoice with scheduled payment
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: parseInt(amount) * 100,
      currency: "usd",
      description: "RoofEngine Outbound Retainer (Scheduled)"
    });

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: false, // don’t charge immediately
    });

    return { statusCode: 200, body: JSON.stringify(invoice) };
  } catch (err) {
    console.error("charge-later error:", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
};

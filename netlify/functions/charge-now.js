// netlify/functions/charge-now.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27'
});

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, productId } = JSON.parse(event.body);

    // 1) Attach PM & make it default
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // 2) Find the product's active price
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 1
    });
    if (!prices.data.length) {
      throw new Error('No active price found for product');
    }
    const priceId = prices.data[0].id;

    // 3) Create invoice item
    await stripe.invoiceItems.create({
      customer: customerId,
      price: priceId
    });

    // 4) Create & pay the invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: true  // auto-finalize & attempt payment
    });
    const paidInvoice = await stripe.invoices.pay(invoice.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ invoice: paidInvoice })
    };
  } catch (err) {
    console.error('charge-now error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

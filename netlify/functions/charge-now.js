// netlify/functions/charge-now.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
});

exports.handler = async (event) => {
  try {
    const { customerId, paymentMethodId, productId } = JSON.parse(event.body);

    // 1) Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // 2) Make it the default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // 3) Look up an active price for the given product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 1,
    });
    if (!prices.data.length) {
      throw new Error(`No active price found for product ${productId}`);
    }
    const priceId = prices.data[0].id;

    // 4) Create an invoice item for that price
    await stripe.invoiceItems.create({
      customer: customerId,
      price: priceId,
    });

    // 5) Create & finalize the invoice (auto_advance: true will attempt payment)
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: true,
    });

    // 6) Pay the invoice immediately
    const paidInvoice = await stripe.invoices.pay(invoice.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ invoice: paidInvoice }),
    };
  } catch (err) {
    console.error('charge-now error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

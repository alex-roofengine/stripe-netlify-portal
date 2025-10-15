// netlify/functions/list-invoices-detailed.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { customerId, limit } = event.queryStringParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customerId' }) };
    }

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: limit ? Number(limit) : 30, // recent 30
      expand: ['data.charge', 'data.payment_intent.charges']
    });

    const detailed = invoices.data.map(inv => {
      // Prefer charge on invoice, else look at PI charges.
      let charge = inv.charge || (inv.payment_intent?.charges?.data?.[0] ?? null);

      let pmCard = null;
      let statementDescriptor = null;
      if (charge) {
        statementDescriptor = charge.statement_descriptor || charge.calculated_statement_descriptor || null;

        const pmd = charge.payment_method_details;
        if (pmd && pmd.card) {
          pmCard = {
            brand: pmd.card.brand,
            last4: pmd.card.last4,
            exp_month: pmd.card.exp_month,
            exp_year: pmd.card.exp_year
          };
        }
      }

      // Description guess (top-level invoice line)
      const firstLine = inv.lines?.data?.[0];
      const description = firstLine?.description || inv.description || null;

      return {
        id: inv.id,
        created: inv.created,
        amount_paid: inv.amount_paid,
        amount_due: inv.amount_due,
        amount_remaining: inv.amount_remaining,
        currency: inv.currency,
        status: inv.status, // paid, open, uncollectible, void, draft
        hosted_invoice_url: inv.hosted_invoice_url,
        statement_descriptor: statementDescriptor,
        description,
        payment_method_card: pmCard
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detailed)
    };
  } catch (err) {
    console.error('list-invoices-detailed error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

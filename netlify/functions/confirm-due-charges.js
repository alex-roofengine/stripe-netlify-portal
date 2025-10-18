// netlify/functions/confirm-due-charges.js
// Netlify Scheduled Function: confirm charge-later PIs when due (every 15 min).
// Requires: STRIPE_SECRET_KEY

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// Run every 15 minutes
exports.config = { schedule: '*/15 * * * *' };

exports.handler = async () => {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Search PIs that are not confirmed yet (requires_confirmation) and marked for charge later
    const query = "status:'requires_confirmation' AND metadata['charge_later']:'true' AND -metadata['cancelled']:'true'";

    let confirmed = [];
    let skipped = [];
    let failed = [];

    let page = null;
    do {
      const res = await stripe.paymentIntents.search({ query, limit: 100, page });
      for (const pi of res.data) {
        const md = pi.metadata || {};
        const dueUnix = Number(md.desired_charge_at_unix || 0);
        if (!dueUnix || Number.isNaN(dueUnix)) { skipped.push({ id: pi.id, reason: 'no_due_time' }); continue; }
        if (dueUnix > now) { skipped.push({ id: pi.id, reason: `not_due (${dueUnix} > ${now})` }); continue; }

        try {
          const confirmedPI = await stripe.paymentIntents.confirm(pi.id, { off_session: true });
          confirmed.push({ id: confirmedPI.id, status: confirmedPI.status });
        } catch (err) {
          failed.push({ id: pi.id, error: err.message });
        }
      }
      page = res.next_page || null;
    } while (page);

    const summary = { ok: true, confirmed, skipped, failed, now };
    console.log('confirm-due-charges:', JSON.stringify(summary));
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error('confirm-due-charges error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

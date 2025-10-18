// netlify/functions/scheduler-confirm-due.js
// Confirm any PI with metadata.charge_later === 'true' whose scheduled
// local time (metadata.schedule_date + schedule_time in schedule_tz) has passed.
// Netlify scheduled function: runs automatically.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// Run every 10 minutes
exports.config = {
  schedule: '@every 10m'
};

// Build a comparable key like 20251020 0900 for a Date in a given TZ
function zKeyFor(dateUTC, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    time

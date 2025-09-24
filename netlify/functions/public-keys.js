// netlify/functions/public-keys.js
exports.handler = async () => {
  // Return only the publishable key (safe for the browser).
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY; // should start with pk_...

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ publishableKey }),
  };
};

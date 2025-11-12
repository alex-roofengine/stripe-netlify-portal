const crypto = require('crypto');
const fetch = require('node-fetch');

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token, secret) {
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expected) throw new Error('bad signature');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

exports.handler = async (event) => {
  try {
    const APP_URL = process.env.APP_URL;
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const SESSION_SECRET = process.env.SESSION_SECRET;
    const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN;

    const url = new URL(`${APP_URL}${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookies = Object.fromEntries((event.headers.cookie || '')
      .split(';').map(c => c.trim().split('=')));

    if (!code || !state || cookies.oauth_state !== state) {
      return { statusCode: 400, body: 'Invalid OAuth state' };
    }

    // Exchange the code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${APP_URL}/.netlify/functions/auth-callback`,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenRes.ok) return { statusCode: 500, body: 'Token exchange failed' };
    const tokens = await tokenRes.json();

    // Decode the ID token (JWT) to get email (skipping JWK verify for brevity)
    const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf8'));
    const email = payload.email || '';
    const emailVerified = payload.email_verified;

    if (!emailVerified) return { statusCode: 403, body: 'Email not verified' };
    if (ALLOWED_EMAIL_DOMAIN && !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      return { statusCode: 403, body: 'Forbidden (domain)' };
    }

    // Create our own signed session cookie (email + expiry)
    const session = sign(
      { email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }, // 8h
      SESSION_SECRET
    );

    const cookieParts = [
      `session=${session}`,
      'HttpOnly', 'Secure', 'Path=/', 'SameSite=Lax', 'Max-Age=28800'
    ];

    return {
      statusCode: 302,
      headers: {
        Location: '/portal/',
        'Set-Cookie': [
          cookieParts.join('; '),
          'oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax' // clear state
        ]
      }
    };
  } catch (e) {
    return { statusCode: 500, body: `Auth error: ${e.message}` };
  }
};

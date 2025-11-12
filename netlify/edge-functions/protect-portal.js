export default async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;

  // Allowlist public routes needed before login
  const allow = [
    '/login.html',
    '/favicon.ico',
    '/robots.txt',
    '/.netlify/functions/login',
    '/.netlify/functions/auth-callback',
    '/.netlify/functions/logout',
    '/assets/', '/images/', '/css/', '/js/', '/_next/', '/build/'
  ];
  if (p === '/' || p === '/index.html') {
    // send visitors to login by default
    return Response.redirect(new URL('/login.html', req.url), 302);
  }
  if (allow.some(a => p === a || p.startsWith(a))) return; // let it through

  // --- session check (same scheme as your auth-callback) ---
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return Response.redirect(new URL('/login.html', req.url), 302);

  const [body, sig] = m[1].split('.');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(Deno.env.get('SESSION_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const expected = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  if (sig !== expectedB64) return new Response('Forbidden', { status: 403 });

  const claims = JSON.parse(atob(body));
  if (!claims?.email || claims.exp * 1000 < Date.now()) {
    return Response.redirect(new URL('/login.html', req.url), 302);
  }

  const domain = Deno.env.get('ALLOWED_EMAIL_DOMAIN');
  if (domain && !String(claims.email).endsWith(`@${domain}`)) {
    return new Response('Forbidden', { status: 403 });
  }

  // allow request
  return;
};

export const config = { path: ['/*'] };

export default async (req) => {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return Response.redirect(new URL('/login.html', req.url), 302);

  // Verify signature (same scheme as function)
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
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  if (sig !== expectedB64) return new Response('Forbidden', { status: 403 });

  const claims = JSON.parse(atob(body));
  if (claims.exp * 1000 < Date.now()) return Response.redirect(new URL('/login.html', req.url), 302);

  // If you also want a domain check here:
  const domain = Deno.env.get('ALLOWED_EMAIL_DOMAIN');
  if (domain && !String(claims.email || '').endsWith(`@${domain}`)) {
    return new Response('Forbidden', { status: 403 });
  }

  // allow request through
  return;
};

export const config = { path: ['/portal/*'] };

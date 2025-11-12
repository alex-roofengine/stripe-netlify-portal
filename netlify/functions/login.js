exports.handler = async (event) => {
  const APP_URL = process.env.APP_URL;
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

  // create a simple CSRF state and store it in a short-lived cookie
  const state = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${APP_URL}/.netlify/functions/auth-callback`,
    response_type: 'code',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    access_type: 'online',
    state
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; Path=/; Max-Age=600; SameSite=Lax`
    }
  };
};

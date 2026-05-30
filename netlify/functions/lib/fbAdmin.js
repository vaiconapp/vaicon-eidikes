// Κοινός βοηθός: ταυτότητα Service Account για κλήσεις στη Realtime DB.
// Env: FIREBASE_SERVICE_ACCOUNT (JSON), FIREBASE_DB_URL.
// Αν λείπει το service account, οι κλήσεις γίνονται όπως πριν (fallback).

const crypto = require('crypto');

const dbBase = () => (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cachedToken = null, cachedExp = 0;

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const getAccessToken = async () => {
  if (cachedToken && Date.now() < cachedExp - 60000) return cachedToken;
  const sa = getServiceAccount();
  if (!sa?.client_email || !sa?.private_key) return null;
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud, iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
  try {
    const res = await fetch(aud, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const data = await res.json();
    if (!data.access_token) return null;
    cachedToken = data.access_token;
    cachedExp = Date.now() + Number(data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch { return null; }
};

const fbFetch = async (url, options) => {
  const base = dbBase();
  if (base && url.indexOf(base) === 0 && url.indexOf('access_token=') === -1 && url.indexOf('auth=') === -1) {
    const token = await getAccessToken();
    if (token) url += (url.indexOf('?') === -1 ? '?' : '&') + 'access_token=' + token;
  }
  return fetch(url, options);
};

module.exports = { fbFetch, dbBase, getAccessToken };

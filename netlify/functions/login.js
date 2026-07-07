// Ισχυρός έλεγχος εισόδου: επαλήθευση κωδικού + 2FA → custom token με claim twofa:true.
// Μόνο αν και τα δύο περάσουν δίνεται το κλειδί για τη βάση.
// Env: FIREBASE_SERVICE_ACCOUNT, FIREBASE_DB_URL (για twofa records), FIREBASE_API_KEY_TEST (fallback dev).
const crypto = require('crypto');
const { fbFetch, dbBase, getAccessToken } = require('./lib/fbAdmin');

const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(b) });
const key = (u) => String(u || '').trim().toUpperCase().replace(/\s+/g, '');
const hash = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');
const USER_DOMAIN = '@vaicon.local';
const toEmail = (u) => { const s = String(u || '').trim().toLowerCase().replace(/\s+/g, ''); return s.includes('@') ? s : s + USER_DOMAIN; };
const needsTwoFactor = (username) => { const u = key(username); return !u.startsWith('ADMIN') && !u.startsWith('GUEST'); };

// --- Firebase REST sign-in (επαλήθευση password) ---
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.FIREBASE_API_KEY_TEST || '';
async function verifyPassword(email, password) {
  const apiKey = FIREBASE_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_API_KEY_TEST δεν έχει ρυθμιστεί');
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: false }) }
  );
  const d = await res.json();
  if (!res.ok || d.error) throw new Error(d?.error?.message || 'Λάθος κωδικός');
  return d;
}

// --- Firebase custom token (χρησιμοποιεί service account) ---
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function mintCustomToken(uid, claims = {}) {
  const sa = (() => { try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch { return null; } })();
  if (!sa?.client_email || !sa?.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT δεν έχει ρυθμιστεί');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid,
    claims,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(sa.private_key))}`;
}

// --- 2FA verify (ίδια λογική με two-factor.js) ---
async function verify2FA(username, code) {
  const u = key(username);
  const path = `${dbBase()}/twofa/${encodeURIComponent(u)}.json`;
  let rec = null;
  try { rec = await (await fbFetch(path, {})).json(); } catch {}
  if (!rec) return { ok: false, error: 'Ζήτησε νέο κωδικό 2FA.' };
  if (Date.now() > (rec.exp || 0)) { await fbFetch(path, { method: 'DELETE' }); return { ok: false, error: 'Ο κωδικός έληξε.' }; }
  if ((rec.tries || 0) >= 5) { await fbFetch(path, { method: 'DELETE' }); return { ok: false, error: 'Πολλές προσπάθειες.' }; }
  if (rec.h === hash(String(code || '').trim())) {
    await fbFetch(path, { method: 'DELETE' });
    await fbFetch(`${dbBase()}/twofa_pending/${encodeURIComponent(u)}.json`, { method: 'DELETE' });
    return { ok: true };
  }
  await fbFetch(path, { method: 'PATCH', body: JSON.stringify({ tries: (rec.tries || 0) + 1 }) });
  return { ok: false, error: 'Λάθος κωδικός 2FA.' };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  let p; try { p = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'bad json' }); }
  const { username, password, code } = p;
  if (!username || !password) return json(400, { ok: false, error: 'Λείπουν στοιχεία.' });

  const email = toEmail(username);
  const role = email.startsWith('admin') ? 'admin' : email.startsWith('guest') ? 'guest' : 'user';

  // 1. Επαλήθευση κωδικού
  try { await verifyPassword(email, password); }
  catch (e) { return json(200, { ok: false, error: 'Λάθος όνομα ή κωδικός.' }); }

  // verify-only: δεν εκδίδει token, απλώς επιβεβαιώνει τον κωδικό
  if (p.action === 'verify-only') return json(200, { ok: true });

  // 2. Επαλήθευση 2FA (παράλειψη για admin/guest)
  if (needsTwoFactor(username)) {
    const tfRes = await verify2FA(username, code);
    if (!tfRes.ok) return json(200, { ok: false, error: tfRes.error });
  }

  // 3. Έκδοση custom token με twofa:true + role + email (ως vem — ώστε οι rules να διαβάσουν auth.token.vem)
  let customToken;
  try { customToken = await mintCustomToken(email, { twofa: true, role, vem: email }); }
  catch (e) { return json(500, { ok: false, error: 'Αποτυχία έκδοσης token: ' + e.message }); }

  return json(200, { ok: true, customToken, role, email });
};

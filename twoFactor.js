// 2FA. DEV (localhost): ο κωδικός εμφανίζεται στην οθόνη (χωρίς server).
// PROD: start → server παράγει κωδικό (μετά επαλήθευση κωδικού εισόδου).
//       verify → server επαληθεύει κωδικό + κωδικό εισόδου → επιστρέφει custom token.
export const IS_DEV = typeof window !== 'undefined' &&
  /^(localhost$|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test((window.location && window.location.hostname) || '');

const FN_TWOFA = '/.netlify/functions/two-factor';
const FN_LOGIN = '/.netlify/functions/login';
const AGE = 5 * 60 * 1000;
let devCode = null, devExp = 0;

export async function start2FA(username, password = '') {
  if (IS_DEV) {
    devCode = String(Math.floor(100000 + Math.random() * 900000));
    devExp = Date.now() + AGE;
    return { ok: true, devCode };
  }
  try {
    const r = await fetch(FN_TWOFA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', username, password }) });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d.ok, error: d.error };
  } catch { return { ok: false, error: 'Σφάλμα σύνδεσης.' }; }
}

export async function verify2FA(username, code, password = '') {
  const c = String(code || '').trim();
  if (IS_DEV) {
    if (!devCode || Date.now() > devExp) return { ok: false, error: 'Ο κωδικός έληξε — ζήτησε νέο.' };
    return c === devCode ? { ok: true } : { ok: false, error: 'Λάθος κωδικός.' };
  }
  try {
    const r = await fetch(FN_LOGIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, code: c }) });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d.ok, error: d.error, customToken: d.customToken, email: d.email, role: d.role };
  } catch { return { ok: false, error: 'Σφάλμα σύνδεσης.' }; }
}

export async function loginDirect(username, password) {
  if (IS_DEV) return { ok: false, error: 'DEV: χρήση Firebase Auth' };
  try {
    const r = await fetch(FN_LOGIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, code: '' }) });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d.ok, error: d.error, customToken: d.customToken, email: d.email, role: d.role };
  } catch { return { ok: false, error: 'Σφάλμα σύνδεσης.' }; }
}

export async function verifyPasswordOnly(username, password) {
  if (IS_DEV) return { ok: false };
  try {
    const r = await fetch(FN_LOGIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify-only', username, password, code: '' }) });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d.ok };
  } catch { return { ok: false }; }
}

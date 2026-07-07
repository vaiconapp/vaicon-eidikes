// 2FA: στέλνει εξαψήφιο κωδικό στο κινητό του διαχειριστή (OWNER_PHONE) & επαληθεύει server-side.
// Env: OWNER_PHONE, YUBOTO_API_KEY, YUBOTO_SENDER, YUBOTO_TEST_MODE, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DB_URL.
const crypto = require('crypto');
const { fbFetch, dbBase } = require('./lib/fbAdmin');

const YUBOTO_ENDPOINT = 'https://services.yuboto.com/omni/v1/Send';
const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(b) });
const key = (u) => String(u || '').trim().toUpperCase().replace(/\s+/g, '');
const hash = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');
const norm = (p) => { const d = String(p || '').replace(/\D/g, ''); return d ? '30' + d.replace(/^(0030|30)/, '').replace(/^0+/, '') : ''; };

const sendSms = async (phone, text) => {
  const apiKey = process.env.YUBOTO_API_KEY;
  const sender = process.env.YUBOTO_SENDER || 'VAICON';
  if ((process.env.YUBOTO_TEST_MODE || 'true').toLowerCase() === 'true') {
    console.log(`[2FA TEST] to=${phone} text="${text}"`); return true;
  }
  if (!apiKey) return false;
  try {
    const r = await fetch(YUBOTO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': 'Basic ' + apiKey },
      body: JSON.stringify({ contacts: [{ phonenumber: phone }], sms: { sender, text, validity: 60, typesms: 'sms', priority: 1 } }),
    });
    return r.ok;
  } catch { return false; }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  let p; try { p = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'bad json' }); }
  const u = key(p.username);
  if (!u) return json(400, { ok: false, error: 'no user' });
  const path = `${dbBase()}/twofa/${encodeURIComponent(u)}.json`;

  if (p.action === 'start') {
    // Επαλήθευση κωδικού εισόδου πριν παραχθεί ο κωδικός 2FA (anti-spam)
    if (p.password) {
      const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.FIREBASE_API_KEY_TEST || '';
      if (FIREBASE_API_KEY) {
        const email = String(u).toLowerCase() + '@vaicon.local';
        try {
          const vr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: p.password, returnSecureToken: false }),
          });
          const vd = await vr.json();
          if (!vr.ok || vd.error) return json(200, { ok: false, error: 'Λάθος κωδικός.' });
        } catch { return json(500, { ok: false, error: 'Σφάλμα σύνδεσης.' }); }
      }
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exp = Date.now() + 5 * 60 * 1000;
    await fbFetch(path, { method: 'PUT', body: JSON.stringify({ h: hash(code), exp, tries: 0 }) });
    const pendingPath = `${dbBase()}/twofa_pending/${encodeURIComponent(u)}.json`;
    await fbFetch(pendingPath, { method: 'PUT', body: JSON.stringify({ code, exp, username: u }) });
    const phone = norm(process.env.OWNER_PHONE);
    if (phone) await sendSms(phone, `VAICON κωδικός εισόδου (${u}): ${code}`);
    return json(200, { ok: true });
  }

  if (p.action === 'verify') {
    let rec = null;
    try { rec = await (await fbFetch(path, {})).json(); } catch {}
    if (!rec) return json(200, { ok: false, error: 'Ζήτησε νέο κωδικό.' });
    if (Date.now() > (rec.exp || 0)) { await fbFetch(path, { method: 'DELETE' }); return json(200, { ok: false, error: 'Ο κωδικός έληξε.' }); }
    if ((rec.tries || 0) >= 5) { await fbFetch(path, { method: 'DELETE' }); return json(200, { ok: false, error: 'Πολλές προσπάθειες — ζήτησε νέο.' }); }
    if (rec.h === hash(String(p.code || '').trim())) {
      await fbFetch(path, { method: 'DELETE' });
      await fbFetch(`${dbBase()}/twofa_pending/${encodeURIComponent(u)}.json`, { method: 'DELETE' });
      return json(200, { ok: true });
    }
    await fbFetch(path, { method: 'PATCH', body: JSON.stringify({ tries: (rec.tries || 0) + 1 }) });
    return json(200, { ok: false, error: 'Λάθος κωδικός.' });
  }
  return json(400, { ok: false, error: 'unknown action' });
};

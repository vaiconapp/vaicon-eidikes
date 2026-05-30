// Netlify Function: Yuboto SMS sender (Phase 1 — Greek mobile numbers)
// Env vars:
//   YUBOTO_API_KEY   — Base64 API key από my.yuboto.com (υποχρεωτικό για live)
//   YUBOTO_SENDER    — εγκεκριμένο sender name (default: "VAICON")
//   YUBOTO_TEST_MODE — "true" => δεν στέλνει στο Yuboto, επιστρέφει success (default: "true")

const { fbFetch } = require('./lib/fbAdmin');

const YUBOTO_ENDPOINT = 'https://services.yuboto.com/omni/v1/Send';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const normalizePhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  const stripped = d.replace(/^(0030|30)/, '').replace(/^0+/, '');
  return '30' + stripped;
};

const baseUrl = () => (process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');

const saveMsgMap = async (id, orderId, channel) => {
  const db = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
  if (!db || !id || !orderId) return;
  try {
    await fbFetch(`${db}/msg_map/${encodeURIComponent(id)}.json`, {
      method: 'PUT',
      body: JSON.stringify({ orderId, channel, ts: Date.now() }),
    });
  } catch {}
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { success: false, error: 'Μη έγκυρο JSON' }); }

  const phone = normalizePhone(payload.phone);
  const message = String(payload.message || '').trim();
  const orderId = payload.orderId || null;
  if (!phone || !/^3069\d{8}$/.test(phone)) return json(400, { success: false, error: 'Μη έγκυρο ελληνικό κινητό' });
  if (!message) return json(400, { success: false, error: 'Κενό μήνυμα' });

  const apiKey = process.env.YUBOTO_API_KEY;
  const sender = process.env.YUBOTO_SENDER || 'VAICON';
  const testMode = (process.env.YUBOTO_TEST_MODE || 'true').toLowerCase() === 'true';

  if (testMode) {
    console.log(`[YUBOTO TEST MODE] to=${phone} sender=${sender} text="${message.slice(0, 60)}..."`);
    return json(200, { success: true, test: true, phone, sender });
  }

  if (!apiKey) return json(500, { success: false, error: 'Δεν έχει ρυθμιστεί το YUBOTO_API_KEY' });

  try {
    const resp = await fetch(YUBOTO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Basic ' + apiKey,
      },
      body: JSON.stringify({
        dlr: 'true',
        callbackUrl: `${baseUrl()}/.netlify/functions/dlr-callback`,
        contacts: [{ phonenumber: phone }],
        dateinToSend: null,
        timeinToSend: null,
        sms: {
          sender,
          text: message,
          validity: 180,
          typesms: 'sms',
          longsms: 'true',
          priority: 1,
        },
      }),
    });

    const data = await resp.json().catch(() => null);
    const first = Array.isArray(data) ? data[0] : (data?.Items?.[0] || data);
    const errorCode = first?.ErrorCode ?? first?.errorCode ?? null;
    const errorMsg = first?.ErrorMessage || first?.errorMessage || null;
    const msgId = first?.Id ?? first?.id ?? first?.MessageId ?? first?.messageId ?? null;

    if (resp.ok && (errorCode === 0 || errorCode === '0' || errorCode === null)) {
      if (msgId) await saveMsgMap(msgId, orderId, 'sms');
      return json(200, { success: true, data, msgId });
    }
    return json(200, { success: false, error: errorMsg || `Yuboto error ${errorCode ?? resp.status}`, data });
  } catch (e) {
    return json(500, { success: false, error: 'Σφάλμα σύνδεσης: ' + (e?.message || String(e)) });
  }
};

// Netlify Function: Yuboto DLR callback (ενημερώσεις κατάστασης SMS/Viber)
// Δέχεται POST/GET από Yuboto με το id του μηνύματος και την κατάσταση,
// βρίσκει το mapping στο /msg_map/{id} και ενημερώνει το special_orders/{id}/msgStatus/{channel}.
// Env: FIREBASE_DB_URL

const { fbFetch } = require('./lib/fbAdmin');

const ok = (body = 'OK') => ({ statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body });

const STATUS_RANK = { sent: 1, delivered: 2, read: 3 };

const mapStatus = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (/seen|read|αναγν/.test(s)) return 'read';
  if (/deliv|παραδ|^2$/.test(s)) return 'delivered';
  if (/sent|σταλ|^1$/.test(s)) return 'sent';
  if (/fail|undeliv|expir|reject|error|^0$/.test(s)) return 'failed';
  return s || null;
};

exports.handler = async (event) => {
  const db = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
  if (!db) return ok('no-db');

  let p = {};
  try {
    if (event.body) {
      const ct = (event.headers?.['content-type'] || '').toLowerCase();
      if (ct.includes('application/json')) p = JSON.parse(event.body);
      else p = Object.fromEntries(new URLSearchParams(event.body));
    }
  } catch {}
  p = { ...(event.queryStringParameters || {}), ...p };

  const id = p.id ?? p.Id ?? p.messageId ?? p.MessageId ?? p.smsId ?? null;
  const status = mapStatus(p.status ?? p.Status ?? p.dlrStatus ?? p.dlr ?? p.state);
  if (!id || !status) return ok('skip');

  try {
    const mapRes = await fbFetch(`${db}/msg_map/${encodeURIComponent(id)}.json`);
    const map = await mapRes.json().catch(() => null);
    if (!map?.orderId) return ok('no-map');
    const channel = map.channel || 'sms';

    const cur = await (await fbFetch(`${db}/special_orders/${map.orderId}/msgStatus/${channel}.json`)).json().catch(() => null);
    const curRank = STATUS_RANK[cur?.status] || 0;
    const newRank = STATUS_RANK[status] || 0;
    if (status !== 'failed' && newRank < curRank) return ok('stale');

    await fbFetch(`${db}/special_orders/${map.orderId}/msgStatus/${channel}.json`, {
      method: 'PUT',
      body: JSON.stringify({ status, at: Date.now() }),
    });
    return ok('updated');
  } catch (e) {
    return ok('error');
  }
};

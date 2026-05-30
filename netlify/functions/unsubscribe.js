// Netlify Function: σελίδα απεγγραφής Viber
// GET ?c=<customerId> -> σελίδα με κουμπί επιβεβαίωσης
// POST (ίδιο c) -> καταγραφή απεγγραφής στο customers/{id}/viberOptOut
// Env: FIREBASE_DB_URL

const { fbFetch } = require('./lib/fbAdmin');

const html = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body,
});

const page = (inner) => `<!doctype html><html lang="el"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Απεγγραφή — VAICON</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f6;margin:0;padding:24px;color:#222;}
  .card{max-width:520px;margin:24px auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 14px rgba(0,0,0,.08);}
  h1{font-size:22px;margin:0 0 12px;color:#1a1a2e;}
  p{font-size:15px;line-height:1.6;color:#444;}
  ul{font-size:15px;line-height:1.6;color:#444;padding-left:20px;}
  button{margin-top:18px;width:100%;padding:14px;border:0;border-radius:10px;background:#7360f2;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;}
  .ok{color:#1b5e20;font-weight:bold;}
  .muted{color:#888;font-size:13px;margin-top:16px;}
</style></head><body><div class="card">${inner}</div></body></html>`;

exports.handler = async (event) => {
  const db = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
  const c = (event.queryStringParameters || {}).c || '';

  if (!c) return html(400, page('<h1>Σφάλμα</h1><p>Ο σύνδεσμος δεν είναι έγκυρος.</p>'));

  if (event.httpMethod === 'POST') {
    try {
      await fbFetch(`${db}/customers/${encodeURIComponent(c)}/viberOptOut.json`, {
        method: 'PUT',
        body: JSON.stringify({ ts: Date.now() }),
      });
    } catch {}
    return html(200, page(`
      <h1>Απεγγραφήκατε</h1>
      <p class="ok">Η απεγγραφή σας ολοκληρώθηκε.</p>
      <p>Δεν θα λαμβάνετε πλέον μηνύματα Viber από τη VAICON.</p>
      <p class="muted">Αν χρειαστείτε ενημέρωση για κάποια παραγγελία, επικοινωνήστε μαζί μας τηλεφωνικά.</p>
    `));
  }

  return html(200, page(`
    <h1>Απεγγραφή από μηνύματα Viber</h1>
    <p>Αν επιβεβαιώσετε την απεγγραφή, στο εξής:</p>
    <ul>
      <li>δεν θα λαμβάνετε ενημερώσεις για νέα προϊόντα ή προσφορές, και</li>
      <li><strong>δεν θα μπορείτε να λαμβάνετε ενημέρωση για την πορεία των παραγγελιών σας μέσω Viber.</strong></li>
    </ul>
    <form method="POST">
      <button type="submit">Επιβεβαίωση απεγγραφής</button>
    </form>
    <p class="muted">Αν το πατήσατε κατά λάθος, απλώς κλείστε αυτή τη σελίδα.</p>
  `));
};

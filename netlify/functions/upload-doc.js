// Netlify Function: ανέβασμα εγγράφου πελάτη σε παραγγελία μέσω κινητού.
// GET  ?t=<token> -> σελίδα κάμερας (getUserMedia· τίποτα δεν αποθηκεύεται στο κινητό)
// POST {t, img}   -> αποθήκευση φωτό στο order_files/{orderId}/{photoId}, ενημέρωση docCount, σβήσιμο token
// Env: FIREBASE_DB_URL, FIREBASE_SERVICE_ACCOUNT

const { fbFetch } = require('./lib/fbAdmin');

const html = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body,
});
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const shell = (inner) => `<!doctype html><html lang="el"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Έγγραφο παραγγελίας — VAICON</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;background:#11131a;margin:0;color:#fff;}
  .wrap{max-width:560px;margin:0 auto;padding:14px;}
  h1{font-size:18px;margin:6px 0 10px;text-align:center;}
  video,img.preview{width:100%;border-radius:12px;background:#000;display:block;}
  canvas{display:none;}
  .row{display:flex;gap:10px;margin-top:12px;}
  button{flex:1;padding:16px;border:0;border-radius:12px;font-size:17px;font-weight:bold;cursor:pointer;color:#fff;}
  .shoot{background:#1565C0;}
  .send{background:#1b8e3a;}
  .again{background:#555;}
  .msg{text-align:center;font-size:16px;line-height:1.5;padding:24px 8px;}
  .ok{color:#7CFFA0;}
  .err{color:#ff8a80;}
  .hint{color:#9aa;font-size:13px;text-align:center;margin-top:10px;}
</style></head><body><div class="wrap">${inner}</div></body></html>`;

const expiredPage = () => shell(`
  <h1>VAICON</h1>
  <div class="msg err">Ο σύνδεσμος έληξε ή χρησιμοποιήθηκε ήδη.</div>
  <div class="hint">Δημιουργήστε νέο QR από τον υπολογιστή και ξαναπροσπαθήστε.</div>
`);

const cameraPage = (token) => shell(`
  <h1>Φωτογράφισε το έγγραφο</h1>
  <video id="v" autoplay playsinline></video>
  <img id="p" class="preview" style="display:none">
  <canvas id="c"></canvas>
  <div class="row" id="liveBtns"><button class="shoot" id="shoot">Τράβα φωτό</button></div>
  <div class="row" id="reviewBtns" style="display:none">
    <button class="again" id="again">Ξανά</button>
    <button class="send" id="send">Αποστολή</button>
  </div>
  <input id="fileFallback" type="file" accept="image/*" capture="environment" style="display:none">
  <div class="hint" id="hint">Η φωτό δεν αποθηκεύεται στο κινητό.</div>
<script>
  var T=${JSON.stringify(token)};
  var v=document.getElementById('v'),p=document.getElementById('p'),c=document.getElementById('c');
  var liveBtns=document.getElementById('liveBtns'),reviewBtns=document.getElementById('reviewBtns');
  var shoot=document.getElementById('shoot'),again=document.getElementById('again'),send=document.getElementById('send');
  var hint=document.getElementById('hint'),fileFallback=document.getElementById('fileFallback');
  var stream=null,dataUrl=null;
  function stopCam(){ if(stream){ stream.getTracks().forEach(function(t){t.stop();}); stream=null; } }
  function fail(){ v.style.display='none'; liveBtns.style.display='none'; fileFallback.style.display='block'; hint.textContent='Πάτησε εδώ για άνοιγμα κάμερας.'; }
  function shrink(srcW,srcH,draw){ var MAX=1500,s=Math.min(1,MAX/Math.max(srcW,srcH)); c.width=Math.round(srcW*s); c.height=Math.round(srcH*s); var ctx=c.getContext('2d'); draw(ctx,c.width,c.height); return c.toDataURL('image/jpeg',0.7); }
  function review(url){ dataUrl=url; p.src=url; p.style.display='block'; v.style.display='none'; liveBtns.style.display='none'; reviewBtns.style.display='flex'; }
  navigator.mediaDevices&&navigator.mediaDevices.getUserMedia?
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(s){stream=s;v.srcObject=s;}).catch(fail):fail();
  shoot.onclick=function(){ if(!v.videoWidth)return; dataUrl=shrink(v.videoWidth,v.videoHeight,function(ctx,w,h){ctx.drawImage(v,0,0,w,h);}); review(dataUrl); };
  fileFallback.onchange=function(e){ var f=e.target.files[0]; if(!f)return; var img=new Image(); img.onload=function(){ review(shrink(img.width,img.height,function(ctx,w,h){ctx.drawImage(img,0,0,w,h);})); }; img.src=URL.createObjectURL(f); };
  again.onclick=function(){ dataUrl=null; p.style.display='none'; reviewBtns.style.display='none'; if(stream){ v.style.display='block'; liveBtns.style.display='flex'; } else { fileFallback.value=''; fileFallback.click(); } };
  send.onclick=function(){ if(!dataUrl)return; send.disabled=true; send.textContent='Αποστολή...'; 
    fetch(location.pathname+'?t='+encodeURIComponent(T),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:T,img:dataUrl})})
    .then(function(r){return r.json();})
    .then(function(d){ stopCam(); document.querySelector('.wrap').innerHTML = d&&d.success
      ? '<h1>VAICON</h1><div class="msg ok">✓ Η φωτό ανέβηκε.</div><div class="hint">Μπορείτε να κλείσετε αυτή τη σελίδα.</div>'
      : '<h1>VAICON</h1><div class="msg err">Αποτυχία: '+((d&&d.error)||'άγνωστο σφάλμα')+'</div>'; })
    .catch(function(){ send.disabled=false; send.textContent='Αποστολή'; alert('Σφάλμα δικτύου, ξαναδοκιμάστε.'); }); };
  window.addEventListener('pagehide',stopCam);
</script>`);

const readToken = async (db, t) => {
  if (!t) return null;
  try {
    const r = await fbFetch(`${db}/upload_tokens/${encodeURIComponent(t)}.json`);
    const data = await r.json();
    if (!data || !data.orderId) return null;
    if (data.exp && Date.now() > Number(data.exp)) return null;
    return data;
  } catch { return null; }
};

exports.handler = async (event) => {
  const db = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
  if (!db) return html(500, shell('<div class="msg err">Λείπει η ρύθμιση βάσης.</div>'));

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { success: false, error: 'Μη έγκυρο αίτημα' }); }
    const t = body.t || (event.queryStringParameters || {}).t || '';
    const img = String(body.img || '');
    const tok = await readToken(db, t);
    if (!tok) return json(410, { success: false, error: 'Ο σύνδεσμος έληξε' });
    if (!img.startsWith('data:image/') || img.length < 100) return json(400, { success: false, error: 'Μη έγκυρη φωτό' });
    if (img.length > 5 * 1024 * 1024) return json(413, { success: false, error: 'Πολύ μεγάλη φωτό' });

    const orderId = String(tok.orderId);
    const photoId = (tok.mode === 'replace' && tok.photoId) ? String(tok.photoId) : String(Date.now());
    try {
      await fbFetch(`${db}/order_files/${orderId}/${photoId}.json`, {
        method: 'PUT',
        body: JSON.stringify({ img, ts: Date.now(), by: tok.by || '' }),
      });
      const listRes = await fbFetch(`${db}/order_files/${orderId}.json`);
      const list = await listRes.json();
      const count = list ? Object.keys(list).length : 1;
      await fbFetch(`${db}/special_orders/${orderId}.json`, { method: 'PATCH', body: JSON.stringify({ docCount: count }) });
      await fbFetch(`${db}/upload_tokens/${encodeURIComponent(t)}.json`, { method: 'DELETE' });
      return json(200, { success: true, count });
    } catch (e) {
      return json(500, { success: false, error: 'Αποτυχία αποθήκευσης' });
    }
  }

  const t = (event.queryStringParameters || {}).t || '';
  const tok = await readToken(db, t);
  if (!tok) return html(410, expiredPage());
  return html(200, cameraPage(t));
};

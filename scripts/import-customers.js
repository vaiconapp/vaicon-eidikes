const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const FIREBASE_URL = 'https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const excelIdx = args.indexOf('--excel');
const EXCEL_PATH = excelIdx >= 0 ? args[excelIdx + 1] : 'C:/Users/xxxyy/Desktop/Λίστα_Όλοι_25526.xlsx';
const REPORT_PATH = path.join(process.cwd(), 'customers-import-report.html');

const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function normalizeName(s) {
  if (!s) return '';
  return stripAccents(String(s).toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSig(s) {
  const tokens = normalizeName(s).split(' ').filter(t => t.length > 1);
  if (tokens.length < 2) return null;
  return [...new Set(tokens)].sort().join(' ');
}

const digits = s => String(s || '').replace(/\D/g, '');
const last10 = s => { const d = digits(s); return d.length > 10 ? d.slice(-10) : d; };
const isValidPhone = s => { const d = digits(s); return d.length >= 9 && d.length <= 14; };

const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function fetchCustomers() {
  const res = await fetch(`${FIREBASE_URL}/customers.json`);
  if (!res.ok) throw new Error('Firebase fetch failed: ' + res.status);
  const data = (await res.json()) || {};
  return Object.entries(data).map(([id, v]) => ({ id, ...v }));
}

function readExcel(p) {
  const wb = XLSX.readFile(p);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj = {
      _row: i + 1,
      name: String(r[0] || '').trim(),
      profession: String(r[1] || '').trim(),
      city: String(r[2] || '').trim(),
      phone: String(r[3] || '').trim(),
      mobile: String(r[4] || '').trim(),
    };
    if (obj.name) out.push(obj);
  }
  return out;
}

function buildIndex(rows) {
  const byName = new Map();
  const byTokens = new Map();
  const byPhone = new Map();
  const push = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const row of rows) {
    push(byName, normalizeName(row.name), row);
    push(byTokens, tokenSig(row.name), row);
    for (const p of [row.phone, row.mobile]) {
      const k = last10(p);
      if (k.length >= 10) push(byPhone, k, row);
    }
  }
  return { byName, byTokens, byPhone };
}

function findMatches(customer, idx) {
  const matches = new Map();
  const addAll = rows => { for (const r of rows) matches.set(r._row, r); };
  const n = normalizeName(customer.name);
  if (n && idx.byName.has(n)) addAll(idx.byName.get(n));
  if (matches.size === 0) {
    const tk = tokenSig(customer.name);
    if (tk && idx.byTokens.has(tk)) addAll(idx.byTokens.get(tk));
  }
  for (const slot of ['phone', 'phone2', 'phone3']) {
    const k = last10(customer[slot]);
    if (k.length >= 10 && idx.byPhone.has(k)) addAll(idx.byPhone.get(k));
  }
  return [...matches.values()];
}

function computeUpdates(customer, excelRow) {
  const updates = [];
  if (excelRow.city && !(customer.city || '').toString().trim()) {
    updates.push({ field: 'city', label: 'Πόλη/Περιοχή', from: '', to: excelRow.city });
  }
  if (excelRow.profession && !(customer.profession || '').toString().trim()) {
    updates.push({ field: 'profession', label: 'Επάγγελμα', from: '', to: excelRow.profession });
  }
  const existing = new Set();
  for (const slot of ['phone', 'phone2', 'phone3']) {
    const d = last10(customer[slot]);
    if (d.length >= 10) existing.add(d);
  }
  const newPhones = [];
  for (const p of [excelRow.mobile, excelRow.phone]) {
    if (!isValidPhone(p)) continue;
    const k = last10(p);
    if (existing.has(k)) continue;
    existing.add(k);
    newPhones.push(digits(p));
  }
  const emptySlots = ['phone', 'phone2', 'phone3'].filter(s => !(customer[s] || '').toString().trim());
  const labels = { phone: 'Τηλέφωνο 1', phone2: 'Τηλέφωνο 2', phone3: 'Τηλέφωνο 3' };
  for (let i = 0; i < newPhones.length && i < emptySlots.length; i++) {
    updates.push({ field: emptySlots[i], label: labels[emptySlots[i]], from: '', to: newPhones[i] });
  }
  return updates;
}

function buildReport({ withUpdates, foundNoExtras, notFound, duplicates, totals }) {
  const style = `
body{font-family:Segoe UI,Arial,sans-serif;margin:24px;background:#f5f5f5;color:#222}
h1{color:#9d1421;margin-bottom:8px}
h2{border-bottom:2px solid #9d1421;padding-bottom:6px;margin-top:32px;color:#9d1421}
table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0 24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th,td{border:1px solid #e0e0e0;padding:8px 10px;text-align:left;font-size:14px;vertical-align:top}
th{background:#9d1421;color:#fff;font-weight:600}
tr.cust td{background:#eef4ff;font-size:15px}
.new{background:#d4f4d4;font-weight:bold}
.old{color:#888}
.summary{background:#fff;padding:16px 20px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1);margin-bottom:16px;line-height:1.8}
.summary b{display:inline-block;min-width:280px}
.warn{background:#fff5e6;border-left:4px solid #ff9900;padding:12px 16px;margin:16px 0;border-radius:4px}
.empty{color:#aaa;font-style:italic}
code{background:#eee;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace}`;

  const rowsWithUpdates = withUpdates.map(({ customer, excelRow, updates }) => {
    const upRows = updates.map(u =>
      `<tr><td>${escHtml(u.label)}</td><td class="old">${u.from ? escHtml(u.from) : '<span class="empty">κενό</span>'}</td><td class="new">${escHtml(u.to)}</td></tr>`
    ).join('');
    return `<tr class="cust"><td colspan="3"><b>${escHtml(customer.name)}</b> <span style="color:#666">(Excel γραμμή ${excelRow._row})</span></td></tr>${upRows}`;
  }).join('');

  const noExtraRows = foundNoExtras.map(({ customer, excelRow }) =>
    `<tr><td>${escHtml(customer.name)}</td><td>Γραμμή ${excelRow._row}</td></tr>`
  ).join('');

  const notFoundRows = notFound.map(c =>
    `<tr><td>${escHtml(c.name)}</td><td>${escHtml(c.phone || '')}</td></tr>`
  ).join('');

  const dupRows = duplicates.map(({ customer, matches }) => {
    const cands = matches.map(r =>
      `<div style="margin:4px 0;padding:6px;background:#f9f9f9;border-radius:4px">Γρ. <b>${r._row}</b>: ${escHtml(r.name)}<br><small>${escHtml(r.profession)} | ${escHtml(r.city)} | ${escHtml(r.phone)} | ${escHtml(r.mobile)}</small></div>`
    ).join('');
    return `<tr><td><b>${escHtml(customer.name)}</b></td><td>${cands}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Customers Import Report</title><style>${style}</style></head><body>
<h1>Report Εισαγωγής Πελατών από Excel</h1>
<div class="summary">
  <div><b>Σύνολο πελατών στη βάση:</b> ${totals.allCustomers}</div>
  <div><b>Θα ενημερωθούν:</b> ${withUpdates.length}</div>
  <div><b>Βρέθηκαν χωρίς νέα στοιχεία:</b> ${foundNoExtras.length}</div>
  <div><b>Δεν βρέθηκαν στο Excel:</b> ${notFound.length}</div>
  <div><b>Διπλά matches (χειροκίνητος έλεγχος):</b> ${duplicates.length}</div>
</div>
<div class="warn"><b>Σημείωση:</b> Καμία αλλαγή δεν έχει γραφτεί στη βάση. Τρέξε με <code>--apply</code> μετά τον έλεγχο.</div>

<h2>1. Πελάτες προς ενημέρωση (${withUpdates.length})</h2>
${rowsWithUpdates ? `<table><thead><tr><th style="width:25%">Πεδίο</th><th style="width:25%">Τωρινή τιμή</th><th>Νέα τιμή από Excel</th></tr></thead><tbody>${rowsWithUpdates}</tbody></table>` : '<p class="empty">Καμία ενημέρωση.</p>'}

<h2>2. Διπλά matches - χειροκίνητη απόφαση (${duplicates.length})</h2>
${dupRows ? `<table><thead><tr><th style="width:30%">Πελάτης βάσης</th><th>Υποψήφιες γραμμές Excel</th></tr></thead><tbody>${dupRows}</tbody></table>` : '<p class="empty">Δεν υπάρχουν.</p>'}

<h2>3. Βρέθηκαν χωρίς νέα στοιχεία (${foundNoExtras.length})</h2>
${noExtraRows ? `<table><thead><tr><th>Πελάτης</th><th>Excel</th></tr></thead><tbody>${noExtraRows}</tbody></table>` : '<p class="empty">Κανείς.</p>'}

<h2>4. Δεν βρέθηκαν στο Excel (${notFound.length})</h2>
${notFoundRows ? `<table><thead><tr><th>Πελάτης</th><th>Τηλέφωνο</th></tr></thead><tbody>${notFoundRows}</tbody></table>` : '<p class="empty">Όλοι βρέθηκαν.</p>'}

</body></html>`;
}

async function applyUpdates(withUpdates) {
  const date = new Date().toISOString().slice(0, 10);
  const resAll = await fetch(`${FIREBASE_URL}/customers.json`);
  const all = await resAll.json();
  const backupPath = path.join(process.cwd(), `customers-backup-${date}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(all, null, 2), 'utf8');
  console.log(`Backup: ${backupPath}`);
  let ok = 0, fail = 0;
  for (const { customer, updates } of withUpdates) {
    const body = {};
    for (const u of updates) body[u.field] = u.to;
    if (Object.keys(body).length === 0) continue;
    const url = `${FIREBASE_URL}/customers/${customer.id}.json`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`FAILED ${customer.name}: ${res.status}`); fail++; }
    else ok++;
  }
  console.log(`Done. Updated: ${ok}, failed: ${fail}.`);
}

(async () => {
  console.log('Reading Firebase customers...');
  const customers = await fetchCustomers();
  console.log(`Found ${customers.length} customers in database.`);
  console.log(`Reading Excel: ${EXCEL_PATH}`);
  const excelRows = readExcel(EXCEL_PATH);
  console.log(`Found ${excelRows.length} rows in Excel.`);
  const idx = buildIndex(excelRows);

  const withUpdates = [];
  const foundNoExtras = [];
  const notFound = [];
  const duplicates = [];

  for (const c of customers) {
    const matches = findMatches(c, idx);
    if (matches.length === 0) { notFound.push(c); continue; }
    if (matches.length > 1) { duplicates.push({ customer: c, matches }); continue; }
    const excelRow = matches[0];
    const updates = computeUpdates(c, excelRow);
    if (updates.length === 0) foundNoExtras.push({ customer: c, excelRow });
    else withUpdates.push({ customer: c, excelRow, updates });
  }

  const html = buildReport({
    withUpdates, foundNoExtras, notFound, duplicates,
    totals: { allCustomers: customers.length },
  });
  fs.writeFileSync(REPORT_PATH, html, 'utf8');
  console.log(`Report written: ${REPORT_PATH}`);
  console.log(`Summary: update=${withUpdates.length}, no-extras=${foundNoExtras.length}, not-found=${notFound.length}, duplicates=${duplicates.length}`);

  if (APPLY) {
    console.log('--apply: writing changes to Firebase...');
    await applyUpdates(withUpdates);
  } else {
    console.log('Dry run. Use --apply after reviewing the report.');
  }
})().catch(e => { console.error(e); process.exit(1); });

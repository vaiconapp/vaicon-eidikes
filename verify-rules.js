// =====================================================================
// VAICON ΕΙΔΙΚΕΣ — Έλεγχος κανόνων τιμολόγησης
// =====================================================================
// Τρέξε με: node verify-rules.js
// ---------------------------------------------------------------------
// ⚠ Οι παρακάτω συναρτήσεις είναι ΑΝΤΙΓΡΑΦΟ από utils.js:
//   - autoPriceLines, applyAutoPriceLines (+ bandAdd, priceNum)
// Αν αλλάξει το utils.js, ενημέρωσε και εδώ ώστε ο έλεγχος να μένει χρήσιμος.
// Σημ.: το applyAutoPriceLines των ειδικών ΜΟΝΟ προσθέτει (δεν ανανεώνει υπάρχουσες γραμμές).
// =====================================================================

// ---------- ΑΝΤΙΓΡΑΦΟ ΛΟΓΙΚΗΣ (πρέπει να ταιριάζει με utils.js) ----------

const priceNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const bandAdd = (bands, v) => {
  const x = priceNum(v);
  const b = (bands || []).find(bb => {
    const from = String(bb?.from ?? '').trim() === '' ? -Infinity : priceNum(bb.from);
    const to = String(bb?.to ?? '').trim() === '' ? Infinity : priceNum(bb.to);
    return x >= from && x <= to;
  });
  return b ? priceNum(b.add) : 0;
};

function autoPriceLines(catalog, orderType, order = {}) {
  const cat = orderType === 'ΕΙΔΙΚΗ' ? 'ΕΙΔΙΚΗ' : 'ΤΥΠΟΠΟΙΗΜΕΝΗ';
  const catMatch = (c) => c === cat || c === 'ΓΕΝΙΚΗ';
  const isDipli = String(order.sasiType || '').includes('ΔΙΠΛΗ') || String(order.armor || '').includes('ΔΙΠΛΗ');
  const wantArmor = isDipli ? 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' : 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ';
  const model = isDipli ? String(order.dipliModel || '').trim() : '';
  const coats = (order.coatings || []).filter(Boolean).map(s => String(s).trim());
  const lock = String(order.lock || '').trim();
  const q = parseInt(order.qty, 10); const qty = String(q > 0 ? q : 1);
  const total = (e) => { const h = bandAdd(e.heightBands, order.h), w = bandAdd(e.widthBands, order.w); return priceNum(e.unitPrice) + (e.bandLogic === 'or' ? Math.max(h, w) : h + w); };
  const lines = [];

  const armor = (catalog || []).filter(e => e && e.hasRule && catMatch(e.category)
    && (e.ruleKind === 'armor' || (!e.ruleKind && e.ruleArmor)) && String(e.ruleArmor || '') === wantArmor);
  const pick = isDipli
    ? (model && armor.find(e => String(e.ruleModel || '').trim() === model)) || armor.find(e => !String(e.ruleModel || '').trim())
    : armor[0];
  if (pick && total(pick) > 0) lines.push({ label: pick.name || wantArmor, value: String(Math.round(total(pick) * 100) / 100), qty });

  for (const e of (catalog || [])) {
    if (!e || !e.hasRule || !catMatch(e.category)) continue;
    const kind = e.ruleKind || (e.ruleArmor ? 'armor' : '');
    if (kind === 'armor') continue;
    const target = String(e.ruleTarget || '').trim();
    const hit = kind === 'coating' ? (!!target && coats.includes(target))
      : kind === 'lock' ? (!!lock && lock === target) : false;
    if (!hit || total(e) <= 0) continue;
    lines.push({ label: e.name || target, value: String(Math.round(total(e) * 100) / 100), qty });
  }

  const stav = (order.stavera || []).filter(s => s && s.dim);
  if (stav.length) {
    const ruleOf = (kind) => (catalog || []).find(e => e && e.hasRule && catMatch(e.category) && e.ruleKind === kind);
    const perimM = (dim) => {
      const n = String(dim).split(/[×xXχΧ]/).map(p => priceNum(p)).filter(v => v > 0);
      return n.length >= 2 ? 2 * (n[0] + n[1]) / 100 : 0;
    };
    const glass = ruleOf('glass'), design = ruleOf('design');
    const doors = q > 0 ? q : 1;
    const used = {};
    const uniq = (base) => { used[base] = (used[base] || 0) + 1; return used[base] > 1 ? `${base} (${used[base]})` : base; };
    const push = (rule, s, base) => {
      const p = perimM(s.dim); if (p <= 0) return;
      const per = Math.max(priceNum(rule.minCharge), p * priceNum(rule.unitPrice));
      if (per <= 0) return;
      const rq = parseInt(s.qty, 10) > 0 ? parseInt(s.qty, 10) : 1;
      lines.push({ label: uniq(`${base} ${s.dim}`), value: String(Math.round(per * 100) / 100), qty: String(rq * doors) });
    };
    for (const s of stav) {
      if (glass && priceNum(glass.unitPrice) > 0) push(glass, s, glass.name || 'Σταθερό / Τζάμι');
      if (design && priceNum(design.unitPrice) > 0 && String(s.design || '').trim() === String(design.ruleTarget || '').trim())
        push(design, s, design.name || 'ΧΙΑΣΤΗ');
    }
  }
  return lines;
}

function applyAutoPriceLines(priceList, lines) {
  const list = Array.isArray(priceList) ? priceList : [];
  const have = new Set(list.map(it => String(it?.label || '').trim()));
  const add = (lines || []).filter(l => l && !have.has(String(l.label).trim()));
  return [...add, ...list];
}

// ---------- ΥΠΟΔΟΜΗ TEST ----------

let pass = 0, fail = 0;
const failures = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function test(name, actual, expected) {
  if (eq(actual, expected)) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else {
    fail++; failures.push({ name, actual, expected });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}
function group(title, fn) { console.log(`\n\x1b[1m${title}\x1b[0m`); fn(); }

// ---------- ΣΕΝΑΡΙΑ ----------

group('autoPriceLines — θωράκιση (ΕΙΔΙΚΗ/ΤΥΠΟΠΟΙΗΜΕΝΗ)', () => {
  const cat = [
    { name: 'Ειδική ΜΟΝΗ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '500' },
    { name: 'Πόρτα ΜΟΝΗ', category: 'ΤΥΠΟΠΟΙΗΜΕΝΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '300' },
  ];
  test('ειδική ΜΟΝΗ → 500', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Ειδική ΜΟΝΗ', value: '500', qty: '1' }]);
  test('sasiType κενό → ΜΟΝΗ', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { qty: '1' }), [{ label: 'Ειδική ΜΟΝΗ', value: '500', qty: '1' }]);
  test('τυποποιημένη ΜΟΝΗ → 300 (κατηγορία)', autoPriceLines(cat, 'ΤΥΠΟΠΟΙΗΜΕΝΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Πόρτα ΜΟΝΗ', value: '300', qty: '1' }]);
  test('ειδική ΔΙΠΛΗ χωρίς κανόνα → []', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), []);
  test('qty 3 → ποσότητα 3', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '3' }), [{ label: 'Ειδική ΜΟΝΗ', value: '500', qty: '3' }]);
  test('κενός κατάλογος → []', autoPriceLines([], 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), []);
});

group('autoPriceLines — μοντέλα διπλής', () => {
  const cat = [
    { name: 'Διπλή S21-1', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', ruleModel: 'S21-1', unitPrice: '270' },
    { name: 'Διπλή H23-2', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', ruleModel: 'H23-2', unitPrice: '375' },
  ];
  test('μοντέλο S21-1 → 270', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S21-1', qty: '1' }), [{ label: 'Διπλή S21-1', value: '270', qty: '1' }]);
  test('μοντέλο H23-2 → 375', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'H23-2', qty: '1' }), [{ label: 'Διπλή H23-2', value: '375', qty: '1' }]);
  test('χωρίς μοντέλο + γενικός → fallback', autoPriceLines([{ name: 'Διπλή γενική', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', unitPrice: '450' }], 'ΕΙΔΙΚΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S21-1', qty: '1' }), [{ label: 'Διπλή γενική', value: '450', qty: '1' }]);
  test('μοντέλο χωρίς αντιστοιχία + χωρίς γενικό → []', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ', dipliModel: 'S22-2', qty: '1' }), []);
});

group('autoPriceLines — επενδύσεις / κλειδαριές / ΓΕΝΙΚΗ', () => {
  const cat = [
    { name: 'PVC ΕΞΩ', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'coating', ruleTarget: 'PVC ΕΞΩ', unitPrice: '40' },
    { name: 'Ειδική επένδυση', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'coating', ruleTarget: 'INOX', unitPrice: '120' },
    { name: 'Κλειδαριά CISA', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'lock', ruleTarget: 'CISA', unitPrice: '80' },
  ];
  test('επένδυση ΓΕΝΙΚΗ μπαίνει σε ειδική', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { coatings: ['PVC ΕΞΩ'], qty: '1' }), [{ label: 'PVC ΕΞΩ', value: '40', qty: '1' }]);
  test('ειδική επένδυση μπαίνει σε ειδική', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { coatings: ['INOX'], qty: '1' }), [{ label: 'Ειδική επένδυση', value: '120', qty: '1' }]);
  test('κλειδαριά match', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { lock: 'CISA', qty: '1' }), [{ label: 'Κλειδαριά CISA', value: '80', qty: '1' }]);
  test('επένδυση που δεν υπάρχει στην παραγγελία → []', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { coatings: ['LAMINATE'], qty: '1' }), []);
  test('πολλά μαζί: επένδυση + κλειδαριά', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { coatings: ['PVC ΕΞΩ'], lock: 'CISA', qty: '1' }), [{ label: 'PVC ΕΞΩ', value: '40', qty: '1' }, { label: 'Κλειδαριά CISA', value: '80', qty: '1' }]);
});

group('autoPriceLines — κλίμακες ύψους/πλάτους (αθροιστικά)', () => {
  const cat = [{ name: 'Ειδική ΜΟΝΗ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '150',
    heightBands: [{ from: '220', to: '', add: '80' }],
    widthBands: [{ from: '100', to: '120', add: '50' }, { from: '121', to: '', add: '110' }] }];
  const o = (h, w) => ({ sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1', h, w });
  test('225×110 → 280', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('225', '110')), [{ label: 'Ειδική ΜΟΝΗ', value: '280', qty: '1' }]);
  test('218×98 → 150 (καμία)', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('218', '98')), [{ label: 'Ειδική ΜΟΝΗ', value: '150', qty: '1' }]);
  test('225×130 → 340 (121+ = 110)', autoPriceLines(cat, 'ΕΙΔΙΚΗ', o('225', '130')), [{ label: 'Ειδική ΜΟΝΗ', value: '340', qty: '1' }]);
  test('χωρίς διαστάσεις → 150', autoPriceLines(cat, 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1' }), [{ label: 'Ειδική ΜΟΝΗ', value: '150', qty: '1' }]);
  test('δεκαδική επιβάρυνση 12,5 → 162.5', autoPriceLines([{ name: 'Χ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '150', widthBands: [{ from: '98', to: '', add: '12,5' }] }], 'ΕΙΔΙΚΗ', { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1', h: '210', w: '98' }), [{ label: 'Χ', value: '162.5', qty: '1' }]);
});

group('autoPriceLines — AND vs OR (ύψος + πλάτος)', () => {
  const mk = (logic) => [{ name: 'Ειδική ΜΟΝΗ', category: 'ΕΙΔΙΚΗ', hasRule: true, ruleKind: 'armor', ruleArmor: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', unitPrice: '250', bandLogic: logic,
    heightBands: [{ from: '219', to: '235', add: '45' }], widthBands: [{ from: '99', to: '', add: '45' }] }];
  const o = { sasiType: 'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', qty: '1', h: '225', w: '110' };
  test('AND → 340 (250+45+45)', autoPriceLines(mk('and'), 'ΕΙΔΙΚΗ', o), [{ label: 'Ειδική ΜΟΝΗ', value: '340', qty: '1' }]);
  test('OR → 295 (μόνο η μεγαλύτερη)', autoPriceLines(mk('or'), 'ΕΙΔΙΚΗ', o), [{ label: 'Ειδική ΜΟΝΗ', value: '295', qty: '1' }]);
});

group('autoPriceLines — σταθερά (περίμετρος glass/design)', () => {
  const cat = [
    { name: 'Σταθερό / Τζάμι', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'glass', ruleTarget: 'Σταθερό / Τζάμι', unit: 'μμ', unitPrice: '22', minCharge: '50' },
    { name: 'ΧΙΑΣΤΗ', category: 'ΓΕΝΙΚΗ', hasRule: true, ruleKind: 'design', ruleTarget: 'ΧΙΑΣΤΗ', unit: 'μμ', unitPrice: '24', minCharge: '50' },
  ];
  test('ένα σταθερό 210×50 → 5.2μ × 22 = 114.4',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210 × 50' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210 × 50', value: '114.4', qty: '1' }]);
  test('σταθερό + χιαστή → σταθερό ΚΑΙ χιαστή επιπλέον',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210 × 50', design: 'ΧΙΑΣΤΗ' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210 × 50', value: '114.4', qty: '1' }, { label: 'ΧΙΑΣΤΗ 210 × 50', value: '124.8', qty: '1' }]);
  test('ελάχιστο 50€ ανά κομμάτι (μικρό 30×20)',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '30x20' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 30x20', value: '50', qty: '1' }]);
  test('πολλαπλασιασμός με πόρτες (qty 3) → τιμή/κομμάτι, ποσότητα ×3',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50' }], qty: '3' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '3' }]);
  test('δύο σταθερά → δύο ξεχωριστές γραμμές',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50' }, { dim: '100×100' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }, { label: 'Σταθερό / Τζάμι 100×100', value: '88', qty: '1' }]);
  test('ποσότητα γραμμής σταθερού (qty 2) → τιμή/κομμάτι, ποσότητα 2',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50', qty: '2' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '2' }]);
  test('ίδια διάσταση σε δύο σειρές → μοναδικό label με (2)',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50' }, { dim: '210×50' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }, { label: 'Σταθερό / Τζάμι 210×50 (2)', value: '114.4', qty: '1' }]);
  test('χιαστή μόνο στη γραμμή που την έχει',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50', design: 'ΧΙΑΣΤΗ' }, { dim: '100×100' }], qty: '1' }),
    [{ label: 'Σταθερό / Τζάμι 210×50', value: '114.4', qty: '1' }, { label: 'ΧΙΑΣΤΗ 210×50', value: '124.8', qty: '1' }, { label: 'Σταθερό / Τζάμι 100×100', value: '88', qty: '1' }]);
  test('χωρίς κανόνα στον κατάλογο → καμία χρέωση σταθερού',
    autoPriceLines([], 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210×50' }], qty: '1' }), []);
  test('μη έγκυρη διάσταση (ένας αριθμός) → αγνοείται',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { stavera: [{ dim: '210' }], qty: '1' }), []);
  test('χωρίς σταθερά → []',
    autoPriceLines(cat, 'ΕΙΔΙΚΗ', { qty: '1' }), []);
});

group('applyAutoPriceLines — μόνο προσθήκη (ειδικές)', () => {
  const lines = [{ label: 'Ειδική ΜΟΝΗ', value: '500', qty: '1' }];
  test('κενή λίστα → προσθήκη', applyAutoPriceLines([], lines), lines);
  test('κενές γραμμές → ίδια λίστα', applyAutoPriceLines([{ label: 'Α', value: '5', qty: '1' }], []), [{ label: 'Α', value: '5', qty: '1' }]);
  test('μπαίνει στην αρχή', applyAutoPriceLines([{ label: 'Α', value: '5', qty: '1' }], lines), [{ label: 'Ειδική ΜΟΝΗ', value: '500', qty: '1' }, { label: 'Α', value: '5', qty: '1' }]);
  test('υπάρχον label ΔΕΝ διπλασιάζεται (κρατά χειροκίνητο)', applyAutoPriceLines([{ label: 'Ειδική ΜΟΝΗ', value: '999', qty: '1' }], lines), [{ label: 'Ειδική ΜΟΝΗ', value: '999', qty: '1' }]);
  test('πολλές γραμμές με σειρά', applyAutoPriceLines([], [{ label: 'A', value: '1', qty: '1' }, { label: 'B', value: '2', qty: '1' }]), [{ label: 'A', value: '1', qty: '1' }, { label: 'B', value: '2', qty: '1' }]);
});

// ---------- ΑΠΟΤΕΛΕΣΜΑ ----------

console.log(`\n\x1b[1m─────────────────────────────────────────\x1b[0m`);
console.log(`\x1b[32m✓ ${pass} passed\x1b[0m   \x1b[${fail > 0 ? '31' : '90'}m✗ ${fail} failed\x1b[0m`);
console.log(`\x1b[1m─────────────────────────────────────────\x1b[0m`);
if (fail > 0) { console.log(`\n\x1b[31m⚠ Failures: ${failures.map(f => f.name).join(' | ')}\x1b[0m`); process.exit(1); }

// Κοινά helpers για μορφοποίηση επενδύσεων/κλειδαριών (bold/size/color)

export const SIZE_DELTA = { S: -2, M: 0, L: 2, XL: 4 };

export const COLOR_MAP = {
  black:  '#000000',
  red:    '#cc0000',
  orange: '#e65100',
  blue:   '#1565c0',
  green:  '#2e7d32',
  purple: '#6a0dad',
};

export const COLOR_OPTIONS = [
  { key: 'black',  label: '⚫' },
  { key: 'red',    label: '🔴' },
  { key: 'orange', label: '🟠' },
  { key: 'blue',   label: '🔵' },
  { key: 'green',  label: '🟢' },
  { key: 'purple', label: '🟣' },
];

export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL'];

// Βρίσκει το item από τη λίστα (coatings ή locks) με βάση το όνομα.
// Αν δεν βρει exact match, δοκιμάζει με startsWith (χρήσιμο για locks όπου μπορεί να έχει suffix "(τύπος)" ή σημειώσεις)
export const findFormatItem = (name, list=[]) => {
  if (!name || !list || list.length === 0) return null;
  const exact = list.find(x => x && x.name === name);
  if (exact) return exact;
  // Ταίριασμα από την αρχή - προτιμούμε τη μεγαλύτερη αντιστοίχιση
  const candidates = list.filter(x => x && x.name && name.startsWith(x.name));
  if (candidates.length === 0) return null;
  return candidates.sort((a,b) => b.name.length - a.name.length)[0];
};

// Επιστρέφει React Native style object για μια μορφοποίηση
export const getFormatStyle = (item, baseSize=13) => {
  if (!item) return {};
  const style = {};
  if (item.bold) style.fontWeight = 'bold';
  if (item.size && item.size !== 'M') {
    const delta = SIZE_DELTA[item.size] || 0;
    style.fontSize = baseSize + delta;
  }
  if (item.color && item.color !== 'black') {
    style.color = COLOR_MAP[item.color] || COLOR_MAP.black;
  }
  return style;
};

// Επιστρέφει HTML inline style για εκτύπωση (relative με em για μέγεθος)
export const SIZE_EM = { S: 0.85, M: 1, L: 1.2, XL: 1.4 };

export const getFormatHtmlStyle = (item) => {
  if (!item) return '';
  const parts = [];
  if (item.bold) parts.push('font-weight:bold');
  if (item.size && item.size !== 'M') {
    const em = SIZE_EM[item.size] || 1;
    parts.push(`font-size:${em}em`);
  }
  if (item.color && item.color !== 'black') {
    parts.push(`color:${COLOR_MAP[item.color] || COLOR_MAP.black}`);
  }
  return parts.join(';');
};

// Τυλίγει HTML string με span αν υπάρχει μορφοποίηση, αλλιώς επιστρέφει το string
export const wrapHtml = (name, item) => {
  const style = getFormatHtmlStyle(item);
  return style ? `<span style="${style}">${name}</span>` : name;
};

// Format μιας λίστας coatings/locks names σε HTML string, χωρισμένα με separator
export const formatNamesHtml = (names, list, sep=', ') => {
  if (!names || names.length === 0) return '';
  return names.map(n => wrapHtml(n, findFormatItem(n, list))).join(sep);
};

export const getCoatingGroup = (name) => {
  const n = String(name || '').toUpperCase();
  if (n.includes('ΕΞΩ')) return 0;
  if (n.includes('ΜΕΣΑ') || n.includes('ΕΣΩΤ')) return 1;
  return 2;
};

export const sortCoatingsGrouped = (list = []) =>
  [...list].sort((a, b) => {
    const gA = getCoatingGroup(a.name), gB = getCoatingGroup(b.name);
    if (gA !== gB) return gA - gB;
    return (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0);
  });

export const canMoveCoatingInGroup = (sorted, index, direction) => {
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= sorted.length) return false;
  return getCoatingGroup(sorted[index]?.name) === getCoatingGroup(sorted[swapIndex]?.name);
};

// ── Helpers πελατών (έλεγχος διπλότυπου + ταξινόμηση) ──
// Τηλέφωνο: μόνο ψηφία, τελευταία 10 (αγνοεί +30 / 0030)
export const phoneKey = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
// Κείμενο: χωρίς τόνους, σημεία στίξης (. , ; ·), πεζά, ένα κενό
export const normTxt = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,;·]/g, ' ').replace(/\s+/g, ' ').trim();
// Κλειδί αλφαβητικής ταξινόμησης: αγνοεί σύμβολα/κενά πριν τα γράμματα + κεφαλαία/πεζά
export const custSortKey = (c) => String(c?.name || '').replace(/^[^\p{L}]+/u, '').toLocaleLowerCase('el');

// ── Αυτόματη πρόταση επόμενου αριθμού παραγγελίας ──
// present = αριθμοί ενεργών+πωλημένων (και των δύο τύπων), ledger = μητρώο εκδοθέντων (order_seq).
// Επιστρέφει το ΜΕΓΑΛΥΤΕΡΟ υπάρχον (present + ledger) + 1 (δεν γεμίζει παλιά κενά).
export const suggestNextOrderNo = (presentNos = [], ledgerNos = [], startAt = 1) => {
  const toInt = (x) => { const n = parseInt(String(x), 10); return Number.isFinite(n) ? n : null; };
  let max = startAt - 1;
  for (const x of [...presentNos, ...ledgerNos]) { const n = toInt(x); if (n != null && n > max) max = n; }
  return String(max + 1);
};

// ── Ομαδοποίηση πορτών ίδιου πελάτη: βασικός αριθμός + παύλα-σειρά (145-1, 145-2, …) ──
export const groupOrderNo = (base, seq) => `${String(base).trim()}-${seq}`;

// Βασικός αριθμός χωρίς παύλα-σειρά ("4521-2" → "4521")
export const splitBaseNo = (orderNo) => String(orderNo).split('-')[0].trim();

// Επόμενη ελεύθερη παύλα-σειρά κάτω από base (π.χ. base "4521" με ["4521-1"] → 2)
export const nextGroupSuffix = (base, nos = []) => {
  const b = String(base).trim();
  let max = 0;
  for (const no of nos) {
    const s = String(no);
    if (s.startsWith(b + '-')) {
      const n = parseInt(s.slice(b.length + 1), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
};

// Ομαδοποίηση υποβολών πωλητή σε εγγραφές (μεμονωμένη ή ομάδα κατά groupId),
// διατηρώντας τη σειρά εισόδου· οι πόρτες ομάδας ταξινομούνται κατά groupSeq.
export const groupSubmissions = (list = []) => {
  const groups = new Map();
  const entries = [];
  for (const s of list) {
    if (s.groupId) {
      let g = groups.get(s.groupId);
      if (!g) { g = { type: 'group', groupId: s.groupId, subs: [] }; groups.set(s.groupId, g); entries.push(g); }
      g.subs.push(s);
    } else {
      entries.push({ type: 'single', sub: s });
    }
  }
  for (const g of groups.values()) g.subs.sort((a, b) => (a.groupSeq || 0) - (b.groupSeq || 0) || (a.submittedAt || 0) - (b.submittedAt || 0));
  return entries;
};

const PHONE_FIELDS = ['phone', 'phone2', 'phone3', 'phoneViber'];
// Βρίσκει πιθανά διπλότυπα: ίδιο τηλέφωνο Ή αναγνωριστικό Ή πλήρες όνομα
export const findDuplicateCustomers = (form, customers, excludeId) => {
  const phones = PHONE_FIELDS.map(k => phoneKey(form[k])).filter(Boolean);
  const id = normTxt(form.identifier), nm = normTxt(form.name);
  return (customers || []).filter(c => {
    if (!c || (excludeId && c.id === excludeId)) return false;
    const cph = PHONE_FIELDS.map(k => phoneKey(c[k])).filter(Boolean);
    if (phones.length && phones.some(p => cph.includes(p))) return true;
    if (id && normTxt(c.identifier) === id) return true;
    if (nm && normTxt(c.name) === nm) return true;
    return false;
  });
};

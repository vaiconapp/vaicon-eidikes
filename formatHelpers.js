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

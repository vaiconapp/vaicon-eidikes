import { FIREBASE_URL } from './App';

// Καταγραφή κίνησης στο Firebase
export const logActivity = async (section, action, details = {}) => {
  try {
    const entry = {
      ts: Date.now(),
      section,   // ΕΙΔΙΚΗ / ΤΥΠΟΠΟΙΗΜΕΝΗ / ΣΑΣΙ ΣΤΟΚ / ΚΑΣΕΣ ΣΤΟΚ
      action,    // π.χ. "Νέα παραγγελία", "LASER ✓", "Διαγραφή"
      ...details // orderNo, customer, size, notes κλπ
    };
    await fetch(`${FIREBASE_URL}/activity_log.json`, {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  } catch(e) {
    // Αν αποτύχει το log δεν σταματάει τίποτα
    console.warn('Activity log error:', e);
  }
};

// Φόρτωση ιστορικού (τελευταίες 7 μέρες)
export const loadActivityLog = async () => {
  try {
    const res = await fetch(`${FIREBASE_URL}/activity_log.json`);
    const data = await res.json();
    if (!data) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 μέρες πριν
    const entries = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    // Κρατάμε μόνο τελευταίες 7 μέρες
    return entries
      .filter(e => e.ts >= cutoff)
      .sort((a, b) => b.ts - a.ts); // νεότερο πρώτα
  } catch(e) {
    return [];
  }
};

// Διαγραφή παλαιών εγγραφών (>7 μέρες) — καλείται κατά τη φόρτωση
export const cleanOldLogs = async () => {
  try {
    const res = await fetch(`${FIREBASE_URL}/activity_log.json`);
    const data = await res.json();
    if (!data) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(data)) {
      if (data[key].ts < cutoff) {
        await fetch(`${FIREBASE_URL}/activity_log/${key}.json`, { method: 'DELETE' });
      }
    }
  } catch(e) {}
};

// Συνδυασμένη φόρτωση + καθαρισμός με ΜΙΑ μόνο διαδρομή στη βάση.
// Επιστρέφει τις πρόσφατες κινήσεις (≤7 ημέρες) και σβήνει τις παλιές
// μαζικά στο background με ΜΙΑ PATCH (αντί για 1 DELETE ανά εγγραφή).
export const loadAndClean = async () => {
  try {
    const res = await fetch(`${FIREBASE_URL}/activity_log.json`);
    const data = await res.json();
    if (!data) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fresh = [];
    const oldKeys = [];
    for (const key of Object.keys(data)) {
      const entry = { id: key, ...data[key] };
      if (entry.ts >= cutoff) fresh.push(entry);
      else oldKeys.push(key);
    }
    fresh.sort((a, b) => b.ts - a.ts);
    if (oldKeys.length) {
      const patch = {};
      for (const k of oldKeys) patch[k] = null;
      fetch(`${FIREBASE_URL}/activity_log.json`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }).catch(() => {});
    }
    return fresh;
  } catch(e) {
    return [];
  }
};

// Format ημερομηνίας/ώρας
export const fmtDateTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
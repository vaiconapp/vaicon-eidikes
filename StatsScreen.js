import React, { useState, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Alert, Platform,
} from 'react-native';
import * as XLSX from 'xlsx';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const PERIODS = ['ΣΗΜΕΡΑ', 'ΕΒΔΟΜΑΔΑ', 'ΜΗΝΑΣ', 'ΕΤΟΣ', 'ΠΕΡΥΣΙ'];
const YEAR_START = 2026;
const MONTHS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
const fmtDateTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const escHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dimensionStr = (o) => {
  if (o.h != null && o.w != null && String(o.h) !== '' && String(o.w) !== '') return `${o.h}x${o.w}`;
  return o.size || '—';
};
const armorLabel = (o) => (String(o.armor || '').toUpperCase().includes('ΔΙΠΛ') ? 'ΔΙΠΛΗ' : 'ΜΟΝΗ');
const sideShort = (s) => (s === 'ΑΡΙΣΤΕΡΗ' || s === 'ΑΡΙΣΤΕΡΑ' ? 'ΑΡ.' : s === 'ΔΕΞΙΑ' ? 'ΔΕ.' : '—');

function getSelectableYears() {
  const maxY = Math.max(YEAR_START, new Date().getFullYear());
  const arr = [];
  for (let y = YEAR_START; y <= maxY; y++) arr.push(y);
  return arr;
}

function filterSoldByYear(orders, year) {
  return orders.filter((o) => o.soldAt && new Date(o.soldAt).getFullYear() === year);
}

function isDeleteDateAllowed(year) {
  const now = new Date();
  const febFirst = new Date(year + 1, 1, 1);
  now.setHours(0, 0, 0, 0);
  febFirst.setHours(0, 0, 0, 0);
  return now >= febFirst;
}

function buildTopN(orders, getKey, n = 10) {
  const counts = {};
  orders.forEach((o) => {
    const keys = getKey(o);
    (Array.isArray(keys) ? keys : [keys])
      .filter((k) => k && String(k).trim())
      .forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    total,
    rows: Object.entries(counts)
      .map(([label, count]) => ({ label, count, pct: total ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n),
  };
}

function buildDimStats(orders, armor) {
  const filtered = orders.filter((o) => armorLabel(o) === armor);
  const total = filtered.length;
  if (total === 0) return { total: 0, rows: [] };
  const counts = {};
  filtered.forEach((o) => {
    if (o.h == null || o.w == null || String(o.h) === '' || String(o.w) === '') return;
    const key = `${o.h}x${o.w} ${sideShort(o.side)}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  const rows = Object.entries(counts)
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
  return { total, rows };
}

function computeYearStats(orders) {
  let moni = 0, dipli = 0;
  const byMonth = Array(12).fill(0);
  const dimCount = {};
  orders.forEach((o) => {
    if (armorLabel(o) === 'ΔΙΠΛΗ') dipli += 1; else moni += 1;
    if (o.soldAt) byMonth[new Date(o.soldAt).getMonth()] += 1;
    const dk = dimensionStr(o);
    dimCount[dk] = (dimCount[dk] || 0) + 1;
  });
  const top10 = Object.entries(dimCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { total: orders.length, moni, dipli, byMonth, top10 };
}

function buildExcelRows(orders) {
  const header = [
    '#Παρ.','Πελάτης','Διάσταση','Φορά','ΜΟΝΗ/ΔΙΠΛΗ','Επενδύσεις','Hardware','Lock','Εγκατάσταση',
    'Ημ.Καταχώρησης','Ημ.Παράδοσης','Ημ.Πώλησης',
  ];
  const sorted = [...orders].sort((a, b) => (a.soldAt || 0) - (b.soldAt || 0));
  const rows = sorted.map((o) => [
    o.orderNo ?? '',
    o.customer ?? '',
    dimensionStr(o),
    o.side || '—',
    armorLabel(o),
    Array.isArray(o.coatings) ? o.coatings.filter(Boolean).join(', ') : '',
    o.hardware || '—',
    o.lock || '—',
    o.installation || '—',
    o.createdAt ? fmtDateTime(o.createdAt) : '',
    o.deliveryDate || '',
    o.soldAt ? fmtDateTime(o.soldAt) : '',
  ]);
  return [header, ...rows];
}

function buildReportHtml(year, orders, stats) {
  const sorted = [...orders].sort((a, b) => (a.soldAt || 0) - (b.soldAt || 0));
  const monthRows = stats.byMonth
    .map((c, i) => `<tr><td>${MONTHS_EL[i]}</td><td style="text-align:right">${c}</td></tr>`).join('');
  const topRows = stats.top10
    .map(([dim, c]) => `<tr><td>${escHtml(dim)}</td><td style="text-align:right">${c}</td></tr>`).join('');
  const tableRows = sorted.map((o) => `<tr>
    <td>${escHtml(o.orderNo)}</td>
    <td>${escHtml(o.customer)}</td>
    <td>${escHtml(dimensionStr(o))}</td>
    <td>${escHtml(o.side || '—')}</td>
    <td>${escHtml(armorLabel(o))}</td>
    <td>${escHtml(Array.isArray(o.coatings) ? o.coatings.filter(Boolean).join(', ') : '')}</td>
    <td>${escHtml(o.hardware || '—')}</td>
    <td>${escHtml(o.lock || '—')}</td>
    <td>${escHtml(o.installation || '—')}</td>
    <td>${escHtml(o.createdAt ? fmtDateTime(o.createdAt) : '')}</td>
    <td>${escHtml(o.soldAt ? fmtDateTime(o.soldAt) : '')}</td>
  </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>VAICON ΕΙΔΙΚΕΣ ${year}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; color: #1a1a1a; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 14px; margin: 20px 0 8px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  .stats { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
  .box { background: #f5f5f5; padding: 10px 14px; border-radius: 8px; }
</style></head><body>
  <h1>VAICON ΕΙΔΙΚΕΣ — Πωλήσεις ${year}</h1>
  <div class="stats">
    <div class="box"><strong>Σύνολο</strong><br/>${stats.total} παραγγελίες</div>
    <div class="box"><strong>ΜΟΝΗ</strong><br/>${stats.moni}</div>
    <div class="box"><strong>ΔΙΠΛΗ</strong><br/>${stats.dipli}</div>
  </div>
  <h2>Ανά μήνα</h2>
  <table><thead><tr><th>Μήνας</th><th>Πωλήσεις</th></tr></thead><tbody>${monthRows}</tbody></table>
  <h2>Top 10 διαστάσεις</h2>
  <table><thead><tr><th>Διάσταση</th><th>Πλήθος</th></tr></thead><tbody>${topRows}</tbody></table>
  <h2>Λίστα παραγγελιών</h2>
  <table>
    <thead><tr>
      <th>#Παρ.</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>ΜΟΝΗ/ΔΙΠΛΗ</th>
      <th>Επενδύσεις</th><th>Hardware</th><th>Lock</th><th>Εγκατ.</th>
      <th>Ημ.Καταχ.</th><th>Ημ.Πώλησης</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body></html>`;
}

async function downloadXlsxFile(year, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Πωλήσεις');
  const filename = `vaicon_eidikes_${year}.xlsx`;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    const { cacheDirectory, writeAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const path = (cacheDirectory || '') + filename;
    await writeAsStringAsync(path, b64, { encoding: EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
      });
    }
  }
}

async function openSalesPdf(year, html) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0');
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    iframe.contentWindow.focus(); iframe.contentWindow.print();
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1000);
  } else {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `vaicon_eidikes_${year}.pdf` });
    }
  }
}

export default function StatsScreen({ specialOrders = [], soldSpecialOrders = [], setSoldSpecialOrders, FIREBASE_URL, onClose }) {
  const [period, setPeriod] = useState('ΜΗΝΑΣ');
  const [exportedYear, setExportedYear] = useState(null);
  const [showExportYearModal, setShowExportYearModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const allOrders = useMemo(() => [...specialOrders, ...soldSpecialOrders], [specialOrders, soldSpecialOrders]);

  const now = Date.now();
  const periodRange = useMemo(() => {
    const d = new Date(now);
    const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dow = (d.getDay() + 6) % 7;
    const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const yearStart = new Date(d.getFullYear(), 0, 1).getTime();
    const prevYearStart = new Date(d.getFullYear() - 1, 0, 1).getTime();
    if (period === 'ΣΗΜΕΡΑ')   return { from: startOfToday,  to: Infinity };
    if (period === 'ΕΒΔΟΜΑΔΑ') return { from: weekStart,     to: Infinity };
    if (period === 'ΜΗΝΑΣ')    return { from: monthStart,    to: Infinity };
    if (period === 'ΕΤΟΣ')     return { from: yearStart,     to: Infinity };
    if (period === 'ΠΕΡΥΣΙ')   return { from: prevYearStart, to: yearStart };
    return { from: 0, to: Infinity };
  }, [period, now]);

  const inRange = (ts) => ts != null && ts >= periodRange.from && ts < periodRange.to;

  const filtered = useMemo(
    () => allOrders.filter((o) => inRange(o.createdAt)),
    [allOrders, periodRange]
  );
  const filteredSold = useMemo(
    () => soldSpecialOrders.filter((o) => inRange(o.soldAt)),
    [soldSpecialOrders, periodRange]
  );

  const pendingCount = specialOrders.filter((o) => o.status === 'PENDING' || !o.status).length;
  const prodCount    = specialOrders.filter((o) => o.status === 'PROD' || o.status === 'DIPLI_PROD').length;
  const readyCount   = specialOrders.filter((o) => o.status === 'READY').length;
  const totalPieces  = useMemo(
    () => filtered.reduce((s, o) => s + (parseInt(o.qty, 10) || 1), 0),
    [filtered]
  );

  const avgTime = useMemo(() => {
    const calc = (orders, fromKey, toKey) => {
      const valid = orders.filter((o) => o[fromKey] && o[toKey]);
      if (!valid.length) return null;
      const total = valid.reduce((s, o) => s + (o[toKey] - o[fromKey]), 0);
      return Math.round(total / valid.length / 3600000);
    };
    return {
      toProd:  calc(allOrders, 'createdAt', 'prodAt'),
      toReady: calc(allOrders, 'prodAt',    'readyAt'),
      toSold:  calc(allOrders, 'readyAt',   'soldAt'),
    };
  }, [allOrders]);

  const salesChart = useMemo(() => {
    const sold = {};
    const ord = {};
    const orderedKeys = [];
    const push = (key) => { if (!(key in sold)) { sold[key] = 0; ord[key] = 0; orderedKeys.push(key); } };
    const bucketOf = (ts) => {
      if (period === 'ΣΗΜΕΡΑ')   return `${Math.floor(new Date(ts).getHours() / 3) * 3}h`;
      if (period === 'ΕΒΔΟΜΑΔΑ') return orderedKeys[(new Date(ts).getDay() + 6) % 7];
      if (period === 'ΜΗΝΑΣ') {
        const day = new Date(ts).getDate();
        const w = Math.min(orderedKeys.length, Math.ceil(day / 7));
        return `Εβδ ${w}`;
      }
      return MONTHS_EL[new Date(ts).getMonth()];
    };
    let title = 'ΠΩΛΗΣΕΙΣ / ΠΑΡΑΓΓΕΛΙΕΣ ΑΝΑ ΜΗΝΑ';
    if (period === 'ΣΗΜΕΡΑ') {
      for (let h = 0; h < 24; h += 3) push(`${h}h`);
      title = 'ΠΩΛΗΣΕΙΣ / ΠΑΡΑΓΓΕΛΙΕΣ ΑΝΑ 3ΩΡΟ';
    } else if (period === 'ΕΒΔΟΜΑΔΑ') {
      const labels = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ'];
      const start = periodRange.from;
      for (let i = 0; i < 7; i++) {
        const d = new Date(start + i * 86400000);
        push(`${labels[i]} ${d.getDate()}/${d.getMonth() + 1}`);
      }
      title = 'ΠΩΛΗΣΕΙΣ / ΠΑΡΑΓΓΕΛΙΕΣ ΑΝΑ ΗΜΕΡΑ';
    } else if (period === 'ΜΗΝΑΣ') {
      const d = new Date(now);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const weeks = Math.ceil(daysInMonth / 7);
      for (let i = 1; i <= weeks; i++) push(`Εβδ ${i}`);
      title = 'ΠΩΛΗΣΕΙΣ / ΠΑΡΑΓΓΕΛΙΕΣ ΑΝΑ ΕΒΔΟΜΑΔΑ';
    } else {
      MONTHS_EL.forEach((m) => push(m));
    }
    soldSpecialOrders.forEach((o) => {
      if (!inRange(o.soldAt)) return;
      const k = bucketOf(o.soldAt);
      if (k && k in sold) sold[k] += 1;
    });
    allOrders.forEach((o) => {
      if (!inRange(o.createdAt)) return;
      const k = bucketOf(o.createdAt);
      if (k && k in ord) ord[k] += 1;
    });
    return { title, keys: orderedKeys, sold, ord };
  }, [period, soldSpecialOrders, allOrders, periodRange, now]);
  const maxSales = Math.max(
    ...salesChart.keys.map((k) => Math.max(salesChart.sold[k] || 0, salesChart.ord[k] || 0)),
    1
  );

  const topCustomers = useMemo(
    () => buildTopN(filtered, (o) => o.customer || '').rows.slice(0, 10),
    [filtered]
  );
  const topCoatings = useMemo(
    () => buildTopN(filtered, (o) => Array.isArray(o.coatings) ? o.coatings : []).rows.slice(0, 4),
    [filtered]
  );
  const topLocks = useMemo(
    () => buildTopN(filtered, (o) => o.lock || '').rows.slice(0, 4),
    [filtered]
  );

  const installPct = useMemo(() => {
    if (!filtered.length) return null;
    const yes = filtered.filter((o) => String(o.installation || '').toUpperCase().includes('ΝΑΙ')).length;
    return { yes, no: filtered.length - yes, pct: Math.round((yes / filtered.length) * 100) };
  }, [filtered]);

  const dimStatsMoni  = useMemo(() => buildDimStats(filtered, 'ΜΟΝΗ'),  [filtered]);
  const dimStatsDipli = useMemo(() => buildDimStats(filtered, 'ΔΙΠΛΗ'), [filtered]);

  const selectableYears = useMemo(() => getSelectableYears(), []);
  const deleteTargetCount = exportedYear != null ? filterSoldByYear(soldSpecialOrders, exportedYear).length : 0;

  const runExportForYear = async (year) => {
    const list = filterSoldByYear(soldSpecialOrders, year);
    if (list.length === 0) { Alert.alert('', `Δεν υπάρχουν πωλήσεις για το ${year}`); return; }
    const stats = computeYearStats(list);
    try {
      await downloadXlsxFile(year, buildExcelRows(list));
      await openSalesPdf(year, buildReportHtml(year, list, stats));
      setExportedYear(year);
      setShowExportYearModal(false);
    } catch (e) {
      Alert.alert('Σφάλμα', 'Η εξαγωγή δεν ολοκληρώθηκε.');
    }
  };

  const onPressDeleteYear = () => {
    if (exportedYear === null) { Alert.alert('', 'Πρέπει πρώτα να κάνεις Εξαγωγή!'); return; }
    if (!isDeleteDateAllowed(exportedYear)) {
      Alert.alert('', `Η διαγραφή των παραγγελιών του ${exportedYear} επιτρέπεται από 1/2/${exportedYear + 1}.`);
      return;
    }
    const n = filterSoldByYear(soldSpecialOrders, exportedYear).length;
    if (n === 0) { Alert.alert('', 'Δεν υπάρχουν παραγγελίες για διαγραφή.'); return; }
    setShowDeleteModal(true);
  };

  const confirmDeleteYear = async () => {
    if (exportedYear === null || !FIREBASE_URL) { setShowDeleteModal(false); return; }
    const list = filterSoldByYear(soldSpecialOrders, exportedYear);
    const ids = list.map((o) => o.id).filter(Boolean);
    try {
      const patch = {};
      ids.forEach((id) => { patch[id] = null; });
      await fetch(`${FIREBASE_URL}/special_orders.json`, { method: 'PATCH', body: JSON.stringify(patch) });
      setSoldSpecialOrders && setSoldSpecialOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
      setExportedYear(null);
    } catch (e) {
      Alert.alert('Σφάλμα', 'Η διαγραφή δεν ολοκληρώθηκε.');
    }
    setShowDeleteModal(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>📊 ΣΤΑΤΙΣΤΙΚΑ</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity key={p} style={[styles.periodBtn, period === p && styles.periodBtnActive]} onPress={() => setPeriod(p)}>
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>

        <Text style={styles.sectionTitle}>ΣΥΝΟΨΗ</Text>
        <View style={styles.summaryGrid}>
          <StatBox label="Σύνολο Τεμαχίων" value={totalPieces} color="#007AFF" />
          <StatBox label="Πωλήσεις" value={filteredSold.length} color="#00C851" />
          <StatBox label="Εκκρεμούν" value={pendingCount + prodCount + readyCount} color="#ff4444" />
          <StatBox label="Σύνολο Ενεργών" value={specialOrders.length} color="#ff9500" />
        </View>

        <Text style={styles.sectionTitle}>LIVE ΚΑΤΑΣΤΑΣΗ</Text>
        <View style={styles.card}>
          <StatusRow label="🔴 Προς Παραγωγή" value={pendingCount} />
          <StatusRow label="🟡 Στην Παραγωγή" value={prodCount} />
          <StatusRow label="🟢 Έτοιμα Αποθήκης" value={readyCount} />
        </View>

        <Text style={styles.sectionTitle}>ΜΕΣΟΣ ΧΡΟΝΟΣ ΠΑΡΑΓΩΓΗΣ</Text>
        <View style={styles.card}>
          <TimeRow label="ΚΑΤΑΧΩΡΗΣΗ → ΠΑΡΑΓΩΓΗ" hours={avgTime.toProd} />
          <TimeRow label="ΠΑΡΑΓΩΓΗ → ΕΤΟΙΜΗ" hours={avgTime.toReady} />
          <TimeRow label="ΕΤΟΙΜΗ → ΠΩΛΗΣΗ" hours={avgTime.toSold} />
        </View>

        <Text style={styles.sectionTitle}>{salesChart.title}</Text>
        <View style={[styles.card, { paddingTop: 16 }]}>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#007AFF' }]} /><Text style={styles.legendTxt}>Παραγγελίες</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#8B0000' }]} /><Text style={styles.legendTxt}>Πωλήσεις</Text></View>
          </View>
          <View style={styles.barChart}>
            {salesChart.keys.map((key) => {
              const so = salesChart.sold[key] || 0;
              const or = salesChart.ord[key]  || 0;
              return (
                <View key={key} style={styles.barCol}>
                  <View style={styles.barPairRow}>
                    <View style={styles.barPairCol}>
                      <Text style={[styles.barValue, { color: '#007AFF' }]}>{or > 0 ? or : ''}</Text>
                      <View style={[styles.bar, { height: Math.max(4, (or / maxSales) * 80), backgroundColor: '#007AFF' }]} />
                    </View>
                    <View style={styles.barPairCol}>
                      <Text style={[styles.barValue, { color: '#8B0000' }]}>{so > 0 ? so : ''}</Text>
                      <View style={[styles.bar, { height: Math.max(4, (so / maxSales) * 80), backgroundColor: '#8B0000' }]} />
                    </View>
                  </View>
                  <Text style={styles.barLabel}>{key}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {installPct && (
          <>
            <Text style={styles.sectionTitle}>🔧 ΜΕ ΤΟΠΟΘΕΤΗΣΗ</Text>
            <View style={styles.card}>
              <StatusRow label="ΝΑΙ" value={`${installPct.yes} (${installPct.pct}%)`} />
              <StatusRow label="ΟΧΙ" value={`${installPct.no} (${100 - installPct.pct}%)`} />
            </View>
          </>
        )}

        {topCustomers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🏆 TOP ΠΕΛΑΤΕΣ</Text>
            <View style={styles.card}>
              {topCustomers.map((r, i) => (
                <RankRow key={r.label} rank={i + 1} label={r.label} value={`${r.count}`} />
              ))}
            </View>
          </>
        )}

        {topCoatings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🎨 TOP 4 ΕΠΕΝΔΥΣΕΙΣ</Text>
            <View style={styles.card}>
              {topCoatings.map((r, i) => (
                <RankRow key={r.label} rank={i + 1} label={r.label} value={`${r.count}`} />
              ))}
            </View>
          </>
        )}

        {topLocks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🔒 TOP 4 ΚΛΕΙΔΑΡΙΕΣ</Text>
            <View style={styles.card}>
              {topLocks.map((r, i) => (
                <RankRow key={r.label} rank={i + 1} label={r.label} value={`${r.count}`} />
              ))}
            </View>
          </>
        )}

        <View style={styles.dimChartsRow}>
          <View style={styles.dimChartHalf}>
            <DimChart title="📐 ΜΟΝΗ — ΔΙΑΣΤΑΣΕΙΣ" data={dimStatsMoni} color="#007AFF" />
          </View>
          <View style={styles.dimChartHalf}>
            <DimChart title="📐 ΔΙΠΛΗ — ΔΙΑΣΤΑΣΕΙΣ" data={dimStatsDipli} color="#00C851" />
          </View>
        </View>

        <View style={styles.exportBtnRow}>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnGreen]} onPress={() => setShowExportYearModal(true)}>
            <Text style={styles.exportBtnText}>📥 Εξαγωγή Έτους</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnRed]} onPress={onPressDeleteYear}>
            <Text style={styles.exportBtnText}>🗑️ Διαγραφή Έτους</Text>
          </TouchableOpacity>
        </View>
        {exportedYear != null && <Text style={styles.exportedHint}>Τελευταία εξαγωγή: {exportedYear}</Text>}
      </ScrollView>

      <Modal visible={showExportYearModal} transparent animationType="fade" onRequestClose={() => setShowExportYearModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.yearModalBox}>
            <Text style={styles.yearModalTitle}>Επιλογή έτους εξαγωγής</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {selectableYears.map((y) => (
                <TouchableOpacity key={y} style={styles.yearRow} onPress={() => runExportForYear(y)}>
                  <Text style={styles.yearRowText}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalCloseBtn, { marginTop: 12 }]} onPress={() => setShowExportYearModal(false)}>
              <Text style={styles.modalCloseBtnText}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.yearModalBox}>
            <Text style={styles.deleteModalText}>
              {`Θέλεις να διαγράψεις ΟΡΙΣΤΙΚΑ τις ${deleteTargetCount} παραγγελίες του ${exportedYear}; Η ενέργεια αυτή είναι μη αναστρέψιμη.`}
            </Text>
            <View style={styles.deleteModalBtns}>
              <TouchableOpacity style={[styles.exportBtn, styles.exportBtnRed, { flex: 1 }]} onPress={confirmDeleteYear}>
                <Text style={styles.exportBtnText}>ΝΑΙ, ΔΙΑΓΡΑΦΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportBtn, { flex: 1, backgroundColor: '#666' }]} onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.exportBtnText}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatBox({ label, value, color }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatusRow({ label, value }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function TimeRow({ label, hours }) {
  const display = hours === null ? '—' : hours < 24 ? `${hours}ω` : `${Math.round(hours / 24)}μ`;
  const color = hours === null ? '#ccc' : hours < 24 ? '#00C851' : hours < 72 ? '#ffbb33' : '#ff4444';
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color, fontWeight: 'bold' }]}>{display}</Text>
    </View>
  );
}

function RankRow({ rank, label, value }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel} numberOfLines={1}>{medals[rank - 1] || `${rank}.`} {label}</Text>
      <Text style={[styles.statusValue, { color: '#007AFF', fontWeight: 'bold' }]}>{value}</Text>
    </View>
  );
}

function DimChart({ title, data, color }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {data.total === 0 ? (
          <Text style={styles.emptyText}>Δεν υπάρχουν πωλήσεις</Text>
        ) : (
          <>
            <Text style={styles.dimTotalText}>Σύνολο: {data.total}</Text>
            {data.rows.map((row) => (
              <DimBarRow key={row.label} label={row.label} count={row.count} pct={row.pct} maxPct={data.rows[0].pct} color={color} />
            ))}
          </>
        )}
      </View>
    </>
  );
}

function DimBarRow({ label, count, pct, maxPct, color }) {
  const fillWidth = maxPct > 0 ? Math.max(2, (pct / maxPct) * 100) : 0;
  return (
    <View style={styles.dimBarRow}>
      <Text style={styles.dimBarLabel}>{label}</Text>
      <View style={styles.dimBarTrack}>
        <View style={[styles.dimBarFill, { width: `${fillWidth}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.dimBarValue}>{pct.toFixed(1)}% <Text style={styles.dimBarCount}>({count})</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#8B0000', paddingTop: 40, paddingBottom: 10, paddingHorizontal: 14 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  closeBtn: { padding: 4 },
  closeTxt: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: 1.5 },
  periodRow: { flexDirection: 'row', gap: 10, alignSelf: 'center' },
  periodBtn: { paddingVertical: 10, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, alignItems: 'center', minWidth: 56 },
  periodBtnActive: { backgroundColor: 'white' },
  periodText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  periodTextActive: { color: '#8B0000' },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#888', marginTop: 16, marginBottom: 8, letterSpacing: 1 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statBox: { width: '47%', backgroundColor: '#fff', borderRadius: 10, padding: 14, borderTopWidth: 4, elevation: 1 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 4, elevation: 1 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  statusLabel: { fontSize: 13, color: '#444', flex: 1, marginRight: 8 },
  statusValue: { fontSize: 13, color: '#333' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 11, color: '#444', fontWeight: '600' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', minHeight: 140 },
  barCol: { alignItems: 'center', flex: 1 },
  barPairRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barPairCol: { alignItems: 'center' },
  bar: { width: 12, borderRadius: 3 },
  barValue: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  barLabel: { fontSize: 11, color: '#1a1a1a', fontWeight: 'bold', marginTop: 6, textAlign: 'center' },
  dimTotalText: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 8, fontStyle: 'italic' },
  dimChartsRow: { flexDirection: 'row', gap: 8 },
  dimChartHalf: { flex: 1, minWidth: 0 },
  dimBarRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  dimBarLabel: { width: 95, fontSize: 11, fontWeight: '700', color: '#333' },
  dimBarTrack: { flex: 1, height: 18, backgroundColor: '#f0f0f0', borderRadius: 9, overflow: 'hidden', marginHorizontal: 6 },
  dimBarFill: { height: '100%', borderRadius: 9 },
  dimBarValue: { width: 78, textAlign: 'right', fontSize: 11, fontWeight: '700', color: '#333' },
  dimBarCount: { fontSize: 11, color: '#888', fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#888', fontStyle: 'italic', textAlign: 'center', paddingVertical: 14 },
  exportBtnRow: { gap: 10, marginTop: 12 },
  exportBtn: { padding: 14, borderRadius: 10, alignItems: 'center', width: '100%' },
  exportBtnGreen: { backgroundColor: '#1b5e20' },
  exportBtnRed: { backgroundColor: '#8B0000' },
  exportBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  exportedHint: { fontSize: 12, color: '#666', marginTop: 8, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  yearModalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 360 },
  yearModalTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  yearRow: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  yearRowText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  modalCloseBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalCloseBtnText: { color: 'white', fontWeight: 'bold' },
  deleteModalText: { fontSize: 14, color: '#333', lineHeight: 22, marginBottom: 16 },
  deleteModalBtns: { flexDirection: 'row', gap: 10 },
});

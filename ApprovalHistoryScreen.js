import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { FIREBASE_URL } from './App';
import { fmtDateTime } from './utils';

const FOUR_MONTHS = 120 * 24 * 60 * 60 * 1000;

export default function ApprovalHistoryScreen({ onClose, resolveLabel = (u) => u }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('customer');
  const [modeOpen, setModeOpen] = useState(false);
  const [sort, setSort] = useState({ field: 'ts', dir: 'desc' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FIREBASE_URL}/approval_log.json`);
      const data = await res.json();
      const cutoff = Date.now() - FOUR_MONTHS;
      const all = data ? Object.keys(data).map(k => ({ id: k, ...data[k] })) : [];
      const old = {};
      all.forEach(e => { if ((e.ts || 0) < cutoff) old[e.id] = null; });
      if (Object.keys(old).length) fetch(`${FIREBASE_URL}/approval_log.json`, { method: 'PATCH', body: JSON.stringify(old) }).catch(() => {});
      setRows(all.filter(e => (e.ts || 0) >= cutoff).sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    } catch { setRows([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const MODES = { customer: 'Πελάτης', orderNo: 'Αριθμός', seller: 'Πωλητής' };
  const PLACEHOLDERS = { customer: 'Όνομα / επωνυμία πελάτη', orderNo: 'Αριθμός παραγγελίας', seller: 'Όνομα πωλητή' };
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = rows;
    if (s) list = list.filter(r =>
      mode === 'orderNo' ? String(r.orderNo || '').toLowerCase().includes(s)
      : mode === 'seller' ? String(resolveLabel(r.submittedBy) || r.submittedBy || '').toLowerCase().includes(s)
      : String(r.customer || '').toLowerCase().includes(s)
    );
    const sign = sort.dir === 'desc' ? -1 : 1;
    const val = (r) => sort.field === 'orderNo' ? (parseInt(r.orderNo) || 0) : (r.ts || 0);
    return [...list].sort((a, b) => sign * (val(a) - val(b)));
  }, [rows, search, mode, sort]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 ΙΣΤΟΡΙΚΟ ΕΓΚΡΙΣΕΩΝ</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
      </View>
      <View style={{ padding: 10, zIndex: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity style={styles.modeBtn} onPress={() => setModeOpen(o => !o)}>
              <Text style={styles.modeBtnText}>🔎 {MODES[mode]} ▾</Text>
            </TouchableOpacity>
            {modeOpen ? (
              <View style={styles.modeDropdown}>
                {Object.keys(MODES).map(k => (
                  <TouchableOpacity key={k} style={styles.modeItem} onPress={() => { setMode(k); setModeOpen(false); setSearch(''); }}>
                    <Text style={[styles.modeItemText, mode === k && { fontWeight: 'bold', color: '#8B0000' }]}>{MODES[k]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.searchBox}>
            <TextInput style={styles.searchInput} placeholder={PLACEHOLDERS[mode]} value={search} onChangeText={setSearch} />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Text style={styles.clearX}>✕</Text></TouchableOpacity> : null}
          </View>
          {[['orderNo', 'Αρ.'], ['ts', 'Νεότ.']].map(([f, lbl]) => {
            const active = sort.field === f;
            return (
              <TouchableOpacity key={f} style={[styles.sortBtn, active && styles.sortBtnActive]}
                onPress={() => setSort(p => p.field === f ? { field: f, dir: p.dir === 'desc' ? 'asc' : 'desc' } : { field: f, dir: 'desc' })}>
                <Text style={[styles.sortBtnText, active && { color: '#fff' }]}>{lbl}{active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Text style={styles.count}>{filtered.length} εγκρίσεις (τελευταίοι 4 μήνες)</Text>
      {loading ? <ActivityIndicator size="large" color="#8B0000" style={{ marginTop: 24 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
          {filtered.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν εγκρίσεις.</Text> :
            filtered.map(r => { const rej = r.action === 'REJECTED'; return (
              <View key={r.id} style={[styles.card, { borderLeftColor: rej ? '#c62828' : '#00C851' }]}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderNo}>{rej ? '✕ ΑΠΟΡΡΙΨΗ' : (r.action === 'APPROVED_QUOTE' ? '💼 ΠΡΟΣΦΟΡΑ' : `#${r.orderNo || '—'}`)} {r.section ? `· ${r.section}` : ''}</Text>
                  <Text style={styles.time}>{r.ts ? fmtDateTime(r.ts) : ''}</Text>
                </View>
                <Text style={styles.customer}>👤 {r.customer || '—'}</Text>
                <Text style={styles.detail}>🧑‍💼 Πωλητής: {resolveLabel(r.submittedBy) || r.submittedBy || '—'}</Text>
                {r.submittedAt ? <Text style={styles.detail}>📤 Υποβολή πωλητή: {fmtDateTime(r.submittedAt)}</Text> : null}
                <Text style={[styles.detail, rej && { color: '#c62828', fontWeight: 'bold' }]}>{rej ? '✕ Απόρριψη από' : '✅ Έγκριση από'}: {r.approvedBy || '—'}</Text>
                {rej && r.rejectNote ? <Text style={[styles.detail, { color: '#c62828' }]}>📝 {r.rejectNote}</Text> : null}
              </View>
            ); })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#8B0000', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  close: { color: '#fff', fontSize: 22, fontWeight: 'bold', paddingHorizontal: 6 },
  modeBtn: { backgroundColor: '#8B0000', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  modeBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  modeDropdown: { position: 'absolute', top: 42, left: 0, minWidth: 140, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 4, zIndex: 20 },
  modeItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modeItemText: { fontSize: 14, color: '#333' },
  searchBox: { flexDirection: 'row', alignItems: 'center', width: '33%', minWidth: 150, backgroundColor: '#FDECEA', borderRadius: 8, borderWidth: 1.5, borderColor: '#E57373', paddingHorizontal: 8 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: '#1a1a1a' },
  clearX: { fontSize: 16, color: '#8B0000', fontWeight: 'bold', paddingHorizontal: 4 },
  sortBtn: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#bbb', paddingHorizontal: 12, paddingVertical: 9 },
  sortBtnActive: { backgroundColor: '#8B0000', borderColor: '#8B0000' },
  sortBtnText: { fontSize: 13, fontWeight: 'bold', color: '#555' },
  count: { fontSize: 11, color: '#999', paddingHorizontal: 12, paddingBottom: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 5, borderLeftColor: '#00C851', elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  time: { fontSize: 11, color: '#999' },
  customer: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 4 },
  detail: { fontSize: 13, color: '#555', marginTop: 2 },
});

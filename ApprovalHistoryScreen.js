import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { FIREBASE_URL } from './App';

const FOUR_MONTHS = 120 * 24 * 60 * 60 * 1000;
const fmtDateTime = (d) => {
  if (!d) return '';
  const dt = new Date(d); if (isNaN(dt)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};

export default function ApprovalHistoryScreen({ onClose, resolveLabel = (u) => u }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      String(r.customer || '').toLowerCase().includes(s) ||
      String(r.orderNo || '').toLowerCase().includes(s) ||
      String(resolveLabel(r.submittedBy) || r.submittedBy || '').toLowerCase().includes(s) ||
      String(r.approvedBy || '').toLowerCase().includes(s)
    );
  }, [rows, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 ΙΣΤΟΡΙΚΟ ΕΓΚΡΙΣΕΩΝ</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
      </View>
      <View style={{ padding: 10 }}>
        <TextInput style={styles.search} placeholder="🔍 Αναζήτηση (πελάτης / αρ. / πωλητής / έγκριση)" value={search} onChangeText={setSearch} />
      </View>
      <Text style={styles.count}>{filtered.length} εγκρίσεις (τελευταίοι 4 μήνες)</Text>
      {loading ? <ActivityIndicator size="large" color="#8B0000" style={{ marginTop: 24 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
          {filtered.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν εγκρίσεις.</Text> :
            filtered.map(r => { const rej = r.action === 'REJECTED'; return (
              <View key={r.id} style={[styles.card, { borderLeftColor: rej ? '#c62828' : '#00C851' }]}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderNo}>{rej ? '✕ ΑΠΟΡΡΙΨΗ' : `#${r.orderNo || '—'}`} {r.section ? `· ${r.section}` : ''}</Text>
                  <Text style={styles.time}>{r.ts ? fmtDateTime(r.ts) : ''}</Text>
                </View>
                <Text style={styles.customer}>👤 {r.customer || '—'}</Text>
                <Text style={styles.detail}>🧑‍💼 Πωλητής: {resolveLabel(r.submittedBy) || r.submittedBy || '—'}</Text>
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
  search: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  count: { fontSize: 11, color: '#999', paddingHorizontal: 12, paddingBottom: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 5, borderLeftColor: '#00C851', elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
  time: { fontSize: 11, color: '#999' },
  customer: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 4 },
  detail: { fontSize: 13, color: '#555', marginTop: 2 },
});

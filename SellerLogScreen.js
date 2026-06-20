import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { FIREBASE_URL } from './App';

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const day = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${day}/${m}/${dt.getFullYear()}`;
};

// Αρχείο αναθέσεων πελάτη → πωλητή (μόνο διαχειριστής).
export default function SellerLogScreen({ onClose, resolveLabel = (u) => u }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FIREBASE_URL}/seller_assign_log.json`);
      const data = await res.json();
      const list = data ? Object.keys(data).map(k => ({ id: k, ...data[k] })) : [];
      list.sort((a, b) => (b.at || 0) - (a.at || 0));
      setRows(list);
    } catch { setRows([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      String(r.customer || '').toLowerCase().includes(s) ||
      String(resolveLabel(r.seller) || r.seller || '').toLowerCase().includes(s) ||
      String(r.by || '').toLowerCase().includes(s)
    );
  }, [rows, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📒 Αναθέσεις Πελατών σε Πωλητές</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
      </View>
      <View style={styles.toolbar}>
        <TextInput style={styles.search} placeholder="🔍 Αναζήτηση (πελάτης / πωλητής / καταχωρητής)" value={search} onChangeText={setSearch} />
        <TouchableOpacity style={styles.refresh} onPress={load}><Text style={styles.refreshTxt}>🔄</Text></TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={[styles.th, { flex: 2 }]}>Πελάτης</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Πωλητής</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Καταχωρητής</Text>
        <Text style={[styles.th, { flex: 1 }]}>Ημ/νία</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#8B0000" style={{ marginTop: 24 }} />
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>Δεν υπάρχουν αναθέσεις.</Text>
          ) : filtered.map((r, i) => (
            <View key={r.id} style={[styles.row, i % 2 ? styles.rowOdd : styles.rowEven]}>
              <Text style={[styles.td, { flex: 2, fontWeight: 'bold' }]}>{r.customer || '—'}</Text>
              <Text style={[styles.td, { flex: 1.3, color: '#8B0000', fontWeight: 'bold' }]}>{resolveLabel(r.seller) || r.seller || '—'}</Text>
              <Text style={[styles.td, { flex: 1.3 }]}>{r.by || '—'}</Text>
              <Text style={[styles.td, { flex: 1, color: '#777' }]}>{r.at ? fmtDate(r.at) : '—'}</Text>
            </View>
          ))}
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
  toolbar: { flexDirection: 'row', gap: 8, padding: 10 },
  search: { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 8 },
  refresh: { backgroundColor: '#8B0000', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  refreshTxt: { color: '#fff', fontSize: 16 },
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  rowEven: { backgroundColor: '#fff' },
  rowOdd: { backgroundColor: '#f3e9e9' },
  th: { fontWeight: 'bold', color: '#333', fontSize: 13, paddingHorizontal: 4 },
  td: { color: '#222', fontSize: 13, paddingHorizontal: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
});

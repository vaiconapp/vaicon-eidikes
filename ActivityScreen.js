import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { loadActivityLog, cleanOldLogs, fmtDateTime } from './activityLog';
import { FIREBASE_URL as FB_URL } from './App';

const SECTION_COLORS = {
  'ΕΙΔΙΚΗ':        '#8B0000',
  'ΤΥΠΟΠΟΙΗΜΕΝΗ':  '#1565C0',
  'ΣΑΣΙ ΣΤΟΚ':     '#2E7D32',
  'ΚΑΣΕΣ ΣΤΟΚ':    '#E65100',
};

const ACTION_ICONS = {
  'Νέα παραγγελία':   '➕',
  'Διαγραφή':         '🗑️',
  'Ακύρωση':          '❌',
  'Πώληση':           '💰',
  'Αρχείο':           '📦',
  'Απόρριψη':         '🚫',
  'Επιστροφή':        '↩️',
  'Φάση':             '🔨',
  'Επεξεργασία':      '✏️',
};

export default function ActivityScreen({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ΟΛΑ');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await cleanOldLogs();
    const data = await loadActivityLog();
    setEntries(data);
    setLoading(false);
  };

  const clearAll = async () => {
    if (window.confirm('Διαγραφή όλου του ιστορικού;')) {
      try {
        await fetch(`${FB_URL}/activity_log.json`, { method: 'DELETE' });
        setEntries([]);
      } catch(e) {}
    }
  };

  const FILTERS = ['ΟΛΑ', 'ΕΙΔΙΚΗ', 'ΤΥΠΟΠΟΙΗΜΕΝΗ', 'ΣΑΣΙ ΣΤΟΚ', 'ΚΑΣΕΣ ΣΤΟΚ'];
  const filtered = filter === 'ΟΛΑ' ? entries : entries.filter(e => e.section === filter);

  const getIcon = (action) => {
    for (const key of Object.keys(ACTION_ICONS)) {
      if (action && action.includes(key)) return ACTION_ICONS[key];
    }
    return '📋';
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
        <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
          <Text style={styles.clearTxt}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* FILTERS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{padding:8,gap:6,flexDirection:'row'}}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter===f && styles.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterTxt, filter===f && styles.filterActiveTxt]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.count}>{filtered.length} κινήσεις (τελευταίες 7 μέρες)</Text>

      {/* LIST */}
      <ScrollView style={{flex:1}}>
        {loading && <Text style={styles.empty}>Φόρτωση...</Text>}
        {!loading && filtered.length === 0 && <Text style={styles.empty}>Δεν υπάρχουν κινήσεις.</Text>}
        {!loading && filtered.map(entry => {
          const sectionColor = SECTION_COLORS[entry.section] || '#555';
          return (
            <View key={entry.id} style={styles.card}>
              <View style={[styles.sectionBar, { backgroundColor: sectionColor }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.actionTxt}>{getIcon(entry.action)} {entry.action}</Text>
                  <Text style={styles.timeTxt}>{fmtDateTime(entry.ts)}</Text>
                </View>
                <View style={[styles.sectionBadge, { backgroundColor: sectionColor }]}>
                  <Text style={styles.sectionBadgeTxt}>{entry.section}</Text>
                </View>
                {entry.orderNo && <Text style={styles.detailTxt}>🔢 #{entry.orderNo}</Text>}
                {entry.customer && <Text style={styles.detailTxt}>👤 {entry.customer}</Text>}
                {entry.size && <Text style={styles.detailTxt}>📐 {entry.size}</Text>}
                {entry.model && <Text style={styles.detailTxt}>🚪 {entry.model}</Text>}
                {entry.qty && <Text style={styles.detailTxt}>📦 {entry.qty} τεμ.</Text>}
                {entry.extra && <Text style={styles.extraTxt}>{entry.extra}</Text>}
              </View>
            </View>
          );
        })}
        <View style={{height:40}}/>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#1a1a1a', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { padding: 4 },
  closeTxt: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: 'white', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
  clearBtn: { padding: 4 },
  clearTxt: { fontSize: 20 },
  filterRow: { backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee', maxHeight: 52 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#eee' },
  filterActive: { backgroundColor: '#1a1a1a' },
  filterTxt: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  filterActiveTxt: { color: 'white' },
  count: { fontSize: 11, color: '#999', padding: 8, paddingBottom: 4 },
  card: { flexDirection: 'row', backgroundColor: 'white', marginHorizontal: 10, marginBottom: 6, borderRadius: 8, overflow: 'hidden', elevation: 1 },
  sectionBar: { width: 5 },
  cardBody: { flex: 1, padding: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  actionTxt: { fontSize: 13, fontWeight: 'bold', color: '#1a1a1a', flex: 1 },
  timeTxt: { fontSize: 10, color: '#999', marginLeft: 8 },
  sectionBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 4 },
  sectionBadgeTxt: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  detailTxt: { fontSize: 12, color: '#555', marginTop: 2 },
  extraTxt: { fontSize: 11, color: '#888', marginTop: 4, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 14 },
});
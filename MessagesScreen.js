import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, FlatList, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { fmtDateTime } from './activityLog';
import { FIREBASE_URL as FB_URL } from './App';

export default function MessagesScreen({ users = [], userLabels = {}, lockKey, onClose }) {
  const [selected, setSelected] = useState({});
  const [text, setText] = useState('');
  const [archive, setArchive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filterUser, setFilterUser] = useState('ΟΛΑ');

  const nameOf = (u) => userLabels[lockKey(u)] || u;

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${FB_URL}/messages.json`);
      const data = (await r.json()) || {};
      const list = [];
      Object.keys(data).forEach(uk => {
        const folder = data[uk] || {};
        const items = Object.keys(folder).map(id => ({ uk, id, ...folder[id] }));
        items.sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((m, i) => { m._num = i + 1; });
        items.forEach(m => list.push(m));
      });
      list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setArchive(list);
    } catch { setArchive([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  const toggle = (u) => setSelected(s => ({ ...s, [u]: !s[u] }));

  const send = async () => {
    const msg = text.trim();
    const targets = users.filter(u => selected[u]);
    if (!msg) { Alert.alert('Προσοχή', 'Γράψε το μήνυμα.'); return; }
    if (targets.length === 0) { Alert.alert('Προσοχή', 'Διάλεξε τουλάχιστον έναν παραλήπτη.'); return; }
    setSending(true);
    let failed = 0;
    for (const u of targets) {
      const entry = { text: msg, ts: Date.now(), from: 'ADMIN', toName: u, read: false, readAt: null };
      try {
        const r = await fetch(`${FB_URL}/messages/${lockKey(u)}.json`, { method: 'POST', body: JSON.stringify(entry) });
        if (!r.ok) failed++;
      } catch { failed++; }
    }
    setSending(false);
    setText('');
    setSelected({});
    await loadArchive();
    if (failed) Alert.alert('⚠️ Προσοχή', `${failed} μήνυμα(τα) ΔΕΝ στάλθηκαν.`);
    else Alert.alert('✅ Στάλθηκε', `Το μήνυμα στάλθηκε σε ${targets.length} χρήστη(ες).`);
  };

  const deleteEntry = (item) => {
    const doDel = async () => {
      try { await fetch(`${FB_URL}/messages/${item.uk}/${item.id}.json`, { method: 'DELETE' }); setArchive(a => a.filter(x => x.id !== item.id)); } catch {}
    };
    if (Platform.OS === 'web') { if (window.confirm('Διαγραφή μηνύματος από το αρχείο;')) doDel(); }
    else Alert.alert('Διαγραφή', 'Διαγραφή μηνύματος;', [{ text: 'Όχι', style: 'cancel' }, { text: 'Ναι', style: 'destructive', onPress: doDel }]);
  };

  const renderItem = useCallback(({ item }) => (
    <View style={styles.card}>
      <View style={[styles.bar, { backgroundColor: item.read ? '#2e7d32' : '#E65100' }]} />
      <View style={styles.numCircle}><Text style={styles.numTxt}>{item._num}</Text></View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.toTxt}>👤 {item.toName || item.uk}</Text>
          <Text style={styles.timeTxt}>{fmtDateTime(item.ts)}</Text>
        </View>
        <Text style={styles.msgTxt}>{item.text}</Text>
        <View style={styles.cardBottom}>
          <Text style={[styles.status, { color: item.read ? '#2e7d32' : '#E65100' }]}>
            {item.read ? `✓ διαβάστηκε ${item.readAt ? '— ' + fmtDateTime(item.readAt) : ''}` : '⏳ στάλθηκε'}
          </Text>
          <TouchableOpacity onPress={() => deleteEntry(item)}><Text style={styles.delTxt}>🗑️</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  ), []);

  const shown = filterUser === 'ΟΛΑ' ? archive : archive.filter(m => (m.toName || m.uk) === filterUser);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>✉️ ΜΗΝΥΜΑΤΑ</Text>
        <TouchableOpacity onPress={loadArchive} style={styles.closeBtn}><Text style={styles.closeTxt}>🔄</Text></TouchableOpacity>
      </View>

      <View style={styles.composer}>
        <Text style={styles.label}>Παραλήπτες</Text>
        <View style={styles.chips}>
          {users.map(u => (
            <TouchableOpacity key={u} style={[styles.chip, selected[u] && styles.chipOn]} onPress={() => toggle(u)}>
              <Text style={[styles.chipTxt, selected[u] && styles.chipTxtOn]}>{selected[u] ? '✓ ' : ''}{nameOf(u)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Γράψε το μήνυμα..."
          placeholderTextColor="#999"
          multiline
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.5 }]} disabled={sending} onPress={send}>
          <Text style={styles.sendTxt}>{sending ? 'Αποστολή...' : '📨 ΑΠΟΣΤΟΛΗ'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {['ΟΛΑ', ...users].map(f => (
          <TouchableOpacity key={f} style={[styles.fchip, filterUser === f && styles.fchipOn]} onPress={() => setFilterUser(f)}>
            <Text style={[styles.fchipTxt, filterUser === f && styles.fchipTxtOn]}>{f === 'ΟΛΑ' ? 'ΟΛΑ' : nameOf(f)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.count}>ΑΡΧΕΙΟ — {shown.length} μηνύματα</Text>
      {loading ? (
        <Text style={styles.empty}>Φόρτωση...</Text>
      ) : shown.length === 0 ? (
        <Text style={styles.empty}>Δεν υπάρχουν μηνύματα.</Text>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          initialNumToRender={15}
          removeClippedSubviews
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#1a1a1a', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { padding: 4 },
  closeTxt: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: 'white', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
  composer: { backgroundColor: 'white', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#eee', borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipTxt: { fontSize: 13, fontWeight: 'bold', color: '#555' },
  chipTxtOn: { color: 'white' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 70, textAlignVertical: 'top', backgroundColor: '#fafafa' },
  sendBtn: { backgroundColor: '#8B0000', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 },
  sendTxt: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingTop: 8 },
  fchip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#eee' },
  fchipOn: { backgroundColor: '#1565C0' },
  fchipTxt: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  fchipTxtOn: { color: 'white' },
  count: { fontSize: 11, color: '#999', padding: 8, paddingBottom: 4 },
  card: { flexDirection: 'row', backgroundColor: 'white', marginHorizontal: 10, marginBottom: 6, borderRadius: 8, overflow: 'hidden', elevation: 1 },
  bar: { width: 5 },
  numCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginHorizontal: 8 },
  numTxt: { fontSize: 14, fontWeight: '900', color: 'white' },
  cardBody: { flex: 1, padding: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  toTxt: { fontSize: 13, fontWeight: 'bold', color: '#1a1a1a', flex: 1 },
  timeTxt: { fontSize: 10, color: '#999', marginLeft: 8 },
  msgTxt: { fontSize: 14, color: '#333', marginBottom: 6 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 11, fontWeight: 'bold' },
  delTxt: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
});

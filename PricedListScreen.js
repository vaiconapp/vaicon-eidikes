import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { FIREBASE_URL } from './App';

const LINK_LABELS = { montage: 'Μοντάρ.', kypri: 'Κυπρί', heightReduction: 'Μείωση', hinges3: 'Έξτρα μεντ.', galva: 'Γαλβ.', pihaki: 'Πηχάκι', stavCol: 'Κολώνες', casePaint: 'Βαφή' };

export default function PricedListScreen({ title = 'ΔΙΑΦΟΡΑ', icon = '📦', items = [], setItems, fbNode = 'misc', placeholder = 'π.χ. 3ος μεντεσές, μόνωση φελιζόλ...', showFlags = true, onClose }) {
  const [form, setForm] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const sorted = [...items].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

  const syncToCloud = async (it) => {
    try { await fetch(`${FIREBASE_URL}/${fbNode}/${it.id}.json`, { method: 'PUT', body: JSON.stringify(it) }); }
    catch { Alert.alert('Σφάλμα', 'Δεν αποθηκεύτηκε στο Cloud.'); }
  };

  const move = async (index, direction) => {
    const list = [...sorted];
    const swap = index + direction;
    if (swap < 0 || swap >= list.length) return;
    [list[index], list[swap]] = [list[swap], list[index]];
    const withOrder = list.map((l, i) => ({ ...l, order: i }));
    setItems(withOrder);
    await Promise.all(withOrder.map(l => fetch(`${FIREBASE_URL}/${fbNode}/${l.id}.json`, { method: 'PATCH', body: JSON.stringify({ order: l.order }) })));
  };

  const save = async () => {
    if (!form.trim()) return Alert.alert('Προσοχή', 'Βάλτε όνομα.');
    if (editingId) {
      const existing = items.find(l => l.id === editingId);
      if (!existing) return Alert.alert('Προσοχή', 'Η εγγραφή δεν βρέθηκε, ανανεώστε τη σελίδα.');
      const updated = { ...existing, name: form.trim(), price: formPrice.trim() };
      setItems(items.map(l => l.id === editingId ? updated : l));
      await syncToCloud(updated);
    } else {
      if (items.some(l => l.name.toLowerCase() === form.trim().toLowerCase())) return Alert.alert('Προσοχή', 'Υπάρχει ήδη.');
      const it = { id: Date.now().toString(), name: form.trim(), price: formPrice.trim(), createdAt: Date.now(), order: items.length };
      setItems([...items, it]);
      await syncToCloud(it);
    }
    setForm(''); setFormPrice(''); setEditingId(null);
  };

  const edit = (it) => { setForm(it.name); setFormPrice(it.price || ''); setEditingId(it.id); };

  const toggleFlag = async (it, field) => {
    const val = !it[field];
    setItems(items.map(l => l.id === it.id ? { ...l, [field]: val } : l));
    try { await fetch(`${FIREBASE_URL}/${fbNode}/${it.id}.json`, { method: 'PATCH', body: JSON.stringify({ [field]: val }) }); } catch {}
  };

  const remove = async (id) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Οριστική διαγραφή;')
      : await new Promise(res => Alert.alert('Διαγραφή', 'Οριστική διαγραφή;', [{ text: 'Όχι', onPress: () => res(false) }, { text: 'Ναι', style: 'destructive', onPress: () => res(true) }]));
    if (!ok) return;
    setItems(items.filter(l => l.id !== id));
    if (editingId === id) { setForm(''); setFormPrice(''); setEditingId(null); }
    try { await fetch(`${FIREBASE_URL}/${fbNode}/${id}.json`, { method: 'DELETE' }); } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{icon} {title}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{editingId ? 'ΕΠΕΞΕΡΓΑΣΙΑ' : 'ΝΕΑ ΕΓΓΡΑΦΗ'}</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} placeholder={placeholder} value={form} onChangeText={setForm} />
          <TextInput style={styles.priceInput} placeholder="€" value={formPrice} onChangeText={setFormPrice} keyboardType="numeric" />
          <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveTxt}>{editingId ? '✓' : '+'}</Text></TouchableOpacity>
        </View>
        {editingId && (
          <TouchableOpacity onPress={() => { setForm(''); setFormPrice(''); setEditingId(null); }} style={styles.cancelEdit}>
            <Text style={styles.cancelTxt}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        )}
        <TextInput style={styles.search} placeholder="🔍 Αναζήτηση..." value={search} onChangeText={setSearch} />
        <Text style={styles.count}>Σύνολο: {items.length}</Text>
        <ScrollView>
          {sorted.map((l, idx) => {
            if (!l.name.toLowerCase().includes(search.toLowerCase())) return null;
            return (
              <View key={l.id} style={styles.card}>
                <View style={styles.orderBtns}>
                  <TouchableOpacity onPress={() => move(idx, -1)} disabled={idx === 0}>
                    <Text style={[styles.orderBtn, idx === 0 && { opacity: 0.2 }]}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(idx, 1)} disabled={idx === sorted.length - 1}>
                    <Text style={[styles.orderBtn, idx === sorted.length - 1 && { opacity: 0.2 }]}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardName}>{l.name}</Text>
                {!!l.link && <Text style={styles.linkBadge}>🔗 {LINK_LABELS[l.link] || l.link}</Text>}
                {!!String(l.price || '').trim() && <Text style={styles.cardPrice}>€{l.price}</Text>}
                {showFlags && (
                  <View style={styles.flags}>
                    {[['showStd', 'Τυπ'], ['showEid', 'Ειδ']].map(([f, lbl]) => (
                      <TouchableOpacity key={f} style={styles.flagBox} onPress={() => toggleFlag(l, f)}>
                        <Text style={[styles.flagChk, l[f] && styles.flagChkOn]}>{l[f] ? '☑' : '☐'}</Text>
                        <Text style={styles.flagLbl}>{lbl}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.cardBtns}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => edit(l)}><Text style={styles.editTxt}>✏️</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => remove(l.id)}><Text style={styles.deleteTxt}>🗑</Text></TouchableOpacity>
                </View>
              </View>
            );
          })}
          {sorted.filter(l => l.name.toLowerCase().includes(search.toLowerCase())).length === 0 && <Text style={styles.empty}>Δεν βρέθηκαν εγγραφές.</Text>}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#1a1a1a', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center' },
  closeBtn: { marginRight: 16, padding: 4 },
  closeTxt: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  body: { flex: 1, padding: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: { flex: 1, backgroundColor: 'white', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  priceInput: { width: 70, backgroundColor: 'white', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 14, textAlign: 'center' },
  saveBtn: { backgroundColor: '#8B0000', borderRadius: 8, width: 48, justifyContent: 'center', alignItems: 'center' },
  saveTxt: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  cancelEdit: { alignSelf: 'flex-start', marginBottom: 8 },
  cancelTxt: { color: '#ff4444', fontSize: 12, fontWeight: 'bold' },
  search: { maxWidth: 260, backgroundColor: 'white', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 8 },
  count: { fontSize: 11, color: '#999', marginBottom: 8 },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', elevation: 1, borderLeftWidth: 4, borderLeftColor: '#8B0000' },
  orderBtns: { flexDirection: 'column', marginRight: 8, gap: 2 },
  orderBtn: { fontSize: 14, color: '#8B0000', fontWeight: 'bold', paddingHorizontal: 2 },
  cardName: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  cardPrice: { fontSize: 13, fontWeight: 'bold', color: '#8B0000', marginRight: 8 },
  linkBadge: { fontSize: 10, fontWeight: 'bold', color: '#1565C0', backgroundColor: '#E3F2FD', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, marginRight: 8 },
  flags: { flexDirection: 'row', gap: 6, marginRight: 8 },
  flagBox: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 5, backgroundColor: '#f0f0f0' },
  flagChk: { fontSize: 15, color: '#bbb' },
  flagChkOn: { color: '#2e7d32' },
  flagLbl: { fontSize: 10, fontWeight: 'bold', color: '#666' },
  cardBtns: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 6 },
  editTxt: { fontSize: 16 },
  deleteBtn: { padding: 6 },
  deleteTxt: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
});

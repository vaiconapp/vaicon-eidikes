import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { FIREBASE_URL } from './App';

export default function LocksScreen({ locks, setLocks, onClose }) {
  const [form, setForm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const syncToCloud = async (lock) => {
    try {
      await fetch(`${FIREBASE_URL}/locks/${lock.id}.json`, { method: 'PUT', body: JSON.stringify(lock) });
    } catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };

  const deleteFromCloud = async (id) => {
    try { await fetch(`${FIREBASE_URL}/locks/${id}.json`, { method: 'DELETE' }); } catch(e) {}
  };

  const movelock = async (index, direction) => {
    const newList = [...locks];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    const withOrder = newList.map((l, i) => ({ ...l, order: i }));
    setLocks(withOrder);
    await Promise.all(withOrder.map(l => fetch(`${FIREBASE_URL}/locks/${l.id}.json`, { method: 'PATCH', body: JSON.stringify({ order: l.order }) })));
  };

  const saveLock = async () => {
    if (!form.trim()) return Alert.alert("Προσοχή", "Βάλτε όνομα κλειδαριάς.");
    if (editingId) {
      const updated = { ...locks.find(l => l.id === editingId), name: form.trim() };
      setLocks(locks.map(l => l.id === editingId ? updated : l));
      await syncToCloud(updated);
      Alert.alert("VAICON", `Η κλειδαριά ενημερώθηκε!\n${form.trim()}`);
    } else {
      const exists = locks.some(l => l.name.toLowerCase() === form.trim().toLowerCase());
      if (exists) return Alert.alert("Προσοχή", "Αυτή η κλειδαριά υπάρχει ήδη.");
      const newLock = { id: Date.now().toString(), name: form.trim(), createdAt: Date.now(), order: locks.length };
      setLocks([...locks, newLock]);
      await syncToCloud(newLock);
      Alert.alert("VAICON", `Κλειδαριά αποθηκεύτηκε!\n${form.trim()}`);
    }
    setForm(''); setEditingId(null);
  };

  const editLock = (lock) => { setForm(lock.name); setEditingId(lock.id); };

  const deleteLock = (id) => {
    Alert.alert("Διαγραφή", "Οριστική διαγραφή κλειδαριάς;", [
      { text: "Όχι" },
      { text: "Ναι", style: "destructive", onPress: async () => {
        setLocks(locks.filter(l => l.id !== id));
        await deleteFromCloud(id);
      }}
    ]);
  };

  const sorted = [...locks].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const filtered = sorted.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔒 ΚΛΕΙΔΑΡΙΕΣ</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{editingId ? 'ΕΠΕΞΕΡΓΑΣΙΑ ΚΛΕΙΔΑΡΙΑΣ' : 'ΝΕΑ ΚΛΕΙΔΑΡΙΑ'}</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} placeholder="π.χ. Cisa 3 σημεία, Yale, Mottura..." value={form} onChangeText={setForm} autoCapitalize="characters" />
          <TouchableOpacity style={styles.saveBtn} onPress={saveLock}>
            <Text style={styles.saveTxt}>{editingId ? '✓' : '+'}</Text>
          </TouchableOpacity>
        </View>
        {editingId && (
          <TouchableOpacity onPress={() => { setForm(''); setEditingId(null); }} style={styles.cancelEdit}>
            <Text style={styles.cancelTxt}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        )}
        <TextInput style={styles.search} placeholder="🔍 Αναζήτηση..." value={search} onChangeText={setSearch} />
        <Text style={styles.count}>Σύνολο: {locks.length} κλειδαριές</Text>
        <ScrollView>
          {filtered.map((l, index) => (
            <View key={l.id} style={styles.card}>
              <View style={styles.orderBtns}>
                <TouchableOpacity onPress={() => movelock(sorted.indexOf(l), -1)} disabled={sorted.indexOf(l) === 0}>
                  <Text style={[styles.orderBtn, sorted.indexOf(l) === 0 && {opacity:0.2}]}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => movelock(sorted.indexOf(l), 1)} disabled={sorted.indexOf(l) === sorted.length - 1}>
                  <Text style={[styles.orderBtn, sorted.indexOf(l) === sorted.length - 1 && {opacity:0.2}]}>▼</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardName}>{l.name}</Text>
              <View style={styles.cardBtns}>
                <TouchableOpacity style={styles.editBtn} onPress={() => editLock(l)}>
                  <Text style={styles.editTxt}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteLock(l.id)}>
                  <Text style={styles.deleteTxt}>🗑</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {filtered.length === 0 && <Text style={styles.empty}>Δεν βρέθηκαν κλειδαριές.</Text>}
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
  saveBtn: { backgroundColor: '#8B0000', borderRadius: 8, width: 48, justifyContent: 'center', alignItems: 'center' },
  saveTxt: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  cancelEdit: { alignSelf: 'flex-start', marginBottom: 8 },
  cancelTxt: { color: '#ff4444', fontSize: 12, fontWeight: 'bold' },
  search: { backgroundColor: 'white', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 8 },
  count: { fontSize: 11, color: '#999', marginBottom: 8 },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', elevation: 1, borderLeftWidth: 4, borderLeftColor: '#8B0000' },
  orderBtns: { flexDirection: 'column', marginRight: 8, gap: 2 },
  orderBtn: { fontSize: 14, color: '#8B0000', fontWeight: 'bold', paddingHorizontal: 2 },
  cardName: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  cardBtns: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 6 },
  editTxt: { fontSize: 16 },
  deleteBtn: { padding: 6 },
  deleteTxt: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
});
import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { FIREBASE_URL } from './App';

export default function CoatingsScreen({ coatings, setCoatings, onClose }) {
  const [form, setForm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const syncToCloud = async (coating) => {
    try {
      await fetch(`${FIREBASE_URL}/coatings/${coating.id}.json`, { method: 'PUT', body: JSON.stringify(coating) });
    } catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };

  const deleteFromCloud = async (id) => {
    try { await fetch(`${FIREBASE_URL}/coatings/${id}.json`, { method: 'DELETE' }); } catch(e) {}
  };

  const moveCoating = async (index, direction) => {
    const newList = [...coatings];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    // Αποθήκευση νέας σειράς με order field
    const withOrder = newList.map((c, i) => ({ ...c, order: i }));
    setCoatings(withOrder);
    await Promise.all(withOrder.map(c => fetch(`${FIREBASE_URL}/coatings/${c.id}.json`, { method: 'PATCH', body: JSON.stringify({ order: c.order }) })));
  };

  const saveCoating = async () => {
    if (!form.trim()) return Alert.alert("Προσοχή", "Βάλτε όνομα επένδυσης.");
    if (editingId) {
      const updated = { ...coatings.find(c => c.id === editingId), name: form.trim() };
      setCoatings(coatings.map(c => c.id === editingId ? updated : c));
      await syncToCloud(updated);
      Alert.alert("VAICON", `Η επένδυση ενημερώθηκε!\n${form.trim()}`);
    } else {
      const exists = coatings.some(c => c.name.toLowerCase() === form.trim().toLowerCase());
      if (exists) return Alert.alert("Προσοχή", "Αυτή η επένδυση υπάρχει ήδη.");
      const newCoating = { id: Date.now().toString(), name: form.trim(), createdAt: Date.now(), order: coatings.length };
      setCoatings([...coatings, newCoating]);
      await syncToCloud(newCoating);
      Alert.alert("VAICON", `Επένδυση αποθηκεύτηκε!\n${form.trim()}`);
    }
    setForm(''); setEditingId(null);
  };

  const editCoating = (coating) => {
    setForm(coating.name);
    setEditingId(coating.id);
  };

  const deleteCoating = (id) => {
    Alert.alert("Διαγραφή", "Οριστική διαγραφή επένδυσης;", [
      { text: "Όχι" },
      { text: "Ναι", style: "destructive", onPress: async () => {
        setCoatings(coatings.filter(c => c.id !== id));
        await deleteFromCloud(id);
      }}
    ]);
  };

  // Αυτόματο χρώμα βάσει ονόματος
  const getCoatingBg = (name) => {
    const n = name?.toLowerCase() || '';
    if (n.includes('μέσα') || n.includes('μεσα')) return '#E8F4FD'; // ανοιχτό μπλε = ΜΕΣΑ
    if (n.includes('έξω') || n.includes('εξω')) return '#FFF3E0';   // ανοιχτό πορτοκαλί = ΕΞΩ
    return '#ffffff';
  };

  const getCoatingBorder = (name) => {
    const n = name?.toLowerCase() || '';
    if (n.includes('μέσα') || n.includes('μεσα')) return '#90CAF9';
    if (n.includes('έξω') || n.includes('εξω')) return '#FFCC80';
    return '#007AFF';
  };
  const sorted = [...coatings].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const filtered = sorted.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>{editingId ? 'ΕΠΕΞΕΡΓΑΣΙΑ ΕΠΕΝΔΥΣΗΣ' : 'ΝΕΑ ΕΠΕΝΔΥΣΗ'}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="π.χ. Δερματίνη, Inox, Ξύλο..."
            value={form}
            onChangeText={setForm}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={saveCoating}>
            <Text style={styles.saveTxt}>{editingId ? '✓' : '+'}</Text>
          </TouchableOpacity>
        </View>
        {editingId && (
          <TouchableOpacity onPress={() => { setForm(''); setEditingId(null); }} style={styles.cancelEdit}>
            <Text style={styles.cancelTxt}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        )}

        <TextInput style={styles.search} placeholder="🔍 Αναζήτηση..." value={search} onChangeText={setSearch} />

        <Text style={styles.count}>Σύνολο: {coatings.length} επενδύσεις</Text>

        <ScrollView>
          {filtered.map((c, index) => (
            <View key={c.id} style={[styles.card, {backgroundColor: getCoatingBg(c.name), borderLeftColor: getCoatingBorder(c.name)}]}>
              <View style={styles.orderBtns}>
                <TouchableOpacity onPress={() => moveCoating(sorted.indexOf(c), -1)} disabled={sorted.indexOf(c) === 0}>
                  <Text style={[styles.orderBtn, sorted.indexOf(c) === 0 && {opacity:0.2}]}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveCoating(sorted.indexOf(c), 1)} disabled={sorted.indexOf(c) === sorted.length - 1}>
                  <Text style={[styles.orderBtn, sorted.indexOf(c) === sorted.length - 1 && {opacity:0.2}]}>▼</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardName}>{c.name}</Text>
              <View style={styles.cardBtns}>
                <TouchableOpacity style={styles.editBtn} onPress={() => editCoating(c)}>
                  <Text style={styles.editTxt}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCoating(c.id)}>
                  <Text style={styles.deleteTxt}>🗑</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {filtered.length === 0 && <Text style={styles.empty}>Δεν βρέθηκαν επενδύσεις.</Text>}
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
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 8, width: 48, justifyContent: 'center', alignItems: 'center' },
  saveTxt: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  cancelEdit: { alignSelf: 'flex-start', marginBottom: 8 },
  cancelTxt: { color: '#ff4444', fontSize: 12, fontWeight: 'bold' },
  search: { backgroundColor: 'white', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 8 },
  count: { fontSize: 11, color: '#999', marginBottom: 8 },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', elevation: 1, borderLeftWidth: 4, borderLeftColor: '#007AFF' },
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
import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { FIREBASE_URL } from './App';
import { SIZE_OPTIONS, COLOR_OPTIONS, COLOR_MAP, getFormatStyle } from './formatHelpers';

export default function LocksScreen({ locks, setLocks, onClose }) {
  const [form, setForm] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [fmtBold, setFmtBold] = useState(false);
  const [fmtSize, setFmtSize] = useState('M');
  const [fmtColor, setFmtColor] = useState('black');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const resetForm = () => { setForm(''); setFormPrice(''); setFmtBold(false); setFmtSize('M'); setFmtColor('black'); setEditingId(null); };

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
      const updated = { ...locks.find(l => l.id === editingId), name: form.trim(), price: formPrice.trim(), bold: fmtBold, size: fmtSize, color: fmtColor };
      setLocks(locks.map(l => l.id === editingId ? updated : l));
      await syncToCloud(updated);
      Alert.alert("VAICON", `Η κλειδαριά ενημερώθηκε!\n${form.trim()}`);
    } else {
      const exists = locks.some(l => l.name.toLowerCase() === form.trim().toLowerCase());
      if (exists) return Alert.alert("Προσοχή", "Αυτή η κλειδαριά υπάρχει ήδη.");
      const newLock = { id: Date.now().toString(), name: form.trim(), price: formPrice.trim(), createdAt: Date.now(), order: locks.length, bold: fmtBold, size: fmtSize, color: fmtColor };
      setLocks([...locks, newLock]);
      await syncToCloud(newLock);
      Alert.alert("VAICON", `Κλειδαριά αποθηκεύτηκε!\n${form.trim()}`);
    }
    resetForm();
  };

  const editLock = (lock) => {
    setForm(lock.name);
    setFormPrice(lock.price || '');
    setFmtBold(!!lock.bold);
    setFmtSize(lock.size || 'M');
    setFmtColor(lock.color || 'black');
    setEditingId(lock.id);
  };

  const printList = () => {
    if (Platform.OS !== 'web') return;
    const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = sorted.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="p">${l.price ? '€' + esc(l.price) : ''}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ΚΛΕΙΔΑΡΙΕΣ</title><style>body{font-family:Arial,sans-serif;margin:12mm;color:#000}h1{font-size:20px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:5px 6px;font-size:13px}th{text-align:left;border-bottom:2px solid #999}.p{text-align:right;font-weight:bold;white-space:nowrap}@media print{@page{size:A4 portrait;margin:12mm}}</style></head><body><h1>🔒 ΚΛΕΙΔΑΡΙΕΣ — ΛΙΣΤΑ (${locks.length})</h1><table><tr><th>#</th><th>Κλειδαριά</th><th class="p">Τιμή</th></tr>${rows || '<tr><td colspan="3">Καμία εγγραφή.</td></tr>'}</table><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

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
          <TextInput style={styles.priceInput} placeholder="€" value={formPrice} onChangeText={setFormPrice} keyboardType="numeric" />
          <TouchableOpacity style={styles.saveBtn} onPress={saveLock}>
            <Text style={styles.saveTxt}>{editingId ? '✓' : '+'}</Text>
          </TouchableOpacity>
        </View>

        {/* ΜΟΡΦΟΠΟΙΗΣΗ */}
        <View style={styles.fmtBox}>
          <Text style={styles.fmtTitle}>🎨 ΜΟΡΦΟΠΟΙΗΣΗ</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Προεπισκόπηση:</Text>
            <Text style={[styles.previewText, getFormatStyle({bold:fmtBold,size:fmtSize,color:fmtColor}, 14)]}>
              {form.trim() || 'ΠΛΗΚΤΡΟΛΟΓΗΣΤΕ...'}
            </Text>
          </View>

          <View style={styles.fmtRow}>
            <Text style={styles.fmtLabel}>💪 Bold:</Text>
            <TouchableOpacity style={[styles.fmtBtn, !fmtBold && styles.fmtBtnActive]} onPress={()=>setFmtBold(false)}>
              <Text style={[styles.fmtBtnTxt, !fmtBold && styles.fmtBtnTxtActive]}>ΟΧΙ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.fmtBtn, fmtBold && styles.fmtBtnActive]} onPress={()=>setFmtBold(true)}>
              <Text style={[styles.fmtBtnTxt, fmtBold && styles.fmtBtnTxtActive]}>ΝΑΙ</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fmtRow}>
            <Text style={styles.fmtLabel}>🔠 Μέγεθος:</Text>
            {SIZE_OPTIONS.map(s=>(
              <TouchableOpacity key={s} style={[styles.fmtBtn, fmtSize===s && styles.fmtBtnActive]} onPress={()=>setFmtSize(s)}>
                <Text style={[styles.fmtBtnTxt, fmtSize===s && styles.fmtBtnTxtActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.fmtRow}>
            <Text style={styles.fmtLabel}>🎨 Χρώμα:</Text>
            {COLOR_OPTIONS.map(co=>(
              <TouchableOpacity key={co.key} style={[styles.colorBtn, {borderColor: fmtColor===co.key ? '#000' : 'transparent', backgroundColor: COLOR_MAP[co.key]+'22'}]} onPress={()=>setFmtColor(co.key)}>
                <Text style={{fontSize:18}}>{co.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {editingId && (
          <TouchableOpacity onPress={resetForm} style={styles.cancelEdit}>
            <Text style={styles.cancelTxt}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TextInput style={[styles.search, { flex: 1, marginBottom: 0 }]} placeholder="🔍 Αναζήτηση..." value={search} onChangeText={setSearch} />
          {Platform.OS === 'web' && <TouchableOpacity style={styles.printBtn} onPress={printList}><Text style={styles.printTxt}>🖨️ ΕΚΤΥΠΩΣΗ</Text></TouchableOpacity>}
        </View>
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
              <Text style={[styles.cardName, { fontWeight: l.bold ? 'bold' : 'normal' }, getFormatStyle(l, 14)]}>{l.name}</Text>
              {!!String(l.price || '').trim() && <Text style={styles.cardPrice}>€{l.price}</Text>}
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
  priceInput: { width: 70, backgroundColor: 'white', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 14, textAlign: 'center' },
  printBtn: { backgroundColor: '#eef4ff', borderWidth: 1, borderColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  printTxt: { color: '#1565C0', fontWeight: 'bold', fontSize: 12 },
  cardPrice: { fontSize: 13, fontWeight: 'bold', color: '#8B0000', marginRight: 8 },
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
  fmtBox: { backgroundColor: '#fafafa', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  fmtTitle: { fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  previewBox: { backgroundColor: 'white', borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  previewLabel: { fontSize: 9, color: '#999', marginBottom: 2 },
  previewText: { fontSize: 14, color: '#000' },
  fmtRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  fmtLabel: { fontSize: 11, color: '#555', minWidth: 75 },
  fmtBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, backgroundColor: '#e0e0e0', minWidth: 32, alignItems: 'center' },
  fmtBtnActive: { backgroundColor: '#8B0000' },
  fmtBtnTxt: { fontSize: 11, fontWeight: 'bold', color: '#555' },
  fmtBtnTxtActive: { color: 'white' },
  colorBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Animated, PanResponder, ScrollView, StyleSheet, Platform } from 'react-native';

export const priceListTotal = (items = []) =>
  (items || []).reduce((s, it) => s + (parseFloat(String(it?.value ?? '').replace(',', '.')) || 0), 0);

export const parseNum = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
export const priceFinalTotal = (items = [], discount = 0) => priceListTotal(items) - parseNum(discount);

const fmtEuro = (n) => `${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')}€`;
const pad = (n) => String(n).padStart(2, '0');
const fmtDateTime = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const withBlank = (arr) => { const a = (arr && arr.length) ? [...arr] : []; const last = a[a.length - 1]; if (!last || last.label || last.value) a.push({ label: '', value: '' }); return a; };

// Μετακινούμενο παράθυρο λίστας τιμών (περιγραφή αριστερά, τιμή δεξιά, αυτόματο σύνολο).
export default function PriceListModal({ visible, initialItems = [], initialDiscount = '', initialNote = '', log = [], title = 'Καταχώρηση τιμών', startLocked = false, readOnly = false, onSave, onClose }) {
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [locked, setLocked] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    if (!visible) return;
    const seed = (initialItems || []).map(it => ({ label: it.label || '', value: it.value != null ? String(it.value) : '' }));
    setItems((startLocked || readOnly) ? (seed.length ? seed : [{ label: '', value: '' }]) : withBlank(seed));
    setDiscount(initialDiscount != null && initialDiscount !== '' ? String(initialDiscount) : '');
    setNote(initialNote || '');
    setLocked(readOnly || !!startLocked);
    pan.setValue({ x: 0, y: 0 });
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => pan.flattenOffset(),
    })
  ).current;

  const rowRefs = useRef({});
  const focusKey = (k) => { const el = rowRefs.current[k]; if (el && el.focus) el.focus(); };
  const setRow = (i, key, val) => setItems(prev => {
    const next = prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it);
    const last = next[next.length - 1];
    if (i === next.length - 1 && (last.label || last.value)) next.push({ label: '', value: '' });
    return next;
  });
  const removeRow = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const onValueSubmit = (i) => {
    if (i === items.length - 1) { setItems(prev => [...prev, { label: '', value: '' }]); setTimeout(() => focusKey(`${i + 1}-label`), 60); }
    else focusKey(`${i + 1}-label`);
  };

  const clean = items.map(it => ({ label: String(it.label || '').trim(), value: String(it.value || '').trim() })).filter(it => it.label || it.value);
  const subtotal = priceListTotal(items);
  const total = subtotal - parseNum(discount);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.panel, { transform: pan.getTranslateTransform() }]}>
          <View style={[styles.header, Platform.OS === 'web' ? { cursor: 'move' } : null]} {...panResponder.panHandlers}>
            <Text style={styles.headerTxt}>💶 {title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>
          {locked ? <Text style={styles.lockNote}>{readOnly ? '🔒 Μόνο προβολή (πουλημένη παραγγελία)' : '🔒 Κλειδωμένο — πάτα «Επεξεργασία» για αλλαγές'}</Text> : null}
          <ScrollView style={[styles.itemsBox, { maxHeight: 320 }]} contentContainerStyle={{ padding: 10 }} keyboardShouldPersistTaps="handled">
            {items.map((it, i) => (
              <View key={i} style={styles.row}>
                <TextInput ref={el => rowRefs.current[`${i}-label`] = el} editable={!locked} style={[styles.labelInput, locked && styles.lockedInput]} placeholder="Περιγραφή (π.χ. σασί)" placeholderTextColor="#aaa" value={it.label} onChangeText={t => setRow(i, 'label', t)} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => focusKey(`${i}-value`)} />
                <TextInput ref={el => rowRefs.current[`${i}-value`] = el} editable={!locked} style={[styles.valueInput, locked && styles.lockedInput]} placeholder="0" placeholderTextColor="#aaa" keyboardType="numeric" value={it.value} onChangeText={t => setRow(i, 'value', t)} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => onValueSubmit(i)} />
                <Text style={styles.euro}>€</Text>
                {!locked ? <TouchableOpacity onPress={() => removeRow(i)} style={styles.delBtn}><Text style={styles.delTxt}>✕</Text></TouchableOpacity> : null}
              </View>
            ))}
          </ScrollView>
          <View style={styles.summary}>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Σύνολο γραμμών (προ-ΦΠΑ)</Text>
              <Text style={styles.sumVal}>{fmtEuro(subtotal)}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Έκπτωση</Text>
              <View style={styles.discountWrap}>
                <TextInput editable={!locked} style={[styles.discountInput, locked && styles.lockedInput]} placeholder="0" placeholderTextColor="#aaa" keyboardType="numeric" value={discount} onChangeText={setDiscount} />
                <Text style={styles.euro}>€</Text>
              </View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Σύνολο (χωρίς ΦΠΑ)</Text>
              <Text style={styles.totalVal}>{fmtEuro(total)}</Text>
            </View>
          </View>
          {(!locked || note) ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>📝 Σημείωση</Text>
              <TextInput editable={!locked} style={[styles.noteInput, locked && styles.lockedInput]} placeholder="Προαιρετικό σημείωμα…" placeholderTextColor="#aaa" multiline value={note} onChangeText={setNote} />
            </View>
          ) : null}
          {(log && log.length) ? (
            <View style={styles.logBox}>
              <View style={styles.logHeadRow}>
                <Text style={[styles.logH, { flex: 1.2 }]}>Χρήστης</Text>
                <Text style={[styles.logH, { flex: 1.6 }]}>Ημ/νία</Text>
                <Text style={[styles.logH, { flex: 1, textAlign: 'right' }]}>Τιμή</Text>
              </View>
              <ScrollView style={{ maxHeight: 110 }} keyboardShouldPersistTaps="handled">
                {log.map((e, i) => (
                  <View key={i} style={styles.logRow}>
                    <Text style={[styles.logC, { flex: 1.2 }]} numberOfLines={1}>{e.user || '—'}</Text>
                    <Text style={[styles.logC, { flex: 1.6 }]}>{fmtDateTime(e.ts)}</Text>
                    <Text style={[styles.logC, { flex: 1, textAlign: 'right', fontWeight: 'bold' }]}>{fmtEuro(e.total || 0)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.footer}>
            {locked ? (
              <>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#e0e0e0' }]} onPress={onClose}><Text style={{ color: '#555', fontWeight: 'bold' }}>Κλείσιμο</Text></TouchableOpacity>
                {!readOnly ? <TouchableOpacity style={[styles.btn, { backgroundColor: '#1565C0' }]} onPress={() => { setItems(prev => withBlank(prev)); setLocked(false); }}><Text style={{ color: '#fff', fontWeight: 'bold' }}>✏️ Επεξεργασία</Text></TouchableOpacity> : null}
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#e0e0e0' }]} onPress={onClose}><Text style={{ color: '#555', fontWeight: 'bold' }}>Άκυρο</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#8B0000' }]} onPress={() => onSave(clean, discount, note.trim())}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Αποθήκευση</Text></TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#8B0000', paddingHorizontal: 14, paddingVertical: 10 },
  headerTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  close: { color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  lockNote: { fontSize: 12, color: '#8B0000', fontWeight: 'bold', textAlign: 'center', paddingTop: 8 },
  lockedInput: { backgroundColor: '#f3f3f3', color: '#333', borderColor: '#e5e5e5' },
  labelInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14 },
  valueInput: { width: 78, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14, textAlign: 'right' },
  euro: { fontSize: 14, color: '#555', fontWeight: 'bold' },
  delBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  delTxt: { color: '#c62828', fontWeight: '900', fontSize: 13 },
  itemsBox: { margin: 10, marginBottom: 0, borderWidth: 1, borderColor: '#c8a200', backgroundColor: '#fff8e1', borderRadius: 10 },
  summary: { margin: 10, borderWidth: 1, borderColor: '#c8a200', backgroundColor: '#fff8e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  sumLabel: { fontSize: 14, color: '#555' },
  sumVal: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  discountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  discountInput: { width: 78, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 14, textAlign: 'right', backgroundColor: '#fff' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  totalLabel: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  totalVal: { fontSize: 18, fontWeight: '900', color: '#8B0000' },
  noteBox: { marginHorizontal: 10, marginBottom: 4, borderWidth: 1, borderColor: '#90CAF9', backgroundColor: '#E8F0FE', borderRadius: 10, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 },
  noteLabel: { fontSize: 12, color: '#1565C0', fontWeight: 'bold', marginBottom: 4 },
  noteInput: { minHeight: 54, borderWidth: 1, borderColor: '#bbd7f5', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: '#1a1a1a', textAlignVertical: 'top' },
  logBox: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#eee' },
  logHeadRow: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#eee' },
  logH: { fontSize: 11, color: '#888', fontWeight: 'bold' },
  logRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  logC: { fontSize: 12, color: '#444' },
  footer: { flexDirection: 'row', gap: 10, padding: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});

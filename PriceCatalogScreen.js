import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import { FIREBASE_URL } from './App';
import { DIPLI_MODELS } from './utils';

const CATEGORIES = ['ΓΕΝΙΚΗ', 'ΤΥΠΟΠΟΙΗΜΕΝΗ', 'ΕΙΔΙΚΗ'];
const CAT_COLOR = { 'ΓΕΝΙΚΗ': '#455a64', 'ΤΥΠΟΠΟΙΗΜΕΝΗ': '#1565C0', 'ΕΙΔΙΚΗ': '#8e24aa' };
const UNITS = [{ v: 'τεμ', label: 'Τεμάχια' }, { v: 'μ²', label: 'Τετρ. μέτρα' }, { v: 'μμ', label: 'Τρέχ. μέτρα' }];
const RULE_ARMORS = ['ΜΟΝΗ ΘΩΡΑΚΙΣΗ', 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'];
const RULE_KINDS = [['armor', 'Θωράκιση πόρτας'], ['coating', 'Επένδυση'], ['glass', 'Πλαίσιο τζαμιού / Σταθερό'], ['design', 'Σχέδιο πλαισίου τζαμιού']];
const RULE_KIND_LABELS = Object.fromEntries(RULE_KINDS);
const CAT_APPLIES = { 'ΓΕΝΙΚΗ': 'Τυποποιημένες + Ειδικές', 'ΤΥΠΟΠΟΙΗΜΕΝΗ': 'Μόνο τυποποιημένες', 'ΕΙΔΙΚΗ': 'Μόνο ειδικές' };
const notify = (title, msg) => { if (Platform.OS === 'web') window.alert(msg || title); else Alert.alert(title, msg); };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toFixed(2).replace('.', ',');
const fmtBand = (b) => {
  const from = String(b?.from || '').trim(), to = String(b?.to || '').trim(), add = String(b?.add || '').trim();
  if (!add) return null;
  const range = from && to ? (from === to ? from : `${from}–${to}`) : from ? `${from}+` : to ? `έως ${to}` : 'όλα';
  return `${range} → +${add}€`;
};
const bandsLine = (bands) => (bands || []).map(fmtBand).filter(Boolean).join(' · ');

function BandEditor({ label, bands, onChange }) {
  const upd = (i, k, v) => onChange(bands.map((b, idx) => idx === i ? { ...b, [k]: v } : b));
  return (
    <View style={styles.bandBox}>
      <Text style={styles.bandTitle}>{label}</Text>
      {bands.map((b, i) => (
        <View key={i} style={styles.bandRow}>
          <TextInput style={styles.bandInput} placeholder="από" keyboardType="numeric" value={b.from} onChangeText={t => upd(i, 'from', t)} />
          <Text style={styles.bandSep}>–</Text>
          <TextInput style={styles.bandInput} placeholder="έως" keyboardType="numeric" value={b.to} onChangeText={t => upd(i, 'to', t)}
            onBlur={() => { if (String(b.to).trim() && String(b.from).trim() && num(b.to) < num(b.from)) upd(i, 'to', ''); }} />
          <Text style={styles.bandSep}>→ +</Text>
          <TextInput style={styles.bandInput} placeholder="€" keyboardType="decimal-pad" value={b.add} onChangeText={t => upd(i, 'add', t)} />
          <TouchableOpacity onPress={() => onChange(bands.filter((_, idx) => idx !== i))} style={styles.bandDel}><Text style={styles.bandDelTxt}>✕</Text></TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={() => onChange([...bands, { from: '', to: '', add: '' }])} style={styles.bandAdd}><Text style={styles.bandAddTxt}>＋ όριο</Text></TouchableOpacity>
    </View>
  );
}

export default function PriceCatalogScreen({ coatings = [], onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('ΓΕΝΙΚΗ');
  const [unitPrice, setUnitPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [minCharge, setMinCharge] = useState('');
  const [showDesignDD, setShowDesignDD] = useState(false);
  const [hasRule, setHasRule] = useState(false);
  const [ruleKind, setRuleKind] = useState('armor');
  const [ruleArmor, setRuleArmor] = useState('');
  const [ruleModel, setRuleModel] = useState('');
  const [heightBands, setHeightBands] = useState([]);
  const [widthBands, setWidthBands] = useState([]);
  const [bandLogic, setBandLogic] = useState('and');
  const [searchDoors, setSearchDoors] = useState('');
  const [searchCoat, setSearchCoat] = useState('');
  const [picker, setPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${FIREBASE_URL}/price_catalog.json`);
      const data = await r.json();
      setItems(data ? Object.keys(data).map(k => ({ id: k, ...data[k] })) : []);
    } catch { Alert.alert('Σφάλμα', 'Αποτυχία φόρτωσης τιμοκαταλόγου.'); }
    setLoading(false);
  };

  const resetForm = () => {
    setEditingId(null); setName(''); setCategory('ΓΕΝΙΚΗ');
    setUnitPrice(''); setUnit(''); setMinCharge(''); setHasRule(false); setRuleKind('armor'); setRuleArmor(''); setRuleModel(''); setHeightBands([]); setWidthBands([]); setBandLogic('and');
  };

  const cleanBands = (bands) => (bands || [])
    .map(b => ({ from: String(b.from || '').trim(), to: String(b.to || '').trim(), add: String(b.add || '').trim() }))
    .filter(b => b.add && (b.from || b.to));

  const save = async () => {
    if (!name.trim()) return notify('Προσοχή', 'Βάλτε περιγραφή είδους (το πάνω πεδίο).');
    const base = { name: name.trim(), category, unitPrice: unitPrice.trim(), unit: unit.trim(),
      minCharge: (hasRule && (ruleKind === 'glass' || ruleKind === 'design')) ? minCharge.trim() : '', hasRule: !!hasRule,
      ruleKind: hasRule ? ruleKind : '', ruleArmor: (hasRule && ruleKind === 'armor') ? ruleArmor : '',
      ruleModel: (hasRule && ruleKind === 'armor' && ruleArmor === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ') ? ruleModel : '',
      ruleTarget: (hasRule && ruleKind !== 'armor') ? name.trim() : '',
      heightBands: hasRule ? cleanBands(heightBands) : [], widthBands: hasRule ? cleanBands(widthBands) : [],
      bandLogic: hasRule ? bandLogic : 'and' };
    let entry;
    if (editingId) {
      const existing = items.find(i => i.id === editingId);
      entry = { ...existing, ...base };
      setItems(items.map(i => i.id === editingId ? entry : i));
    } else {
      entry = { id: Date.now().toString(), createdAt: Date.now(), ...base };
      setItems([...items, entry]);
    }
    try { await fetch(`${FIREBASE_URL}/price_catalog/${entry.id}.json`, { method: 'PUT', body: JSON.stringify(entry) }); }
    catch { notify('Σφάλμα', 'Δεν αποθηκεύτηκε στο Cloud.'); }
    resetForm();
  };

  const edit = (it) => {
    setEditingId(it.id); setName(it.name || '');
    setCategory(CATEGORIES.includes(it.category) ? it.category : 'ΓΕΝΙΚΗ');
    setUnitPrice(it.unitPrice || ''); setUnit(it.unit || ''); setMinCharge(it.minCharge || ''); setHasRule(!!it.hasRule);
    setRuleKind(it.ruleKind || 'armor'); setRuleArmor(it.ruleArmor || ''); setRuleModel(it.ruleModel || '');
    setHeightBands(it.heightBands || []); setWidthBands(it.widthBands || []); setBandLogic(it.bandLogic === 'or' ? 'or' : 'and');
  };

  const remove = async (id) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Οριστική διαγραφή είδους;')
      : await new Promise(res => Alert.alert('Διαγραφή', 'Οριστική διαγραφή είδους;', [{ text: 'Όχι', onPress: () => res(false) }, { text: 'Ναι', style: 'destructive', onPress: () => res(true) }]));
    if (!ok) return;
    setItems(items.filter(i => i.id !== id));
    if (editingId === id) resetForm();
    try { await fetch(`${FIREBASE_URL}/price_catalog/${id}.json`, { method: 'DELETE' }); } catch {}
  };

  const sorted = useMemo(() => [...items].sort((a, b) => {
    const ca = CATEGORIES.indexOf(a.category), cb = CATEGORIES.indexOf(b.category);
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    return (a.name || '').localeCompare(b.name || '', 'el');
  }), [items]);

  const match = (i, q) => (i.name || '').toLowerCase().includes(q.toLowerCase());

  const pickerList = coatings
    .map(x => x?.name).filter(Boolean)
    .filter(n => n.toLowerCase().includes(pickerSearch.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'el'));

  const pickName = (n) => {
    setName(n);
    if (hasRule) { setRuleKind('coating'); setRuleArmor(''); }
    setPicker(false); setPickerSearch('');
  };
  const autoNames = RULE_ARMORS.map(a => `Πόρτα ${a}`);
  const pickRuleArmor = (a) => {
    const next = ruleArmor === a ? '' : a;
    setRuleArmor(next);
    if (next !== 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ') setRuleModel('');
    if (next && (!name.trim() || autoNames.includes(name.trim()))) setName(`Πόρτα ${next}`);
  };
  const pickRuleKind = (k) => {
    if (k === ruleKind) return;
    setRuleKind(k); setRuleArmor(''); setName(k === 'glass' ? 'Σταθερό / Τζάμι' : ''); setShowDesignDD(k === 'design');
  };
  const designNames = (() => {
    const ns = [...new Set(items.filter(i => i && i.ruleKind === 'design' && String(i.name || '').trim()).map(i => i.name.trim()))];
    return ns.length ? ns : ['ΧΙΑΣΤΗ'];
  })();
  const pickDesign = (d) => {
    const ex = items.find(i => i && i.ruleKind === 'design' && i.name === d);
    if (ex) edit(ex); else setName(d);
    setShowDesignDD(false);
  };

  const isCoating = (it) => it.ruleKind === 'coating';
  const renderCard = (it, cat) => (
    <View key={it.id} style={[styles.card, { borderLeftColor: CAT_COLOR[cat] }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{it.hasRule ? '⚙️ ' : ''}{it.name}{it.hasRule && it.ruleArmor && !String(it.name || '').includes(it.ruleArmor) ? ` · ${it.ruleArmor}` : ''}{it.ruleModel ? ` (${it.ruleModel})` : ''}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.catPill, { backgroundColor: CAT_COLOR[cat] }]}>{cat}</Text>
          <Text style={styles.metaTxt}>{CAT_APPLIES[cat]}{it.hasRule ? ` · Κανόνας: ${RULE_KIND_LABELS[it.ruleKind || (it.ruleArmor ? 'armor' : 'coating')] || '—'}` : ' · χωρίς κανόνα'}</Text>
        </View>
        <Text style={styles.cardSub}><Text style={styles.cardTot}>{fmt(num(it.unitPrice))}€</Text>{it.unit ? ` / ${it.unit}` : ''}{it.hasRule ? ' βασική' : ''}{it.minCharge ? ` · ελάχ. ${fmt(num(it.minCharge))}€` : ''}</Text>
        {bandsLine(it.heightBands) ? <Text style={styles.bandLine}>📐 Ύψος: {bandsLine(it.heightBands)}</Text> : null}
        {bandsLine(it.widthBands) ? <Text style={styles.bandLine}>↔️ Πλάτος: {bandsLine(it.widthBands)}</Text> : null}
        {bandsLine(it.heightBands) && bandsLine(it.widthBands) ? <Text style={styles.logicTag}>{it.bandLogic === 'or' ? '⇒ OR (μόνο η μεγαλύτερη)' : '⇒ AND (αθροιστικά)'}</Text> : null}
      </View>
      <TouchableOpacity style={styles.iconBtn} onPress={() => edit(it)}><Text style={styles.icon}>✏️</Text></TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={() => remove(it.id)}><Text style={styles.icon}>🗑</Text></TouchableOpacity>
    </View>
  );
  const renderList = (list, emptyTxt) => list.length === 0
    ? <Text style={styles.empty}>{emptyTxt}</Text>
    : CATEGORIES.map(cat => {
        const group = list.filter(i => (CATEGORIES.includes(i.category) ? i.category : 'ΓΕΝΙΚΗ') === cat);
        if (!group.length) return null;
        return (
          <View key={cat}>
            <Text style={[styles.catHeader, { color: CAT_COLOR[cat] }]}>{cat} ({group.length})</Text>
            {group.map(it => renderCard(it, cat))}
          </View>
        );
      });

  const doorsList = sorted.filter(i => !isCoating(i) && match(i, searchDoors));
  const coatList = sorted.filter(i => isCoating(i) && match(i, searchCoat));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>💶 ΤΙΜΟΚΑΤΑΛΟΓΟΣ</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.cols}>
        <View style={styles.leftCol}>
        <Text style={styles.label}>{editingId ? 'ΕΠΕΞΕΡΓΑΣΙΑ ΕΙΔΟΥΣ' : 'ΝΕΟ ΕΙΔΟΣ'}</Text>

        <View style={styles.row}>
          <TouchableOpacity style={[styles.check, hasRule && styles.checkOn]} onPress={() => setHasRule(v => !v)}>
            <Text style={styles.checkTxt}>{hasRule ? '✓' : ''}</Text>
          </TouchableOpacity>
          <Text style={styles.checkLabel}>Κανόνας</Text>
          <TextInput style={[styles.input, { flex: 1, maxWidth: 340 }]} placeholder="Περιγραφή είδους..." value={name} onChangeText={setName} />
          <TouchableOpacity style={styles.menuBtn} onPress={() => setPicker(true)}><Text style={styles.menuBtnTxt}>📋 Μενού</Text></TouchableOpacity>
        </View>

        <View style={styles.catRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.catChip, category === c && { backgroundColor: CAT_COLOR[c], borderColor: CAT_COLOR[c] }]}>
              <Text style={[styles.catChipTxt, category === c && { color: '#fff' }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasRule && (
          <>
            <View style={[styles.catRow, { position: 'relative', zIndex: 30 }]}>
              <Text style={[styles.fieldLbl, { alignSelf: 'center' }]}>Κανόνας για:</Text>
              {RULE_KINDS.map(([k, lbl]) => (
                <View key={k} style={{ position: 'relative', zIndex: k === 'design' ? 30 : 1 }}>
                  <TouchableOpacity onPress={() => { if (ruleKind === k) { if (k === 'design') setShowDesignDD(v => !v); } else pickRuleKind(k); }} style={[styles.catChip, ruleKind === k && { backgroundColor: '#E65100', borderColor: '#E65100' }]}>
                    <Text style={[styles.catChipTxt, ruleKind === k && { color: '#fff' }]}>{lbl}{k === 'design' ? ' ▾' : ''}</Text>
                  </TouchableOpacity>
                  {k === 'design' && ruleKind === 'design' && showDesignDD && (
                    <View style={styles.designDD}>
                      {designNames.map(d => (
                        <TouchableOpacity key={d} onPress={() => pickDesign(d)} style={styles.designDDItem}>
                          <Text style={styles.designDDTxt}>{d}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
            {ruleKind === 'armor' ? (
              <View style={styles.catRow}>
                <Text style={[styles.fieldLbl, { alignSelf: 'center' }]}>Θωράκιση:</Text>
                {RULE_ARMORS.map(a => (
                  <TouchableOpacity key={a} onPress={() => pickRuleArmor(a)} style={[styles.catChip, ruleArmor === a && { backgroundColor: '#E65100', borderColor: '#E65100' }]}>
                    <Text style={[styles.catChipTxt, ruleArmor === a && { color: '#fff' }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
                {ruleArmor === 'ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ' && DIPLI_MODELS.map(m => (
                  <TouchableOpacity key={m.code} onPress={() => setRuleModel(ruleModel === m.code ? '' : m.code)} style={[styles.catChip, ruleModel === m.code && { backgroundColor: '#5D4037', borderColor: '#5D4037' }]}>
                    <Text style={[styles.catChipTxt, ruleModel === m.code && { color: '#fff' }]}>{m.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : ruleKind === 'coating' ? (
              <Text style={styles.ruleHint}>Διάλεξε επένδυση από το 📋 Μενού — μπαίνει στην περιγραφή και ενεργοποιεί τον κανόνα.</Text>
            ) : ruleKind === 'design' ? (
              <Text style={styles.ruleHint}>Διάλεξε σχέδιο από το «Σχέδιο πλαισίου τζαμιού ▾» πιο πάνω, ή γράψε νέο όνομα στο πάνω πεδίο.</Text>
            ) : (
              <Text style={styles.ruleHint}>Γράψε όνομα (π.χ. Σταθερό / Τζάμι). Χρέωση ανά μονάδα + ελάχιστη χρέωση.</Text>
            )}
          </>
        )}

        <View style={[styles.row, { zIndex: 1 }]}>
          <View style={{ width: 110 }}><Text style={styles.fieldLbl}>{hasRule ? 'Βασική τιμή (€)' : 'Τιμή μονάδας (€)'}</Text><TextInput style={styles.input} placeholder="0,00" keyboardType="decimal-pad" value={unitPrice} onChangeText={setUnitPrice} /></View>
          <View>
            <Text style={styles.fieldLbl}>Μονάδα μέτρησης</Text>
            <View style={styles.unitRow}>
              {UNITS.map(u => (
                <TouchableOpacity key={u.v} onPress={() => setUnit(unit === u.v ? '' : u.v)} style={[styles.unitChip, unit === u.v && styles.unitChipOn]}>
                  <Text style={[styles.unitChipTxt, unit === u.v && { color: '#fff' }]}>{u.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {hasRule && (ruleKind === 'glass' || ruleKind === 'design') ? (
            <View style={{ width: 120 }}><Text style={styles.fieldLbl}>Ελάχιστη χρέωση (€)</Text><TextInput style={styles.input} placeholder="0,00" keyboardType="decimal-pad" value={minCharge} onChangeText={setMinCharge} /></View>
          ) : null}
        </View>

        {hasRule && ruleArmor ? (
          <View style={styles.bandsWrap}>
            <BandEditor label="Επιβάρυνση ΥΨΟΥΣ (εκ.)" bands={heightBands} onChange={setHeightBands} />
            <BandEditor label="Επιβάρυνση ΠΛΑΤΟΥΣ (εκ.)" bands={widthBands} onChange={setWidthBands} />
            <View style={styles.logicRow}>
              <Text style={styles.logicLabel}>Ύψος & Πλάτος μαζί:</Text>
              {[['and', 'AND'], ['or', 'OR']].map(([v, lbl]) => (
                <TouchableOpacity key={v} onPress={() => setBandLogic(v)} style={[styles.logicChip, bandLogic === v && styles.logicChipOn]}>
                  <Text style={[styles.logicChipTxt, bandLogic === v && { color: '#fff' }]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.logicHint}>{bandLogic === 'or' ? 'μόνο η μεγαλύτερη επιβάρυνση' : 'προστίθενται ύψος + πλάτος'}</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.row, { marginTop: 8 }]}>
          <TouchableOpacity style={styles.clearBtn} onPress={save}><Text style={styles.clearTxt}>{editingId ? '✓ ΑΠΟΘΗΚΕΥΣΗ' : '+ ΠΡΟΣΘΗΚΗ'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={resetForm}><Text style={styles.clearTxt}>ΑΚΥΡΟ</Text></TouchableOpacity>
        </View>
        </View>

        <View style={styles.rightArea}>
        {loading ? <ActivityIndicator size="large" color="#8B0000" style={{ marginTop: 30 }} /> : (
          <View style={styles.listCols}>
            <View style={styles.listCol}>
              <TextInput style={styles.search} placeholder="🔍 Αναζήτηση πόρτας/σασί..." value={searchDoors} onChangeText={setSearchDoors} />
              <Text style={styles.listHead}>🚪 Πόρτες / Σασί ({doorsList.length})</Text>
              <ScrollView style={{ flex: 1 }}>{renderList(doorsList, 'Δεν υπάρχουν είδη.')}</ScrollView>
            </View>
            <View style={styles.listCol}>
              <TextInput style={styles.search} placeholder="🔍 Αναζήτηση επένδυσης..." value={searchCoat} onChangeText={setSearchCoat} />
              <Text style={styles.listHead}>🎨 Επενδύσεις ({coatList.length})</Text>
              <ScrollView style={{ flex: 1 }}>{renderList(coatList, 'Δεν υπάρχουν επενδύσεις.')}</ScrollView>
            </View>
          </View>
        )}
        </View>
        </View>
      </View>

      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerPanel}>
            <View style={styles.pickerTabs}>
              <Text style={[styles.pickerTabTxt, { color: '#8B0000', fontSize: 14 }]}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
              <TouchableOpacity onPress={() => setPicker(false)} style={styles.pickerClose}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.search} placeholder="🔍 Αναζήτηση..." value={pickerSearch} onChangeText={setPickerSearch} />
            <ScrollView style={{ maxHeight: 360 }}>
              {pickerList.map(n => (
                <TouchableOpacity key={n} style={styles.pickerItem} onPress={() => pickName(n)}><Text style={styles.pickerItemTxt}>{n}</Text></TouchableOpacity>
              ))}
              {pickerList.length === 0 && <Text style={styles.empty}>Καμία επιλογή.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  cols: { flex: 1, flexDirection: 'row', gap: 16 },
  leftCol: { flex: 5 },
  rightArea: { flex: 7, minWidth: 420 },
  listCols: { flex: 1, flexDirection: 'row', gap: 12 },
  listCol: { flex: 1, minWidth: 230 },
  listHead: { fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 6, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: '#eee' },
  label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-end', maxWidth: 680 },
  fieldLbl: { fontSize: 11, color: '#888', marginBottom: 2 },
  input: { backgroundColor: 'white', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 11, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  designDD: { position: 'absolute', top: 42, left: 0, minWidth: 150, backgroundColor: 'white', borderWidth: 1, borderColor: '#E65100', borderRadius: 8, paddingVertical: 4, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  designDDItem: { paddingVertical: 9, paddingHorizontal: 14 },
  designDDTxt: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  unitRow: { flexDirection: 'row', gap: 6 },
  unitChip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', backgroundColor: 'white' },
  unitChipOn: { backgroundColor: '#37474f', borderColor: '#37474f' },
  unitChipTxt: { fontSize: 13, fontWeight: 'bold', color: '#666' },
  check: { width: 34, height: 34, borderRadius: 8, borderWidth: 2, borderColor: '#bbb', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' },
  checkOn: { backgroundColor: '#E65100', borderColor: '#E65100' },
  checkTxt: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  checkLabel: { fontSize: 13, color: '#666', fontWeight: 'bold', marginRight: 4 },
  menuBtn: { backgroundColor: '#37474f', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', height: 44 },
  menuBtnTxt: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  catRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  catChip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1, borderColor: '#ccc', backgroundColor: 'white' },
  catChipTxt: { fontSize: 13, fontWeight: 'bold', color: '#666' },
  saveBtn: { backgroundColor: '#8B0000', borderRadius: 8, width: 46, height: 40, justifyContent: 'center', alignItems: 'center' },
  saveTxt: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  clearBtn: { borderWidth: 1, borderColor: '#ff8a80', borderRadius: 8, height: 40, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  clearTxt: { color: '#d32f2f', fontSize: 12, fontWeight: 'bold' },
  ruleHint: { fontSize: 11, color: '#E65100', marginBottom: 8, fontStyle: 'italic' },
  bandsWrap: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 8, maxWidth: 680 },
  bandBox: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#eee', padding: 8, minWidth: 290 },
  bandTitle: { fontSize: 11, fontWeight: 'bold', color: '#E65100', marginBottom: 6 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  bandInput: { width: 52, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6, fontSize: 12, textAlign: 'center' },
  bandSep: { fontSize: 12, color: '#777', fontWeight: 'bold' },
  bandDel: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  bandDelTxt: { color: '#c62828', fontWeight: '900', fontSize: 11 },
  bandAdd: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#fff3e0', borderRadius: 6, marginTop: 2 },
  bandAddTxt: { fontSize: 11, fontWeight: 'bold', color: '#E65100' },
  search: { backgroundColor: 'white', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 8 },
  catHeader: { fontSize: 13, fontWeight: 'bold', marginTop: 10, marginBottom: 4, letterSpacing: 1 },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', elevation: 1, borderLeftWidth: 4 },
  cardName: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  cardSub: { fontSize: 12, color: '#777', marginTop: 2 },
  cardTot: { color: '#2e7d32', fontWeight: 'bold' },
  bandLine: { fontSize: 12, color: '#E65100', marginTop: 2, fontWeight: '600' },
  logicTag: { fontSize: 11, color: '#6a1b9a', marginTop: 2, fontWeight: '700' },
  logicRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, width: '100%', flexWrap: 'wrap' },
  logicLabel: { fontSize: 12, color: '#444', fontWeight: '600' },
  logicChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: '#8e24aa', backgroundColor: '#fff' },
  logicChipOn: { backgroundColor: '#8e24aa' },
  logicChipTxt: { fontSize: 12, fontWeight: '700', color: '#8e24aa' },
  logicHint: { fontSize: 11, color: '#777', fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  catPill: { fontSize: 10, fontWeight: 'bold', color: '#fff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  metaTxt: { fontSize: 11, color: '#666' },
  iconBtn: { padding: 6 },
  icon: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  pickerPanel: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  pickerTabs: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  pickerTab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#e0e0e0' },
  pickerTabOn: { backgroundColor: '#8B0000' },
  pickerTabTxt: { fontSize: 13, fontWeight: 'bold', color: '#555' },
  pickerClose: { marginLeft: 'auto', padding: 6, backgroundColor: '#1a1a1a', borderRadius: 8 },
  pickerItem: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#eee' },
  pickerItemTxt: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
});

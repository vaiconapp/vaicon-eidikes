import React, { useState, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform } from 'react-native';
import { FIREBASE_URL } from './App';

// Helper εκτύπωσης — web: window.print(), mobile: expo-print + sharing
const printHTML = async (html, title, existingWin=null) => {
  if (Platform.OS === 'web') {
    const win = existingWin || window.open('', '_blank', 'width=900,height=700,left=100,top=100,resizable=yes,scrollbars=yes');
    if (!win) { Alert.alert("Σφάλμα", "Ο browser μπλόκαρε το παράθυρο εκτύπωσης. Επιτρέψτε τα pop-ups."); return; }
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const innerCSS = styleMatch ? styleMatch[1] : '';
    const inner = html.replace(/<html[\s\S]*?<body[^>]*>/i,'').replace(/<\/body[\s\S]*?<\/html>/i,'');
    const previewHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title || 'VAICON'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #f5f5f5; }
          #toolbar {
            position: fixed; top: 0; left: 0; right: 0;
            background: #1a1a1a; padding: 10px 16px;
            display: flex; align-items: center; justify-content: space-between;
            z-index: 999;
          }
          #toolbar h2 { color: white; font-size: 14px; }
          #printBtn { background: #007AFF; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; }
          #closeBtn { background: #555; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; margin-left: 8px; }
          #content { margin-top: 56px; padding: 16px; background: white; }
          @media print { #toolbar { display: none; } #content { margin-top: 0; padding: 0; } }
          ${innerCSS}
        </style>
      </head>
      <body>
        <div id="toolbar">
          <h2>🖨️ ${title || 'VAICON'}</h2>
          <div>
            <button id="printBtn" onclick="window.print()">🖨️ ΕΚΤΥΠΩΣΗ</button>
            <button id="closeBtn" onclick="window.close()">✕ ΚΛΕΙΣΙΜΟ</button>
          </div>
        </div>
        <div id="content">${inner}</div>
      </body>
      </html>
    `;
    win.document.write(previewHTML);
    win.document.close();
    win.focus();
  } else {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title || 'VAICON', UTI: 'com.adobe.pdf' });
  }
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const INIT = { name: '', phone: '', phone2: '', phone3: '', phoneViber: '', email: '', identifier: '', city: '', profession: '' };

export default function CustomersScreen({ customers, setCustomers, onClose, prefillName, onCustomerAdded, customOrders=[], allOrders=[], setSpecialOrders, setSoldSpecialOrders, specialOrders=[] }) {
  const [form, setForm] = useState(prefillName ? { ...INIT, name: prefillName } : INIT);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('name'); // 'name' | 'orders'
  const [selectedCustomerOrders, setSelectedCustomerOrders] = useState(null); // πελάτης για εμφάνιση παραγγελιών
  const [deleteCustomerModal, setDeleteCustomerModal] = useState({ visible:false, customerId:null, customerName:'' });
  const scrollRef = useRef(null);

  const uniqueCities = useMemo(() => {
    const set = new Set();
    customers.forEach(c => { const v = (c.city || '').trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b, 'el'));
  }, [customers]);
  const uniqueProfessions = useMemo(() => {
    const set = new Set();
    customers.forEach(c => { const v = (c.profession || '').trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b, 'el'));
  }, [customers]);

  const suggest = (list, q) => {
    const s = (q || '').trim().toLowerCase();
    if (!s) return [];
    return list.filter(v => v.toLowerCase().includes(s) && v.toLowerCase() !== s).slice(0, 5);
  };
  const citySuggestions = suggest(uniqueCities, form.city);
  const professionSuggestions = suggest(uniqueProfessions, form.profession);

  const getStatusLabel = (order) => {
    if (order.status==='PENDING') return { label:'📋 Καταχωρημένη', color:'#ff4444' };
    if (order.status==='STD_PENDING') return { label:'📐 Τυποποιημένη', color:'#8B0000' };
    if (order.status==='READY') return { label:'✅ Έτοιμη Αποθήκης', color:'#00C851' };
    if (order.status==='PROD') {
      const activePhasesLabels = ['laser','cases','sasi','mounting','painting']
        .map(k => order.phases?.[k])
        .filter(p => p?.active && !p?.done)
        .map(p => p?.label||'');
      const doneCount = ['laser','cases','sasi','mounting','painting'].filter(k=>order.phases?.[k]?.done).length;
      return { label:`🔨 Παραγωγή (${doneCount} φάσεις done)`, color:'#ffbb33' };
    }
    return { label:'—', color:'#999' };
  };

  const syncToCloud = async (customer) => {
    try {
      await fetch(`${FIREBASE_URL}/customers/${customer.id}.json`, { method: 'PUT', body: JSON.stringify(customer) });
    } catch { Alert.alert("Σφάλμα", "Δεν αποθηκεύτηκε στο Cloud."); }
  };

  const deleteFromCloud = async (id) => {
    try { await fetch(`${FIREBASE_URL}/customers/${id}.json`, { method: 'DELETE' }); } catch(e) {}
  };

  const saveCustomer = async () => {
    if (!form.name.trim()) return Alert.alert("Προσοχή", "Βάλτε Όνομα Πελάτη.");
    if (editingId) {
      const prevCustomer = customers.find(c => c.id === editingId);
      const oldName = prevCustomer?.name ?? '';
      const updated = { ...prevCustomer, ...form };
      setCustomers(customers.map(c => c.id === editingId ? updated : c));
      await syncToCloud(updated);

      // Ενημέρωση παραγγελιών ειδικών (Firebase: /special_orders/) + τοπική κατάσταση
      if (setSpecialOrders && setSoldSpecialOrders) {
        const matchesCustomer = (order) =>
          order.customerId === editingId ||
          (!order.customerId && oldName && order.customer === oldName);

        const updateOrder = async (order) => {
          if (!matchesCustomer(order)) return order;
          const patch = { customer: updated.name };
          if (!order.customerId) patch.customerId = editingId;
          const updatedOrder = { ...order, ...patch };
          await fetch(`${FIREBASE_URL}/special_orders/${order.id}.json`, { method: 'PATCH', body: JSON.stringify(patch) });
          return updatedOrder;
        };
        const updatedActive = await Promise.all(allOrders.filter(o => o.status !== 'SOLD').map(updateOrder));
        const updatedSold = await Promise.all(allOrders.filter(o => o.status === 'SOLD').map(updateOrder));
        setSpecialOrders(updatedActive);
        setSoldSpecialOrders(updatedSold);
      }

      Alert.alert("VAICON", `Ο πελάτης ενημερώθηκε!\n${form.name}`);
    } else {
      const newCustomer = { ...form, id: Date.now().toString(), createdAt: Date.now() };
      setCustomers([newCustomer, ...customers]);
      await syncToCloud(newCustomer);
      Alert.alert("VAICON", `Πελάτης αποθηκεύτηκε!\n${form.name}`, [
        { text:'ΟΚ', onPress:()=>{ if(onCustomerAdded) onCustomerAdded(newCustomer); } }
      ]);
      setForm(INIT); setEditingId(null); return;
    }
    setForm(INIT);
    setEditingId(null);
  };

  const editCustomer = (c) => {
    setForm({
      name: c.name || '', phone: c.phone || '', phone2: c.phone2 || '', phone3: c.phone3 || '',
      phoneViber: c.phoneViber || '', email: c.email || '', identifier: c.identifier || '',
      city: c.city || '', profession: c.profession || '',
    });
    setEditingId(c.id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const deleteCustomer = (id) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    // Ελέγχουμε με όνομα — όχι customerId
    const hasAnyOrders = allOrders.some(o => o.customer === customer.name);
    if (hasAnyOrders) {
      setDeleteCustomerModal({ visible:true, customerId:null, customerName:customer.name, blocked:true });
      return;
    }
    setDeleteCustomerModal({ visible:true, customerId:id, customerName:customer.name, blocked:false });
  };

  const confirmDeleteCustomer = async (id) => {
    setCustomers(customers.filter(c => c.id !== id));
    await deleteFromCloud(id);
  };

  const printCustomers = async () => {
    const sorted = [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'el'));
    const rows = sorted.map(c => {
      const orderCount = allOrders.filter(o => o.customer === c.name).length;
      const phones = [c.phone, c.phone2, c.phone3].filter(Boolean).join('<br>');
      return `<tr>
        <td>${c.name || ''}</td>
        <td>${c.identifier || ''}</td>
        <td>${c.city || ''}</td>
        <td>${c.profession || ''}</td>
        <td>${phones}</td>
        <td>${c.phoneViber || ''}</td>
        <td>${c.email || ''}</td>
        <td class="col-orders">${orderCount > 0 ? orderCount : ''}</td>
      </tr>`;
    }).join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; margin: 8mm; color: #000; }
      h1 { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
      h2 { font-size: 11px; color: #555; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: auto; }
      th { padding: 4px 6px; text-align: left; border: 1px solid #000; font-weight: bold; background: #ddd; font-size: 10px; white-space: nowrap; }
      td { padding: 4px 6px; border: 1px solid #ccc; vertical-align: top; word-wrap: break-word; }
      tr:nth-child(even) td { background: #f9f9f9; }
      .col-orders { width: 40px; text-align: center; }
      @media print { @page { size: A4 landscape; margin: 8mm; } }
    </style></head><body>
      <h1>ΠΕΛΑΤΕΣ</h1>
      <h2>Σύνολο: ${sorted.length} πελάτες</h2>
      <table>
        <thead><tr>
          <th>Όνομα</th><th>Αναγνωριστικό</th><th>Πόλη/Περιοχή</th><th>Επάγγελμα</th><th>Τηλέφωνα</th><th>Viber</th><th>Email</th><th>Παρ.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;
    await printHTML(html, 'ΠΕΛΑΤΕΣ');
  };

  const filtered = customers
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      const isNumeric = /^\d+$/.test(search);
      if (isNumeric) {
        return [c.phone, c.phone2, c.phone3, c.phoneViber].some(p => p && String(p).startsWith(search));
      } else {
        const nameWords = (c.name || '').toLowerCase().split(' ').map(w => w.replace(/[()]/g, ''));
        const identWords = (c.identifier || '').toLowerCase().split(' ').map(w => w.replace(/[()]/g, ''));
        const cityWords = (c.city || '').toLowerCase().split(' ').map(w => w.replace(/[()]/g, ''));
        const profWords = (c.profession || '').toLowerCase().split(' ').map(w => w.replace(/[()]/g, ''));
        return (
          nameWords.some(w => w.startsWith(q)) ||
          identWords.some(w => w.startsWith(q)) ||
          cityWords.some(w => w.startsWith(q)) ||
          profWords.some(w => w.startsWith(q))
        );
      }
    })
    .sort((a, b) => {
      if (sortMode === 'orders') {
        const aCount = allOrders.filter(o => o.customer === a.name).length;
        const bCount = allOrders.filter(o => o.customer === b.name).length;
        if (bCount !== aCount) return bCount - aCount;
        return (a.name || '').localeCompare(b.name || '', 'el');
      }
      return (a.name || '').localeCompare(b.name || '', 'el');
    });

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>👥 ΠΕΛΑΤΕΣ</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={printCustomers} style={styles.printBtn}>
          <Text style={styles.printTxt}>🖨️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={{ padding: 12 }}>
        <View style={{ paddingBottom: 40 }}>

          <Text style={styles.sectionTitle}>
            {editingId ? '✏️ ΕΠΕΞΕΡΓΑΣΙΑ ΠΕΛΑΤΗ' : 'ΚΑΤΑΧΩΡΗΣΗ ΝΕΟΥ ΠΕΛΑΤΗ'}
          </Text>
          {editingId && (
            <View style={styles.editBanner}>
              <Text style={styles.editBannerTxt}>Επεξεργάζεσαι υπάρχοντα πελάτη</Text>
            </View>
          )}
          <TextInput style={styles.input} placeholder="Όνομα Πελάτη *" value={form.name} onChangeText={v => setForm({...form, name:v})} />
          <View style={{flexDirection:'row', gap:6, marginBottom:8}}>
            <TextInput style={[styles.input, {flex:1, marginBottom:0}]} placeholder="Τηλ #1" keyboardType="phone-pad" value={form.phone} onChangeText={v => setForm({...form, phone:v})} />
            <TextInput style={[styles.input, {flex:1, marginBottom:0}]} placeholder="Τηλ #2" keyboardType="phone-pad" value={form.phone2} onChangeText={v => setForm({...form, phone2:v})} />
            <TextInput style={[styles.input, {flex:1, marginBottom:0}]} placeholder="Τηλ #3" keyboardType="phone-pad" value={form.phone3} onChangeText={v => setForm({...form, phone3:v})} />
            {(editingId && customers.find(c=>c.id===editingId)?.viberOptOut) ? (
              <View style={[styles.input, {flex:1, marginBottom:0, backgroundColor:'#ffebee', borderColor:'#c62828', borderWidth:1.5, justifyContent:'center'}]}>
                <Text style={{color:'#c62828', fontWeight:'bold', fontSize:13}}>🚫 Απεγγραφή Viber</Text>
              </View>
            ) : (
              <TextInput style={[styles.input, {flex:1, marginBottom:0}]} placeholder="Viber" keyboardType="phone-pad" value={form.phoneViber} onChangeText={v => setForm({...form, phoneViber:v})} />
            )}
          </View>
          <TextInput style={styles.input} placeholder="Email (προαιρετικό)" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => setForm({...form, email:v})} />
          <TextInput style={styles.input} placeholder="Αναγνωριστικό (π.χ. Γιώργης Μαραθώνας)" value={form.identifier} onChangeText={v => setForm({...form, identifier:v})} />

          <View style={{ flexDirection:'row', gap:6, marginBottom: citySuggestions.length || professionSuggestions.length ? 0 : 0 }}>
            <View style={{ flex:1 }}>
              <TextInput style={[styles.input, { marginBottom: citySuggestions.length ? 0 : 8 }]} placeholder="Πόλη / Περιοχή" value={form.city} onChangeText={v => setForm({...form, city:v})} />
              {citySuggestions.length > 0 && (
                <View style={styles.suggestBox}>
                  {citySuggestions.map(s => (
                    <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => setForm(f => ({ ...f, city: s }))}>
                      <Text style={styles.suggestTxt}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={{ flex:1 }}>
              <TextInput style={[styles.input, { marginBottom: professionSuggestions.length ? 0 : 8 }]} placeholder="Επάγγελμα" value={form.profession} onChangeText={v => setForm({...form, profession:v})} />
              {professionSuggestions.length > 0 && (
                <View style={styles.suggestBox}>
                  {professionSuggestions.map(s => (
                    <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => setForm(f => ({ ...f, profession: s }))}>
                      <Text style={styles.suggestTxt}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
            {editingId && (
              <TouchableOpacity style={[styles.saveBtn, { paddingHorizontal:16, backgroundColor:'#888' }]} onPress={() => { setForm(INIT); setEditingId(null); }}>
                <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveBtn, { paddingHorizontal:20, alignSelf:'flex-start' }]} onPress={saveCustomer}>
              <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>
                {editingId ? '💾 ΑΠΟΘΗΚΕΥΣΗ ΑΛΛΑΓΩΝ' : 'ΑΠΟΘΗΚΕΥΣΗ ΠΕΛΑΤΗ'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection:'row', alignItems:'center', marginTop:24, marginBottom:10, gap:6 }}>
            <Text style={[styles.sectionTitle, { marginBottom:0 }]}>ΛΙΣΤΑ ΠΕΛΑΤΩΝ ({customers.length})</Text>
            <TouchableOpacity
              onPress={()=>setSortMode('name')}
              style={{ marginLeft:10, paddingHorizontal:10, paddingVertical:6, borderRadius:6, backgroundColor: sortMode==='name' ? '#8B0000' : '#ddd' }}>
              <Text style={{ color: sortMode==='name' ? 'white' : '#555', fontWeight:'bold', fontSize:12 }}>🔤 A→Ω</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={()=>setSortMode('orders')}
              style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:6, backgroundColor: sortMode==='orders' ? '#8B0000' : '#ddd' }}>
              <Text style={{ color: sortMode==='orders' ? 'white' : '#555', fontWeight:'bold', fontSize:12 }}>🔢 #↓</Text>
            </TouchableOpacity>
            <TextInput
              style={{ marginLeft:10, backgroundColor:'#fff', paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#ddd', fontSize:13, width:180 }}
              placeholder="🔍 Αναζήτηση"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Text style={styles.hint}>💡 Κράτα 3 δευτ. για επεξεργασία • Κράτα το ✕ 2 δευτ. για διαγραφή</Text>

          {filtered.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.customerCard, editingId === c.id && styles.customerCardEditing]}
              onLongPress={() => editCustomer(c)}
              delayLongPress={3000}
              activeOpacity={0.7}
            >
              <View style={{ flex:1 }}>
                <View style={{ flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:6, marginBottom:4 }}>
                  <Text style={styles.customerName}>{c.name}</Text>
                  {(()=>{
                    const activeOrders = specialOrders.filter(o=>o.customer===c.name);
                    const soldOrders = allOrders.filter(o=>o.customer===c.name && o.status==='SOLD');
                    const total = allOrders.filter(o=>o.customer===c.name).length;
                    if (total === 0) return null;
                    return (
                      <View style={{ flexDirection:'row', gap:4, alignItems:'center' }}>
                        {activeOrders.length > 0 && (
                          <View style={{ backgroundColor:'#8B0000', borderRadius:10, paddingHorizontal:7, paddingVertical:2, minWidth:22, alignItems:'center' }}>
                            <Text style={{ color:'white', fontWeight:'bold', fontSize:12 }}>{activeOrders.length}</Text>
                          </View>
                        )}
                        {soldOrders.length > 0 && (
                          <View style={{ backgroundColor:'#555', borderRadius:10, paddingHorizontal:7, paddingVertical:2, minWidth:22, alignItems:'center' }}>
                            <Text style={{ color:'white', fontWeight:'bold', fontSize:11 }}>💰{soldOrders.length}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </View>
                {(()=>{
                  const items = [
                    c.phone && `📞 ${c.phone}`,
                    c.phone2 && `📞 ${c.phone2}`,
                    c.phone3 && `📞 ${c.phone3}`,
                    c.phoneViber && `📱V ${c.phoneViber}`,
                  ].filter(Boolean);
                  return items.length ? <Text style={styles.customerDetail}>{items.join('   ')}</Text> : null;
                })()}
                {c.email ? <Text style={styles.customerDetail}>✉️ {c.email}</Text> : null}
                {c.identifier ? <Text style={styles.customerDetail}>🏷 {c.identifier}</Text> : null}
                {(c.city || c.profession) ? (
                  <Text style={styles.customerDetail}>
                    {c.city ? `📍 ${c.city}` : ''}{c.city && c.profession ? '   ' : ''}{c.profession ? `💼 ${c.profession}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.customerDate}>📅 {fmtDate(c.createdAt)}</Text>
              </View>
              <View style={{gap:6}}>
                <TouchableOpacity
                  style={{backgroundColor:'#007AFF', paddingHorizontal:10, paddingVertical:6, borderRadius:6, alignItems:'center'}}
                  onPress={()=>setSelectedCustomerOrders(c)}>
                  <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>
                    📦 ΠΑΡΑΓΓΕΛΙΕΣ {allOrders.filter(o=>o.customer===c.name).length > 0 ? `(${allOrders.filter(o=>o.customer===c.name).length})` : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onLongPress={() => deleteCustomer(c.id)}
                  delayLongPress={2000}
                  activeOpacity={0.6}
                  onPress={()=>{}}
                >
                  <Text style={styles.deleteTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          {filtered.length === 0 && (
            <Text style={{ textAlign:'center', color:'#999', marginTop:20 }}>Δεν βρέθηκαν πελάτες</Text>
          )}
        </View>
      </ScrollView>

      {/* MODAL ΠΑΡΑΓΓΕΛΙΩΝ ΠΕΛΑΤΗ — έξω από ScrollView */}
      {/* MODAL ΠΑΡΑΓΓΕΛΙΩΝ ΠΕΛΑΤΗ — ΟΛΑ */}
      <Modal visible={!!selectedCustomerOrders} transparent animationType="slide" onRequestClose={()=>setSelectedCustomerOrders(null)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, maxHeight:'80%'}}>
            <View style={{backgroundColor:'#8B0000', padding:16, borderTopLeftRadius:16, borderTopRightRadius:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>📦 {selectedCustomerOrders?.name}</Text>
              <TouchableOpacity onPress={()=>setSelectedCustomerOrders(null)}>
                <Text style={{color:'white', fontSize:20, fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{padding:12}}>
              {(()=>{
                const allCustomerOrders = allOrders
                  .filter(o=>o.customer===selectedCustomerOrders?.name)
                  .sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                if (allCustomerOrders.length === 0) return (
                  <Text style={{textAlign:'center', color:'#999', padding:20}}>Δεν υπάρχουν παραγγελίες</Text>
                );
                return allCustomerOrders.map(o=>{
                  const st = getStatusLabel(o);
                  return (
                    <View key={o.id} style={{backgroundColor:'#f9f9f9', borderRadius:8, padding:12, marginBottom:8, borderLeftWidth:4, borderLeftColor:st.color}}>
                      <Text style={{fontWeight:'bold', fontSize:14}}>#{o.orderNo} — {o.h}x{o.w}</Text>
                      <Text style={{fontSize:12, color:'#555', marginTop:2}}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'📐 Τυποποιημένη':'✏️ Ειδική'} | {o.side||''}</Text>
                      {o.notes?<Text style={{fontSize:11, color:'#888', marginTop:2}}>Σημ: {o.notes}</Text>:null}
                      <View style={{marginTop:6, backgroundColor:st.color+'22', paddingHorizontal:8, paddingVertical:4, borderRadius:6, alignSelf:'flex-start'}}>
                        <Text style={{fontSize:12, fontWeight:'bold', color:st.color}}>{st.label}</Text>
                      </View>
                    </View>
                  );
                });
              })()}
              <View style={{height:20}}/>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL ΔΙΑΓΡΑΦΗΣ ΠΕΛΑΤΗ */}
      <Modal visible={!!deleteCustomerModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380}}>
            {deleteCustomerModal.blocked ? (
              <>
                <Text style={{fontSize:17, fontWeight:'bold', color:'#b71c1c', marginBottom:12, textAlign:'center'}}>⛔ Αδύνατη Διαγραφή</Text>
                <Text style={{fontSize:14, color:'#444', marginBottom:24, textAlign:'center'}}>
                  Ο πελάτης <Text style={{fontWeight:'bold'}}>{deleteCustomerModal.customerName}</Text> έχει παραγγελίες στο σύστημα και δεν μπορεί να διαγραφεί.
                </Text>
                <TouchableOpacity
                  style={{backgroundColor:'#8B0000', padding:14, borderRadius:10, alignItems:'center'}}
                  onPress={()=>setDeleteCustomerModal({visible:false, customerId:null, customerName:'', blocked:false})}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>ΟΚ</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{fontSize:17, fontWeight:'bold', color:'#b71c1c', marginBottom:8, textAlign:'center'}}>⚠️ Διαγραφή Πελάτη</Text>
                <Text style={{fontSize:14, color:'#444', marginBottom:24, textAlign:'center'}}>
                  Διαγραφή του <Text style={{fontWeight:'bold'}}>{deleteCustomerModal.customerName}</Text>; Η ενέργεια δεν αναιρείται.
                </Text>
                <TouchableOpacity
                  style={{backgroundColor:'#b71c1c', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
                  onPress={async()=>{
                    await confirmDeleteCustomer(deleteCustomerModal.customerId);
                    setDeleteCustomerModal({visible:false, customerId:null, customerName:'', blocked:false});
                  }}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>🗑️ ΔΙΑΓΡΑΦΗ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
                  onPress={()=>setDeleteCustomerModal({visible:false, customerId:null, customerName:'', blocked:false})}>
                  <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor:'#8B0000', paddingVertical:16, paddingHorizontal:16, flexDirection:'row', alignItems:'center', paddingTop:48 },
  backBtn: { marginRight:16, padding:4 },
  backTxt: { color:'white', fontSize:20, fontWeight:'bold' },
  headerTitle: { color:'white', fontSize:18, fontWeight:'bold', letterSpacing:2 },
  sectionTitle: { fontWeight:'bold', fontSize:14, color:'#333', marginBottom:10 },
  hint: { fontSize:11, color:'#888', marginBottom:10, fontStyle:'italic' },
  editBanner: { backgroundColor:'#fff3cd', borderRadius:8, padding:10, marginBottom:8, borderLeftWidth:4, borderLeftColor:'#ffbb33' },
  editBannerTxt: { color:'#856404', fontWeight:'bold', fontSize:13 },
  input: { backgroundColor:'#fff', padding:12, borderRadius:8, marginBottom:8, borderWidth:1, borderColor:'#ddd', fontSize:14 },
  saveBtn: { backgroundColor:'#8B0000', padding:16, borderRadius:8, alignItems:'center', marginTop:4, marginBottom:8 },
  customerCard: { backgroundColor:'#fff', borderRadius:8, padding:14, marginBottom:8, flexDirection:'row', alignItems:'center', borderLeftWidth:5, borderLeftColor:'#8B0000', elevation:2 },
  customerCardEditing: { borderLeftColor:'#ffbb33', backgroundColor:'#fffdf0' },
  customerName: { fontSize:16, fontWeight:'bold', color:'#1a1a1a', marginBottom:4 },
  customerDetail: { fontSize:13, color:'#555', marginBottom:2 },
  customerDate: { fontSize:11, color:'#999', marginTop:4 },
  deleteBtn: { padding:10, backgroundColor:'#ff4444', borderRadius:6, borderWidth:2, borderColor:'#cc0000' },
  deleteTxt: { color:'white', fontWeight:'bold', fontSize:16 },
  printBtn: { padding:6, marginLeft:12 },
  printTxt: { fontSize:22 },
  suggestBox: { flexDirection:'row', flexWrap:'wrap', gap:4, backgroundColor:'#fff8e1', padding:6, borderRadius:6, marginBottom:8, borderWidth:1, borderColor:'#ffe082' },
  suggestChip: { backgroundColor:'#fff', paddingHorizontal:10, paddingVertical:4, borderRadius:12, borderWidth:1, borderColor:'#ffc107' },
  suggestTxt: { fontSize:12, color:'#856404', fontWeight:'600' },
});

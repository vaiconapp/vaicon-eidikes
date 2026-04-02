import React, { useState } from 'react';
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

const INIT = { name: '', phone: '', identifier: '' };

export default function CustomersScreen({ customers, setCustomers, onClose, prefillName, onCustomerAdded, customOrders=[], allOrders=[], setCustomOrders, setSoldOrders, specialOrders=[] }) {
  const [form, setForm] = useState(prefillName ? { name: prefillName, phone: '', identifier: '' } : INIT);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCustomerOrders, setSelectedCustomerOrders] = useState(null); // πελάτης για εμφάνιση παραγγελιών
  const [deleteCustomerModal, setDeleteCustomerModal] = useState({ visible:false, customerId:null, customerName:'' });

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
      const updated = { ...customers.find(c => c.id === editingId), ...form };
      setCustomers(customers.map(c => c.id === editingId ? updated : c));
      await syncToCloud(updated);

      // Ενημέρωση παραγγελιών που έχουν αυτόν τον πελάτη
      if (setCustomOrders && setSoldOrders) {
        const updateOrder = async (order) => {
          if (order.customerId !== editingId) return order;
          const updatedOrder = { ...order, customer: updated.name };
          // Ενημέρωση Firebase — όλες οι παραγγελίες στο /orders/
          await fetch(`${FIREBASE_URL}/orders/${order.id}.json`, { method: 'PATCH', body: JSON.stringify({ customer: updated.name }) });
          return updatedOrder;
        };
        // Ενημέρωση ΚΑΙ active ΚΑΙ sold ΚΑΙ όλα τα orderType (ΕΙΔΙΚΗ/ΤΥΠΟΠΟΙΗΜΕΝΗ)
        const updatedActive = await Promise.all(allOrders.filter(o=>o.status!=='SOLD').map(updateOrder));
        const updatedSold = await Promise.all(allOrders.filter(o=>o.status==='SOLD').map(updateOrder));
        setCustomOrders(updatedActive);
        setSoldOrders(updatedSold);
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
    setForm({ name: c.name || '', phone: c.phone || '', identifier: c.identifier || '' });
    setEditingId(c.id);
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
      return `<tr>
        <td>${c.name || ''}</td>
        <td>${c.identifier || ''}</td>
        <td class="col-phone">${c.phone || ''}</td>
        <td class="col-orders">${orderCount > 0 ? orderCount : ''}</td>
      </tr>`;
    }).join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; margin: 10mm; color: #000; }
      h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
      h2 { font-size: 12px; color: #555; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
      th { padding: 6px 8px; text-align: left; border: 1px solid #000; font-weight: bold; background: #ddd; font-size: 11px; }
      td { padding: 6px 8px; border: 1px solid #ccc; vertical-align: top; word-wrap: break-word; }
      tr:nth-child(even) td { background: #f9f9f9; }
      .col-phone { width: 110px; }
      .col-orders { width: 70px; text-align: center; }
      .col-ident { width: 28%; }
      @media print { @page { size: A4 portrait; margin: 10mm; } }
    </style></head><body>
      <h1>👥 ΠΕΛΑΤΕΣ</h1>
      <h2>Σύνολο: ${sorted.length} πελάτες</h2>
      <table>
        <colgroup>
          <col><col class="col-ident"><col style="width:110px"><col style="width:70px">
        </colgroup>
        <thead><tr>
          <th>Όνομα</th><th>Αναγνωριστικό</th><th>Τηλέφωνο</th><th>Παρ.</th>
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
        return (c.phone || '').startsWith(search);
      } else {
        const nameWords = (c.name || '').toLowerCase().split(' ').map(w => w.replace(/[()]/g, ''));
        const identWords = (c.identifier || '').toLowerCase().split(' ').map(w => w.replace(/[()]/g, ''));
        return (
          nameWords.some(w => w.startsWith(q)) ||
          identWords.some(w => w.startsWith(q))
        );
      }
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'el'));

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

      <ScrollView style={{ padding: 12 }}>
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
          <TextInput style={styles.input} placeholder="Τηλέφωνο Επικοινωνίας" keyboardType="phone-pad" value={form.phone} onChangeText={v => setForm({...form, phone:v})} />
          <TextInput style={styles.input} placeholder="Αναγνωριστικό (π.χ. Γιώργης Μαραθώνας)" value={form.identifier} onChangeText={v => setForm({...form, identifier:v})} />

          <View style={{ flexDirection:'row', gap:8 }}>
            {editingId && (
              <TouchableOpacity style={[styles.saveBtn, { flex:1, backgroundColor:'#888' }]} onPress={() => { setForm(INIT); setEditingId(null); }}>
                <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveBtn, { flex:2 }]} onPress={saveCustomer}>
              <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>
                {editingId ? '💾 ΑΠΟΘΗΚΕΥΣΗ ΑΛΛΑΓΩΝ' : 'ΑΠΟΘΗΚΕΥΣΗ ΠΕΛΑΤΗ'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop:24 }]}>ΛΙΣΤΑ ΠΕΛΑΤΩΝ ({customers.length})</Text>
          <Text style={styles.hint}>💡 Κράτα 3 δευτ. για επεξεργασία • Κράτα το ✕ 2 δευτ. για διαγραφή</Text>
          <TextInput style={[styles.input, { backgroundColor:'#fff' }]} placeholder="🔍 Αναζήτηση" value={search} onChangeText={setSearch} />

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
                {c.phone ? <Text style={styles.customerDetail}>📞 {c.phone}</Text> : null}
                {c.identifier ? <Text style={styles.customerDetail}>🏷 {c.identifier}</Text> : null}
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
});

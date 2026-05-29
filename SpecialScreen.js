import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Share, Dimensions, Platform, Keyboard, PanResponder, Animated } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { findFormatItem, getFormatStyle, formatNamesHtml, wrapHtml } from './formatHelpers';

// Helper εκτύπωσης — web: window.print(), mobile: expo-print + sharing
const printHTML = async (html, title, existingWin=null) => {
  if (Platform.OS === 'web') {
    const win = existingWin || window.open('', '_blank', 'width=900,height=700,left=100,top=100,resizable=yes,scrollbars=yes');
    if (!win) { Alert.alert("Σφάλμα", "Ο browser μπλόκαρε το παράθυρο εκτύπωσης. Επιτρέψτε τα pop-ups."); return; }
    // Εξάγω το CSS από το html
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

const fmtDate = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
const fmtDateTime = (ts) => { if (!ts) return null; const d = new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

const STD_HEIGHTS = ['208','213','218','223'];
const STD_WIDTHS  = ['83','88','93','98'];
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', glassNotes:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', notes:'', status:'PENDING', hardware:'', installation:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', coatings:[], stavera:[], heightReduction:'', programNo:'' };

const PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'cases',    label:'🟡 ΚΑΣΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ' },
  { key:'vafio',    label:'⚫ ΒΑΦΕΙΟ' },
  { key:'epend',    label:'🟠 ΕΠΕΝΔΥΣΕΙΣ' },
  { key:'montDoor', label:'🟢 ΜΟΝΤΑΡΙΣΜΑ' },
];

const DIPLI_PHASES = [
  { key:'laser',    label:'🔴 LASER ΚΟΠΕΣ' },
  { key:'montSasi', label:'🔵 ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ' },
  { key:'montDoor', label:'🟢 ΜΟΝΤΑΡΙΣΜΑ' },
];

const initPhases = () => {
  const p = {};
  PHASES.forEach(ph => { p[ph.key] = { active:true, printed:false, done:false }; });
  return p;
};

// SellModal αφαιρέθηκε — πώληση πλέον είναι πάντα ολική


// ── ConfirmModal — επιβεβαίωση ολοκλήρωσης παραγωγής ──
function ConfirmModal({ visible, title, message, confirmText, onConfirm, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:12, textAlign:'center' }}>{title}</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:24, textAlign:'center', lineHeight:20 }}>{message}</Text>
          <TouchableOpacity
            style={{ backgroundColor:'#00C851', padding:14, borderRadius:10, alignItems:'center', marginBottom:8 }}
            onPress={onConfirm}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>{confirmText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd' }}
            onPress={onCancel}>
            <Text style={{ color:'#555', fontWeight:'bold', fontSize:14 }}>ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Helper: παραγγελία PROD με όλες τις ενεργές φάσεις done = έτοιμη για μεταφορά
const isOrderReadyForTransfer = (order) => {
  if (!order || order.status !== 'PROD' || !order.phases) return false;
  const hasCoatings = !!(order.coatings && order.coatings.filter(c => c && String(c).trim()).length > 0);
  const hasInstallation = order.installation === 'ΝΑΙ';
  return Object.keys(order.phases).every(k => {
    if (k === 'epend'    && !hasCoatings)     return true;
    if (k === 'montDoor' && !hasInstallation) return true;
    return !order.phases[k].active || order.phases[k].done;
  });
};

// Helper: παραγγελία έτοιμη προς μοντάρισμα (προηγούμενες φάσεις done, επένδυση δεν μετράει)
const isReadyForMont = (o) => {
  if (!o || o.installation !== 'ΝΑΙ') return false;
  const m = o.phases?.montDoor;
  if (!m?.active || m.done) return false;
  return ['laser','cases','montSasi','vafio'].every(k => !o.phases?.[k]?.active || o.phases?.[k]?.done);
};

// Helpers για ανοιγόμενο τζάμι (ίδια λογική με σταθερό αλλά ξεχωριστή διαδικασία)
const hasGlass = (o) => !!(o && o.glassDim && String(o.glassDim).trim());
const isGlassPending = (o) => hasGlass(o) && !o.glassDone;

// Helpers ειδοποίησης πελάτη (Viber / Email / SMS)
const normalizePhone = (p) => {
  const d = String(p||'').replace(/\D/g,'');
  if (!d) return '';
  return d.startsWith('30') ? d : '30' + d.replace(/^0+/,'');
};
const buildOrderMessage = (o) => {
  const isStd = o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ';
  const coats = (o.coatings||[]).filter(c=>c&&String(c).trim()).join(', ');
  const stav = (o.stavera||[]).filter(s=>s&&s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+s.dim+(s.note?' '+s.note:'')).join(', ');
  const tzami = (o.glassDim||'')+(o.glassNotes?' '+o.glassNotes:'');
  return [
    `Γεια σας ${o.customer||''},`,
    '',
    `Καταχωρήσαμε την παραγγελία σας Νο ${o.orderNo||'-'}`,
    `${o.h||''}x${o.w||''} | ${o.side||''} | ${o.armor||'ΜΟΝΗ'} ΘΩΡΑΚΙΣΗ`,
    !isStd ? `Κάσα: ${o.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | ${o.caseMaterial||'DKP'} Μεντ: ${o.hinges||'2'}` : null,
    `Κλειδ: ${o.lock||'—'}`,
    coats ? `Επενδύσεις: ${coats}` : null,
    stav ? `Σταθερό: ${stav}` : null,
    tzami ? `Τζάμι: ${tzami}` : null,
    o.notes ? `Σημ: ${o.notes}` : null,
    '',
    'Παρακαλούμε ελέγξτε τα παραπάνω στοιχεία. Μετά την έναρξη παραγωγής δεν είναι δυνατές αλλαγές και η εταιρεία δεν φέρει ευθύνη για τυχόν διαφορές.',
    '',
    'Ευχαριστούμε — VAICON',
  ].filter(v => v !== null).join('\n');
};
const buildReadyMessage = (o) => {
  return `VAICON: Η ΠΑΡΑΓΓΕΛΙΑ ΝΟ ${o.orderNo||'-'} ΕΙΝΑΙ ΕΤΟΙΜΗ. ΩΡΕΣ ΠΑΡΑΛΑΒΗΣ: ΕΡΓΑΣΙΜΕΣ 08:00-15:30.`;
};
const buildSmsOrderMessage = (o) => {
  const d = new Date(o?.createdAt || Date.now());
  const dt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  return `VAICON: ΚΑΤΑΧΩΡΗΘΗΚΕ Η ΠΑΡΑΓΓΕΛΙΑ ΝΟ ${o.orderNo||'-'} (${dt}). ΤΑ ΣΤΟΙΧΕΙΑ ΣΤΑΛΘΗΚΑΝ ΑΝΑΛΥΤΙΚΑ ΣΕ VIBER/EMAIL. ΜΕΤΑ ΤΗΝ ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ ΔΕΝ ΓΙΝΟΝΤΑΙ ΑΛΛΑΓΕΣ.`;
};
const messageFor = (o) => o?.status === 'READY' ? buildReadyMessage(o) : buildOrderMessage(o);
const smsMessageFor = (o) => o?.status === 'READY' ? buildReadyMessage(o) : buildSmsOrderMessage(o);
const openEmail = (email, msg, orderNo) => {
  if (!email) return;
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = `mailto:${email}?subject=${encodeURIComponent('Παραγγελία Νο '+(orderNo||''))}&body=${encodeURIComponent(msg)}`;
    a.click();
  }
};

// Φάση 1: μόνο ελληνικά κινητά (ξεκινούν με 69 μετά την αφαίρεση 30/0030/0)
const isGreekMobile = (p) => {
  const d = String(p||'').replace(/\D/g,'');
  if (!d) return false;
  const stripped = d.replace(/^(0030|30)/, '').replace(/^0+/, '');
  return /^69\d{8}$/.test(stripped);
};
const sendSmsViaYuboto = async (phone, message, orderId=null) => {
  try {
    const resp = await fetch('/.netlify/functions/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizePhone(phone), message, orderId }),
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: 'Σφάλμα σύνδεσης: ' + (e?.message || e) };
  }
};
const sendViberViaYuboto = async (phone, message, orderId=null, customerId=null) => {
  try {
    const resp = await fetch('/.netlify/functions/send-viber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizePhone(phone), message, orderId, customerId }),
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: 'Σφάλμα σύνδεσης: ' + (e?.message || e) };
  }
};

const stripAccents = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const PEEPHOLE_COATING_RE = /ΑΛΟΥΜΙΝ/;
const PEEPHOLE_NOTES_RE = /ΚΥΠΡ/;
const peepholeTriggers = (coatings=[], notes='') => {
  const out = [];
  (coatings||[]).forEach(c => {
    if (c && PEEPHOLE_COATING_RE.test(stripAccents(c).toUpperCase())) out.push(c);
  });
  if (notes && PEEPHOLE_NOTES_RE.test(stripAccents(notes).toUpperCase())) {
    out.push('Κυπρί (στις παρατηρήσεις)');
  }
  return out;
};
const needsPeepholeWarning = (coatings, notes) => peepholeTriggers(coatings, notes).length > 0;

const PEEPHOLE_WARN_NOTE = 'ΠΡΟΣΟΧΗ ΟΧΙ ΤΡΥΠΗΜΑ ΓΙΑ ΜΑΤΙ';
const withPeepholeNote = (notes) => {
  const cur = String(notes||'').trim();
  if (cur.includes(PEEPHOLE_WARN_NOTE)) return cur;
  return cur ? `${cur}\n${PEEPHOLE_WARN_NOTE}` : PEEPHOLE_WARN_NOTE;
};
const formatNotesHtml = (notes) =>
  String(notes||'').replace(/\n/g,'<br>').replace(
    /ΠΡΟΣΟΧΗ ΟΧΙ ΤΡΥΠΗΜΑ ΓΙΑ ΜΑΤΙ/g,
    '<span style="color:#c62828;font-weight:bold;font-size:1.3em">ΠΡΟΣΟΧΗ ΟΧΙ ΤΡΥΠΗΜΑ ΓΙΑ ΜΑΤΙ</span>'
  );

// ── BlinkingReadyBadge — κίτρινο που αναβοσβήνει & μεταφέρει στα ΕΤΟΙΜΑ ──
function BlinkingReadyBadge({ onPress }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1.0,  duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View style={{opacity, backgroundColor:'#ffd600', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5, borderWidth:2, borderColor:'#f57f17'}}>
        <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:14}}>🟡 ΕΤΟΙΜΗ ΓΙΑ ΜΕΤΑΦΟΡΑ — ΠΑΤΗΣΕ ΕΔΩ</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── PhaseBadges — badges σταδίων παραγωγής (κοινό για καρτέλα, αναζήτηση, modal) ──
function PhaseBadges({ order }) {
  if (!order || order.status !== 'PROD' || !order.phases) return null;
  const labels = {laser:'LASER',cases:'ΚΑΣΕΣ',montSasi:'ΣΑΣΙ',vafio:'ΒΑΦΕΙΟ',epend:'ΕΠΕΝ.',montDoor:'ΜΟΝΤ.'};
  const coatCount = (order.coatings||[]).filter(c=>c&&String(c).trim()).length;
  return (
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:4}}>
      {PHASES.map(ph=>{
        const phase = order.phases[ph.key];
        if(!phase||!phase.active) return null;
        if (ph.key === 'epend' && coatCount === 0) return null;
        if (ph.key === 'montDoor' && order.installation !== 'ΝΑΙ') return null;
        const showCoatTicks = ph.key === 'epend' && coatCount >= 2;
        return (
          <View key={ph.key} style={{alignItems:'center', gap:2}}>
            <View style={{backgroundColor:phase.done?'#2e7d32':'#ff9800',borderRadius:4,paddingHorizontal:6,paddingVertical:2}}>
              <Text style={{color:'white',fontSize:12,fontWeight:'bold'}}>{phase.done?'✅':'⏳'} {labels[ph.key]||ph.key}</Text>
            </View>
            {showCoatTicks && (
              <View style={{flexDirection:'row', gap:3}}>
                {[0,1].map(i => {
                  const checked = phase.done || !!(order.coatingChecks && order.coatingChecks[String(i)]);
                  return (
                    <View key={i} style={{backgroundColor:checked?'#2e7d32':'#ff9800',borderRadius:4,paddingHorizontal:4,paddingVertical:1}}>
                      <Text style={{color:'white',fontSize:11,fontWeight:'bold'}}>{checked?'✅':'☐'}{i+1}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      {order.stavera&&order.stavera.some(s=>s&&s.dim)&&(
        <View style={{alignItems:'center', gap:2, marginLeft:6}}>
          <View style={{backgroundColor:order.staveraDone?'#2e7d32':'#ff9800',borderRadius:6,paddingHorizontal:10,paddingVertical:4,borderWidth:1.5,borderColor:'#1a1a1a'}}>
            <Text style={{color:'white',fontSize:13,fontWeight:'bold'}}>{order.staveraDone?'✅':'⏳'} 📐 ΣΤΑΘ.</Text>
          </View>
        </View>
      )}
      {hasGlass(order)&&(
        <View style={{alignItems:'center', gap:2}}>
          <View style={{backgroundColor:order.glassDone?'#2e7d32':'#ff9800',borderRadius:6,paddingHorizontal:10,paddingVertical:4,borderWidth:1.5,borderColor:'#1a1a1a'}}>
            <Text style={{color:'white',fontSize:13,fontWeight:'bold'}}>{order.glassDone?'✅':'⏳'} 🪟 ΤΖ.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── BlinkingStuckButton — κουμπί στη δεξιά μπάρα για παραγγελίες έτοιμες αλλά κολλημένες
function BlinkingStuckButton({ count, active, onPress }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) { opacity.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1.0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, active]);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View style={{opacity: active ? 1 : opacity, backgroundColor: active ? '#f57f17' : '#ffd600', borderRadius:8, padding:11, alignItems:'center', borderWidth:2, borderColor:'#f57f17'}}>
        <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:14}}>🟡 ΕΤΟΙΜΕΣ ΓΙΑ ΜΕΤΑΦΟΡΑ ({count})</Text>
        {active && <Text style={{color:'#1a1a1a', fontSize:11, marginTop:2, fontWeight:'bold'}}>✕ ΑΚΥΡΩΣΗ ΦΙΛΤΡΟΥ</Text>}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Helper: βρίσκει πρόταση για διπλότυπο νούμερο ──
const computeSuggested = (base, allOrders, editingId) => {
  const letters = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  for(let i=0; i<letters.length; i++){
    const candidate = base+'-'+letters[i];
    if(!allOrders.some(o=>o.orderNo===candidate && o.id!==editingId)) return candidate;
  }
  return base+'-?';
};

// ── DuplicateModal — 3 επιλογές ──
function DuplicateModal({ visible, base, suggested, onUse, onKeep, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#8B0000', marginBottom:8, textAlign:'center' }}>⚠️ Διπλότυπο Νούμερο</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:4, textAlign:'center' }}>
            Το νούμερο <Text style={{ fontWeight:'bold' }}>{base}</Text> υπάρχει ήδη.
          </Text>
          <Text style={{ fontSize:13, color:'#888', marginBottom:20, textAlign:'center' }}>
            Πρόταση: <Text style={{ fontWeight:'bold', color:'#007AFF' }}>{suggested}</Text>
          </Text>
          <TouchableOpacity
            style={{ backgroundColor:'#007AFF', padding:14, borderRadius:10, alignItems:'center', marginBottom:8 }}
            onPress={onUse}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>✅ ΧΡΗΣΙΜΟΠΟΙΩ {suggested}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', marginBottom:8, borderWidth:1, borderColor:'#ddd' }}
            onPress={onKeep}>
            <Text style={{ color:'#1a1a1a', fontWeight:'bold', fontSize:14 }}>🔒 ΚΡΑΤΩ {base}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor:'#ff4444', padding:14, borderRadius:10, alignItems:'center' }}
            onPress={onCancel}>
            <Text style={{ color:'white', fontWeight:'bold', fontSize:14 }}>✕ ΑΚΥΡΟ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function SpecialScreen({ specialOrders=[], setSpecialOrders, soldSpecialOrders=[], setSoldSpecialOrders, customers=[], onRequestAddCustomer, coatings=[], locks=[] }) {
  // ---------- Helpers μορφοποίησης επενδύσεων/κλειδαριών ----------
  // Επιστρέφουν RN style για UI και HTML string για εκτυπώσεις, με βάση τις ρυθμίσεις bold/size/color
  const coatingStyle = (name, baseSize) => getFormatStyle(findFormatItem(name, coatings), baseSize);
  const lockStyle    = (name, baseSize) => getFormatStyle(findFormatItem(name, locks), baseSize);
  const coatingsHtml = (names, sep=', ') => formatNamesHtml(names||[], coatings, sep);
  const lockHtml     = (name) => name ? wrapHtml(name, findFormatItem(name, locks)) : '—';
  // Επείγων αριθμός προγράμματος: ξεκινά με γράμμα (ελληνικό ή λατινικό)
  const isUrgentProgram = (pNo) => !!pNo && /^[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]/.test(String(pNo).trim());

  // Ετικέτα καρτέλας όπου βρίσκεται μια παραγγελία (για το modal αναζήτησης πελατών)
  const getOrderTabInfo = (o) => {
    if (!o) return { label: '—', color: '#999' };
    if (o.status === 'SOLD')    return { label: 'ΑΡΧΕΙΟ',        color: '#555'    };
    if (o.status === 'READY')   return { label: 'ΕΤΟΙΜΑ',        color: '#00C851' };
    if (o.status === 'PROD')    return { label: 'ΠΑΡΑΓΩΓΗ',      color: '#2e7d32' };
    if (o.status === 'PENDING') return { label: 'ΚΑΤΑΧΩΡΗΜΕΝΕΣ', color: '#ff4444' };
    return { label: o.status || '—', color: '#999' };
  };

  // Εκτύπωση μίας σελίδας με όλα τα στοιχεία μιας παραγγελίας (read-only προβολή)
  const buildSingleOrderHTML = (o) => {
    if (!o) return '';
    const createdFmt  = o.createdAt    ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
    const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
    const tab = getOrderTabInfo(o);
    const coats = Array.isArray(o.coatings) ? o.coatings : [];
    const exo   = coats.filter(c => /ΕΞΩ|εξω|έξω/i.test(c));
    const mesa  = coats.filter(c => /ΜΕΣΑ|μεσα|ΕΣΩΤ/i.test(c));
    const other = coats.filter(c => !exo.includes(c) && !mesa.includes(c));
    const stav  = Array.isArray(o.stavera) ? o.stavera : [];
    const notesHtml = formatNotesHtml(o.notes);
    const pNoStyle = isUrgentProgram(o.programNo)
      ? 'border:3px solid #cc3300; padding:1px 4px; border-radius:3px; color:#cc3300;'
      : 'color:#cc3300;';
    return `
      <html><head><meta charset="utf-8"><style>
        body { font-family: Arial, sans-serif; color:#1a1a1a; padding: 14px; }
        h1 { font-size: 18px; text-align:center; margin-bottom: 6px; }
        .meta { text-align:center; color:#555; font-size:11px; margin-bottom:14px; }
        .sec { border:1px solid #ccc; border-radius:6px; padding:10px 12px; margin-bottom:10px; }
        .secTitle { font-size:11px; color:#777; font-weight:bold; letter-spacing:1px; margin-bottom:6px; text-transform:uppercase; }
        .row { display:flex; flex-wrap:wrap; gap:10px 24px; }
        .kv { min-width:140px; font-size:13px; }
        .kv b { color:#555; font-weight:normal; font-size:11px; display:block; }
        .kv span { font-weight:bold; font-size:14px; }
        table { width:100%; border-collapse:collapse; margin-top:4px; }
        th, td { border:1px solid #ddd; padding:4px 6px; font-size:12px; text-align:left; }
        th { background:#f5f5f5; font-weight:bold; }
        .tag { display:inline-block; padding:2px 8px; border-radius:4px; color:#fff; font-size:11px; font-weight:bold; }
        .notes { background:#fffdf5; border:1px solid #ffe082; padding:8px; border-radius:4px; font-size:13px; white-space:pre-wrap; }
      </style></head><body>
        <h1>VAICON — ΚΑΡΤΕΛΑ ΠΑΡΑΓΓΕΛΙΑΣ #${o.orderNo||'—'}${o.programNo?` &nbsp; <span style="${pNoStyle};font-size:16px;">Α.Π. ${o.programNo}</span>`:''}</h1>
        <div class="meta">
          <span class="tag" style="background:${tab.color};">${tab.label}</span>
          &nbsp;·&nbsp; Καταχώρηση: <b>${createdFmt||'—'}</b>
          &nbsp;·&nbsp; Παράδοση: <b>${deliveryFmt||'—'}</b>
        </div>

        <div class="sec">
          <div class="secTitle">Πελάτης</div>
          <div class="row">
            <div class="kv"><b>Όνομα</b><span>${o.customer||'—'}</span></div>
          </div>
        </div>

        <div class="sec">
          <div class="secTitle">Διαστάσεις & Χαρακτηριστικά</div>
          <div class="row">
            <div class="kv"><b>Ύψος (Η)</b><span>${o.h||'—'}</span></div>
            <div class="kv"><b>Πλάτος (W)</b><span>${o.w||'—'}</span></div>
            <div class="kv"><b>Τεμάχια</b><span>${o.qty||'1'}</span></div>
            <div class="kv"><b>Μεντεσέδες</b><span>${o.hinges||'—'}</span></div>
            <div class="kv"><b>Πλευρά</b><span>${o.side||'—'}</span></div>
            <div class="kv"><b>Θωράκιση</b><span>${o.armor||'—'}</span></div>
            <div class="kv"><b>Τύπος Σασί</b><span>${o.sasiType||'—'}</span></div>
            <div class="kv"><b>Τύπος Κάσας</b><span>${o.caseType||'—'}</span></div>
            <div class="kv"><b>Υλικό Κάσας</b><span>${o.caseMaterial||'—'}</span></div>
            <div class="kv"><b>Τοποθέτηση</b><span>${o.installation||'—'}</span></div>
            ${o.heightReduction?`<div class="kv"><b>Μείωση Ύψους</b><span>${o.heightReduction}</span></div>`:''}
          </div>
        </div>

        <div class="sec">
          <div class="secTitle">Κλειδαριά / Τζάμι / Μηχανισμοί</div>
          <div class="row">
            <div class="kv" style="min-width:220px;"><b>Κλειδαριά</b><span>${lockHtml(o.lock)||'—'}</span></div>
            <div class="kv"><b>Τζάμι (διαστ.)</b><span>${o.glassDim||'—'}</span></div>
            <div class="kv" style="min-width:220px;"><b>Τζάμι (σημειώσεις)</b><span>${o.glassNotes||'—'}</span></div>
            <div class="kv" style="min-width:220px;"><b>Μηχανισμοί / Εξαρτήματα</b><span>${o.hardware||'—'}</span></div>
          </div>
        </div>

        <div class="sec">
          <div class="secTitle">Επενδύσεις</div>
          <div class="row">
            <div class="kv" style="min-width:260px;"><b>ΕΞΩ</b><span>${exo.length?coatingsHtml(exo):'—'}</span></div>
            <div class="kv" style="min-width:260px;"><b>ΜΕΣΑ</b><span>${mesa.length?coatingsHtml(mesa):'—'}</span></div>
            ${other.length?`<div class="kv" style="min-width:260px;"><b>Άλλες</b><span>${coatingsHtml(other)}</span></div>`:''}
          </div>
        </div>

        ${stav.length?`
        <div class="sec">
          <div class="secTitle">Σταθερά</div>
          <table>
            <tr><th>#</th><th>Ύψος</th><th>Πλάτος</th><th>Τεμ.</th><th>Σημ.</th></tr>
            ${stav.map((s,i)=>`<tr><td>${i+1}</td><td>${s.h||s.dim||''}</td><td>${s.w||''}</td><td>${s.qty||''}</td><td>${s.note||''}</td></tr>`).join('')}
          </table>
        </div>`:''}

        ${o.notes?`
        <div class="sec">
          <div class="secTitle">Σημειώσεις</div>
          <div class="notes">${notesHtml}</div>
        </div>`:''}
      </body></html>
    `;
  };

  const printSingleOrderFull = async (o) => {
    if (!o) return;
    const html = buildSingleOrderHTML(o);
    await printHTML(html, `VAICON — Παραγγελία #${o.orderNo||''}`);
  };
  const [activeSection, setActiveSection] = useState('pending'); // form | pending | prod | ready | archive
  const [pendingSort, setPendingSort] = useState('no');
  const [showOnlyStuck, setShowOnlyStuck] = useState(false); // φιλτράρισμα: μόνο "έτοιμες κολλημένες"
  const [showHardwarePicker, setShowHardwarePicker] = useState(false);
  const [showLockPicker, setShowLockPicker] = useState(false);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [pickerEditMode, setPickerEditMode] = useState(false);
  const [lockEditText, setLockEditText] = useState('');
  const [dupModal, setDupModal] = useState({ visible:false, base:'', suggested:'', onUse:null, onKeep:null, onCancel:null });
  const [confirmModal, setConfirmModal] = useState({ visible:false, title:'', message:'', confirmText:'', onConfirm:null });
  const [archiveDeleteModal, setArchiveDeleteModal] = useState({ visible:false, orderId:null, pwd:'', error:false });
  const [smsToast, setSmsToast] = useState({ visible:false, text:'', kind:'ok' });
  const [peepholeWarn, setPeepholeWarn] = useState({ visible:false, coatings:[], onContinue:null, onAddNote:null });
  const showSmsToast = (text, kind='ok') => {
    setSmsToast({ visible:true, text, kind });
    setTimeout(()=>setSmsToast(t => t.text===text ? { visible:false, text:'', kind:'ok' } : t), 4500);
  };
  const [archiveReturnModal, setArchiveReturnModal] = useState({ visible:false, orderId:null });
  const [editModal, setEditModal] = useState({ visible:false, order:null });
  const [notifyModal, setNotifyModal] = useState({ visible:false, order:null });
  const [editForm, setEditForm] = useState({});
  const editGlassRef = useRef();
  const editGlassNotesRef = useRef();
  const editStaveraRefs = useRef({});
  const editStaveraNoteRefs = useRef({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeProdPhase, setActiveProdPhase] = useState('laser');
  const [customHardwareText, setCustomHardwareText] = useState('');
  const [showCustomHardwareInput, setShowCustomHardwareInput] = useState(false);
  const [customForm, setCustomForm] = useState(INIT_FORM);
  const [editingOrder, setEditingOrder] = useState(null); // η πόρτα που επεξεργαζόμαστε
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [pendingSearch, setPendingSearch] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [readySearch, setReadySearch] = useState('');

  const [printSelected, setPrintSelected] = useState({});
  const [montReadyFilter, setMontReadyFilter] = useState(false);
  const [printPreview, setPrintPreview] = useState({ visible:false, phaseKey:null, orders:[], copies:1 });
  const [pendingChanges, setPendingChanges] = useState([]); // καλάθι αλλαγών done/undone
  const [lastChangedIds, setLastChangedIds] = useState([]); // τελευταία παρτίδα αλλαγών
  const [prodBatch, setProdBatch] = useState([]); // καλάθι παραγγελιών για ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ
  const [programModal, setProgramModal] = useState({ visible: false, programNo: '' }); // modal αριθμού προγράμματος
  const [printProgramModal, setPrintProgramModal] = useState({ visible: false, programs: [], selected: null, phaseKey: null, readyOnly: false }); // modal επιλογής programNo για εκτύπωση ΠΡΟΓΡΑΜΜΑ / φάσεων
  const panPosition = useRef({ x: 0, y: 0 });
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // === Customer Lookup (🔍 ΠΕΛΑΤΕΣ) panel state ===
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [customerLookupSearch, setCustomerLookupSearch] = useState('');
  const [lookupCustomerId, setLookupCustomerId] = useState(null);
  const [lookupCustInfo, setLookupCustInfo] = useState(false);
  const [lookupOrderModal, setLookupOrderModal] = useState({ visible: false, order: null });
  const [custPanPos, setCustPanPos] = useState({ x: 0, y: 0 });
  const custIsDragging = useRef(false);
  const custDragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const handleCustDragStart = (e) => {
    custIsDragging.current = true;
    custDragStart.current = {
      mx: e.clientX || e.touches?.[0]?.clientX || 0,
      my: e.clientY || e.touches?.[0]?.clientY || 0,
      px: custPanPos.x,
      py: custPanPos.y,
    };
    const onMove = (ev) => {
      if (!custIsDragging.current) return;
      const cx = ev.clientX || ev.touches?.[0]?.clientX || 0;
      const cy = ev.clientY || ev.touches?.[0]?.clientY || 0;
      setCustPanPos({
        x: custDragStart.current.px + (cx - custDragStart.current.mx),
        y: custDragStart.current.py + (cy - custDragStart.current.my),
      });
    };
    const onUp = () => {
      custIsDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  const handleDragStart = (e) => {
    isDragging.current = true;
    dragStart.current = {
      mx: e.clientX || e.touches?.[0]?.clientX || 0,
      my: e.clientY || e.touches?.[0]?.clientY || 0,
      px: panPos.x,
      py: panPos.y,
    };
    const onMove = (ev) => {
      if (!isDragging.current) return;
      const cx = ev.clientX || ev.touches?.[0]?.clientX || 0;
      const cy = ev.clientY || ev.touches?.[0]?.clientY || 0;
      setPanPos({
        x: dragStart.current.px + (cx - dragStart.current.mx),
        y: dragStart.current.py + (cy - dragStart.current.my),
      });
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  const customerRef=useRef(); const orderNoRef=useRef(); const hRef=useRef(); const wRef=useRef(); const qtyEidikiRef=useRef();
  const hingeRef=useRef(); const glassRef=useRef(); const glassNotesRef=useRef(); const lockRef=useRef(); const notesRef=useRef();
  const customerSelectedRef = useRef(false);
  const prodScrollRef = useRef(null);
  const staveraWidthRefs = useRef({});
  const staveraNoteRefs = useRef({});
  const staveraHRefs = useRef({});
  const staveraWRefs = useRef({});
  const staveraGridNoteRefs = useRef({});
  const staveraQtyRefs = useRef({});
  const editStaveraQtyRefs = useRef({});
  const [pageWidth, setPageWidth] = useState(SCREEN_WIDTH);


  const syncToCloud = async (o) => { try { await fetch(`${FIREBASE_URL}/special_orders/${o.id}.json`,{method:'PUT',body:JSON.stringify(o)}); } catch { Alert.alert("Σφάλμα","Δεν αποθηκεύτηκε."); } };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/special_orders/${id}.json`,{method:'DELETE'}); } catch(e){} };

  // Πελάτης από όνομα παραγγελίας (για phone/email)
  const findCustomerOf = (o) => {
    if (!o) return null;
    if (o.customerId) {
      const byId = (customers||[]).find(c => c.id === o.customerId);
      if (byId) return byId;
    }
    if (!o.customer) return null;
    const target = stripAccents(String(o.customer).trim().toLowerCase());
    return (customers||[]).find(c => c.name && stripAccents(c.name.trim().toLowerCase()) === target);
  };
  const markNotified = async (orderId, channel) => {
    const order = specialOrders.find(o => o.id === orderId);
    if (!order) return;
    const upd = { ...order, notified: { ...(order.notified||{}), [channel]: Date.now() } };
    setSpecialOrders(prev => prev.map(o => o.id === orderId ? upd : o));
    await syncToCloud(upd);
  };
  const clearNotified = async (orderId, channel) => {
    const order = specialOrders.find(o => o.id === orderId);
    if (!order?.notified?.[channel]) return;
    const newNotified = { ...order.notified };
    delete newNotified[channel];
    const upd = { ...order, notified: newNotified };
    setSpecialOrders(prev => prev.map(o => o.id === orderId ? upd : o));
    await syncToCloud(upd);
    const labels = { viber:'Viber', email:'Email', sms:'SMS' };
    showSmsToast(`Αφαιρέθηκε σημείωση ${labels[channel]||channel} από #${order.orderNo||'?'}`, 'info');
  };
  const pickViberPhone = (c) => c?.phoneViber || '';
  const pickSmsPhone = (c) => [c?.phone, c?.phone2, c?.phone3, c?.phoneViber].find(isGreekMobile) || '';
  const confirmSend = (channel, order, action) => {
    const labels = { viber: 'Viber', email: 'Email', sms: 'SMS' };
    setConfirmModal({
      visible: true,
      title: `Αποστολή ${labels[channel] || channel}`,
      message: `Αποστολή ${labels[channel] || channel} στον πελάτη #${order.orderNo || '?'} (${order.customer || '—'});`,
      confirmText: 'ΑΠΟΣΤΟΛΗ',
      onConfirm: () => action(),
    });
  };
  const notifyViber = async (o) => {
    const c = findCustomerOf(o);
    const p = pickViberPhone(c);
    if (!p) return;
    if (c?.viberOptOut) return showSmsToast('Ο πελάτης έχει απεγγραφεί από Viber.', 'err');
    showSmsToast('Αποστολή Viber...', 'info');
    const res = await sendViberViaYuboto(p, messageFor(o), o.id, c?.id);
    if (!res?.success) {
      showSmsToast('✕ Αποτυχία Viber: ' + (res?.error || 'Άγνωστο σφάλμα'), 'err');
      return;
    }
    markNotified(o.id, 'viber');
    showSmsToast(res.test ? '✓ Test mode: Viber OK.' : '✓ Viber στάλθηκε.', 'ok');
  };
  const notifyEmail = (o) => { const c = findCustomerOf(o); if (!c?.email) return; openEmail(c.email, messageFor(o), o.orderNo); markNotified(o.id, 'email'); };
  const notifySms = async (o) => {
    const c = findCustomerOf(o);
    const p = pickSmsPhone(c);
    if (!p) return showSmsToast('Δεν υπάρχει ελληνικό κινητό στον πελάτη.', 'err');
    showSmsToast('Αποστολή SMS...', 'info');
    const res = await sendSmsViaYuboto(p, smsMessageFor(o), o.id);
    if (!res?.success) {
      showSmsToast('✕ Αποτυχία SMS: ' + (res?.error || 'Άγνωστο σφάλμα'), 'err');
      return;
    }
    markNotified(o.id, 'sms');
    showSmsToast(res.test ? '✓ Test mode: SMS OK.' : '✓ SMS στάλθηκε.', 'ok');
  };

  const resetForm = () => { setCustomForm(INIT_FORM); setCustomerSearch(''); setSelectedCustomer(null); setShowCustomerList(false); setEditingOrder(null); };

  // Ακύρωση φόρμας: αν είμαστε σε επεξεργασία, επαναφέρει την παραγγελία
  const cancelForm = async () => {
    if (editingOrder) {
      const restored = editingOrder;
      setSpecialOrders(prev => [restored, ...prev.filter(o => o.id !== restored.id)]);
      await syncToCloud(restored);
    }
    resetForm();
  };

  // Auto-focus πελάτη στο mount
  useEffect(()=>{ setTimeout(()=>customerRef.current?.focus(), 300); }, []);

  // Συγχρονισμός: όταν επιστρέφουμε στην ΠΑΡΑΓΩΓΗ, σύρε το paged ScrollView στη φάση που είναι ενεργή
  useEffect(()=>{
    if (activeSection !== 'prod' || !pageWidth) return;
    const keys = [...PHASES.map(p=>p.key), 'stavera'];
    const idx = keys.indexOf(activeProdPhase);
    if (idx < 0) return;
    const t = setTimeout(()=>{
      prodScrollRef.current?.scrollTo({ x: idx * pageWidth, animated: false });
    }, 0);
    return ()=>clearTimeout(t);
  }, [activeSection, pageWidth]);

  const blurAll = () => {
    glassRef.current?.blur();
    glassNotesRef.current?.blur();
    Object.values(staveraHRefs.current).forEach(r=>r?.blur());
    Object.values(staveraGridNoteRefs.current).forEach(r=>r?.blur());
    Object.values(staveraQtyRefs.current).forEach(r=>r?.blur());
  };

  const handleGlassEnter = () => {
    if (customForm.glassDim.length>0 && !customForm.glassDim.includes('×')) {
      setCustomForm({...customForm, glassDim:customForm.glassDim+' × '});
      setTimeout(()=>glassRef.current?.focus(),10);
    } else {
      glassRef.current?.blur();
      setTimeout(()=>glassNotesRef.current?.focus(),10);
    }
  };


  const saveOrder = async (overrides = {}) => {
    if (!customForm.orderNo) return Alert.alert("Προσοχή","Το Νούμερο Παραγγελίας είναι υποχρεωτικό.");
    if (!customForm.h||!customForm.w) return Alert.alert("Προσοχή","Βάλτε Ύψος και Πλάτος.");
    // Έλεγχος διπλότυπου αριθμού (failsafe κατά αποθήκευση)
    const isDuplicate = [...specialOrders, ...soldSpecialOrders].some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
    if (isDuplicate) {
      Alert.alert("⚠️ Διπλότυπο", `Το νούμερο ${customForm.orderNo} υπάρχει ήδη.\nΑλλάξτε τον αριθμό παραγγελίας.`);
      return;
    }

    // Έλεγχος αν ο πελάτης είναι καταχωρημένος
    if (customForm.customer && !selectedCustomer) {
      const exists = (customers||[]).some(c=>c.name?.toLowerCase()===customForm.customer.trim().toLowerCase());
      if (!exists) {
        Alert.alert(
          "Πελάτης δεν βρέθηκε",
          `Ο πελάτης "${customForm.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`,
          [
            { text:"ΟΧΙ", style:"destructive", onPress:()=>{ setCustomerSearch(''); setCustomForm(f=>({...f,customer:''})); }},
            { text:"ΝΑΙ", onPress:()=>{
              if (onRequestAddCustomer) {
                onRequestAddCustomer(customForm.customer.trim(), (newCustomer)=>{
                  setSelectedCustomer(newCustomer);
                  setCustomerSearch(newCustomer.name);
                  setCustomForm(f=>({...f, customer:newCustomer.name, customerId:newCustomer.id}));
                });
              }
            }}
          ]
        );
        return;
      }
    }
    const newOrder = {...customForm, ...overrides, orderType:'ΕΙΔΙΚΗ', id:Date.now().toString(), createdAt:Date.now(), status:'PENDING'};
    setSpecialOrders([newOrder,...specialOrders]);
    await syncToCloud(newOrder);
    await logActivity('ΕΙΔΙΚΗ', 'Νέα παραγγελία', { orderNo: newOrder.orderNo, customer: newOrder.customer, size: `${newOrder.h}x${newOrder.w}`, qty: newOrder.qty });
    resetForm();

    setNotifyModal({ visible:true, order:newOrder });
  };

  const editOrder = async (order) => {
    setCustomForm(order);
    setCustomerSearch(order.customer||'');
    setEditingOrder(order);
    setSpecialOrders(specialOrders.filter(o=>o.id!==order.id));
    deleteFromCloud(order.id);

  };

  // Μεταφορά PENDING → PROD: αρχικοποιεί τις φάσεις παραγωγής
  const moveToProd = async (id) => {
    const order = specialOrders.find(o=>o.id===id); if(!order) return;
    const hasCoatings = !!(order.coatings && order.coatings.filter(c => c && String(c).trim()).length > 0);
    const phases = {};
    PHASES.forEach(ph => {
      // ΜΟΝΤΑΡΙΣΜΑ: μόνο αν installation === 'ΝΑΙ'
      // ΕΠΕΝΔΥΣΕΙΣ: μόνο αν υπάρχουν πραγματικά coatings
      if (ph.key==='montDoor' && order.installation!=='ΝΑΙ') {
        phases[ph.key] = { active:false, printed:false, done:false };
      } else if (ph.key==='epend' && !hasCoatings) {
        phases[ph.key] = { active:false, printed:false, done:false };
      } else {
        phases[ph.key] = { active:true, printed:false, done:false };
      }
    });
    const upd = {...order, status:'PROD', prodAt:Date.now(), phases};
    setSpecialOrders(specialOrders.map(o=>o.id===id?upd:o));
    await syncToCloud(upd);
    await logActivity('ΕΙΔΙΚΗ', 'Φάση → ΠΑΡΑΓΩΓΗ', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
  };

  const updateStatus = async (id, newStatus) => {
    const now=Date.now(); const order=specialOrders.find(o=>o.id===id); if(!order) return;
    if (newStatus==='PROD') { moveToProd(id); return; }
    if (newStatus==='READY') {
      const hasStavera = order.stavera && order.stavera.filter(s=>s.dim).length > 0;
      if (hasStavera && !order.staveraDone) {
        setConfirmModal({
          visible: true,
          title: '⚠️ Εκκρεμεί Σταθερό',
          message: 'Τα σταθερά δεν έχουν ολοκληρωθεί.\nΗ παραγγελία δεν μπορεί να πάει ΕΤΟΙΜΗ.',
          confirmText: 'ΟΚ',
          onConfirm: null
        });
        return;
      }
    }
    if (newStatus==='SOLD') {
      const totalQty=parseInt(order.qty)||1;
      setConfirmModal({
        visible: true,
        title: '💰 ΠΩΛΗΣΗ',
        message: `Επιβεβαίωση πώλησης παραγγελίας #${order.orderNo}${order.customer?' — '+order.customer:''}?`,
        confirmText: '💰 ΠΩΛΗΣΗ',
        onConfirm: async () => {
          const now2=Date.now();
          const upd={...order,status:'SOLD',soldAt:now2};
          setSoldSpecialOrders(prev=>[upd,...prev]);
          setSpecialOrders(prev=>prev.filter(o=>o.id!==id));
          await syncToCloud(upd);
          await logActivity('ΕΙΔΙΚΗ', 'Πώληση', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
        }
      });
      return;
    } else {
      let upd;
      setSpecialOrders(specialOrders.map(o=>{ if(o.id===id){upd={...o,status:newStatus,[`${newStatus.toLowerCase()}At`]:now};return upd;} return o; }));
      if(upd) {
        await syncToCloud(upd);
        if(newStatus==='READY') await logActivity('ΕΙΔΙΚΗ', 'Φάση → ΕΤΟΙΜΟ', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
      }
    }
  };



  const moveBack = async (id, cur) => {
    const order=specialOrders.find(o=>o.id===id);
    if (cur==='PROD') {
      const donePhasesCount = order.phases ? Object.values(order.phases).filter(p=>p.done).length : 0;
      const doneLabels = { laser:'LASER ΚΟΠΕΣ', cases:'ΚΑΣΕΣ', montSasi:'ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ', vafio:'ΒΑΦΕΙΟ', montDoor:'ΜΟΝΤΑΡΙΣΜΑ' };
      const doneNames = donePhasesCount>0 ? Object.entries(order.phases||{}).filter(([k,v])=>v.done).map(([k])=>doneLabels[k]||k).join(', ') : '';
      const msg = donePhasesCount>0
        ? `Θα διαγραφούν οι ολοκληρωμένες φάσεις:\n${doneNames}\n\nΕίσαι σίγουρος;`
        : `Επιστροφή παραγγελίας #${order.orderNo} στις ΚΑΤΑΧΩΡΗΜΕΝΕΣ;`;
      setConfirmModal({
        visible: true,
        title: '⚠️ Ανάκληση Παραγγελίας',
        message: msg,
        confirmText: 'ΝΑΙ, ΑΝΑΚΛΗΣΗ',
        onConfirm: async () => {
          const upd={...order, status:'PENDING', phases:null, prodAt:null};
          setSpecialOrders(prev=>prev.map(o=>o.id===id?upd:o));
          await syncToCloud(upd);
        }
      });
      return;
    }
    if (cur==='READY') {
      setConfirmModal({
        visible: true,
        title: '⟲ Επιστροφή στην Παραγωγή',
        message: `Η παραγγελία #${order.orderNo} θα επιστρέψει στην ΠΑΡΑΓΩΓΗ.`,
        confirmText: '⟲ ΕΠΙΣΤΡΟΦΗ',
        onConfirm: async () => {
          const upd={...order, status:'PROD'};
          setSpecialOrders(prev=>prev.map(o=>o.id===id?upd:o));
          await syncToCloud(upd);
        }
      });
      return;
    }
    const upd={...order,status:'PENDING'};
    setSpecialOrders(specialOrders.map(o=>o.id===id?upd:o)); await syncToCloud(upd);
  };

  // Βοηθητική: δημιουργεί HTML πίνακα από λίστα παραγγελιών με τίτλο
  const buildPrintHTML = (copies, phaseKey=null) => {
    const isMounting = phaseKey==='montDoor';
    const isProductionPhase = phaseKey !== null;
    const showCoatings = !isProductionPhase || isMounting;
    const isCases    = phaseKey==='cases';
    const isSasi     = phaseKey==='montSasi';
    const isMontDoor = phaseKey==='montDoor' || phaseKey==='epend';
    const isVafio    = phaseKey==='vafio';
    const isLaser = copies.some(c => c.title && c.title.includes('LASER') || c.title.includes('ΚΑΣΣΕΣ') || c.title.includes('ΣΑΣΙ') || c.title.includes('ΠΡΟΦΙΛ') || c.title.includes('ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ'));
    const tableCSS = `
      body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
      h1{font-size:20px;margin-bottom:2px;font-weight:bold;}
      h2{font-size:12px;margin-top:0;margin-bottom:6px;}
      table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;}
      th{padding:4px 6px;text-align:left;border:1px solid #000;font-weight:bold;white-space:nowrap;font-size:9px;background:#ddd;}
      td{padding:4px 6px;border:1px solid #000;vertical-align:top;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;}
      td.nowrap{white-space:nowrap;}
      td.notes{white-space:normal;min-width:120px;width:auto;}
      td.col-glass{white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;width:120px;max-width:120px;}
      td.col-lock{white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;width:140px;max-width:140px;}
      .col-no{width:48px;}
      .col-tem{width:36px;text-align:center;}
      .col-dim{width:80px;}
      .col-fora{width:28px;}
      .col-thor{width:36px;}
      .col-ment{width:28px;}
      .col-type{width:36px;}
      .col-mat{width:90px;}
      tr:nth-child(even) td{background:#f5f5f5;}
      .page-break{page-break-after:always;break-after:page;}
      @media print{
        @page{size:A4 landscape;margin:5mm;}
        table{border-collapse:collapse!important;width:100%!important;}
        th,td{border:1px solid #000!important;padding:3px 5px!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;white-space:normal!important;word-wrap:break-word!important;word-break:break-word!important;}
        td.nowrap{white-space:nowrap!important;}
        td.notes{white-space:normal!important;}
        td.col-glass{white-space:normal!important;word-wrap:break-word!important;word-break:break-word!important;overflow-wrap:break-word!important;width:120px!important;max-width:120px!important;}
        td.col-lock{white-space:normal!important;word-wrap:break-word!important;word-break:break-word!important;overflow-wrap:break-word!important;width:140px!important;max-width:140px!important;}
        th{background:#ddd!important;font-size:8px!important;white-space:nowrap!important;}
        tr:nth-child(even) td{background:#f5f5f5!important;}
        .page-break{page-break-after:always!important;break-after:page!important;}
      }
    `;

    const buildCasesTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const hingesNum = parseInt(o.hinges)||2;
        const mentStyle = hingesNum>=3 ? 'font-size:22px;font-weight:900;color:#cc0000;' : 'font-size:16px;';
        const kleidaria = lockHtml(o.lock);
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
          <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="${mentStyle}">${mentesedesVal}</td>
          <td style="font-size:15px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;width:160px;max-width:160px">${kleidaria}</td>
          <td style="font-size:15px;text-align:center">${caseTypeVal}</td>
          <td style="font-size:15px">${o.caseMaterial||'DKP'}</td>
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${formatNotesHtml(o.notes)}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:74px"><col style="width:125px"><col style="width:35px"><col style="width:28px"><col style="width:160px"><col style="width:28px"><col style="width:100px"><col style="width:261px"><col style="width:65px">
      </colgroup><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Μεντ.</th><th>Κλειδαριά</th><th>Τ/Κ</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildSasiTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const hingesNum = parseInt(o.hinges)||2;
        const mentStyle = hingesNum>=3 ? 'font-size:22px;font-weight:900;color:#cc0000;' : 'font-size:16px;';
        const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':lockHtml(o.lock);
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
          <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:16px;text-align:center">${armorVal}</td>
          <td style="${mentStyle}">${mentesedesVal}</td>
          <td style="font-size:15px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;max-width:180px">${tzami}</td>
          <td style="font-size:15px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;max-width:180px">${kleidaria}</td>
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${formatNotesHtml(o.notes)}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:5%"><col style="width:12%"><col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:18%"><col style="width:20%"><col style="width:22%"><col style="width:11%">
      </colgroup><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildMontDoorTable = (orders, pKey) => {
      const isEpend = pKey === 'epend';
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':lockHtml(o.lock);
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        const allCoatings = o.coatings||[];
        const exo = allCoatings.filter(c=>c.toUpperCase().includes('ΕΞΩ'));
        const mesa = allCoatings.filter(c=>c.toUpperCase().includes('ΜΕΣΑ')||c.toUpperCase().includes('ΕΣΩΤ'));
        const staveraEntries = (o.stavera||[]).filter(s=>s&&s.dim);
        const staveraStr = staveraEntries.map(s=>(s.qty?`${s.qty}τεμ `:'')+s.dim+(s.note?' '+s.note:'')).join(' | ');
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"";
        const ependCheck = (!isEpend && allCoatings.length>0 && o.phases?.epend?.done) ? ` <span style="color:#00C851;font-size:22px;font-weight:900">✔</span>` : '';
        const notesLines = [];
        if (o.notes) notesLines.push(`<span style="color:#000">${formatNotesHtml(o.notes)}</span>`);
        if (exo.length>0) notesLines.push(`<span style="color:#b8860b;font-weight:bold">🎨 ΕΞΩ: ${coatingsHtml(exo)}${mesa.length===0?ependCheck:''}</span>`);
        if (mesa.length>0) notesLines.push(`<span style="color:#1565c0;font-weight:bold">🎨 ΜΕΣ: ${coatingsHtml(mesa)}${ependCheck}</span>`);
        if (staveraStr) notesLines.push(`<span style="color:#6a0dad;font-weight:bold">📐 ${staveraStr}</span>`);
        if (tzami) notesLines.push(`<span style="color:#555">🪟 ${tzami}</span>`);
        const notesCell = notesLines.join('<br>');
        return `<tr>
          <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
          <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:13px;text-align:center">${armorVal}</td>
          <td style="font-size:13px">${o.hardware||'—'}</td>
          ${!isEpend ? `<td style="font-size:13px">${mentesedesVal}</td>` : ''}
          ${!isEpend ? `<td style="font-size:13px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word">${kleidaria}</td>` : ''}
          ${!isEpend ? `<td style="font-size:13px;text-align:center">${caseTypeVal}</td>` : ''}
          <td style="font-size:13px;white-space:normal;word-wrap:break-word">${notesCell}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      if (isEpend) {
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:55px"><col style="width:125px"><col style="width:35px"><col style="width:39px"><col style="width:105px"><col><col style="width:70px">
        </colgroup><thead><tr>
          <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Χρώμα</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
      }
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:55px"><col style="width:125px"><col style="width:35px"><col style="width:39px"><col style="width:105px"><col style="width:28px"><col style="width:169px"><col style="width:28px"><col><col style="width:70px">
      </colgroup><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Χρώμα</th><th>Μεντ.</th><th>Κλειδαριά</th><th>Τ/Κ</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildVafioTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const qtyVal = o.qty&&parseInt(o.qty)>1?`<span style="font-size:15px;font-weight:900;color:#cc0000">${o.qty}</span>`:'';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
          <td style="font-size:15px;text-align:center">${qtyVal}</td>
          <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:13px">${mentesedesVal}</td>
          <td style="font-size:13px;text-align:center">${caseTypeVal}</td>
          <td style="font-size:13px">${o.caseMaterial||'DKP'}</td>
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${formatNotesHtml(o.notes)}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:55px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:28px"><col style="width:28px"><col style="width:70px"><col style="width:200px"><col style="width:80px">
      </colgroup><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Μεντ.</th><th>Τ/Κ</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const dimCell = (o) => `<span style="font-size:15px;font-weight:900;letter-spacing:0.5px">${o.h||'—'} × ${o.w||'—'}</span>`;
    const qtyDisplay = (o) => { const q=parseInt(o.qty)||1; return q>1?`<span style="font-size:15px;font-weight:900;color:#cc0000">${q}</span>`:""; };
    const totalQty = (orders) => orders.reduce((sum,o)=>sum+(parseInt(o.qty)||1),0);

    const buildLaserTable = (orders, copyTitle) => {
      const isKasses  = copyTitle && copyTitle.includes('ΚΑΣΣΕΣ');
      const isSasi    = copyTitle && copyTitle.includes('ΣΑΣΙ');
      const isProfil  = copyTitle && copyTitle.includes('ΠΡΟΦΙΛ');

      // ΠΡΟΦΙΛ: χωρίς τζάμι, τ.κάσας, υλ.κάσας
      if (isProfil) {
        const rows = orders.map(o => {
          const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
          const hingesNum = parseInt(o.hinges)||2;
          const mentesedesVal = (!o.hinges||o.hinges==='2')?'—':o.hinges;
          const mentStyle = hingesNum>=3 ? 'font-size:14px;font-weight:900;color:#cc0000;' : 'font-size:10px;';
          const kleidaria = lockHtml(o.lock);
          const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
          return `<tr>
            <td class="col-no" style="font-weight:bold">${o.orderNo||'—'}</td>
            <td class="col-tem">${qtyDisplay(o)}</td>
            <td class="col-dim" style="font-weight:900">${dimCell(o)}</td>
            <td class="col-fora" style="font-weight:bold">${fora}</td>
            <td class="col-thor" style="font-size:10px;text-align:center">${armorVal}</td>
            <td class="col-ment" style="${mentStyle}">${mentesedesVal}</td>
            <td class="col-lock" style="font-size:10px">${kleidaria}</td>
            <td class="notes" style="font-size:10px">${formatNotesHtml(o.notes)}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000"><td style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="6"></td></tr>`;
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:55px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:28px"><col style="width:130px"><col>
        </colgroup><thead><tr>
          <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Μεντ.</th><th>Κλειδ.</th><th>Παρατηρήσεις</th>
        </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
      }

      // ΚΑΣΣΕΣ: χοντρή γραμμή όταν αλλάζει caseMaterial
      if (isKasses) {
        let prevMat = null;
        const rows = orders.map(o=>{
          const mat = o.caseMaterial||'DKP';
          const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
          const borderTop = (prevMat!==null && mat!==prevMat) ? 'border-top:3px solid #000;' : '';
          prevMat = mat;
          const hingesNum = parseInt(o.hinges)||2;
          const mentVal = (!o.hinges||o.hinges==='2')?'—':o.hinges;
          const mentStyle = hingesNum>=3 ? 'font-size:14px;font-weight:900;color:#cc0000;' : 'font-size:10px;';
          const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
          const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
          return `<tr style="${borderTop}">
            <td class="col-no" style="font-weight:bold">${o.orderNo||'—'}</td>
            <td class="col-tem">${qtyDisplay(o)}</td>
            <td class="col-dim" style="font-weight:900">${dimCell(o)}</td>
            <td class="col-fora" style="font-weight:bold">${fora}</td>
            <td class="col-thor" style="font-size:10px;text-align:center">${armorVal}</td>
            <td class="col-ment" style="${mentStyle}">${mentVal}</td>
            <td class="col-lock" style="font-size:10px">${lockHtml(o.lock)}</td>
            <td class="col-type" style="font-size:10px;text-align:center">${caseTypeVal}</td>
            <td class="col-mat" style="font-size:10px;font-weight:bold">${mat}</td>
            <td class="notes" style="font-size:10px">${formatNotesHtml(o.notes)}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="6"></td></tr>`;
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:55px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:28px"><col style="width:130px"><col style="width:28px"><col style="width:70px"><col>
        </colgroup><thead><tr>
          <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Μεντ.</th><th>Κλειδ.</th><th>Τ/Κ</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
        </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
      }

      // ΣΑΣΙ: χοντρή γραμμή όταν αλλάζει θωράκιση
      if (isSasi) {
        let prevArmor = null;
        const rows = orders.map(o=>{
          const isDipli = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ');
          const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
          const borderTop = (prevArmor!==null && isDipli!==prevArmor) ? 'border-top:3px solid #000;' : '';
          prevArmor = isDipli;
          const hingesNum = parseInt(o.hinges)||2;
          const mentVal = (!o.hinges||o.hinges==='2')?'—':o.hinges;
          const mentStyle = hingesNum>=3 ? 'font-size:14px;font-weight:900;color:#cc0000;' : 'font-size:10px;';
          const armorVal = isDipli ? '' : '<b>Μ/Θ</b>';
          return `<tr style="${borderTop}">
            <td class="col-no" style="font-weight:bold">${o.orderNo||'—'}</td>
            <td class="col-tem">${qtyDisplay(o)}</td>
            <td class="col-dim" style="font-weight:900">${dimCell(o)}</td>
            <td class="col-fora" style="font-weight:bold">${fora}</td>
            <td class="col-thor" style="font-size:10px;text-align:center">${armorVal}</td>
            <td class="col-ment" style="${mentStyle}">${mentVal}</td>
            <td class="col-glass" style="font-size:10px">${((o.glassDim||'')+(o.glassNotes?' '+o.glassNotes:''))||'—'}</td>
            <td class="col-lock" style="font-size:10px">${lockHtml(o.lock)}</td>
            <td class="notes" style="font-size:10px">${formatNotesHtml(o.notes)}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="4"></td></tr>`;
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:55px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:28px"><col style="width:110px"><col style="width:130px"><col>
        </colgroup><thead><tr>
          <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδ.</th><th>Παρατηρήσεις</th>
        </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
      }

      // ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ: πλήρης πίνακας
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const hingesNum = parseInt(o.hinges)||2;
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const mentStyle = hingesNum>=3 ? 'font-size:14px;font-weight:900;color:#cc0000;' : 'font-size:10px;';
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':lockHtml(o.lock);
        const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        // Επενδύσεις: εξωτερικές / εσωτερικές
        const allCoatings = o.coatings||[];
        const exo = allCoatings.filter(c=>c.toUpperCase().includes('ΕΞΩ'));
        const mesa = allCoatings.filter(c=>c.toUpperCase().includes('ΜΕΣΑ')||c.toUpperCase().includes('ΕΣΩΤ'));
        // Σταθερά
        const staveraEntries = (o.stavera||[]).filter(s=>s&&s.dim);
        const staveraStr = staveraEntries.map(s=>(s.qty?`${s.qty}τεμ `:'')+s.dim+(s.note?' '+s.note:'')).join(' | ');
        // Παρατηρήσεις — σύνθεση
        const notesLines = [];
        if (o.notes) notesLines.push(`<span style="color:#000;font-size:12px">${formatNotesHtml(o.notes)}</span>`);
        if (o.hardware) notesLines.push(`<span style="color:#333;font-weight:bold">🔩 ${o.hardware}</span>`);
        if (exo.length>0) notesLines.push(`<span style="color:#b8860b;font-weight:bold">🎨 ΕΞΩ: ${coatingsHtml(exo)}</span>`);
        if (mesa.length>0) notesLines.push(`<span style="color:#1565c0;font-weight:bold">🎨 ΜΕΣ: ${coatingsHtml(mesa)}</span>`);
        if (staveraStr) notesLines.push(`<span style="color:#6a0dad;font-weight:bold">📐 ${staveraStr}</span>`);
        const notesCell = notesLines.join('<br>');
        // Όνομα πελάτη με αναδίπλωση σε κάθε κενό
        const customerWrapped = o.customer ? o.customer.split(' ').join('<br>') : '';
        const montBadge = o.installation === 'ΝΑΙ' ? ` <span style="color:#cc0000;font-weight:900;font-size:15px">Μ</span>` : '';
        const programNoPrefix = o.programNo ? `<span style="color:#cc0000;font-weight:900;font-size:16px;${isUrgentProgram(o.programNo)?'border:3px solid #cc0000;border-radius:3px;padding:0 2px;':''}">${o.programNo}</span> / ` : '';
        const noCell = `${programNoPrefix}<span style="font-weight:bold;font-size:13px">${o.orderNo||'—'}${montBadge}</span>${customerWrapped ? `<br><span style="font-size:9px;color:#555;font-weight:normal;line-height:1.2">${customerWrapped}</span>` : ''}`;
        return `<tr>
          <td class="col-no" style="white-space:normal;word-break:break-word;vertical-align:top">${noCell}</td>
          <td class="col-tem">${qtyDisplay(o)}</td>
          <td class="col-dim" style="font-weight:900">${dimCell(o)}</td>
          <td class="col-fora" style="font-weight:bold">${fora}</td>
          <td class="col-thor" style="font-size:10px;text-align:center">${armorVal}</td>
          <td class="col-ment" style="${mentStyle}">${mentesedesVal}</td>
          <td class="col-glass" style="font-size:10px">${tzami}</td>
          <td style="font-size:10px;width:140px;max-width:140px;white-space:normal;word-break:break-word;overflow-wrap:break-word">${kleidaria}</td>
          <td class="col-type" style="font-size:10px;text-align:center">${caseTypeVal}</td>
          <td class="col-mat" style="font-size:10px;font-weight:bold">${o.caseMaterial||'DKP'}</td>
          <td class="notes" style="font-size:10px;white-space:pre-wrap">${notesCell}</td>
        </tr>`;
      }).join('');
      const total = totalQty(orders);
      const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="9"></td></tr>`;
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:110px"><col style="width:30px"><col style="width:100px"><col style="width:30px"><col style="width:32px">
        <col style="width:28px"><col style="width:110px"><col style="width:140px"><col style="width:32px"><col style="width:80px"><col>
      </colgroup><thead><tr>
        <th>Νο / Πελάτης</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th>
        <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδ.</th><th>Τ/Κ</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
    };
    const buildTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':lockHtml(o.lock);
        const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        const qtyVal = o.qty&&parseInt(o.qty)>1?`&nbsp;<span style="font-size:15px;font-weight:900;color:#cc0000">${o.qty}</span>`:'';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = createdFmt ? (createdFmt + (deliveryFmt ? `&nbsp;&nbsp;&nbsp;&nbsp;${deliveryFmt}` : '')) : '';
        return `<tr>
          <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
          <td style="font-weight:bold;font-size:13px">${o.h||'—'}x${o.w||'—'}${qtyVal}</td>
          <td style="font-weight:bold;font-size:13px">${fora}</td>
          <td style="text-align:center">${armorVal}</td>
          <td style="font-weight:bold">${o.hardware||'—'}</td>
          <td style="font-weight:bold;font-size:13px">${mentesedesVal}</td>
          <td style="font-weight:bold;font-size:13px">${tzami}</td>
          <td>${kleidaria}</td>
          <td style="text-align:center">${caseTypeVal}</td>
          <td>${o.caseMaterial||'DKP'}</td>
          <td>${o.installation==='ΝΑΙ'?'✓':''}</td>
          ${showCoatings?`<td>${coatingsHtml(o.coatings)}</td>`:''}
          <td style="min-width:140px">${formatNotesHtml(o.notes)}</td>
          <td style="font-size:10px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Χρώμα</th>
        <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Τ/Κ</th><th>Υλ.Κάσας</th><th>Μον.</th>${showCoatings?'<th>Επένδυση</th>':''}<th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const pages = copies.map((copy, idx) => `
      <div class="${idx < copies.length-1 ? 'page-break' : ''}">
        <h1>${copy.title}</h1>
        <h2>Σύνολο: ${copy.orders.length} παραγγελίες</h2>
        ${isLaser ? buildLaserTable(copy.orders, copy.title) : isCases ? buildCasesTable(copy.orders) : isSasi ? buildSasiTable(copy.orders) : isMontDoor ? buildMontDoorTable(copy.orders, phaseKey) : isVafio ? buildVafioTable(copy.orders) : buildTable(copy.orders)}
      </div>
    `).join('');

    return `<html><head><meta charset="utf-8"><style>${tableCSS}</style></head><body>${pages}</body></html>`;
  };

  // Ταξινομήσεις
  const sortByDimension = (arr) => [...arr].sort((a,b) => {
    const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
    if (hDiff!==0) return hDiff;
    return (parseInt(b.w)||0) - (parseInt(a.w)||0);
  });

  const getCopies = (orders, phaseLabel, dateStr) => {
    const uniqueProgs = [...new Set(orders.map(o=>o.programNo).filter(Boolean))];
    const progSuffix = uniqueProgs.length > 0 ? ` — Α.Π. <b>${uniqueProgs.join(', ')}</b>` : '';
    if (phaseLabel.includes('LASER')) {
      const copy1 = [...orders].sort((a,b) => (parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));

      // ΚΑΣΣΕΣ: 1) Υλικό (DKP→ΓΑΛΒΑΝΙΖΕ) 2) Τύπος (ΑΝΟΙΧΤΟΥ→ΚΛΕΙΣΤΟΥ) 3) Διάσταση
      const copy2 = [...orders].sort((a,b) => {
        const matA = a.caseMaterial||'DKP';
        const matB = b.caseMaterial||'DKP';
        if (matA !== matB) return matA==='DKP' ? -1 : 1;
        const typeA = a.caseType||'';
        const typeB = b.caseType||'';
        if (typeA !== typeB) {
          if (typeA.includes('ΑΝΟΙΧΤΟΥ')) return -1;
          if (typeB.includes('ΑΝΟΙΧΤΟΥ')) return 1;
          return typeA.localeCompare(typeB);
        }
        const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
        if (hDiff!==0) return hDiff;
        return (parseInt(b.w)||0) - (parseInt(a.w)||0);
      });

      // ΣΑΣΙ: 1) Θωράκιση (ΔΙΠΛΗ→ΜΟΝΗ) 2) Διάσταση
      const copy3 = [...orders].sort((a,b) => {
        const armorA = (a.armor||'').includes('ΔΙΠΛΗ');
        const armorB = (b.armor||'').includes('ΔΙΠΛΗ');
        if (armorA !== armorB) return armorA ? -1 : 1;
        const hDiff = (parseInt(b.h)||0) - (parseInt(a.h)||0);
        if (hDiff!==0) return hDiff;
        return (parseInt(b.w)||0) - (parseInt(a.w)||0);
      });

      // ΠΡΟΦΙΛ: μόνο διάσταση
      const copy4 = sortByDimension(orders);

      return [
        { title:`VAICON — ${dateStr} — ΚΑΣΣΕΣ${progSuffix}`, orders:copy2 },
        { title:`VAICON — ${dateStr} — ΣΑΣΙ${progSuffix}`, orders:copy3 },
        { title:`VAICON — ${dateStr} — ΠΡΟΦΙΛ${progSuffix}`, orders:copy4 },
      ];
    }
    return [{ title:`VAICON — ${dateStr} — ${phaseLabel}${progSuffix}`, orders:[...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)) }];
  };

  // Άνοιγμα preview εκτύπωσης
  const handlePrint = async (phaseKey) => {
    const selected = Object.keys(printSelected).filter(id => printSelected[id]);
    if (selected.length===0) {
      if(Platform.OS==='web') window.alert('Επίλεξε τουλάχιστον μία παραγγελία.');
      else Alert.alert("Προσοχή","Επίλεξε τουλάχιστον μία παραγγελία.");
      return;
    }
    // Για ΣΤΑΘΕΡΑ: ίδιο φίλτρο με αυτό που εμφανίζεται στο page (περιλαμβάνει και τζάμι)
    const prodOrders = specialOrders.filter(o=>o.status==='PROD');
    const staveraSet = new Map();
    prodOrders.filter(o=>(o.stavera&&o.stavera.length>0) || hasGlass(o)).forEach(o=>staveraSet.set(o.id,o));
    specialOrders.filter(o=>o.status==='READY' && ((o.staveraPendingAtReady&&!o.staveraDone) || (o.glassPendingAtReady&&!o.glassDone))).forEach(o=>staveraSet.set(o.id,o));
    const staveraOrders = [...staveraSet.values()];
    const orders = phaseKey==='stavera'
      ? staveraOrders.filter(o => selected.includes(o.id))
      : specialOrders.filter(o => {
          if (!selected.includes(o.id)) return false;
          // Backward compat: για epend, active αν έχει coatings (override)
          if (phaseKey === 'epend') return !!(o.coatings && o.coatings.length > 0);
          return o.phases?.[phaseKey]?.active;
        });
    // Για LASER ΚΟΠΕΣ → επιλογή αντιγράφων πριν την εκτύπωση
    if (phaseKey==='laser') {
      if(Platform.OS==='web'){
        // Laser → πάντα 4 αντίγραφα χωρίς επιλογή
        const choice = 4;
        // Εκτύπωση απευθείας
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
        const allCopies = getCopies(orders, phaseLabel, dateStr);
        const selectedCopies = allCopies;
        const html = buildPrintHTML(selectedCopies, phaseKey);
        await printHTML(html, `VAICON — ${phaseLabel}`);
        // Μαρκάρει ως printed
        const selectedIds = orders.map(o=>o.id);
        const updated = specialOrders.map(o => {
          if (selectedIds.includes(o.id) && o.phases?.[phaseKey]?.active) {
            return {...o, phases:{...o.phases, [phaseKey]:{...o.phases[phaseKey], printed:true, printHistory:[...(o.phases[phaseKey].printHistory||[]), {ts:Date.now(), copies:choice}]}}};
          }
          return o;
        });
        setSpecialOrders(updated);
        for (const o of updated.filter(o=>selectedIds.includes(o.id))) await syncToCloud(o);
      } else {
        Alert.alert(
          "Εκτύπωση LASER ΚΟΠΕΣ",
          `Επιλέξατε ${orders.length} παραγγελίες.\nΠόσα αντίγραφα θέλετε;`,
          [
            { text:"ΑΚΥΡΟ", style:"cancel" },
            { text:"1 ΑΝΤΙΓΡΑΦΟ", onPress:()=>setPrintPreview({ visible:true, phaseKey, orders, copies:1 }) },
            { text:"4 ΑΝΤΙΓΡΑΦΑ", onPress:()=>setPrintPreview({ visible:true, phaseKey, orders, copies:4 }) },
          ]
        );
      }
    } else {
      // Όλες οι άλλες φάσεις → απευθείας εκτύπωση χωρίς React Modal
      try {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
        if (phaseKey==='stavera') {
          const rows = orders.flatMap(o=>{
            const staveraEntries = (o.stavera||[]).filter(s=>s&&(s.dim||s.note));
            const dateCell = o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'';
            const staveraRows = staveraEntries.map(s=>`<tr>
              <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
              <td style="font-size:13px">${o.caseType||'—'}</td>
              <td style="font-size:20px;font-weight:900">📐 ${s.dim||'—'}</td>
              <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center">${s.qty||''}</td>
              <td style="font-size:13px;min-width:180px">${s.note||''}</td>
              <td style="font-size:12px;color:#444">${dateCell}</td>
            </tr>`);
            const glassRows = hasGlass(o) ? [`<tr>
              <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
              <td style="font-size:13px">${o.caseType||'—'}</td>
              <td style="font-size:20px;font-weight:900;color:#0d47a1">🪟 ${o.glassDim||'—'}</td>
              <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
              <td style="font-size:13px;min-width:180px">${o.glassNotes||''}</td>
              <td style="font-size:12px;color:#444">${dateCell}</td>
            </tr>`] : [];
            if (staveraRows.length===0 && glassRows.length===0) {
              return [`<tr>
                <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
                <td style="font-size:13px">${o.caseType||'—'}</td>
                <td style="font-size:20px;font-weight:900">—</td>
                <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
                <td style="font-size:13px;min-width:180px"></td>
                <td style="font-size:12px;color:#444">${dateCell}</td>
              </tr>`];
            }
            return [...staveraRows, ...glassRows];
          }).join('');
          const html = `<html><head><meta charset="utf-8"><style>
            body{font-family:Arial,sans-serif;margin:8mm;}
            h1{font-size:22px;font-weight:bold;margin-bottom:2px;}
            h2{font-size:13px;color:#555;margin-bottom:10px;}
            table{width:100%;border-collapse:collapse;}
            th{padding:6px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;}
            td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top;}
            tr:last-child td{border-bottom:2px solid #000;}
            @media print{@page{size:A4 landscape;margin:8mm;}}
          </style></head><body>
            <h1>📏 ΣΤΑΘΕΡΑ — ΕΙΔΙΚΗ</h1>
            <h2>📅 ${dateStr} | ${orders.length} παραγγελίες</h2>
            <table><thead><tr><th>Νο</th><th>Τ.Κάσας</th><th>Διάσταση Σταθερού</th><th style="text-align:center">Τεμ.</th><th>Παρατήρηση</th><th>Ημερομηνία</th></tr></thead>
            <tbody>${rows}</tbody></table>
          </body></html>`;
          await printHTML(html, 'ΣΤΑΘΕΡΑ — ΕΙΔΙΚΗ');
          const selectedIds = orders.map(o=>o.id);
          const updated = specialOrders.map(o=>selectedIds.includes(o.id)?{...o,staveraPrinted:true}:o);
          setSpecialOrders(updated);
          updated.filter(o=>selectedIds.includes(o.id)).forEach(o=>syncToCloud(o));
        } else if (phaseKey==='cases') {
          const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
          const kleistou = sorted.filter(o=>(o.caseType||'').includes('ΚΛΕΙΣΤΟΥ'));
          const anoixtou = sorted.filter(o=>(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ'));
          const caseCopies = [];
          if (kleistou.length>0) caseCopies.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ`, orders:kleistou });
          if (anoixtou.length>0) caseCopies.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ`, orders:anoixtou });
          if (caseCopies.length===0) return;
          const html = buildPrintHTML(caseCopies, phaseKey);
          await printHTML(html, `VAICON — ΚΑΣΕΣ`);
          const selectedIds = orders.map(o=>o.id);
          const updated = specialOrders.map(o => {
            if (selectedIds.includes(o.id) && o.phases?.[phaseKey]?.active) {
              return {...o, phases:{...o.phases, [phaseKey]:{...o.phases[phaseKey], printed:true, printHistory:[...(o.phases[phaseKey].printHistory||[]), {ts:Date.now(), copies:1}]}}};
            }
            return o;
          });
          setSpecialOrders(updated);
          for (const o of updated.filter(o=>selectedIds.includes(o.id))) await syncToCloud(o);
        } else {
          const allCopies = getCopies(orders, phaseLabel, dateStr);
          const html = buildPrintHTML([allCopies[0]], phaseKey);
          await printHTML(html, `VAICON — ${phaseLabel}`);
          const selectedIds = orders.map(o=>o.id);
          const updated = specialOrders.map(o => {
            if (!selectedIds.includes(o.id)) return o;
            const hasCoatings = !!(o.coatings && o.coatings.length > 0);
            const isActive = phaseKey === 'epend'
              ? hasCoatings
              : !!(o.phases?.[phaseKey]?.active);
            if (!isActive) return o;
            const existPhase = o.phases?.[phaseKey] || { active: true, done: false, printed: false, printHistory: [] };
            return {...o, phases:{...o.phases, [phaseKey]:{...existPhase, printed:true, printHistory:[...(existPhase.printHistory||[]), {ts:Date.now(), copies:1}]}}};
          });
          setSpecialOrders(updated);
          for (const o of updated.filter(o=>selectedIds.includes(o.id))) await syncToCloud(o);
        }
      } catch(e) {
        Alert.alert("Σφάλμα", "Δεν δημιουργήθηκε το PDF. Δοκιμάστε ξανά.");
      }
    }
  };

  // Εκτύπωση — καλείται μόνο αφού πατηθεί ΕΚΤΥΠΩΣΗ μέσα στο preview
  const handleConfirmPrint = async () => {
    const { phaseKey, orders, copies } = printPreview;
    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    setPrintPreview({visible:false, phaseKey:null, orders:[], copies:1});

    try {
      if (phaseKey==='stavera') {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        const rows = orders.flatMap(o=>{
          const staveraEntries = (o.stavera||[]).filter(s=>s&&(s.dim||s.note));
          const dateCell = o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'';
          const staveraRows = staveraEntries.map(s=>`<tr>
            <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
            <td style="font-size:13px">${o.caseType||'—'}</td>
            <td style="font-size:20px;font-weight:900">📐 ${s.dim||'—'}</td>
            <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center">${s.qty||''}</td>
            <td style="font-size:13px;min-width:180px">${s.note||''}</td>
            <td style="font-size:12px;color:#444">${dateCell}</td>
          </tr>`);
          const glassRows = hasGlass(o) ? [`<tr>
            <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
            <td style="font-size:13px">${o.caseType||'—'}</td>
            <td style="font-size:20px;font-weight:900;color:#0d47a1">🪟 ${o.glassDim||'—'}</td>
            <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
            <td style="font-size:13px;min-width:180px">${o.glassNotes||''}</td>
            <td style="font-size:12px;color:#444">${dateCell}</td>
          </tr>`] : [];
          if (staveraRows.length===0 && glassRows.length===0) {
            return [`<tr>
              <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
              <td style="font-size:13px">${o.caseType||'—'}</td>
              <td style="font-size:20px;font-weight:900">—</td>
              <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
              <td style="font-size:13px;min-width:180px"></td>
              <td style="font-size:12px;color:#444">${dateCell}</td>
            </tr>`];
          }
          return [...staveraRows, ...glassRows];
        }).join('');
        const html = `<html><head><meta charset="utf-8"><style>
          body{font-family:Arial,sans-serif;margin:8mm;}
          h1{font-size:22px;font-weight:bold;margin-bottom:2px;}
          h2{font-size:13px;color:#555;margin-bottom:10px;}
          table{width:100%;border-collapse:collapse;}
          th{padding:6px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;}
          td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top;}
          tr:last-child td{border-bottom:2px solid #000;}
          @media print{@page{size:A4 landscape;margin:8mm;}}
        </style></head><body>
          <h1>📏 ΣΤΑΘΕΡΑ — ΕΙΔΙΚΗ</h1>
          <h2>📅 ${dateStr} | ${orders.length} παραγγελίες</h2>
          <table><thead><tr><th>Νο</th><th>Τ.Κάσας</th><th>Διάσταση Σταθερού</th><th style="text-align:center">Τεμ.</th><th>Παρατήρηση</th><th>Ημερομηνία</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </body></html>`;
        await printHTML(html, 'ΣΤΑΘΕΡΑ — ΕΙΔΙΚΗ');
        const selectedIds = orders.map(o=>o.id);
        const updated = specialOrders.map(o=>selectedIds.includes(o.id)?{...o,staveraPrinted:true}:o);
        setSpecialOrders(updated);
        updated.filter(o=>selectedIds.includes(o.id)).forEach(o=>syncToCloud(o));
        return;
      }
      if (phaseKey==='cases') {
        const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
        const kleistou = sorted.filter(o=>(o.caseType||'').includes('ΚΛΕΙΣΤΟΥ'));
        const anoixtou = sorted.filter(o=>(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ'));
        const caseCopies = [];
        if (kleistou.length>0) caseCopies.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ`, orders:kleistou });
        if (anoixtou.length>0) caseCopies.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ`, orders:anoixtou });
        if (caseCopies.length===0) return;
        const html = buildPrintHTML(caseCopies, phaseKey);
        await printHTML(html, `VAICON — ΚΑΣΕΣ`);
      } else {
        const allCopies = getCopies(orders, phaseLabel, dateStr);
        const selectedCopies = copies===4 ? allCopies : [allCopies[0]];
        const html = buildPrintHTML(selectedCopies, phaseKey);
        await printHTML(html, `VAICON — ${phaseLabel}`);
      }
      // Μαρκάρει ως printed
      const selectedIds = orders.map(o=>o.id);
      const updated = specialOrders.map(o => {
        if (selectedIds.includes(o.id) && o.phases?.[phaseKey]?.active) {
          return {...o, phases:{...o.phases, [phaseKey]:{...o.phases[phaseKey], printed:true, printHistory:[...(o.phases[phaseKey].printHistory||[]), {ts:Date.now(), copies}]}}};
        }
        return o;
      });
      setSpecialOrders(updated);
      for (const o of updated.filter(o=>selectedIds.includes(o.id))) await syncToCloud(o);
    } catch(e) {
      Alert.alert("Σφάλμα", "Δεν δημιουργήθηκε το PDF. Δοκιμάστε ξανά.");
    }
  };

  // Render του Print Preview Modal
  const renderPrintPreview = () => {
    if (!printPreview.visible) return null;
    const { phaseKey, orders, copies } = printPreview;
    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const allCopies = phaseKey==='stavera'
      ? [{ title:`VAICON — ${dateStr} — ΣΤΑΘΕΡΑ`, orders }]
      : phaseKey==='cases'
      ? (() => {
          const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
          const kleistou = sorted.filter(o=>(o.caseType||'').includes('ΚΛΕΙΣΤΟΥ'));
          const anoixtou = sorted.filter(o=>(o.caseType||'').includes('ΑΝΟΙΧΤΟΥ'));
          const result = [];
          if (kleistou.length>0) result.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ`, orders:kleistou });
          if (anoixtou.length>0) result.push({ title:`VAICON — ${dateStr} — ΚΑΣΕΣ ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ`, orders:anoixtou });
          return result.length>0 ? result : [{ title:`VAICON — ${dateStr} — ΚΑΣΕΣ`, orders:sorted }];
        })()
      : getCopies(orders, phaseLabel, dateStr);
    const previewCopies = copies===4 ? allCopies : [allCopies[0]];

    const COLS_CASES = [
      {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Μεντ.',w:35},{label:'Κλειδαριά',w:80},{label:'Τ.Κάσας',w:90},
      {label:'Υλ.Κάσας',w:65},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS_SASI = [
      {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},
      {label:'Κλειδαριά',w:70},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS_MONTDOOR = [
      {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Χρώμα',w:50},{label:'Μεντ.',w:35},
      {label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},{label:'Τ.Κάσας',w:65},
      {label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS_VAFIO = [
      {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
      {label:'Μεντ.',w:35},{label:'Τ.Κάσας',w:90},{label:'Υλ.Κάσας',w:65},
      {label:'Παρατηρήσεις',w:200},{label:'Ημερομηνίες',w:120},
    ];

    const COLS = [
      {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:80},{label:'Φορά',w:40},
      {label:'Θωράκιση',w:70},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},
      {label:'Χρώμα',w:50},{label:'Τ.Κάσας',w:65},{label:'Υλ.Κάσας',w:65},{label:'Μον.',w:40},{label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:220},
    ];

    const renderTable = (sortedOrders) => {
      if (phaseKey==='stavera') {
        const COLS_STAVERA = [
          {label:'Νο',w:50},{label:'Τ.Κάσας',w:90},{label:'Διάσταση Σταθερού',w:130},
          {label:'Παρατήρηση',w:220},{label:'Ημερομηνία',w:110},
        ];
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_STAVERA.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.flatMap((o,i)=>{
                const entries = (o.stavera||[]).filter(s=>s&&(s.dim||s.note));
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const orderHasGlass = hasGlass(o);
                if (entries.length===0 && !orderHasGlass) {
                  return [(
                    <View key={o.id+'-0'} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                      <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{o.orderNo||'—'}</Text>
                      <Text style={[styles.previewTd,{width:90,fontSize:12}]}>{o.caseType||'—'}</Text>
                      <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>—</Text>
                      <Text style={[styles.previewTd,{width:220,fontSize:12}]}></Text>
                      <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{deliveryFmt}</Text>
                    </View>
                  )];
                }
                const staveraRows = entries.map((s,si)=>(
                  <View key={o.id+'-s-'+si} style={[styles.previewTr,(i+si)%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{si===0?o.orderNo||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:90,fontSize:12}]}>{si===0?o.caseType||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>📐 {s.dim||'—'}</Text>
                    <Text style={[styles.previewTd,{width:220,fontSize:12}]}>{s.note||''}</Text>
                    <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{si===0?deliveryFmt:''}</Text>
                  </View>
                ));
                const glassRows = orderHasGlass ? [(
                  <View key={o.id+'-g'} style={[styles.previewTr,(i+entries.length)%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{entries.length===0?o.orderNo||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:90,fontSize:12}]}>{entries.length===0?o.caseType||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15,color:'#0d47a1'}]}>🪟 {o.glassDim||'—'}</Text>
                    <Text style={[styles.previewTd,{width:220,fontSize:12}]}>{o.glassNotes||''}</Text>
                    <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{entries.length===0?deliveryFmt:''}</Text>
                  </View>
                )] : [];
                return [...staveraRows, ...glassRows];
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='cases') {
        const COLS_CASES2 = [
          {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
          {label:'Μεντ.',w:35},{label:'Κλειδαριά',w:80},{label:'Τ/Κ',w:36},
          {label:'Υλ.Κάσας',w:65},{label:'Παρατηρήσεις',w:220},{label:'Ημερομηνίες',w:120},
        ];
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_CASES2.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const caseTypeTxt = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? 'Α/Τ' : '';
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                    <Text style={[styles.previewTd,{width:80}, lockStyle(o.lock, 11)]}>{o.lock||'—'}</Text>
                    <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{caseTypeTxt}</Text>
                    <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                    <Text style={[styles.previewTd,{width:220}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='montSasi') {
        const COLS_SASI2 = [
          {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
          {label:'Θ/Σ',w:36},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},
          {label:'Κλειδαριά',w:70},{label:'Παρατηρήσεις',w:220},{label:'Ημερομηνίες',w:120},
        ];
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_SASI2.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const armorTxt = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : 'Μ/Θ';
                const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{armorTxt}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                    <View style={{width:55,paddingHorizontal:6,justifyContent:'center'}}><Text style={{fontSize:11,color:'#000',fontWeight:'bold',flexWrap:'wrap'}}>{tzami}</Text></View>
                    <View style={{width:70,paddingHorizontal:6,justifyContent:'center'}}><Text style={[{fontSize:11,color:'#000',flexWrap:'wrap'}, o.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ'?lockStyle(o.lock,11):null]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text></View>
                    <Text style={[styles.previewTd,{width:220}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='montDoor' || phaseKey==='epend') {
        const COLS_MONTDOOR2 = [
          {label:'Νο',w:50},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
          {label:'Θ/Σ',w:36},{label:'Χρώμα',w:50},{label:'Μεντ.',w:35},
          {label:'Τζάμι',w:55},{label:'Κλειδαριά',w:70},{label:'Τ/Κ',w:36},
          {label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:220},{label:'Ημερομηνίες',w:120},
        ];
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_MONTDOOR2.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const armorTxt = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : 'Μ/Θ';
                const caseTypeTxt = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? 'Α/Τ' : '';
                const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt2 = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt2 = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{armorTxt}</Text>
                    <Text style={[styles.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                    <View style={{width:55,paddingHorizontal:6,justifyContent:'center'}}><Text style={{fontSize:11,color:'#000',fontWeight:'bold',flexWrap:'wrap'}}>{tzami}</Text></View>
                    <View style={{width:70,paddingHorizontal:6,justifyContent:'center'}}><Text style={[{fontSize:11,color:'#000',flexWrap:'wrap'}, o.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ'?lockStyle(o.lock,11):null]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text></View>
                    <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{caseTypeTxt}</Text>
                    <Text style={[styles.previewTd,{width:120}]}>{(o.coatings||[]).map((n,i)=>(<Text key={i} style={coatingStyle(n, 11)}>{i>0?', ':''}{n}</Text>))}</Text>
                    <Text style={[styles.previewTd,{width:220}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt2,deliveryFmt2].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='vafio') {
        const COLS_VAFIO2 = [
          {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:95},{label:'Φορά',w:40},
          {label:'Μεντ.',w:35},{label:'Τ/Κ',w:36},{label:'Υλ.Κάσας',w:65},
          {label:'Παρατηρήσεις',w:220},{label:'Ημερομηνίες',w:120},
        ];
        return (
          <ScrollView horizontal>
            <View>
              <View style={styles.previewThead}>
                {COLS_VAFIO2.map(h=>(
                  <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
                ))}
              </View>
              {sortedOrders.map((o,i)=>{
                const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
                const caseTypeTxt = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? 'Α/Τ' : '';
                const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
                const createdFmt3 = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                const deliveryFmt3 = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                return (
                  <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                    <Text style={[styles.previewTd,{width:35},...[bold]]}>{o.qty||'1'}</Text>
                    <Text style={[styles.previewTd,{width:95},...[bold]]}>{o.h||'—'} × {o.w||'—'}</Text>
                    <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                    <Text style={[styles.previewTd,{width:35}]}>{mentesedesVal}</Text>
                    <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{caseTypeTxt}</Text>
                    <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                    <Text style={[styles.previewTd,{width:220}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt3,deliveryFmt3].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      const COLS_DEFAULT = [
        {label:'Νο',w:50},{label:'Τεμ.',w:35},{label:'Διάσταση',w:80},{label:'Φορά',w:40},
        {label:'Θ/Σ',w:36},{label:'Μεντ.',w:35},{label:'Τζάμι',w:55},{label:'Κλειδαριά',w:140},
        {label:'Χρώμα',w:50},{label:'Τ/Κ',w:36},{label:'Υλ.Κάσας',w:65},{label:'Μον.',w:40},{label:'Επένδυση',w:120},{label:'Παρατηρήσεις',w:160},
      ];
      return (
      <ScrollView horizontal>
        <View>
          <View style={styles.previewThead}>
            {COLS_DEFAULT.map(h=>(
              <Text key={h.label} style={[styles.previewTh,{width:h.w}]}>{h.label}</Text>
            ))}
          </View>
          {sortedOrders.map((o,i)=>{
            const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
            const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
            const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
            const armorTxt = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : 'Μ/Θ';
            const caseTypeTxt = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? 'Α/Τ' : '';
            const bold = {fontWeight:'bold',fontSize:13,color:'#000'};
            return (
              <View key={o.id+i} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                <Text style={[styles.previewTd,{width:50},...[bold]]}>{o.orderNo||'—'}</Text>
                <Text style={[styles.previewTd,{width:35},...[bold]]}>{o.qty||'1'}</Text>
                <Text style={[styles.previewTd,{width:80},...[bold]]}>{o.h||'—'}x{o.w||'—'}</Text>
                <Text style={[styles.previewTd,{width:40},...[bold]]}>{fora}</Text>
                <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{armorTxt}</Text>
                <Text style={[styles.previewTd,{width:35},...[bold]]}>{mentesedesVal}</Text>
                <View style={{width:55,paddingHorizontal:6}}><Text style={{fontSize:11,color:'#000'}}>{tzami}</Text></View>
                <View style={{width:140,paddingHorizontal:6}}><Text style={[{fontSize:11,color:'#000'}, o.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ'?lockStyle(o.lock,11):null]}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text></View>
                <Text style={[styles.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{caseTypeTxt}</Text>
                <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                <Text style={[styles.previewTd,{width:40}]}>{o.installation==='ΝΑΙ'?'✓':''}</Text>
                <Text style={[styles.previewTd,{width:120}]}>{(o.coatings||[]).map((n,i)=>(<Text key={i} style={coatingStyle(n, 11)}>{i>0?', ':''}{n}</Text>))}</Text>
                <Text style={[styles.previewTd,{width:160,flexWrap:'wrap'}]}>{o.notes||''}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
    };

    return (
      <Modal visible={true} animationType="slide" onRequestClose={()=>setPrintPreview({visible:false,phaseKey:null,orders:[],copies:1})}>
        <View style={styles.previewContainer}>
          {/* HEADER */}
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>VAICON — {phaseLabel}</Text>
            <Text style={styles.previewSub}>📅 {dateStr}  |  {orders.length} παραγγελίες  |  {copies===4?'4 ΑΝΤΙΓΡΑΦΑ':'1 ΑΝΤΙΓΡΑΦΟ'}</Text>
          </View>

          {/* ΑΝΤΙΓΡΑΦΑ */}
          <ScrollView style={styles.previewScroll}>
            {previewCopies.map((copy, idx)=>(
              <View key={idx} style={{marginBottom:20}}>
                <View style={{backgroundColor:'#333',padding:8,marginBottom:4}}>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>
                    {copy.title}
                  </Text>
                </View>
                {renderTable(copy.orders)}
              </View>
            ))}
          </ScrollView>

          {/* ΕΠΙΛΟΓΗ ΑΝΤΙΓΡΑΦΩΝ — μόνο για LASER */}
          {printPreview.phaseKey==='laser' && (
            <View style={{flexDirection:'row', justifyContent:'center', gap:10, paddingHorizontal:16, paddingTop:10, paddingBottom:4}}>
              <TouchableOpacity
                style={{flex:1, padding:10, borderRadius:8, alignItems:'center', backgroundColor: printPreview.copies===1?'#1a1a1a':'#e0e0e0'}}
                onPress={()=>setPrintPreview(p=>({...p,copies:1}))}>
                <Text style={{fontWeight:'bold', color: printPreview.copies===1?'white':'#555'}}>1 ΑΝΤΙΓΡΑΦΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:1, padding:10, borderRadius:8, alignItems:'center', backgroundColor: printPreview.copies===4?'#1a1a1a':'#e0e0e0'}}
                onPress={()=>setPrintPreview(p=>({...p,copies:4}))}>
                <Text style={{fontWeight:'bold', color: printPreview.copies===4?'white':'#555'}}>4 ΑΝΤΙΓΡΑΦΑ</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* ΚΟΥΜΠΙΑ */}
          <View style={styles.previewBtns}>
            <TouchableOpacity style={styles.previewCancelBtn} onPress={()=>setPrintPreview({visible:false,phaseKey:null,orders:[],copies:1})}>
              <Text style={styles.previewCancelTxt}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewPrintBtn} onPress={handleConfirmPrint}>
              <Text style={styles.previewPrintTxt}>🖨️ ΕΚΤΥΠΩΣΗ {copies===4?'(4 ΑΝΤΙΓΡΑΦΑ)':''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Οπτική σήμανση: tick για κάθε επένδυση (μέσα/έξω) — δεν επηρεάζει τη φάση
  const toggleCoatingCheck = async (orderId, idx) => {
    const order = specialOrders.find(o => o.id === orderId);
    if (!order) return;
    const checks = { ...(order.coatingChecks || {}) };
    const k = String(idx);
    checks[k] = !checks[k];
    const upd = { ...order, coatingChecks: checks };
    setSpecialOrders(prev => prev.map(o => o.id === orderId ? upd : o));
    await syncToCloud(upd);
  };

  // Άμεση μεταφορά μιας PROD παραγγελίας στα ΕΤΟΙΜΑ (από το κίτρινο badge)
  const transferOrderToReady = (orderId) => {
    const order = specialOrders.find(o => o.id === orderId);
    if (!order) return;
    const hasStaveraItems = order.stavera && order.stavera.filter(s => s.dim).length > 0;
    const staveraPending = hasStaveraItems && !order.staveraDone;
    const glassPending = isGlassPending(order);
    const anyPending = staveraPending || glassPending;
    const pendingLabel = staveraPending && glassPending ? 'σταθερό και τζάμι'
                       : staveraPending ? 'σταθερό' : 'τζάμι';
    setConfirmModal({
      visible: true,
      title: anyPending ? `⚠️ ΕΚΚΡΕΜΕΙ ${pendingLabel.toUpperCase()}` : '✅ ΟΛΟΚΛΗΡΩΣΗ ΠΑΡΑΓΩΓΗΣ',
      message: anyPending
        ? `Παραγγελία #${order.orderNo}: Όλες οι φάσεις παραγωγής ολοκληρώθηκαν.\n\nΕκκρεμεί ${pendingLabel} — η πόρτα κατεβαίνει στην αποθήκη και το ${pendingLabel} μένει σε εξέλιξη.`
        : `Η παραγγελία #${order.orderNo} μεταφέρεται στα ΕΤΟΙΜΑ.`,
      confirmText: anyPending ? '📦 ΚΑΤΕΒΑΣΗ ΣΤΗΝ ΑΠΟΘΗΚΗ' : '📦 ΕΠΙΒΕΒΑΙΩΣΗ',
      onConfirm: async () => {
        const upd = { ...order, status:'READY', readyAt:Date.now(),
          ...(staveraPending && { staveraPendingAtReady:true }),
          ...(glassPending && { glassPendingAtReady:true }) };
        setSpecialOrders(prev => prev.map(o => o.id === orderId ? upd : o));
        await syncToCloud(upd);
        await logActivity('ΕΙΔΙΚΗ',
          anyPending ? `Φάση → ΕΤΟΙΜΟ (εκκρεμές ${pendingLabel})` : 'Φάση → ΕΤΟΙΜΟ (όλες done)',
          { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
      }
    });
  };

  // Τσεκάρισμα ολοκλήρωσης φάσης — αν όλες done → ΕΤΟΙΜΑ
  const handlePhaseDone = async (orderId, phaseKey) => {
    let order = specialOrders.find(o=>o.id===orderId); if(!order||!order.phases) return;
    // Backward compat: αν το phase δεν υπάρχει, το δημιουργούμε πριν το done
    if (!order.phases[phaseKey]) {
      const defaultActive = phaseKey === 'epend'
        ? !!(order.coatings && order.coatings.length > 0)
        : true;
      if (!defaultActive) return; // δεν αφορά αυτή την παραγγελία
      order = {...order, phases: {...order.phases, [phaseKey]: { active: defaultActive, printed: false, done: false }}};
    }
    if (phaseKey==='montDoor') {
      const prevPhases = ['laser','cases','montSasi','vafio'];
      const notDone = prevPhases.filter(k => order.phases?.[k]?.active && !order.phases?.[k]?.done);
      if (notDone.length > 0) {
        const labels = { laser:'LASER ΚΟΠΕΣ', cases:'ΚΑΣΕΣ', montSasi:'ΚΑΤΑΣΚΕΥΗ ΣΑΣΙ', vafio:'ΒΑΦΕΙΟ' };
        const names = notDone.map(k=>labels[k]).join(', ');
        setConfirmModal({
          visible: true,
          title: '⚠️ Δεν μπορεί να γίνει DONE',
          message: `Δεν έχουν ολοκληρωθεί:\n${names}\n\nΟλοκλήρωσε πρώτα αυτές τις φάσεις.`,
          confirmText: 'ΟΚ',
          onConfirm: null
        });
        return;
      }
      // ΑΛΛΑΓΗ 3: αν η παραγγελία έχει coatings, το 'epend' πρέπει να είναι done
      if (order.coatings && order.coatings.length > 0) {
        const ependPhase = order.phases?.['epend'];
        const ependDone = ependPhase ? ependPhase.done : false;
        if (!ependDone) {
          setConfirmModal({
            visible: true,
            title: '⚠️ Δεν μπορεί να γίνει DONE',
            message: 'Η παραγγελία έχει επενδύσεις.\nΟλοκλήρωσε πρώτα τη φάση ΕΠΕΝΔΥΣΕΙΣ.',
            confirmText: 'ΟΚ',
            onConfirm: null
          });
          return;
        }
      }
    }
    const newPhases = {...order.phases, [phaseKey]:{...order.phases[phaseKey], done:true}};
    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label?.replace(/🔴|🟡|🔵|🟢|⚫/g,'').trim() || phaseKey;
    // Backward compat για παλιές παραγγελίες με "phantom" active phases:
    // - epend χωρίς coatings -> αγνόησε
    // - montDoor χωρίς installation -> αγνόησε
    const hasCoatingsCheck = !!(order.coatings && order.coatings.filter(c => c && String(c).trim()).length > 0);
    const hasInstallationCheck = order.installation === 'ΝΑΙ';
    const allDone = Object.keys(newPhases).every(k => {
      if (k === 'epend'    && !hasCoatingsCheck)     return true;
      if (k === 'montDoor' && !hasInstallationCheck) return true;
      return !newPhases[k].active || newPhases[k].done;
    });
    const hasStavera = order.stavera && order.stavera.filter(s=>s.dim).length > 0;
    const staveraPending = hasStavera && !order.staveraDone;
    const glassPending = isGlassPending(order);
    const anyPending = staveraPending || glassPending;
    const pendingLabel = staveraPending && glassPending ? 'σταθερό και τζάμι'
                       : staveraPending ? 'σταθερό' : 'τζάμι';

    if (allDone) {
      if (anyPending) {
        setConfirmModal({
          visible: true,
          title: `⚠️ ΕΚΚΡΕΜΕΙ ${pendingLabel.toUpperCase()}`,
          message: `Όλες οι φάσεις παραγωγής ολοκληρώθηκαν.\n\nΕκκρεμεί ${pendingLabel} — η παραγγελία θα κατέβει στην αποθήκη και το ${pendingLabel} θα παραμείνει σε εξέλιξη.`,
          confirmText: '📦 ΚΑΤΕΒΑΣΗ ΣΤΗΝ ΑΠΟΘΗΚΗ',
          onConfirm: async () => {
            const upd = {...order, phases:newPhases, status:'READY', readyAt:Date.now(),
              ...(staveraPending && { staveraPendingAtReady:true }),
              ...(glassPending && { glassPendingAtReady:true })};
            setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
            await syncToCloud(upd);
            await logActivity('ΕΙΔΙΚΗ', `Φάση → ΕΤΟΙΜΟ (εκκρεμές ${pendingLabel})`, { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
          }
        });
      } else {
        setConfirmModal({
          visible: true,
          title: '✅ ΟΛΟΚΛΗΡΩΣΗ ΠΑΡΑΓΩΓΗΣ',
          message: `Ολοκληρώνεται η διαδικασία παραγωγής.\nΗ παραγγελία #${order.orderNo} μεταφέρεται στην ΑΠΟΘΗΚΗ.`,
          confirmText: '📦 ΕΠΙΒΕΒΑΙΩΣΗ',
          onConfirm: async () => {
            const upd = {...order, phases:newPhases, status:'READY', readyAt:Date.now()};
            setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
            await syncToCloud(upd);
            await logActivity('ΕΙΔΙΚΗ', 'Φάση → ΕΤΟΙΜΟ (όλες done)', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
          }
        });
      }
    } else {
      const upd = {...order, phases:newPhases};
      setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
      await syncToCloud(upd);
      await logActivity('ΕΙΔΙΚΗ', `Φάση ✓ ${phaseLabel}`, { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
    }
  };

  // Αναίρεση ολοκλήρωσης φάσης
  const handlePhaseUndone = async (orderId, phaseKey) => {
    const order = specialOrders.find(o=>o.id===orderId); if(!order||!order.phases) return;
    // Backward compat: για epend, αν η παραγγελία έχει coatings → active πάντα true
    const existingPhase = order.phases[phaseKey] || { active: true, printed: false, done: false };
    const forceActive = phaseKey === 'epend' && !!(order.coatings && order.coatings.length > 0);
    const updatedPhase = { ...existingPhase, done: false, active: forceActive ? true : existingPhase.active };
    const upd = {...order, phases:{...order.phases, [phaseKey]: updatedPhase}};
    setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Έναρξη παραγωγής
  const handleDipliStart = async (order) => {
    const dipliPhases = {};
    DIPLI_PHASES.forEach(ph => {
      if (ph.key==='montDoor' && order.installation!=='ΝΑΙ') {
        dipliPhases[ph.key] = { active:false, done:false };
      } else {
        dipliPhases[ph.key] = { active:true, done:false };
      }
    });
    const upd = {...order, status:'DIPLI_PROD', dipliPhases, dipliStartAt:Date.now()};
    setSpecialOrders(specialOrders.map(o=>o.id===order.id?upd:o));
    await syncToCloud(upd);
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Ολοκλήρωση φάσης
  const handleDipliPhaseDone = async (orderId, phaseKey) => {
    const order = specialOrders.find(o=>o.id===orderId); if(!order||!order.dipliPhases) return;
    const newPhases = {...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:true}};
    const allPhasesDone = Object.keys(newPhases).every(k => !newPhases[k].active || newPhases[k].done);
    const upd = {...order, dipliPhases:newPhases};
    setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
    // Αν όλες οι φάσεις done → ελέγχω αν υπάρχει κάσα (θα γίνει αυτόματα στο render)
    // Το πέρασμα στα ΕΤΟΙΜΑ γίνεται αυτόματα από το render όταν allPhasesDone && hasCase
  };

  // ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ — Αναίρεση φάσης
  const handleDipliPhaseUndone = async (orderId, phaseKey) => {
    const order = specialOrders.find(o=>o.id===orderId); if(!order||!order.dipliPhases) return;
    const upd = {...order, dipliPhases:{...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:false}}};
    setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
  };
  const removeFromPhase = (orderId, phaseKey) => {
    Alert.alert("Αφαίρεση","Αφαίρεση από αυτή τη φάση παραγωγής;",[
      {text:"Όχι"},
      {text:"Ναι", onPress: async () => {
        const order = specialOrders.find(o=>o.id===orderId); if(!order) return;
        const upd = {...order, phases:{...order.phases, [phaseKey]:{...order.phases[phaseKey], active:false}}};
        setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
        await syncToCloud(upd);
      }}
    ]);
  };

  const cancelOrder = (id) => {
    const doCancel = async () => {
      const order = specialOrders.find(o=>o.id===id);
      setSpecialOrders(specialOrders.filter(o=>o.id!==id));
      await deleteFromCloud(id);
      if (!order || order.orderType!=='ΤΥΠΟΠΟΙΗΜΕΝΗ') return;
      const customer = order.customer || `#${order.orderNo}`;
      const orderQty = parseInt(order.qty)||1;
      const isMoni = order.sasiType==='ΜΟΝΗ ΘΩΡΑΚΙΣΗ' || !order.sasiType;
      const removeRes = async (stockOrders, setStockOrders, firebasePath) => {
        const sameSize = s => String(s.selectedHeight)===String(order.h) && String(s.selectedWidth)===String(order.w) && s.side===order.side;
        let target = stockOrders.find(s=>sameSize(s)&&s.autoNote&&s.autoNote.includes(customer));
        if (!target) target = stockOrders.find(s=>sameSize(s)&&s.status!=='SOLD');
        if (!target) return;
        const customerMap = {};
        if (target.autoNote) {
          target.autoNote.split(',').forEach(entry => {
            const match = entry.trim().match(/^(.+)\s+\((\d+)τεμ\)$/);
            if (match) customerMap[match[1].trim()] = (customerMap[match[1].trim()]||0) + parseInt(match[2]);
          });
        }
        if (customerMap[customer]) { customerMap[customer] -= orderQty; if (customerMap[customer]<=0) delete customerMap[customer]; }
        const newNote = Object.entries(customerMap).map(([n,q])=>`${n} (${q}τεμ)`).join(', ');
        const hasRes = newNote.trim().length > 0;
        const upd = {...target, autoNote: newNote, isAuto: hasRes};
        setStockOrders(prev=>prev.map(s=>s.id===target.id?upd:s));
        await fetch(`${FIREBASE_URL}/${firebasePath}/${upd.id}.json`,{method:'PUT',body:JSON.stringify(upd)});
      };
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Οριστική διαγραφή παραγγελίας;")) doCancel();
    } else {
      Alert.alert("Ακύρωση","Οριστική διαγραφή;",[{text:"Όχι"},{text:"Ναι",style:"destructive",onPress:doCancel}]);
    }
  };
  const deleteFromArchive = (id) => setArchiveDeleteModal({ visible:true, orderId:id, pwd:'', error:false });
  const confirmDeleteFromArchive = async (id) => {
    setSoldSpecialOrders(soldSpecialOrders.filter(o=>o.id!==id));
    await deleteFromCloud(id);
  };
  const returnToReady = async (id) => {
    const order = soldSpecialOrders.find(o=>o.id===id);
    if (!order) return;
    const upd = {...order, status:'READY', soldAt:null};
    setSoldSpecialOrders(soldSpecialOrders.filter(o=>o.id!==id));
    setSpecialOrders([upd, ...specialOrders]);
    await syncToCloud(upd);
  };
  const updateSaleNote = async (order, text) => {
    const isArchive = order.status === 'SOLD';
    const upd = {...order, saleNote: text};
    if (isArchive) {
      setSoldSpecialOrders(prev=>prev.map(o=>o.id===order.id?upd:o));
    } else {
      setSpecialOrders(prev=>prev.map(o=>o.id===order.id?upd:o));
    }
    await fetch(`${FIREBASE_URL}/special_orders/${order.id}.json`, { method:'PATCH', body:JSON.stringify({saleNote:text}) });
  };

  const toggleSection = (s) => { setActiveSection(s); };

  // Helper: highlight κειμένου — επιστρέφει <Text> με μπλε spans στα matching
  const highlightText = (text, query, baseStyle={}) => {
    if (!text) return null;
    const str = String(text);
    if (!query || !query.trim()) return <Text style={baseStyle}>{str}</Text>;
    const q = query.trim();
    const idx = str.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <Text style={baseStyle}>{str}</Text>;
    return (
      <Text style={baseStyle}>
        {str.slice(0, idx)}
        <Text style={{color:'#007AFF', fontWeight:'bold', backgroundColor:'#e3f0ff'}}>{str.slice(idx, idx + q.length)}</Text>
        {str.slice(idx + q.length)}
      </Text>
    );
  };

  const renderNotesWithWarning = (notes, baseStyle, prefix='', searchQuery='') => {
    if (!notes) return null;
    const idx = String(notes).indexOf(PEEPHOLE_WARN_NOTE);
    if (idx === -1) return highlightText(`${prefix}${notes}`, searchQuery, baseStyle);
    return (
      <Text style={baseStyle}>
        {prefix}{notes.slice(0, idx)}
        <Text style={{color:'#c62828', fontWeight:'bold', fontSize:17}}>{PEEPHOLE_WARN_NOTE}</Text>
        {notes.slice(idx + PEEPHOLE_WARN_NOTE.length)}
      </Text>
    );
  };

  // Helper: φιλτράρισμα παραγγελιών με contains, case-insensitive, σε όλα τα πεδία
  const matchesSearch = (order, query) => {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    const fields = [
      order.orderNo,
      order.customer,
      order.h,
      order.w,
      order.lock,
      order.notes,
      order.hardware,
      order.caseMaterial,
      order.glassDim,
      order.glassNotes,
      order.deliveryDate,
      (order.coatings || []).join(' '),
      (order.stavera || []).map(s => (s.dim || '') + ' ' + (s.qty || '') + ' ' + (s.note || '')).join(' '),
    ];
    return fields.some(f => f && String(f).toLowerCase().includes(q));
  };

  const renderOrderCard = (order, isArchive=false, isInPending=false, searchQuery='') => {
    const isProd = order.status==='PROD';
    const bc = isArchive?'#333':(isProd?'#2e7d32':order.status==='PENDING'?'#ff4444':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'SOLD';
    const btn  = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΠΩΛΗΣΗ');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#222');
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    const isReadyForTransfer = isOrderReadyForTransfer(order);
    const cust = !isArchive ? findCustomerOf(order) : null;
    const viberBlocked = !!pickViberPhone(cust) && !!cust?.viberOptOut;
    const viberOk = !!pickViberPhone(cust) && !cust?.viberOptOut;
    const emailOk = !!cust?.email;
    const smsOk = !!pickSmsPhone(cust);
    const anyChannel = viberOk || viberBlocked || emailOk || smsOk;
    const notif = order.notified || {};
    const msgStatus = order.msgStatus || {};
    const shortDate = (ts) => ts ? `${String(new Date(ts).getDate()).padStart(2,'0')}/${String(new Date(ts).getMonth()+1).padStart(2,'0')}` : '';
    const statusMark = (ch) => { const s = msgStatus[ch]?.status; if (s==='read') return <Text style={{color:'#4fc3f7', fontSize:10, fontWeight:'bold'}}>✓✓</Text>; if (s==='delivered') return <Text style={{color:'#cfd8dc', fontSize:10, fontWeight:'bold'}}>✓✓</Text>; if (s==='failed') return <Text style={{color:'#ffcdd2', fontSize:10, fontWeight:'bold'}}>✕</Text>; return null; };
    return (
        <TouchableOpacity key={order.id} onLongPress={()=>!isArchive&&order.status==='PENDING'&&editOrder(order)} delayLongPress={1000} activeOpacity={0.7} style={[styles.orderCard,{borderLeftColor:bc, backgroundColor: isProd?'#e8f5e9':'white', ...(searchQuery && {borderTopWidth:2, borderTopColor:'#007AFF', borderBottomWidth:2, borderBottomColor:'#007AFF', borderRightWidth:2, borderRightColor:'#007AFF'})}]}>
        <View style={[styles.cardContent, {flexDirection:'row'}]}>
          {/* ΣΤΗΛΗ 1 */}
          <View style={{flexShrink:1}}>
            {isProd&&<View style={{backgroundColor:'#2e7d32', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>⚙️ ΣΤΗΝ ΠΑΡΑΓΩΓΗ</Text>
            </View>}
            {order.staveraPendingAtReady&&!order.staveraDone&&<View style={{backgroundColor:'#e65100', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>⏳ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ</Text>
            </View>}
            {highlightText('#'+order.orderNo, searchQuery, {fontSize:24,fontWeight:'900',color:'#1a1a1a',letterSpacing:1,marginBottom:2})}
            {order.customer?highlightText('👤 '+order.customer, searchQuery, {fontSize:17,fontWeight:'bold',color:'#333',marginBottom:3}):null}
            <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginBottom:3}}>
              {highlightText(`${order.h}x${order.w}`, searchQuery, [styles.cardDetails,{fontSize:14}])}
              {order.qty&&parseInt(order.qty)>1?<Text style={{fontWeight:'900',fontSize:17,color:'#cc0000'}}>{order.qty}τεμ</Text>:null}
              <Text style={[styles.cardDetails,{fontSize:14}]}>{order.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}</Text>
              {!isStd?<Text style={[styles.cardDetails,{fontSize:14}]}>{(order.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ')?'Δ/Θ':'Μ/Θ'}</Text>:null}
              {order.hardware?highlightText(order.hardware, searchQuery, [styles.cardDetails,{fontSize:14,color:'#555'}]):null}
            </View>
            {!isStd&&highlightText(`Μεντ: ${order.hinges}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {isStd&&order.hardware?<Text style={[styles.cardSubDetails,{fontSize:13}]}>{order.hardware}</Text>:null}
            {(isStd||!isStd)&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          </View>

          {/* ΚΕΝΟ ΔΙΑΧΩΡΙΣΤΙΚΟ */}
          <View style={{width:24}}/>

          {/* ΣΤΗΛΗ 2 */}
          <View style={{flex:1}}>
            <Text style={[styles.cardSubDetails,{fontSize:13}]}>Κλειδ: <Text style={lockStyle(order.lock,13)}>{order.lock||'—'}</Text></Text>
            {!isStd&&highlightText(`Κάσα: ${order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | ${order.caseMaterial||'DKP'}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&highlightText(`📐 Σταθ: ${order.stavera.filter(s=>s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+s.dim+(s.note?' '+s.note:'')).join(' | ')}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {!isStd&&(order.glassDim||order.glassNotes)&&highlightText(`🪟 Τζ: ${order.glassDim||''}${order.glassNotes?' '+order.glassNotes:''}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {isStd&&order.heightReduction?<Text style={[styles.cardSubDetails,{fontSize:13,color:'#b71c1c',fontWeight:'bold'}]}>📏 ΜΕΙΩΣΗ ΥΨΟΥΣ: {order.heightReduction} cm</Text>:null}
            {order.coatings&&order.coatings.length>0&&(
              <Text style={[styles.cardSubDetails,{fontSize:13,color:'#007AFF'}]}>
                {'🎨 '}
                {order.coatings.map((n,i)=>(<Text key={i} style={[{fontSize:13,color:'#007AFF'}, coatingStyle(n,13)]}>{i>0?', ':''}{n}</Text>))}
              </Text>
            )}
            {renderNotesWithWarning(order.notes, [styles.cardSubDetails,{fontSize:13}], 'Σημ: ', searchQuery)}
            <View style={styles.datesRow}>
              {fmtDate(order.createdAt)&&<Text style={[styles.dateChip,{fontSize:12}]}>📅 {fmtDate(order.createdAt)}</Text>}
              {order.deliveryDate?<Text style={[styles.dateChip,{fontSize:12,backgroundColor:'#fff3e0',color:'#e65100'}]}>🚚 {order.deliveryDate}</Text>:null}
              {fmtDate(order.prodAt)&&<Text style={[styles.dateChip,{fontSize:12}]}>🔨 {fmtDate(order.prodAt)}</Text>}
              {fmtDate(order.readyAt)&&<Text style={[styles.dateChip,{fontSize:12}]}>✅ {fmtDate(order.readyAt)}</Text>}
            </View>
            <PhaseBadges order={order} />
            {isReadyForTransfer && <View style={{marginTop:8}}><BlinkingReadyBadge onPress={()=>transferOrderToReady(order.id)} /></View>}
          </View>
        </View>
        {!isArchive && anyChannel && (
          <View style={{justifyContent:'center', paddingHorizontal:6, paddingVertical:6, borderRightWidth:1, borderRightColor:'#e0e0e0', gap:4, minWidth:95}}>
            <TouchableOpacity disabled={!viberOk} onPress={()=>confirmSend('viber',order,()=>notifyViber(order))} onLongPress={()=>clearNotified(order.id,'viber')} delayLongPress={2000} style={{backgroundColor: viberBlocked?'#b71c1c':(viberOk?'#7360f2':'#ddd'), borderRadius:6, paddingVertical:5, paddingHorizontal:6, alignItems:'center'}}>
              <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>{viberBlocked?'🚫 ':notif.viber?'✓ ':'📞 '}Viber</Text>
              {!viberBlocked && notif.viber && <View style={{flexDirection:'row', alignItems:'center', gap:3}}><Text style={{color:'#fff', fontSize:9}}>{shortDate(notif.viber)}</Text>{statusMark('viber')}</View>}
              {viberBlocked && <Text style={{color:'#fff', fontSize:9}}>απεγγράφηκε</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={!emailOk} onPress={()=>confirmSend('email',order,()=>notifyEmail(order))} onLongPress={()=>clearNotified(order.id,'email')} delayLongPress={2000} style={{backgroundColor: emailOk?'#0288d1':'#ddd', borderRadius:6, paddingVertical:5, paddingHorizontal:6, alignItems:'center'}}>
              <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>{notif.email?'✓ ':'✉️ '}Email</Text>
              {notif.email && <Text style={{color:'#fff', fontSize:9}}>{shortDate(notif.email)}</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={!smsOk} onPress={()=>confirmSend('sms',order,()=>notifySms(order))} onLongPress={()=>clearNotified(order.id,'sms')} delayLongPress={2000} style={{backgroundColor: smsOk?'#1565C0':'#ddd', borderRadius:6, paddingVertical:5, paddingHorizontal:6, alignItems:'center'}}>
              <Text style={{color:'white', fontSize:11, fontWeight:'bold'}}>{notif.sms?'✓ ':'📱 '}SMS</Text>
              {notif.sms && <View style={{flexDirection:'row', alignItems:'center', gap:3}}><Text style={{color:'#fff', fontSize:9}}>{shortDate(notif.sms)}</Text>{statusMark('sms')}</View>}
            </TouchableOpacity>
          </View>
        )}
        {(isArchive||order.status==='READY')&&(
          <TextInput
            style={{flex:1, marginHorizontal:6, marginVertical:8, backgroundColor:'#fffde7', borderRadius:8, borderWidth:1, borderColor:'#ffe082', padding:8, fontSize:12, color:'#5d4037', minHeight:60, textAlignVertical:'top'}}
            placeholder="📝 Σημείωση..."
            placeholderTextColor="#bbb"
            multiline
            value={order.saleNote||''}
            onChangeText={text=>updateSaleNote(order, text)}
          />
        )}
        {order.programNo&&(
          <View style={{justifyContent:'center', alignItems:'center', paddingHorizontal:8, borderRightWidth:1, borderRightColor:'#e0e0e0', backgroundColor:'#fff8e1', minWidth:52}}>
            <View style={isUrgentProgram(order.programNo) ? {borderWidth:3, borderColor:'#e65100', borderRadius:4, paddingHorizontal:3, paddingVertical:1, alignItems:'center'} : {alignItems:'center'}}>
              <Text style={{fontSize:18, fontWeight:'900', color:'#e65100', letterSpacing:1}}>{order.programNo}</Text>
              <Text style={{fontSize:9, color:'#999', fontWeight:'bold'}}>ΠΡΟΓΡ.</Text>
            </View>
          </View>
        )}
        <View style={styles.sideBtnContainer}>
          {!isArchive&&(order.status==='PENDING'||order.status==='PROD')&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:'#007AFF'}]} delayLongPress={2000} onLongPress={()=>{ setEditForm({ deliveryDate:order.deliveryDate||'', lock:order.lock||'', glassDim:order.glassDim||'', glassNotes:order.glassNotes||'', hardware:order.hardware||'', coatings:order.coatings||[], stavera:order.stavera||[], notes:order.notes||'' }); setEditModal({visible:true,order}); }} onPress={()=>{ if(Platform.OS==='web') window.alert('Κράτα πατημένο 2 δευτερόλεπτα για επεξεργασία'); }}><Text style={[styles.upperBtnText,{color:'white'}]}>✏️</Text></TouchableOpacity>}
          {!isArchive&&!(isInPending&&order.status==='READY'&&order.staveraPendingAtReady&&!order.staveraDone)&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:order.status==='PENDING'?'#000':'#666'}]} onPress={()=>order.status==='PENDING'?cancelOrder(order.id):moveBack(order.id,order.status)}><Text style={[styles.upperBtnText,{color:order.status==='PENDING'?'#ff4444':'white'}]}>{order.status==='PENDING'?'ΑΚΥΡΩΣΗ':'⟲'}</Text></TouchableOpacity>}
          {isArchive&&(
            <TouchableOpacity
              style={[styles.upperBtn,{backgroundColor:'#555'}]}
              onLongPress={()=>setArchiveReturnModal({visible:true, orderId:order.id})}
              delayLongPress={2000}>
              <Text style={[styles.upperBtnText,{color:'white'}]}>⟲</Text>
            </TouchableOpacity>
          )}
          {order.status!=='PROD'&&!(isInPending&&order.status==='READY'&&order.staveraPendingAtReady&&!order.staveraDone)&&!isArchive&&<TouchableOpacity style={[styles.lowerBtn,{backgroundColor:btnC}, order.status==='PENDING'&&prodBatch.some(o=>o.id===order.id)&&{borderWidth:3, borderColor:'#ff4444'}]} onPress={()=>{
            if (order.status==='PENDING') {
              // Αντί για άμεση μετάβαση → προσθήκη στο prodBatch
              const alreadyIn = prodBatch.some(o=>o.id===order.id);
              if (alreadyIn) {
                setProdBatch(prev=>prev.filter(o=>o.id!==order.id));
              } else {
                setProdBatch(prev=>[...prev, order]);
              }
            } else {
              updateStatus(order.id, next);
            }
          }}><Text style={styles.sideBtnText}>{prodBatch.some(o=>o.id===order.id)?'✓ ΕΠΙΛΕΓΗ':btn}</Text></TouchableOpacity>}
          {isArchive&&(
            <TouchableOpacity
              style={[styles.lowerBtn,{backgroundColor:'#b71c1c'}]}
              onLongPress={()=>deleteFromArchive(order.id)}
              delayLongPress={2000}>
              <Text style={styles.sideBtnText}>ΔΙΑ/ΦΗ</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Κάρτα πόρτας μέσα σε υποκαρτέλα παραγωγής
  const renderProdPhaseCard = (order, phaseKey, searchQuery='') => {
    // Backward compatibility: αν το phase δεν υπάρχει (παλιές παραγγελίες)
    // Για 'epend': active μόνο αν η παραγγελία έχει coatings (μη κενά)
    const hasCoatings = !!(order.coatings && order.coatings.filter(c => c && String(c).trim()).length > 0);
    const hasInstallation = order.installation === 'ΝΑΙ';
    const defaultActive =
      phaseKey === 'epend'    ? hasCoatings :
      phaseKey === 'montDoor' ? hasInstallation :
      true;
    let phase = order.phases?.[phaseKey] ?? { active: defaultActive, printed: false, done: false };
    // Fix: αν epend υπάρχει αλλά active=false ενώ έχει coatings → διόρθωση
    if (phaseKey === 'epend' && hasCoatings && phase && !phase.active) {
      phase = { ...phase, active: true };
    }
    if (!phase.active) return null;
    // Επιπλέον φίλτρο για backward compat:
    // - epend: δεν εμφανίζεται αν δεν έχει πραγματικά coatings
    // - montDoor: δεν εμφανίζεται αν installation !== 'ΝΑΙ'
    if (phaseKey === 'epend'    && !hasCoatings)     return null;
    if (phaseKey === 'montDoor' && !hasInstallation) return null;
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    const isSelected = !!printSelected[order.id];
    return (
      <View key={order.id} style={[styles.phaseCard, phase.done&&styles.phaseCardDone]}>
        {/* CHECKBOX ΕΠΙΛΟΓΗΣ — πάντα ορατό */}
        <TouchableOpacity style={styles.printCheck} onPress={()=>setPrintSelected(p=>({...p,[order.id]:!p[order.id]}))}>
          <View style={[styles.checkbox, isSelected&&styles.checkboxSelected]}>
            {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
          </View>
        </TouchableOpacity>
        {phase.printed && (
          <View style={styles.printedBadge}>
            <Text style={styles.printedBadgeTxt}>🖨️</Text>
          </View>
        )}

        {/* ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ — 2 στήλες */}
        <View style={{flex:1, paddingHorizontal:8, flexDirection:'row'}}>
          {/* ΣΤΗΛΗ 1: αριθμός, πελάτης, διαστάσεις, μεντ/τζάμι/κλειδ, κάσα, μονταρισμα */}
          <View style={{flexShrink:1}}>
            {highlightText('#'+order.orderNo, searchQuery, [styles.cardDetails,{fontWeight:'bold',fontSize:14}])}
            {order.customer?highlightText('👤 '+order.customer, searchQuery, [styles.cardSubDetails,{marginTop:2,fontSize:13}]):null}
            {highlightText(`${order.h}x${order.w} | ${order.side}${!isStd?` | ${order.armor} ΘΩΡ.`:''}`, searchQuery, [styles.cardDetails,{fontSize:14}])}
            {!isStd&&(
              <Text style={[styles.cardSubDetails,{fontSize:13}]}>
                Μεντ: {order.hinges}
                {(order.glassDim||order.glassNotes)?` | Τζ: ${order.glassDim||''}${order.glassNotes?' '+order.glassNotes:''}`:''}
                {' | Κλειδ: '}
                <Text style={lockStyle(order.lock,13)}>{order.lock||'—'}</Text>
              </Text>
            )}
            {!isStd&&highlightText(`Κάσα: ${order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | ${order.caseMaterial||'DKP'} | ${order.hardware||'—'}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {isStd&&highlightText(order.hardware||'', searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {(isStd||!isStd)&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          </View>

          {/* ΚΕΝΟ ΔΙΑΧΩΡΙΣΤΙΚΟ */}
          <View style={{width:24}}/>

          {/* ΣΤΗΛΗ 2: σταθερό, τεμάχια, επενδύσεις, παρατηρήσεις, done, ημερομηνίες */}
          <View style={{flex:1}}>
            {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&highlightText(`📐 Σταθ: ${order.stavera.filter(s=>s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+s.dim+(s.note?' '+s.note:'')).join(' | ')}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {order.qty&&parseInt(order.qty)>1?<Text style={[styles.cardSubDetails,{color:'#007AFF',fontWeight:'bold',fontSize:13}]}>Τεμ: {order.qty}</Text>:null}
            {order.coatings&&order.coatings.length>0&&(
              <Text style={[styles.cardSubDetails,{color:'#007AFF',fontSize:13}]}>
                {'🎨 '}
                {order.coatings.map((n,i)=>(<Text key={i} style={[{fontSize:13,color:'#007AFF'}, coatingStyle(n,13)]}>{i>0?', ':''}{n}</Text>))}
              </Text>
            )}
            {renderNotesWithWarning(order.notes, [styles.cardSubDetails,{color:'#b71c1c',fontWeight:'bold',fontSize:13}], '📝 ', searchQuery)}
            {phase.done&&<Text style={[styles.doneTxt,{fontSize:15, color:'#00C851', fontWeight:'900'}]}>✅ Ολοκληρώθηκε</Text>}
            {order.prodAt&&<Text style={{fontSize:12,color:'#666',marginTop:4}}>📥 Είσοδος: {fmtDateTime(order.prodAt)}</Text>}
            {order.deliveryDate?<Text style={{fontSize:12,color:'#e65100',fontWeight:'bold'}}>🚚 Παράδοση: {order.deliveryDate}</Text>:null}
          </View>
        </View>

        {/* ΑΡΙΘΜΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ */}
        {order.programNo&&(
          <View style={{justifyContent:'center', alignItems:'center', paddingHorizontal:8, borderRightWidth:1, borderRightColor:'#e0e0e0', backgroundColor:'#fff8e1', minWidth:52}}>
            <View style={isUrgentProgram(order.programNo) ? {borderWidth:3, borderColor:'#e65100', borderRadius:4, paddingHorizontal:3, paddingVertical:1, alignItems:'center'} : {alignItems:'center'}}>
              <Text style={{fontSize:18, fontWeight:'900', color:'#e65100', letterSpacing:1}}>{order.programNo}</Text>
              <Text style={{fontSize:9, color:'#999', fontWeight:'bold'}}>ΠΡΟΓΡ.</Text>
            </View>
          </View>
        )}

        {/* ΚΟΥΜΠΙΑ ΔΕΞΙΑ */}
        <View style={{justifyContent:'space-between', paddingVertical:4, gap:4}}>
          <TouchableOpacity
            style={{backgroundColor:'#007AFF', borderRadius:6, padding:8, alignItems:'center', minWidth:50}}
            delayLongPress={2000}
            onLongPress={()=>{ setEditForm({ deliveryDate:order.deliveryDate||'', lock:order.lock||'', glassDim:order.glassDim||'', glassNotes:order.glassNotes||'', hardware:order.hardware||'', coatings:order.coatings||[], stavera:order.stavera||[], notes:order.notes||'' }); setEditModal({visible:true,order}); }}
            onPress={()=>{ if(Platform.OS==='web') window.alert('Κράτα πατημένο 2 δευτερόλεπτα για επεξεργασία'); }}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✏️</Text>
          </TouchableOpacity>
          {/* DONE + οπτικά ticks επενδύσεων αριστερά (μόνο για ΕΠΕΝΔΥΣΕΙΣ με 2+ επενδύσεις) */}
          <View style={{flexDirection:'row', alignItems:'stretch', gap:4}}>
            {phaseKey === 'epend' && (order.coatings||[]).filter(c=>c&&String(c).trim()).length >= 2 && (
              <View style={{flexDirection:'column', gap:3, justifyContent:'space-between'}}>
                {[0,1].map(i => {
                  const checked = phase.done || !!(order.coatingChecks && order.coatingChecks[String(i)]);
                  return (
                    <TouchableOpacity key={i}
                      disabled={phase.done}
                      onPress={()=>toggleCoatingCheck(order.id, i)}
                      style={{flex:1, backgroundColor: checked?'#2e7d32':'#ff9800', borderRadius:6, paddingHorizontal:6, justifyContent:'center', alignItems:'center', minWidth:36, opacity: phase.done?0.6:1}}>
                      <Text style={{color:'white', fontSize:13, fontWeight:'bold'}}>{checked?'✅':'☐'}{i+1}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <TouchableOpacity
              style={[styles.doneBtn, phase.done && styles.doneBtnActive,
                pendingChanges.some(c=>c.orderId===order.id&&c.phaseKey===phaseKey) && {opacity:0.5, borderWidth:2, borderColor:'#FFD600'},
                lastChangedIds.some(c=>c.orderId===order.id&&c.phaseKey===phaseKey) && {borderWidth:3, borderColor:'#E53935'}
              ]}
              onPress={()=>{
                const exists = pendingChanges.find(c=>c.orderId===order.id&&c.phaseKey===phaseKey);
                if (exists) {
                  // Αν υπάρχει ήδη στο καλάθι → αφαίρεσέ το (toggle)
                  setPendingChanges(prev=>prev.filter(c=>!(c.orderId===order.id&&c.phaseKey===phaseKey)));
                } else {
                  // Πρόσθεσε στο καλάθι
                  setPendingChanges(prev=>[...prev, {
                    orderId: order.id,
                    orderNo: order.orderNo,
                    phaseKey,
                    action: phase.done ? 'undone' : 'done'
                  }]);
                }
              }}>
              <Text style={[styles.doneBtnTxt,{fontSize:12}]}>{phase.done ? '↩️\nUNDO' : '✓\nDONE'}</Text>
            </TouchableOpacity>
          </View>
          {!phase.done && (
            <TouchableOpacity style={styles.removeBtn} onPress={()=>removeFromPhase(order.id,phaseKey)}>
              <Text style={styles.removeBtnTxt}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Απλή εκτύπωση για ΚΑΤΑΧΩΡΗΜΕΝΕΣ / ΕΤΟΙΜΑ / ΑΡΧΕΙΟ — ταξινόμηση κατά αριθμό παραγγελίας
  const handleSimplePrint = async (orders, title) => {
    if (!orders.length) return Alert.alert("Προσοχή","Δεν υπάρχουν παραγγελίες για εκτύπωση.");
    const win = Platform.OS === 'web' ? window.open('', '_blank', 'width=900,height=700,left=100,top=100,resizable=yes,scrollbars=yes') : null;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
    const copyTitle = `VAICON — ${dateStr} — ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ ΠΑΡΑΓΓΕΛΙΩΝ`;
    const copies = [{ title: copyTitle, orders: sorted }];
    const html = buildPrintHTML(copies, 'laser');
    try {
      await printHTML(html, `VAICON — ${title}`, win);
    } catch(e) {
      Alert.alert("Σφάλμα","Δεν δημιουργήθηκε το PDF.");
    }
  };

  // Εκτύπωση τυποποιημένων — με στήλες ΚΑΣΑ/ΣΑΣΙ/ΜΟΝΤΑΡΙΣΜΑ
  const handleStdPrint = async (orders, title, caseReady, sasiReady, isMounting=true) => {
    if (!orders.length) return Alert.alert("Προσοχή","Δεν υπάρχουν παραγγελίες για εκτύπωση.");
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));

    // FIFO για ΚΑΣΑ/ΣΑΣΙ
    const sasiUsed={}, caseUsed={};
    const rows = sorted.map(o=>{
      const key=`${o.h}_${o.w}_${o.side}`;
      const sasiStock=(sasiReady||[]).filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
      const caseStock=(caseReady||[]).filter(s=>String(s.selectedHeight)===String(o.h)&&String(s.selectedWidth)===String(o.w)&&s.side===o.side).reduce((sum,s)=>sum+(parseInt(s.qty)||1),0);
      const hasSasi=(sasiUsed[key]||0)<sasiStock;
      const hasCase=(caseUsed[key]||0)<caseStock;
      sasiUsed[key]=(sasiUsed[key]||0)+1;
      caseUsed[key]=(caseUsed[key]||0)+1;
      const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
      const kasaStatus = hasCase?'✓':'✗';
      const sasiStatus = hasSasi?'✓':'✗';
      const montStatus = o.installation==='ΝΑΙ'?'ΝΑΙ':'ΟΧΙ';
      return `<tr>
        <td style="font-weight:bold;font-size:13px">${o.orderNo||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${o.customer||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${o.h||'—'}x${o.w||'—'}</td>
        <td style="font-weight:bold;font-size:13px">${fora}</td>
        <td>${o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</td>
        <td>${o.caseType||'—'}</td>
        <td>${o.hardware||'—'}</td>
        <td style="text-align:center;font-weight:bold;color:${hasCase?'#155724':'#721c24'}">${kasaStatus}</td>
        <td style="text-align:center;font-weight:bold;color:${hasSasi?'#155724':'#721c24'}">${sasiStatus}</td>
        <td style="text-align:center;font-weight:bold">${montStatus}</td>
        ${isMounting?`<td>${coatingsHtml(o.coatings)}</td>`:''}
        <td>${o.deliveryDate||'—'}</td>
        <td style="min-width:140px">${formatNotesHtml(o.notes)}</td>
      </tr>`;
    }).join('');

    const tableCSS = `
      body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
      h1{font-size:15px;margin-bottom:2px;font-weight:bold;}
      h2{font-size:11px;margin-top:0;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;}
      td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:top;}
      tr:last-child td{border-bottom:2px solid #000;}
      @media print{@page{size:A4 landscape;margin:5mm;}*{color:#000!important;background:#fff!important;}}
    `;
    const html = `<html><head><meta charset="utf-8"><style>${tableCSS}</style></head><body>
      <h1>VAICON — ${dateStr} — ${title}</h1>
      <h2>Σύνολο: ${sorted.length} παραγγελίες</h2>
      <table><thead><tr>
        <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Τύπος</th>
        <th>Τ.Κάσας</th><th>Χρώμα</th><th>ΚΑΣΑ</th><th>ΣΑΣΙ</th><th>Μον.</th>${isMounting?'<th>Επένδυση</th>':''}<th>Παράδοση</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    try {
      await printHTML(html, `VAICON — ${title}`);
    } catch(e) {
      Alert.alert("Σφάλμα","Δεν δημιουργήθηκε το PDF.");
    }
  };
  const handlePrintProdStatus = async (prodOrders) => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const phaseHeader = PHASES.map(ph=>`<th>${ph.label.replace(/🔴|🟡|🔵|🟢|⚫/g,'').trim()}</th>`).join('');

    const rows = prodOrders.map(o => {
      const phaseCells = PHASES.map(ph => {
        // Backward compat: αν το phase δεν υπάρχει ή epend.active=false ενώ έχει coatings
        let phase = o.phases?.[ph.key];
        const hasCoatings = !!(o.coatings && o.coatings.length > 0);
        if (phase === undefined) {
          const defaultActive = ph.key === 'epend' ? hasCoatings : true;
          phase = { active: defaultActive, printed: false, done: false };
        }
        // Fix: αν epend υπάρχει αλλά active=false ενώ έχει coatings → override
        if (ph.key === 'epend' && hasCoatings && phase && !phase.active) {
          phase = { ...phase, active: true };
        }
        if (!phase.active) return `<td style="background:#f0f0f0;text-align:center;color:#999">—</td>`;
        if (phase.done) return `<td style="background:#d4edda;text-align:center;font-weight:bold;color:#155724">✓</td>`;
        if (phase.printed) return `<td style="background:#fff3cd;text-align:center;color:#856404">🖨</td>`;
        return `<td style="background:#f8d7da;text-align:center;color:#721c24">●</td>`;
      }).join('');
      return `<tr>
        <td style="font-weight:bold;color:#cc0000;background:#fff3cd;text-align:center;font-size:13px">${isUrgentProgram(o.programNo)?`<span style="display:inline-block;border:3px solid #cc0000;border-radius:3px;padding:0 3px">${o.programNo}</span>`:(o.programNo||'—')}</td>
        <td style="font-weight:bold">${o.orderNo||'—'}</td>
        <td>${o.customer||'—'}</td>
        <td style="font-weight:bold">${o.h||'—'}x${o.w||'—'}</td>
        <td>${o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}</td>
        <td>${(o.armor||'ΜΟΝΗ')+' ΘΩΡ.'}</td>
        ${phaseCells}
      </tr>`;
    }).join('');

    const legend = `
      <div style="margin-top:12px;font-size:10px;display:flex;gap:20px;">
        <span><span style="background:#d4edda;padding:2px 6px">✓</span> Ολοκληρώθηκε</span>
        <span><span style="background:#fff3cd;padding:2px 6px">🖨</span> Εκτυπώθηκε</span>
        <span><span style="background:#f8d7da;padding:2px 6px">●</span> Σε εξέλιξη</span>
        <span><span style="background:#f0f0f0;padding:2px 6px">—</span> Δεν αφορά</span>
      </div>`;

    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;margin:8mm;color:#000;}
      h1{font-size:14px;font-weight:bold;margin-bottom:2px;}
      h2{font-size:11px;margin-top:0;margin-bottom:10px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;background:#fff;}
      td{padding:5px 4px;border-bottom:1px solid #ddd;vertical-align:middle;}
      @media print{@page{size:A4 landscape;margin:8mm;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body>
      <h1>VAICON — ΚΑΤΑΣΤΑΣΗ ΠΑΡΑΓΩΓΗΣ</h1>
      <h2>📅 ${dateStr} &nbsp;|&nbsp; Σύνολο: ${prodOrders.length} παραγγελίες σε παραγωγή</h2>
      <table><thead><tr>
        <th style="background:#fff3cd">Πρόγρ.</th><th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th>
        ${phaseHeader}
      </tr></thead><tbody>${rows}</tbody></table>
      ${legend}
    </body></html>`;

    try {
      await printHTML(html, 'VAICON — Κατάσταση Παραγωγής');
    } catch(e) {
      Alert.alert("Σφάλμα","Δεν δημιουργήθηκε το PDF.");
    }
  };

  // Ενότητα ΣΤΗΝ ΠΑΡΑΓΩΓΗ με υποκαρτέλες — 3-column layout
  const renderProdSection = () => {
    const prodOrders = specialOrders.filter(o=>o.status==='PROD').sort((a,b)=>(b.prodAt||0)-(a.prodAt||0));
    const maxPhaseCount = prodOrders.length === 0 ? 0 : Math.max(...PHASES.map(ph =>
      prodOrders.filter(o => o.phases?.[ph.key]?.active && !o.phases?.[ph.key]?.done).length
    ));

    const phaseKeys = [...PHASES.map(p=>p.key), 'stavera'];

    // Υπολογισμός staveraOrders για το ΣΤΑΘΕΡΑ-ΤΖΑΜΙΑ tab (περιλαμβάνει σταθερά και τζάμια)
    const staveraSetTab = new Map();
    prodOrders.filter(o=>(o.stavera&&o.stavera.some(s=>s&&s.dim)) || hasGlass(o)).forEach(o=>staveraSetTab.set(o.id,o));
    specialOrders.filter(o=>o.status==='READY' && ((o.staveraPendingAtReady&&!o.staveraDone) || (o.glassPendingAtReady&&!o.glassDone))).forEach(o=>staveraSetTab.set(o.id,o));
    const staveraOrders = [...staveraSetTab.values()];

    const handleStaveraPrint = () => {
      const selected = Object.keys(printSelected).filter(id=>printSelected[id]);
      const staveraIds = staveraOrders.map(o=>String(o.id));
      const staveraSelected = selected.filter(id=>staveraIds.includes(String(id)));
      if (staveraSelected.length===0) {
        if (staveraOrders.length===0) return Alert.alert("Προσοχή","Δεν υπάρχουν παραγγελίες με σταθερά.");
        setPrintPreview({ visible:true, phaseKey:'stavera', orders:staveraOrders, copies:1 });
        return;
      }
      const matchedOrders = staveraOrders.filter(o=>staveraSelected.includes(String(o.id)));
      setPrintPreview({ visible:true, phaseKey:'stavera', orders:matchedOrders, copies:1 });
    };

    // Δεξιά μπάρα: controls για την τρέχουσα φάση
    const renderRightBar = () => {
      // Κουμπιά ΟΛΩΝ / ΜΗ ΕΚΤΥΠ. + ΕΚΤΥΠΩΣΗ για κανονικές φάσεις
      const renderPrintControls = () => {
        if (activeProdPhase === 'stavera') {
          return (
            <View style={{gap:4}}>
              <TouchableOpacity style={[styles.printBtn,{marginBottom:0, paddingVertical:10}]} onPress={handleStaveraPrint}>
                <Text style={styles.printBtnTxt}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#f0f0f0', borderRadius:8, borderWidth:1, borderColor:'#ccc'}}
                onPress={()=>{
                  const allSelected = staveraOrders.every(o=>printSelected[o.id]);
                  const newSelected = {...printSelected};
                  staveraOrders.forEach(o=>{ newSelected[o.id] = !allSelected; });
                  setPrintSelected(newSelected);
                }}>
                <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#555',backgroundColor:
                  staveraOrders.length>0&&staveraOrders.every(o=>printSelected[o.id])?'#555':'white',alignItems:'center',justifyContent:'center'}}>
                  {staveraOrders.length>0&&staveraOrders.every(o=>printSelected[o.id])&&<Text style={{color:'white',fontSize:15,fontWeight:'bold'}}>✓</Text>}
                </View>
                <Text style={{fontSize:15,fontWeight:'bold',color:'#555'}}>ΟΛΩΝ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#fff3cd', borderRadius:8, borderWidth:1, borderColor:'#ffc107'}}
                onPress={()=>{
                  const newSelected = {...printSelected};
                  staveraOrders.forEach(o=>{ newSelected[o.id] = !o.staveraDone; });
                  setPrintSelected(newSelected);
                }}>
                <Text style={{fontSize:15,fontWeight:'bold',color:'#856404'}}>🖨️ ΕΚΚΡΕΜΟΥΝ</Text>
              </TouchableOpacity>
            </View>
          );
        }
        // Κανονικές φάσεις
        const getPhaseOrders = () => prodOrders.filter(o => {
          const hasCoatings = !!(o.coatings && o.coatings.length > 0);
          if (activeProdPhase === 'epend') return hasCoatings;
          return o.phases?.[activeProdPhase]?.active;
        });
        const phaseOrders = getPhaseOrders();
        const allSelected = phaseOrders.length > 0 && phaseOrders.every(o => printSelected[o.id]);

        // Εκτύπωση φάσης: τυπώνει τις επιλεγμένες όπως είναι, χωρίς modal
        const handlePhasePrint = () => {
          const selected = Object.keys(printSelected).filter(id => printSelected[id]);
          if (selected.length === 0) {
            if (Platform.OS === 'web') window.alert('Επίλεξε τουλάχιστον μία παραγγελία.');
            else Alert.alert("Προσοχή","Επίλεξε τουλάχιστον μία παραγγελία.");
            return;
          }
          handlePrint(activeProdPhase);
        };

        return (
          <View style={{gap:4}}>
            <TouchableOpacity style={[styles.printBtn,{marginBottom:0, paddingVertical:10}]} onPress={handlePhasePrint}>
              <Text style={styles.printBtnTxt}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#f0f0f0', borderRadius:8, borderWidth:1, borderColor:'#ccc'}}
              onPress={()=>{
                const newSelected = {...printSelected};
                phaseOrders.forEach(o=>{ newSelected[o.id] = !allSelected; });
                setPrintSelected(newSelected);
              }}>
              <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#555',backgroundColor: allSelected?'#555':'white', alignItems:'center',justifyContent:'center'}}>
                {allSelected?<Text style={{color:'white',fontSize:15,fontWeight:'bold'}}>✓</Text>:null}
              </View>
              <Text style={{fontSize:15,fontWeight:'bold',color:'#555'}}>ΟΛΩΝ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#fff3cd', borderRadius:8, borderWidth:1, borderColor:'#ffc107'}}
              onPress={()=>{
                const newSelected = {...printSelected};
                phaseOrders.forEach(o=>{
                  const isPrinted = !!(o.phases?.[activeProdPhase]?.printed);
                  newSelected[o.id] = !isPrinted;
                });
                setPrintSelected(newSelected);
              }}>
              <Text style={{fontSize:15,fontWeight:'bold',color:'#856404'}}>🖨️ ΜΗ ΕΚΤΥΠ.</Text>
            </TouchableOpacity>
            {/* 3α: Κουμπί ΑΡΙΘΜΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ */}
            <TouchableOpacity
              style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#e8f0fe', borderRadius:8, borderWidth:1, borderColor:'#4a90d9'}}
              onPress={async ()=>{
                const readyOnly = activeProdPhase==='montDoor' && montReadyFilter;
                const prodWithProgram = specialOrders.filter(o=>o.status==='PROD' && o.programNo && (!readyOnly || isReadyForMont(o)));
                if (prodWithProgram.length === 0) {
                  const msg = readyOnly ? 'Δεν υπάρχουν έτοιμες προς μοντάρισμα παραγγελίες με αριθμό προγράμματος.' : 'Δεν υπάρχουν παραγγελίες στην παραγωγή με αριθμό προγράμματος.';
                  if (Platform.OS==='web') window.alert(msg);
                  else Alert.alert("Προσοχή", msg);
                  return;
                }
                // Έλεγχος unique programNo
                const uniquePrograms = [...new Set(prodWithProgram.map(o=>o.programNo))];
                if (uniquePrograms.length >= 2) {
                  // Πολλαπλά προγράμματα → άνοιγμα modal επιλογής, με την τρέχουσα φάση ώστε να εκτυπωθούν οι σωστές σελίδες
                  setPrintProgramModal({ visible: true, programs: uniquePrograms, selected: null, phaseKey: activeProdPhase, readyOnly });
                  return;
                }
                // Μόνο ένα πρόγραμμα → εκτύπωση απευθείας
                const groups = {};
                prodWithProgram.forEach(o => {
                  if (!groups[o.programNo]) groups[o.programNo] = [];
                  groups[o.programNo].push(o);
                });
                const today = new Date();
                const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                const tableCSS = `
                  body{font-family:Arial,sans-serif;margin:8mm;color:#000;}
                  h1{font-size:16px;font-weight:bold;margin-bottom:4px;}
                  h2{font-size:12px;color:#555;margin-bottom:10px;}
                  h3{font-size:14px;font-weight:bold;margin:14px 0 4px;background:#1a1a2e;color:#FFD600;padding:6px 10px;border-radius:4px;}
                  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;}
                  th{padding:4px 6px;text-align:left;border:1px solid #000;font-weight:bold;background:#ddd;font-size:9px;}
                  td{padding:4px 6px;border:1px solid #000;vertical-align:top;}
                  tr:nth-child(even) td{background:#f5f5f5;}
                  @media print{@page{size:A4 landscape;margin:8mm;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
                `;
                const groupsHTML = Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([pNo, orders])=>{
                  const sorted = [...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                  const rows = sorted.map(o=>{
                    const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
                    const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? 'Δ/Θ' : 'Μ/Θ';
                    return `<tr>
                      <td style="font-weight:bold;font-size:14px">${o.orderNo||'—'}</td>
                      <td>${o.customer||'—'}</td>
                      <td style="font-weight:bold">${o.h||'—'} × ${o.w||'—'}</td>
                      <td>${fora}</td>
                      <td>${armorVal}</td>
                      <td>${lockHtml(o.lock)}</td>
                      <td>${o.deliveryDate||'—'}</td>
                      <td>${o.notes||''}</td>
                    </tr>`;
                  }).join('');
                  return `<h3>📋 ΠΡΟΓΡΑΜΜΑ ${pNo} — ${sorted.length} παραγγελίες</h3>
                    <table><thead><tr>
                      <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Κλειδαριά</th><th>Παράδοση</th><th>Παρατηρήσεις</th>
                    </tr></thead><tbody>${rows}</tbody></table>`;
                }).join('');
                const html = `<html><head><meta charset="utf-8"><style>${tableCSS}</style></head><body>
                  <h1>VAICON — ΑΡΙΘΜΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ — ΣΤΗΝ ΠΑΡΑΓΩΓΗ</h1>
                  <h2>📅 ${dateStr} | ${prodWithProgram.length} παραγγελίες σε ${Object.keys(groups).length} προγράμματα</h2>
                  ${groupsHTML}
                </body></html>`;
                await printHTML(html, 'VAICON — ΑΡΙΘΜΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ');
              }}>
              <Text style={{fontSize:14,fontWeight:'bold',color:'#1a1a2e'}}>📋 ΑΡ. ΠΡΟΓΡΑΜΜΑΤΟΣ</Text>
            </TouchableOpacity>
            {activeProdPhase==='montDoor' && (
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor: montReadyFilter?'#00C851':'#e8f5e9', borderRadius:8, borderWidth:1, borderColor:'#00C851'}}
                onPress={()=>{
                  const next = !montReadyFilter;
                  setMontReadyFilter(next);
                  setPrintSelected(prev=>{
                    const upd = {...prev};
                    phaseOrders.filter(isReadyForMont).forEach(o=>{ upd[o.id] = next; });
                    return upd;
                  });
                }}>
                <Text style={{fontSize:14,fontWeight:'bold',color: montReadyFilter?'white':'#1b5e20'}}>✅ ΕΤΟΙΜΑ ΠΡΟΣ ΜΟΝΤΑΡΙΣΜΑ</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      };

      return (
        <View style={{width:290, backgroundColor:'#f9f9f9', borderLeftWidth:1, borderLeftColor:'#e0e0e0', display:'flex', flexDirection:'column'}}>
          {/* (1) Κίτρινη γραμμή */}
          <View style={[styles.listHeader,{backgroundColor:'#ffbb33', flexDirection:'row', alignItems:'center', justifyContent:'space-between', margin:0, borderRadius:0, marginTop:0}]}>
            <Text style={[styles.listHeaderText,{fontSize:14}]}>⚙️ ΠΑΡΑΓΩΓΗ ({maxPhaseCount})</Text>
            <View style={{flexDirection:'row', gap:4}}>
              <TouchableOpacity
                style={{backgroundColor:'#1a1a2e', paddingHorizontal:7, paddingVertical:4, borderRadius:12}}
                onPress={()=>{
                  // Βρίσκω unique programNo από τις παραγγελίες PROD
                  const uniquePrograms = [...new Set(prodOrders.filter(o=>o.programNo).map(o=>o.programNo))];
                  if (uniquePrograms.length >= 2) {
                    // Υπάρχουν πολλαπλά προγράμματα → άνοιγμα modal επιλογής
                    setPrintProgramModal({ visible: true, programs: uniquePrograms, selected: null });
                  } else {
                    // Μόνο ένα ή κανένα programNo → εκτύπωση όλων κανονικά
                    (async () => {
                      const today = new Date();
                      const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                      const phaseLabel = 'ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ ΠΑΡΑΓΓΕΛΙΩΝ';
                      const sorted = [...prodOrders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                      const allCopies = getCopies(sorted, phaseLabel, dateStr);
                      const html = buildPrintHTML([allCopies[0]], 'laser');
                      await printHTML(html, `VAICON — ${phaseLabel}`);
                    })();
                  }
                }}>
                <Text style={{color:'#FFD600', fontSize:14, fontWeight:'bold'}}>🖨️ ΠΡΟΓΡ.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{backgroundColor:'white', paddingHorizontal:7, paddingVertical:4, borderRadius:12}}
                onPress={()=>handlePrintProdStatus([...prodOrders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)))}>
                <Text style={{color:'#8B0000', fontSize:14, fontWeight:'bold'}}>📋 ΚΑΤΑΣ.</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* (2) Καρτέλες φάσεων — κάθετη διάταξη */}
          <View style={{paddingVertical:6, paddingHorizontal:6, gap:4, marginTop:8}}>
            {PHASES.map(ph=>(
              <TouchableOpacity key={ph.key} style={[styles.phaseTab, activeProdPhase===ph.key&&styles.phaseTabActive, {borderRadius:8, marginRight:0, flexDirection:'row', justifyContent:'space-between', alignItems:'center', minWidth:0, paddingVertical:8}]} onPress={()=>{
                setActiveProdPhase(ph.key);
                const idx = phaseKeys.indexOf(ph.key);
                prodScrollRef.current?.scrollTo({x: idx * pageWidth, animated:true});
              }}>
                <Text style={[styles.phaseTabTxt, activeProdPhase===ph.key&&styles.phaseTabTxtActive]}>{ph.label}</Text>
                <Text style={styles.phaseTabCount}>{(()=>{
                  const activeOrders = prodOrders.filter(o => {
                    const hasCoatings = !!(o.coatings && o.coatings.filter(c => c && String(c).trim()).length > 0);
                    const hasInstallation = o.installation === 'ΝΑΙ';
                    if (ph.key === 'epend')    return hasCoatings;
                    if (ph.key === 'montDoor') return hasInstallation;
                    if (o.phases?.[ph.key] !== undefined) return o.phases[ph.key].active;
                    return true;
                  });
                  const total = activeOrders.length;
                  const pending = activeOrders.filter(o => {
                    const phase = o.phases?.[ph.key];
                    if (ph.key === 'epend') {
                      const hasCoatings = !!(o.coatings && o.coatings.filter(c => c && String(c).trim()).length > 0);
                      if (!phase || (!phase.active && hasCoatings)) return true;
                      return !phase.done;
                    }
                    if (ph.key === 'montDoor') {
                      if (!phase) return true;
                      return !phase.done;
                    }
                    return !phase?.done;
                  }).length;
                  return `${pending} / ${total}`;
                })()}</Text>
              </TouchableOpacity>
            ))}
            {/* ΣΤΑΘΕΡΑ tab */}
            <TouchableOpacity
              style={[styles.phaseTab, activeProdPhase==='stavera'&&styles.phaseTabActive, {backgroundColor: activeProdPhase==='stavera'?'#7b1fa2':'#f3e5f5', borderRadius:8, marginRight:0, flexDirection:'row', justifyContent:'space-between', alignItems:'center', minWidth:0, paddingVertical:8}]}
              onPress={()=>{ setActiveProdPhase('stavera'); prodScrollRef.current?.scrollTo({x: phaseKeys.indexOf('stavera') * pageWidth, animated:true}); }}>
              <Text style={[styles.phaseTabTxt, activeProdPhase==='stavera'&&styles.phaseTabTxtActive]}>📐 ΣΤΑΘΕΡΑ-ΤΖΑΜΙΑ</Text>
              <Text style={styles.phaseTabCount}>{staveraOrders.length}</Text>
            </TouchableOpacity>
          </View>

          {/* (3) ΕΚΤΥΠΩΣΗ ΕΠΙΛΕΓΜΕΝΩΝ + ΟΛΩΝ/ΜΗ ΕΚΤΥΠ. */}
          <View style={{padding:8, borderTopWidth:1, borderTopColor:'#e0e0e0'}}>
            {renderPrintControls()}
          </View>
          {/* Αναζήτηση */}
          <View style={{padding:8, borderTopWidth:1, borderTopColor:'#e0e0e0', gap:4}}>
            <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
              <Text style={{fontSize:13, fontWeight:'bold', color:'#555', letterSpacing:1}}>ΑΝΑΖΗΤΗΣΗ</Text>
              {prodSearch.length > 0 && (
                <Text style={{fontSize:12, fontWeight:'bold', color:'#007AFF'}}>
                  {prodOrders.filter(o=>matchesSearch(o, prodSearch)).length} αποτελ.
                </Text>
              )}
            </View>
            <View style={{flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:8, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:8, paddingVertical:4}}>
              <Text style={{fontSize:14, marginRight:4, color:'#aaa'}}>🔍</Text>
              <TextInput
                style={{flex:1, fontSize:13, color:'#1a1a1a', padding:0}}
                placeholder="Αναζήτηση..."
                placeholderTextColor="#bbb"
                value={prodSearch}
                onChangeText={v=>setProdSearch(v)}
                clearButtonMode="while-editing"
              />
              {prodSearch.length > 0 && (
                <TouchableOpacity onPress={()=>setProdSearch('')}>
                  <Text style={{color:'#aaa', fontSize:16, fontWeight:'bold', paddingLeft:4}}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    };

    return (
      <View style={{flex:1, flexDirection:'row'}}>
        {/* ΚΕΝΤΡΟ: Scrollable λίστα παραγγελιών */}
        <ScrollView
          style={{flex:1, backgroundColor:'#f9f9f9'}}
          contentContainerStyle={{padding:8, paddingBottom:80}}>
          {/* PAGED SCROLL — ένα page ανά φάση + ΣΤΑΘΕΡΑ */}
          <ScrollView
            ref={prodScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={e=>{ setPageWidth(e.nativeEvent.layout.width); }}
            onMomentumScrollEnd={e=>{
              const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
              if (page >= 0 && page < phaseKeys.length) setActiveProdPhase(phaseKeys[page]);
            }}
            scrollEventThrottle={16}>
            {PHASES.map(ph=>(
              <View key={ph.key} style={{width:pageWidth}}>
                {prodOrders.length===0?(
                  <Text style={{textAlign:'center',color:'#999',padding:20}}>Καμία παραγγελία στην παραγωγή</Text>
                ):(
                  prodOrders.filter(o=>matchesSearch(o, prodSearch)).filter(o=>!(ph.key==='montDoor' && montReadyFilter) || isReadyForMont(o)).map(o=>renderProdPhaseCard(o, ph.key, prodSearch))
                )}
              </View>
            ))}
            {/* ΣΤΑΘΕΡΑ — τελευταίο page */}
            <View style={{width:pageWidth}}>
              <View style={{marginTop:6}}>
                {(()=>{
                  const filteredStavera = staveraOrders.filter(o=>matchesSearch(o, prodSearch));
                  if (staveraOrders.length===0) {
                    return <Text style={{textAlign:'center',color:'#999',padding:16}}>Δεν υπάρχουν παραγγελίες με σταθερά</Text>;
                  }
                  if (filteredStavera.length===0) {
                    return <Text style={{textAlign:'center',color:'#999',padding:16}}>Καμία παραγγελία δεν ταιριάζει με την αναζήτηση</Text>;
                  }
                  return filteredStavera.map(o=>{
                  const isSelected = !!printSelected[o.id];
                  const hasStaveraItems = !!(o.stavera && o.stavera.some(s=>s&&s.dim));
                  const orderHasGlass = hasGlass(o);
                  const staveraDoneOrNA = !hasStaveraItems || o.staveraDone;
                  const glassDoneOrNA   = !orderHasGlass   || o.glassDone;
                  const allDone = staveraDoneOrNA && glassDoneOrNA;
                  return (
                  <View key={o.id} style={{backgroundColor:allDone?'#e8f5e9':'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:allDone?'#00C851':'#7b1fa2', elevation:1, flexDirection:'row', alignItems:'flex-start'}}>
                    <TouchableOpacity style={{marginRight:10, marginTop:2}} onPress={()=>setPrintSelected(p=>({...p,[o.id]:!p[o.id]}))}>
                      <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isSelected?'#1565c0':'#7b1fa2',backgroundColor:isSelected?'#1565c0':'white',alignItems:'center',justifyContent:'center'}}>
                        {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                    <View style={{flex:1}}>
                      <Text style={{fontWeight:'bold', fontSize:13, marginBottom:4}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                      <Text style={{fontSize:12, color:'#555', marginBottom:6}}>{o.h}x{o.w} | {o.side}</Text>
                      {hasStaveraItems && (o.stavera||[]).map((s,idx)=>s&&s.dim?(
                        <View key={idx} style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, borderLeftWidth:2, borderLeftColor:'#ce93d8'}}>
                          <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                            <Text style={{fontWeight:'bold', fontSize:13, color:'#4a148c'}}>📐 {s.dim||'—'}</Text>
                            {s.qty?<Text style={{fontWeight:'900', fontSize:15, color:'#d32f2f'}}>×{s.qty}</Text>:null}
                          </View>
                          {s.note?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{s.note}</Text>:null}
                        </View>
                      ):null)}
                      {hasStaveraItems && o.staveraDone&&<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Σταθερά ολοκληρώθηκαν</Text>}
                      {orderHasGlass && (
                        <View style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, marginTop: hasStaveraItems?6:0, borderLeftWidth:2, borderLeftColor:'#90caf9'}}>
                          <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                            <Text style={{fontWeight:'bold', fontSize:13, color:'#0d47a1'}}>🪟 {o.glassDim||'—'}</Text>
                          </View>
                          {o.glassNotes?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{o.glassNotes}</Text>:null}
                          {o.glassDone&&<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Τζάμι ολοκληρώθηκε</Text>}
                        </View>
                      )}
                    </View>
                    {o.programNo ? (
                      <View style={{justifyContent:'center', alignItems:'center', paddingHorizontal:8, borderRightWidth:1, borderRightColor:'#e0e0e0', backgroundColor:'#fff8e1', minWidth:52, alignSelf:'stretch'}}>
                        <View style={isUrgentProgram(o.programNo) ? {borderWidth:3, borderColor:'#e65100', borderRadius:4, paddingHorizontal:3, paddingVertical:1, alignItems:'center'} : {alignItems:'center'}}>
                          <Text style={{fontSize:18, fontWeight:'900', color:'#e65100', letterSpacing:1}}>{o.programNo}</Text>
                          <Text style={{fontSize:9, color:'#999', fontWeight:'bold'}}>ΠΡΟΓΡ.</Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={{justifyContent:'space-between', gap:6, marginLeft: o.programNo ? 0 : 8, paddingVertical:2}}>
                      {hasStaveraItems && (
                        <TouchableOpacity
                          style={[styles.doneBtn, o.staveraDone&&styles.doneBtnActive]}
                          onPress={async()=>{
                            const newDone = !o.staveraDone;
                            const upd={...o, staveraDone:newDone, ...(newDone && {staveraPendingAtReady:false})};
                            setSpecialOrders(specialOrders.map(x=>x.id===o.id?upd:x));
                            await syncToCloud(upd);
                          }}>
                          <Text style={styles.doneBtnTxt}>{o.staveraDone?'↩️ ΣΤΑΘ.':'✓ ΣΤΑΘ.'}</Text>
                        </TouchableOpacity>
                      )}
                      {orderHasGlass && (
                        <TouchableOpacity
                          style={[styles.doneBtn, o.glassDone&&styles.doneBtnActive, {backgroundColor:o.glassDone?undefined:'#1976d2'}]}
                          onPress={async()=>{
                            const newDone = !o.glassDone;
                            const upd={...o, glassDone:newDone, ...(newDone && {glassPendingAtReady:false})};
                            setSpecialOrders(specialOrders.map(x=>x.id===o.id?upd:x));
                            await syncToCloud(upd);
                          }}>
                          <Text style={styles.doneBtnTxt}>{o.glassDone?'↩️ ΤΖΑΜΙ':'✓ ΤΖΑΜΙ'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={{backgroundColor:'#ff4444', paddingHorizontal:8, paddingVertical:3, borderRadius:5, alignSelf:'stretch', alignItems:'center'}}
                        onPress={()=>Alert.alert("⚠️ Διαγραφή",`Διαγραφή παραγγελίας #${o.orderNo};`,[
                          {text:"ΑΚΥΡΟ",style:"cancel"},
                          {text:"ΔΙΑΓΡΑΦΗ",style:"destructive",onPress:async()=>{
                            setSpecialOrders(specialOrders.filter(x=>x.id!==o.id));
                            await deleteFromCloud(o.id);
                          }}
                        ])}>
                        <Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>✕ ΔΙΑ/ΦΗ</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  );
                });
                })()}
              </View>
            </View>
          </ScrollView>
        </ScrollView>

        {/* ΔΕΞΙΑ: Σταθερή μπάρα controls */}
        {renderRightBar()}
      </View>
    );
  };


  return (
    <View style={{flex:1}}>
      {smsToast.visible && (
        <View pointerEvents="none" style={{position:'absolute', top:14, alignSelf:'center', left:0, right:0, alignItems:'center', zIndex:9999}}>
          <View style={{backgroundColor: smsToast.kind==='ok'?'#2e7d32':smsToast.kind==='err'?'#c62828':'#1565C0', paddingHorizontal:18, paddingVertical:11, borderRadius:10, shadowColor:'#000', shadowOpacity:0.25, shadowRadius:6, shadowOffset:{width:0,height:3}, elevation:6, maxWidth:'80%'}}>
            <Text style={{color:'white', fontSize:14, fontWeight:'bold', textAlign:'center'}}>{smsToast.text}</Text>
          </View>
        </View>
      )}
      <Modal visible={peepholeWarn.visible} transparent animationType="fade" onRequestClose={()=>{}}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center', padding:20}}>
          <View style={{backgroundColor:'#fff', borderRadius:22, borderWidth:5, borderColor:'#c62828', padding:34, maxWidth:680, width:'100%', shadowColor:'#000', shadowOpacity:0.3, shadowRadius:14, elevation:10}}>
            <Text style={{fontSize:84, textAlign:'center'}}>⚠️</Text>
            <Text style={{fontSize:32, fontWeight:'bold', color:'#c62828', textAlign:'center', marginTop:8, marginBottom:18, lineHeight:40}}>
              ΠΡΟΣΟΧΗ... ΕΡΩΤΗΣΗ ΠΕΛΑΤΗ.{'\n'}ΤΡΥΠΗΜΑ ΕΠΕΝΔΥΣΗΣ ΓΙΑ ΜΑΤΙ
            </Text>
            <View style={{backgroundColor:'#fff3e0', borderRadius:12, padding:16, marginBottom:24}}>
              <Text style={{fontSize:18, color:'#444', textAlign:'center', marginBottom:8}}>Επένδυση στην παραγγελία:</Text>
              <Text style={{fontSize:21, fontWeight:'bold', color:'#bf360c', textAlign:'center'}}>
                {peepholeWarn.coatings.join(' • ')}
              </Text>
            </View>
            <View style={{flexDirection:'row', gap:12}}>
              <TouchableOpacity
                style={{flex:1, backgroundColor:'#2e7d32', paddingVertical:21, borderRadius:14, alignItems:'center'}}
                onPress={()=>{
                  const cb = peepholeWarn.onContinue;
                  setPeepholeWarn({ visible:false, coatings:[], onContinue:null, onAddNote:null });
                  cb && cb();
                }}>
                <Text style={{color:'white', fontSize:18, fontWeight:'bold', textAlign:'center'}}>ΧΩΡΙΣ ΑΛΛΑΓΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:1, backgroundColor:'#c62828', paddingVertical:21, borderRadius:14, alignItems:'center'}}
                onPress={()=>{
                  const cb = peepholeWarn.onAddNote;
                  setPeepholeWarn({ visible:false, coatings:[], onContinue:null, onAddNote:null });
                  cb && cb();
                }}>
                <Text style={{color:'white', fontSize:18, fontWeight:'bold', textAlign:'center'}}>ΔΙΟΡΘΩΣΕ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {renderPrintPreview()}
      <Modal visible={showHardwarePicker} transparent animationType="slide" onRequestClose={()=>setShowHardwarePicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16}}>
            <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>Χρώμα Εξαρτημάτων</Text>
              <TouchableOpacity onPress={()=>setShowHardwarePicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            {['Nikel','Bronze','Nikel Best','Bronze Best','Best Παραγγελία',''].map((c,i)=>{
              const curHardware = pickerEditMode ? editForm.hardware : customForm.hardware;
              const setHardware = (v) => pickerEditMode
                ? setEditForm(f=>({...f,hardware:v}))
                : setCustomForm({...customForm,hardware:v});
              return (
              <TouchableOpacity key={i}
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{
                  if(c===''){
                    setShowCustomHardwareInput(true);
                    setCustomHardwareText('');
                  } else {
                    setHardware(c);
                    setShowCustomHardwareInput(false);
                    setShowHardwarePicker(false);
                  }
                }}>
                <Text style={{fontSize:15,color:c?'#000':'#888'}}>{c||'Άλλο (γράψτε εδώ)...'}</Text>
                {curHardware===c&&c!==''&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
              );
            })}
            {showCustomHardwareInput&&(
              <View style={{padding:12}}>
                <TextInput
                  autoFocus
                  style={{backgroundColor:'#f5f5f5',padding:12,borderRadius:8,borderWidth:1,borderColor:'#8B0000',fontSize:15}}
                  placeholder="Γράψτε χρώμα εξαρτημάτων..."
                  value={customHardwareText}
                  onChangeText={v=>setCustomHardwareText(v)}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={{backgroundColor:'#8B0000',padding:12,borderRadius:8,alignItems:'center',marginTop:8}}
                  onPress={()=>{
                    if(customHardwareText.trim()){
                      if (pickerEditMode) setEditForm(f=>({...f,hardware:customHardwareText.trim()}));
                      else setCustomForm({...customForm,hardware:customHardwareText.trim()});
                    }
                    setShowCustomHardwareInput(false);
                    setShowHardwarePicker(false);
                  }}>
                  <Text style={{color:'white',fontWeight:'bold'}}>ΟΚ</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{height:20}}/>
          </View>
        </View>
      </Modal>

      {/* FLOATING PANEL ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ */}
      {prodBatch.length > 0 && (
        <View style={{
          position:'absolute', bottom: 20 - panPos.y, left: `calc(50% - 160px + ${panPos.x}px)`,
          width:320, backgroundColor:'#1a1a2e', borderRadius:12, elevation:20, zIndex:1000,
          shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.4, shadowRadius:8,
        }}>
          <View
            style={{backgroundColor:'#ffbb33', borderTopLeftRadius:12, borderTopRightRadius:12, padding:10, alignItems:'center', cursor:'grab'}}
            {...(Platform.OS==='web' ? { onMouseDown: handleDragStart, onTouchStart: handleDragStart } : {})}>
            <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:14}}>🚀 ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ ({prodBatch.length})</Text>
          </View>
          <ScrollView style={{maxHeight:140}} contentContainerStyle={{padding:8}}>
            {prodBatch.map((o,i)=>(
              <View key={i} style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:4, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.1)'}}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>#{o.orderNo}{o.customer ? `  ${o.customer}` : ''}</Text>
                <TouchableOpacity onPress={()=>setProdBatch(prev=>prev.filter(x=>x.id!==o.id))}>
                  <Text style={{color:'#ff4444', fontSize:15, paddingHorizontal:6}}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <View style={{flexDirection:'row', gap:8, padding:10, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.15)'}}>
            <TouchableOpacity style={{flex:1, padding:10, borderRadius:8, alignItems:'center', backgroundColor:'#555'}} onPress={()=>setProdBatch([])}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:13}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{flex:2, padding:10, borderRadius:8, alignItems:'center', backgroundColor:'#ffbb33'}} onPress={()=>{
              const batchPrograms = [...new Set(prodBatch.map(o=>o.programNo).filter(Boolean))];
              const prefill = batchPrograms.length === 1 ? batchPrograms[0] : '';
              setProgramModal({visible:true, programNo: prefill});
            }}>
              <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:13}}>✅ ΕΠΙΒΕΒΑΙΩΣΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODAL ΑΡΙΘΜΟΥ ΠΡΟΓΡΑΜΜΑΤΟΣ */}
      <Modal visible={programModal.visible} transparent animationType="fade" onRequestClose={()=>setProgramModal({visible:false,programNo:''})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:20, width:'85%', maxWidth:420}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:12, textAlign:'center'}}>🔢 Αριθμός Προγράμματος</Text>
            <TextInput
              style={{borderWidth:2, borderColor:'#ffbb33', borderRadius:8, padding:12, fontSize:20, fontWeight:'bold', textAlign:'center', marginBottom:12, color:'#1a1a1a'}}
              placeholder="Νέος αριθμός..."
              keyboardType="numeric"
              value={programModal.programNo}
              onChangeText={v=>setProgramModal(m=>({...m, programNo:v}))}
              autoFocus
            />
            {/* Υπάρχοντες αριθμοί προγράμματος */}
            {[...new Set(specialOrders.filter(o=>o.programNo).map(o=>o.programNo))].length > 0 && (
              <View style={{marginBottom:12}}>
                <Text style={{fontSize:12, fontWeight:'bold', color:'#555', marginBottom:6}}>Ή επίλεξε υπάρχον πρόγραμμα:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{flexDirection:'row', gap:6}}>
                    {[...new Set(specialOrders.filter(o=>o.programNo).map(o=>o.programNo))].map(pNo=>(
                      <TouchableOpacity key={pNo}
                        style={{backgroundColor: programModal.programNo===pNo?'#ffbb33':'#f0f0f0', paddingHorizontal:14, paddingVertical:8, borderRadius:8, borderWidth:2, borderColor: programModal.programNo===pNo?'#e6a800':'#ddd'}}
                        onPress={()=>setProgramModal(m=>({...m, programNo:pNo}))}>
                        <Text style={{fontWeight:'bold', fontSize:15, color: programModal.programNo===pNo?'#1a1a1a':'#555'}}>{pNo}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
            <View style={{flexDirection:'row', gap:8}}>
              <TouchableOpacity style={{flex:1, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#e0e0e0'}} onPress={()=>{ setProgramModal({visible:false, programNo:''}); setProdBatch([]); }}>
                <Text style={{fontWeight:'bold', color:'#555'}}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{flex:2, padding:12, borderRadius:10, alignItems:'center', backgroundColor: programModal.programNo.trim() ? '#2e7d32' : '#ccc'}} 
                disabled={!programModal.programNo.trim()}
                onPress={async()=>{
                  const pNo = programModal.programNo.trim();
                  if (!pNo) {
                    Alert.alert("Προσοχή", "Πρέπει να εισάγετε αριθμό προγράμματος!");
                    return;
                  }
                  const batch = [...prodBatch];
                  for (const order of batch) {
                    const phases = {};
                    PHASES.forEach(ph => {
                      if (ph.key==='montDoor' && order.installation!=='ΝΑΙ') {
                        phases[ph.key] = { active:false, printed:false, done:false };
                      } else {
                        phases[ph.key] = { active:true, printed:false, done:false };
                      }
                    });
                    const upd = {...order, status:'PROD', prodAt:Date.now(), phases, programNo: pNo};
                    setSpecialOrders(prev=>prev.map(o=>o.id===order.id?upd:o));
                    await syncToCloud(upd);
                    await logActivity('ΕΙΔΙΚΗ', 'Φάση → ΠΑΡΑΓΩΓΗ', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}`, programNo: pNo });
                  }
                  setProgramModal({visible:false, programNo:''});
                  setProdBatch([]);
                }}>
                <Text style={{fontWeight:'bold', color:'white', fontSize:14}}>🚀 ΟΚ — ΕΝΑΡΞΗ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL ΕΠΙΛΟΓΗΣ ΠΡΟΓΡΑΜΜΑΤΟΣ ΓΙΑ ΕΚΤΥΠΩΣΗ */}
      <Modal visible={printProgramModal.visible} transparent animationType="fade" onRequestClose={()=>setPrintProgramModal({visible:false,programs:[],selected:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:20, width:'85%', maxWidth:420}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:6, textAlign:'center'}}>🖨️ Επιλογή Προγράμματος</Text>
            <Text style={{fontSize:13, color:'#666', marginBottom:16, textAlign:'center'}}>Επίλεξε ποιο πρόγραμμα θέλεις να εκτυπώσεις:</Text>
            <View style={{flexDirection:'row', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:20}}>
              {printProgramModal.programs.map(pNo=>(
                <TouchableOpacity key={pNo}
                  style={{backgroundColor: printProgramModal.selected===pNo?'#1a1a2e':'#f0f0f0', paddingHorizontal:24, paddingVertical:14, borderRadius:10, borderWidth:2, borderColor: printProgramModal.selected===pNo?'#FFD600':'#ddd', minWidth:80, alignItems:'center'}}
                  onPress={()=>setPrintProgramModal(m=>({...m, selected:pNo}))}>
                  <Text style={{fontWeight:'bold', fontSize:20, color: printProgramModal.selected===pNo?'#FFD600':'#555'}}>{pNo}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:'row', gap:8}}>
              <TouchableOpacity style={{flex:1, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#e0e0e0'}} onPress={()=>setPrintProgramModal({visible:false,programs:[],selected:null})}>
                <Text style={{fontWeight:'bold', color:'#555'}}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex:2, padding:12, borderRadius:10, alignItems:'center', backgroundColor: printProgramModal.selected?'#1a1a2e':'#ccc'}}
                disabled={!printProgramModal.selected}
                onPress={async()=>{
                  const selectedPNo = printProgramModal.selected;
                  const phaseKey = printProgramModal.phaseKey;
                  const readyOnly = printProgramModal.readyOnly;
                  setPrintProgramModal({visible:false, programs:[], selected:null, phaseKey:null});
                  
                  if (phaseKey) {
                    // Εκτύπωση συγκεκριμένης φάσης με φιλτράρισμα programNo
                    const prodOrders = specialOrders.filter(o=>o.status==='PROD');
                    const filteredOrders = prodOrders.filter(o=>o.programNo===selectedPNo && o.phases?.[phaseKey]?.active && (!readyOnly || isReadyForMont(o)));
                    if (filteredOrders.length === 0) {
                      Alert.alert("Προσοχή", `Δεν υπάρχουν παραγγελίες με πρόγραμμα ${selectedPNo} σε αυτή τη φάση.`);
                      return;
                    }
                    const today = new Date();
                    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                    const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
                    const allCopies = getCopies(filteredOrders, phaseLabel, dateStr);
                    const html = buildPrintHTML(allCopies, phaseKey);
                    await printHTML(html, `VAICON — ${phaseLabel} — Πρόγρ. ${selectedPNo}`);
                    
                    // Μαρκάρει ως printed
                    const selectedIds = filteredOrders.map(o=>o.id);
                    const updated = specialOrders.map(o => {
                      if (selectedIds.includes(o.id) && o.phases?.[phaseKey]?.active) {
                        return {...o, phases:{...o.phases, [phaseKey]:{...o.phases[phaseKey], printed:true, printHistory:[...(o.phases[phaseKey].printHistory||[]), {ts:Date.now(), copies:1}]}}};
                      }
                      return o;
                    });
                    setSpecialOrders(updated);
                    for (const o of updated.filter(o=>selectedIds.includes(o.id))) await syncToCloud(o);
                  } else {
                    // Εκτύπωση ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ (όλες οι παραγγελίες του προγράμματος)
                    const prodOrders = specialOrders.filter(o=>o.status==='PROD');
                    const filteredOrders = prodOrders.filter(o=>o.programNo===selectedPNo);
                    const today = new Date();
                    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
                    const phaseLabel = 'ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ ΠΑΡΑΓΓΕΛΙΩΝ';
                    const sorted = [...filteredOrders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                    const allCopies = getCopies(sorted, phaseLabel, dateStr);
                    const html = buildPrintHTML([allCopies[0]], 'laser');
                    await printHTML(html, `VAICON — ${phaseLabel} — Πρόγρ. ${selectedPNo}`);
                  }
                }}>
                <Text style={{fontWeight:'bold', color:'white', fontSize:14}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🔍 ΠΕΛΑΤΕΣ — draggable lookup panel (Modal 1) */}
      {showCustomerLookup && (() => {
        const q = (customerLookupSearch || '').trim().toLowerCase();
        const filteredCustomers = q.length === 0
          ? []
          : (customers || []).filter(c =>
              (c.name && c.name.toLowerCase().includes(q)) ||
              [c.phone, c.phone2, c.phone3, c.phoneViber].some(p => p && String(p).toLowerCase().includes(q))
            ).slice(0, 40);
        const selectedCust = lookupCustomerId ? (customers || []).find(c => c.id === lookupCustomerId) : null;
        const activeOrders = activeSection === 'archive' ? (soldSpecialOrders || []) : (specialOrders || []);
        const customerOrders = selectedCust
          ? activeOrders
              .filter(o => o.customer && selectedCust.name && o.customer.trim().toLowerCase() === selectedCust.name.trim().toLowerCase())
              .sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
          : [];
        return (
          <View style={{
            position:'absolute', top: 80 + custPanPos.y, left: `calc(50% - 220px + ${custPanPos.x}px)`,
            width: 440, backgroundColor:'#ffffff', borderRadius:14, elevation:24, zIndex:1000,
            shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:12,
            borderWidth:1, borderColor:'#ddd',
          }}>
            {/* Header — drag handle */}
            <View
              style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, backgroundColor:'#0d47a1', borderTopLeftRadius:14, borderTopRightRadius:14, cursor:'grab'}}
              {...(Platform.OS==='web' ? { onMouseDown: handleCustDragStart, onTouchStart: handleCustDragStart } : {})}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14, letterSpacing:1}}>☰ 🔍 ΠΕΛΑΤΕΣ</Text>
              <TouchableOpacity onPress={()=>{ setShowCustomerLookup(false); setCustomerLookupSearch(''); setLookupCustomerId(null); }}>
                <Text style={{color:'white', fontSize:18, fontWeight:'bold', paddingHorizontal:6}}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Body */}
            <View style={{padding:12}}>
              {/* Search */}
              <View style={{flexDirection:'row', alignItems:'center', backgroundColor:'#f5f5f5', borderRadius:10, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:10, paddingVertical:8, marginBottom:10}}>
                <Text style={{fontSize:16, marginRight:6, color:'#888'}}>🔍</Text>
                <TextInput
                  style={{flex:1, fontSize:14, color:'#1a1a1a', padding:0, outlineStyle:'none'}}
                  placeholder="Αναζήτηση πελάτη (όνομα ή τηλέφωνο)..."
                  placeholderTextColor="#aaa"
                  value={customerLookupSearch}
                  onChangeText={v=>{ setCustomerLookupSearch(v); if (lookupCustomerId) setLookupCustomerId(null); }}
                />
                {customerLookupSearch.length > 0 && (
                  <TouchableOpacity onPress={()=>{ setCustomerLookupSearch(''); setLookupCustomerId(null); }}>
                    <Text style={{color:'#aaa', fontSize:16, fontWeight:'bold', paddingLeft:6}}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Selected customer header */}
              {selectedCust && (
                <View style={{backgroundColor:'#e3f2fd', borderRadius:8, padding:10, marginBottom:8, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                  <View style={{flex:1, flexDirection:'row', alignItems:'center', gap:8}}>
                    <View style={{flex:1}}>
                      <Text style={{fontSize:15, fontWeight:'bold', color:'#0d47a1'}}>👤 {selectedCust.name}</Text>
                      {selectedCust.phone ? <Text style={{fontSize:12, color:'#555'}}>📞 {selectedCust.phone}</Text> : null}
                      <Text style={{fontSize:11, color:'#777', marginTop:2}}>{customerOrders.length} παραγγελ{customerOrders.length===1?'ία':'ίες'}</Text>
                    </View>
                    <TouchableOpacity onPress={()=>setLookupCustInfo(true)} style={{backgroundColor:'#0d47a1', borderRadius:8, paddingHorizontal:10, paddingVertical:6}}>
                      <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>ℹ ΣΤΟΙΧΕΙΑ</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={()=>{setLookupCustInfo(false);setLookupCustomerId(null);}} style={{padding:6}}>
                    <Text style={{color:'#0d47a1', fontWeight:'bold', fontSize:12}}>← Πίσω</Text>
                  </TouchableOpacity>
                </View>
              )}

              {lookupCustInfo && selectedCust && (
                <Modal visible transparent animationType="fade" onRequestClose={()=>setLookupCustInfo(false)}>
                  <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:20}}>
                    <View style={{backgroundColor:'white', borderRadius:14, width:'92%', maxWidth:460, padding:18}}>
                      <Text style={{fontSize:17, fontWeight:'bold', color:'#0d47a1', marginBottom:12}}>👤 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ</Text>
                      <Text style={{fontSize:15, fontWeight:'bold', color:'#1a1a1a', marginBottom:6}}>{selectedCust.name}</Text>
                      {selectedCust.identifier ? <Text style={{fontSize:13, color:'#555', marginBottom:3}}>🏷 {selectedCust.identifier}</Text> : null}
                      {[selectedCust.phone, selectedCust.phone2, selectedCust.phone3].filter(Boolean).map((p,i)=>(
                        <Text key={i} style={{fontSize:13, color:'#333', marginBottom:3}}>📞 {p}</Text>
                      ))}
                      {selectedCust.phoneViber ? <Text style={{fontSize:13, color: selectedCust.viberOptOut?'#c62828':'#7360f2', fontWeight:'bold', marginBottom:3}}>{selectedCust.viberOptOut?'🚫 ':'📱 '}Viber: {selectedCust.phoneViber}{selectedCust.viberOptOut?' (απεγγράφηκε)':''}</Text> : null}
                      {selectedCust.email ? <Text style={{fontSize:13, color:'#333', marginBottom:3}}>✉️ {selectedCust.email}</Text> : null}
                      {selectedCust.city ? <Text style={{fontSize:13, color:'#333', marginBottom:3}}>📍 {selectedCust.city}</Text> : null}
                      {selectedCust.profession ? <Text style={{fontSize:13, color:'#333', marginBottom:3}}>💼 {selectedCust.profession}</Text> : null}
                      <TouchableOpacity onPress={()=>setLookupCustInfo(false)} style={{marginTop:16, backgroundColor:'#0d47a1', borderRadius:10, padding:12, alignItems:'center'}}>
                        <Text style={{color:'white', fontWeight:'bold'}}>ΚΛΕΙΣΙΜΟ</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}

              {/* Lists area */}
              <ScrollView style={{maxHeight:360}} keyboardShouldPersistTaps="handled">
                {/* Αν δεν έχει γίνει επιλογή πελάτη → δείξε αποτελέσματα αναζήτησης πελατών */}
                {!selectedCust && (
                  <>
                    {customerLookupSearch.trim().length === 0 && (
                      <Text style={{color:'#999', fontSize:12, textAlign:'center', padding:20}}>
                        Γράψε όνομα ή τηλέφωνο για αναζήτηση πελάτη.
                      </Text>
                    )}
                    {customerLookupSearch.trim().length > 0 && filteredCustomers.length === 0 && (
                      <Text style={{color:'#aaa', fontSize:12, textAlign:'center', padding:20}}>Δεν βρέθηκαν πελάτες.</Text>
                    )}
                    {filteredCustomers.map(c => {
                      const orderCount = activeOrders.filter(o => o.customer && c.name && o.customer.trim().toLowerCase() === c.name.trim().toLowerCase()).length;
                      return (
                        <TouchableOpacity key={c.id}
                          onPress={()=>setLookupCustomerId(c.id)}
                          style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                          <View style={{flex:1}}>
                            <Text style={{fontSize:14, fontWeight:'bold', color:'#1a1a1a'}}>{c.name}</Text>
                            {c.phone ? <Text style={{fontSize:12, color:'#666'}}>📞 {c.phone}</Text> : null}
                          </View>
                          <View style={{backgroundColor:'#8B0000', borderRadius:10, paddingHorizontal:8, paddingVertical:3, minWidth:30, alignItems:'center', marginLeft:8}}>
                            <Text style={{color:'white', fontWeight:'bold', fontSize:11}}>{orderCount}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* Αν έχει επιλεγεί πελάτης → δείξε τις παραγγελίες του περιληπτικά */}
                {selectedCust && (
                  <>
                    {customerOrders.length === 0 && (
                      <Text style={{color:'#aaa', fontSize:12, textAlign:'center', padding:20}}>Ο πελάτης δεν έχει παραγγελίες.</Text>
                    )}
                    {customerOrders.map(o => {
                      const tab = getOrderTabInfo(o);
                      const dims = `${o.h||'—'}×${o.w||'—'}`;
                      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                      return (
                        <TouchableOpacity key={o.id}
                          onPress={()=>setLookupOrderModal({ visible:true, order:o })}
                          style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor:'#fff'}}>
                          <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                            <Text style={{fontSize:14, fontWeight:'900', color:'#1a1a1a', minWidth:54}}>#{o.orderNo||'—'}</Text>
                            <Text style={{fontSize:12, color:'#1a1a1a', fontWeight:'bold'}}>{dims}</Text>
                            <Text style={{fontSize:11, color:'#555'}}>{o.side||'—'}</Text>
                            <Text style={{fontSize:11, color:'#555'}}>{o.armor||'—'}</Text>
                            <View style={{backgroundColor:tab.color, borderRadius:4, paddingHorizontal:6, paddingVertical:1, marginLeft:'auto'}}>
                              <Text style={{color:'white', fontWeight:'bold', fontSize:10}}>{tab.label}</Text>
                            </View>
                          </View>
                          <View style={{flexDirection:'row', alignItems:'center', gap:10, marginTop:3}}>
                            {o.programNo ? <Text style={{fontSize:11, color:'#cc3300', fontWeight:'bold'}}>Α.Π. {o.programNo}</Text> : null}
                            {createdFmt ? <Text style={{fontSize:11, color:'#888'}}>📅 {createdFmt}</Text> : null}
                            {o.lock ? <Text style={{fontSize:11, color:'#555'}} numberOfLines={1}>🔒 {o.lock}</Text> : null}
                          </View>
                          <PhaseBadges order={o} />
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        );
      })()}

      {/* Modal 2 — λεπτομέρειες παραγγελίας (view-only) + εκτύπωση */}
      <Modal visible={lookupOrderModal.visible} transparent animationType="fade" onRequestClose={()=>setLookupOrderModal({visible:false, order:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:20}}>
          <View style={{backgroundColor:'white', borderRadius:14, width:'92%', maxWidth:820, maxHeight:'92%', overflow:'hidden'}}>
            {/* Header */}
            <View style={{backgroundColor:'#0d47a1', padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
              <View style={{flex:1}}>
                <Text style={{color:'white', fontSize:16, fontWeight:'900', letterSpacing:1}}>
                  📄 ΚΑΡΤΕΛΑ ΠΑΡΑΓΓΕΛΙΑΣ #{lookupOrderModal.order?.orderNo || '—'}
                </Text>
                <Text style={{color:'rgba(255,255,255,0.75)', fontSize:11, marginTop:2}}>Μόνο προβολή</Text>
              </View>
              <TouchableOpacity
                onPress={()=>printSingleOrderFull(lookupOrderModal.order)}
                style={{backgroundColor:'white', paddingHorizontal:14, paddingVertical:8, borderRadius:8, marginRight:10}}>
                <Text style={{color:'#0d47a1', fontWeight:'bold', fontSize:13}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setLookupOrderModal({visible:false, order:null})} style={{padding:6}}>
                <Text style={{color:'white', fontSize:22, fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Body */}
            <ScrollView style={{padding:16}} contentContainerStyle={{paddingBottom:24}}>
              {lookupOrderModal.order && (() => {
                const o = lookupOrderModal.order;
                const createdFmt  = o.createdAt    ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
                const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
                const tab = getOrderTabInfo(o);
                const coats = Array.isArray(o.coatings) ? o.coatings : [];
                const exo   = coats.filter(c => /ΕΞΩ|εξω|έξω/i.test(c));
                const mesa  = coats.filter(c => /ΜΕΣΑ|μεσα|ΕΣΩΤ/i.test(c));
                const other = coats.filter(c => !exo.includes(c) && !mesa.includes(c));
                const stav  = Array.isArray(o.stavera) ? o.stavera : [];
                const K = ({label, value, flex=1})=>(
                  <View style={{flex, minWidth:120, paddingVertical:4}}>
                    <Text style={{fontSize:10, color:'#888', fontWeight:'bold', letterSpacing:0.5}}>{label}</Text>
                    <Text style={{fontSize:14, color:'#1a1a1a', fontWeight:'600'}}>{value ?? '—'}</Text>
                  </View>
                );
                return (
                  <View>
                    {/* Meta */}
                    <View style={{flexDirection:'row', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap'}}>
                      <View style={{backgroundColor:tab.color, borderRadius:6, paddingHorizontal:10, paddingVertical:3}}>
                        <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>{tab.label}</Text>
                      </View>
                      {o.programNo ? (
                        <View style={isUrgentProgram(o.programNo) ? {borderWidth:3, borderColor:'#cc3300', borderRadius:4, paddingHorizontal:6, paddingVertical:2} : {}}>
                          <Text style={{color:'#cc3300', fontWeight:'900', fontSize:14}}>Α.Π. {o.programNo}</Text>
                        </View>
                      ) : null}
                      <Text style={{fontSize:12, color:'#555'}}>📅 Καταχώρηση: <Text style={{fontWeight:'bold'}}>{createdFmt}</Text></Text>
                      <Text style={{fontSize:12, color:'#555'}}>🚚 Παράδοση: <Text style={{fontWeight:'bold'}}>{deliveryFmt}</Text></Text>
                    </View>

                    <PhaseBadges order={o} />

                    {/* Πελάτης */}
                    <View style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}}>
                      <Text style={{fontSize:11, fontWeight:'bold', color:'#0d47a1', letterSpacing:1, marginBottom:4}}>ΠΕΛΑΤΗΣ</Text>
                      <Text style={{fontSize:15, fontWeight:'bold', color:'#1a1a1a'}}>{o.customer || '—'}</Text>
                    </View>

                    {/* Διαστάσεις */}
                    <View style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}}>
                      <Text style={{fontSize:11, fontWeight:'bold', color:'#0d47a1', letterSpacing:1, marginBottom:4}}>ΔΙΑΣΤΑΣΕΙΣ & ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ</Text>
                      <View style={{flexDirection:'row', flexWrap:'wrap'}}>
                        <K label="ΥΨΟΣ (H)" value={o.h}/>
                        <K label="ΠΛΑΤΟΣ (W)" value={o.w}/>
                        <K label="ΤΕΜΑΧΙΑ" value={o.qty||'1'}/>
                        <K label="ΜΕΝΤΕΣΕΔΕΣ" value={o.hinges}/>
                        <K label="ΠΛΕΥΡΑ" value={o.side}/>
                        <K label="ΘΩΡΑΚΙΣΗ" value={o.armor}/>
                        <K label="ΤΥΠΟΣ ΣΑΣΙ" value={o.sasiType}/>
                        <K label="ΤΥΠΟΣ ΚΑΣΑΣ" value={o.caseType}/>
                        <K label="ΥΛΙΚΟ ΚΑΣΑΣ" value={o.caseMaterial}/>
                        <K label="ΤΟΠΟΘΕΤΗΣΗ" value={o.installation}/>
                        {o.heightReduction ? <K label="ΜΕΙΩΣΗ ΥΨΟΥΣ" value={o.heightReduction}/> : null}
                      </View>
                    </View>

                    {/* Κλειδαριά / Τζάμι / Μηχανισμοί */}
                    <View style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}}>
                      <Text style={{fontSize:11, fontWeight:'bold', color:'#0d47a1', letterSpacing:1, marginBottom:4}}>ΚΛΕΙΔΑΡΙΑ · ΤΖΑΜΙ · ΜΗΧΑΝΙΣΜΟΙ</Text>
                      <View style={{flexDirection:'row', flexWrap:'wrap'}}>
                        <View style={{flex:1, minWidth:200, paddingVertical:4}}>
                          <Text style={{fontSize:10, color:'#888', fontWeight:'bold', letterSpacing:0.5}}>ΚΛΕΙΔΑΡΙΑ</Text>
                          <Text style={[{fontSize:14, color:'#1a1a1a', fontWeight:'600'}, lockStyle(o.lock, 14)]}>{o.lock || '—'}</Text>
                        </View>
                        <K label="ΤΖΑΜΙ (ΔΙΑΣΤ.)" value={o.glassDim}/>
                        <K label="ΤΖΑΜΙ (ΣΗΜ.)" value={o.glassNotes} flex={2}/>
                        <K label="ΜΗΧΑΝΙΣΜΟΙ" value={o.hardware} flex={2}/>
                      </View>
                    </View>

                    {/* Επενδύσεις */}
                    <View style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}}>
                      <Text style={{fontSize:11, fontWeight:'bold', color:'#0d47a1', letterSpacing:1, marginBottom:4}}>ΕΠΕΝΔΥΣΕΙΣ</Text>
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:10}}>
                        <View style={{flex:1, minWidth:220}}>
                          <Text style={{fontSize:10, color:'#888', fontWeight:'bold'}}>ΕΞΩ</Text>
                          <Text style={{fontSize:14, color:'#1a1a1a'}}>
                            {exo.length === 0 ? '—' : exo.map((n,i)=>(<Text key={i} style={coatingStyle(n,14)}>{i>0?', ':''}{n}</Text>))}
                          </Text>
                        </View>
                        <View style={{flex:1, minWidth:220}}>
                          <Text style={{fontSize:10, color:'#888', fontWeight:'bold'}}>ΜΕΣΑ</Text>
                          <Text style={{fontSize:14, color:'#1a1a1a'}}>
                            {mesa.length === 0 ? '—' : mesa.map((n,i)=>(<Text key={i} style={coatingStyle(n,14)}>{i>0?', ':''}{n}</Text>))}
                          </Text>
                        </View>
                        {other.length > 0 && (
                          <View style={{flex:1, minWidth:220}}>
                            <Text style={{fontSize:10, color:'#888', fontWeight:'bold'}}>ΑΛΛΕΣ</Text>
                            <Text style={{fontSize:14, color:'#1a1a1a'}}>
                              {other.map((n,i)=>(<Text key={i} style={coatingStyle(n,14)}>{i>0?', ':''}{n}</Text>))}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Σταθερά */}
                    {stav.length > 0 && (
                      <View style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}}>
                        <Text style={{fontSize:11, fontWeight:'bold', color:'#0d47a1', letterSpacing:1, marginBottom:4}}>📐 ΣΤΑΘΕΡΑ</Text>
                        <View style={{flexDirection:'row', backgroundColor:'#f5f5f5', padding:6, borderRadius:4, marginBottom:4}}>
                          <Text style={{flex:0.5, fontSize:11, fontWeight:'bold', color:'#555'}}>#</Text>
                          <Text style={{flex:1, fontSize:11, fontWeight:'bold', color:'#555'}}>ΥΨΟΣ</Text>
                          <Text style={{flex:1, fontSize:11, fontWeight:'bold', color:'#555'}}>ΠΛΑΤΟΣ</Text>
                          <Text style={{flex:0.8, fontSize:11, fontWeight:'bold', color:'#555'}}>ΤΕΜ.</Text>
                          <Text style={{flex:2, fontSize:11, fontWeight:'bold', color:'#555'}}>ΣΗΜ.</Text>
                        </View>
                        {stav.map((s,i)=>(
                          <View key={i} style={{flexDirection:'row', paddingVertical:4, borderTopWidth:i>0?1:0, borderTopColor:'#eee'}}>
                            <Text style={{flex:0.5, fontSize:12}}>{i+1}</Text>
                            <Text style={{flex:1, fontSize:12}}>{s.h || s.dim || ''}</Text>
                            <Text style={{flex:1, fontSize:12}}>{s.w || ''}</Text>
                            <Text style={{flex:0.8, fontSize:12}}>{s.qty || ''}</Text>
                            <Text style={{flex:2, fontSize:12}}>{s.note || ''}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Σημειώσεις */}
                    {o.notes ? (
                      <View style={{borderWidth:1, borderColor:'#ffe082', backgroundColor:'#fffdf5', borderRadius:8, padding:10, marginBottom:10}}>
                        <Text style={{fontSize:11, fontWeight:'bold', color:'#b28704', letterSpacing:1, marginBottom:4}}>📝 ΣΗΜΕΙΩΣΕΙΣ</Text>
                        <Text style={{fontSize:13, color:'#1a1a1a', lineHeight:18}}>{o.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ΚΑΛΑΘΙ ΑΛΛΑΓΩΝ — floating draggable panel */}
      {pendingChanges.length > 0 && (
        <View style={{
          position:'absolute', top: 80 + panPos.y, right: 'auto', left: `calc(100% - 276px + ${panPos.x}px)`,
          width:260, backgroundColor:'#1a1a2e', borderRadius:12, elevation:20, zIndex:999,
          shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.4, shadowRadius:8,
        }}>
          {/* Header — drag handle */}
          <View
            onStartShouldSetResponder={()=>false}
            style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:10, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.15)', cursor:'grab'}}
            {...(Platform.OS==='web' ? {
              onMouseDown: handleDragStart,
              onTouchStart: handleDragStart,
            } : {})}>
            <Text style={{color:'#FFD600', fontWeight:'bold', fontSize:13}}>
              ☰ 📋 ΕΚΚΡΕΜΕΙΣ ({pendingChanges.length})
            </Text>
          </View>
          {/* Λίστα αλλαγών */}
          <ScrollView style={{maxHeight:180}} showsVerticalScrollIndicator={false} contentContainerStyle={{padding:8}}>
            {pendingChanges.map((c,i)=>(
              <View key={i} style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:5, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.08)'}}>
                <Text style={{color:'white', fontSize:12}}>
                  <Text style={{fontWeight:'bold', fontSize:16}}>#{c.orderNo}</Text>
                  {'  '}
                  <Text style={{color: c.action==='done'?'#4caf50':'#ff9800', fontWeight:'bold'}}>
                    {c.action==='done' ? '✓ DONE' : '↩ UNDO'}
                  </Text>
                </Text>
                <TouchableOpacity onPress={()=>setPendingChanges(prev=>prev.filter((_,j)=>j!==i))}>
                  <Text style={{color:'#ff4444', fontSize:15, paddingHorizontal:6}}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          {/* Κουμπιά */}
          <View style={{flexDirection:'row', gap:8, padding:10, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.15)'}}>
            <TouchableOpacity
              style={{flex:1, padding:8, borderRadius:8, alignItems:'center', backgroundColor:'#555'}}
              onPress={()=>setPendingChanges([])}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{flex:2, padding:8, borderRadius:8, alignItems:'center', backgroundColor:'#2e7d32'}}
              onPress={()=>{
                setConfirmModal({
                  visible: true,
                  title: '✅ Επιβεβαίωση αλλαγών',
                  message: `Πρόκειται να εκτελεστούν ${pendingChanges.length} αλλαγές.\n\nΕίσαι σίγουρος;`,
                  confirmText: 'ΕΠΙΒΕΒΑΙΩΣΗ',
                  onConfirm: async () => {
                    const batch = [...pendingChanges];
                    // Εφαρμόζουμε όλες τις αλλαγές σε ένα running snapshot.
                    let workingOrders = specialOrders;
                    const violations = [];
                    const completedOrders = [];
                    const activityLogs = [];

                    for (const c of batch) {
                      let order = workingOrders.find(o => o.id === c.orderId);
                      if (!order || !order.phases) continue;

                      // Backward compat: αν λείπει η φάση, την δημιουργούμε
                      if (!order.phases[c.phaseKey]) {
                        const defaultActive = c.phaseKey === 'epend'
                          ? !!(order.coatings && order.coatings.length > 0)
                          : true;
                        if (!defaultActive && c.action === 'done') continue;
                        order = { ...order, phases: { ...order.phases, [c.phaseKey]: { active: defaultActive, printed: false, done: false } } };
                        workingOrders = workingOrders.map(o => o.id === c.orderId ? order : o);
                      }

                      if (c.action === 'undone') {
                        const existingPhase = order.phases[c.phaseKey] || { active: true, printed: false, done: false };
                        const forceActive = c.phaseKey === 'epend' && !!(order.coatings && order.coatings.length > 0);
                        const updatedPhase = { ...existingPhase, done: false, active: forceActive ? true : existingPhase.active };
                        const upd = { ...order, phases: { ...order.phases, [c.phaseKey]: updatedPhase } };
                        workingOrders = workingOrders.map(o => o.id === c.orderId ? upd : o);
                        continue;
                      }

                      // c.action === 'done': έλεγχοι κανόνων
                      if (c.phaseKey === 'montDoor') {
                        const prevPhases = ['laser','cases','montSasi','vafio'];
                        const notDone = prevPhases.filter(k => order.phases?.[k]?.active && !order.phases?.[k]?.done);
                        if (notDone.length > 0) {
                          violations.push({ orderNo: order.orderNo, type: 'prevPhases', phases: notDone });
                          continue;
                        }
                        if (order.coatings && order.coatings.length > 0) {
                          const ependPhase = order.phases?.['epend'];
                          if (!ependPhase || !ependPhase.done) {
                            violations.push({ orderNo: order.orderNo, type: 'ependFirst' });
                            continue;
                          }
                        }
                      }

                      const newPhases = { ...order.phases, [c.phaseKey]: { ...order.phases[c.phaseKey], done: true } };
                      const upd = { ...order, phases: newPhases };
                      workingOrders = workingOrders.map(o => o.id === c.orderId ? upd : o);

                      activityLogs.push({ phaseKey: c.phaseKey, order: upd });

                      // Έλεγχος: ολοκληρώθηκαν όλες οι φάσεις;
                      if (order.status === 'PROD') {
                        const hasCoatings = !!(order.coatings && order.coatings.filter(x => x && String(x).trim()).length > 0);
                        const hasInstallation = order.installation === 'ΝΑΙ';
                        const allDone = Object.keys(newPhases).every(k => {
                          if (k === 'epend' && !hasCoatings) return true;
                          if (k === 'montDoor' && !hasInstallation) return true;
                          return !newPhases[k].active || newPhases[k].done;
                        });
                        if (allDone) {
                          const hasStaveraItems = order.stavera && order.stavera.filter(s => s.dim).length > 0;
                          const staveraPending = hasStaveraItems && !order.staveraDone;
                          const glassPending = isGlassPending(order);
                          // Αν η ίδια παραγγελία ήδη υπάρχει στη λίστα, μην την ξαναπροσθέσεις
                          if (!completedOrders.find(co => co.order.id === upd.id)) {
                            completedOrders.push({ order: upd, staveraPending, glassPending });
                          }
                        }
                      }
                    }

                    // Εφαρμογή state ΜΙΑ ΦΟΡΑ
                    setSpecialOrders(workingOrders);

                    // Συγχρονισμός κάθε επηρεαζόμενης παραγγελίας στο Firebase (μία φορά ανά παραγγελία)
                    const affectedIds = [...new Set(batch.map(c => c.orderId))];
                    for (const id of affectedIds) {
                      const o = workingOrders.find(x => x.id === id);
                      if (o) await syncToCloud(o);
                    }

                    // Activity logs
                    for (const log of activityLogs) {
                      const phaseLabel = PHASES.find(p => p.key === log.phaseKey)?.label?.replace(/🔴|🟡|🔵|🟢|⚫/g, '').trim() || log.phaseKey;
                      await logActivity('ΕΙΔΙΚΗ', `Φάση ✓ ${phaseLabel}`, { orderNo: log.order.orderNo, customer: log.order.customer, size: `${log.order.h}x${log.order.w}` });
                    }

                    setLastChangedIds(batch.map(c => ({ orderId: c.orderId, phaseKey: c.phaseKey })));
                    setPendingChanges([]);

                    // ΕΝΑ popup για ΟΛΕΣ τις παραγγελίες που τελείωσαν (αντί αλυσίδα)
                    const showCompletionPopup = () => {
                      if (completedOrders.length === 0) return;
                      const normalOrders  = completedOrders.filter(c => !c.staveraPending && !c.glassPending);
                      const pendingOrders = completedOrders.filter(c =>  c.staveraPending ||  c.glassPending);
                      const pendingLabelOf = c => c.staveraPending && c.glassPending ? 'σταθ.+τζάμι'
                                              : c.staveraPending ? 'σταθερό' : 'τζάμι';
                      const parts = [];
                      if (normalOrders.length > 0) {
                        parts.push(`Μεταφέρονται στα ΕΤΟΙΜΑ:\n${normalOrders.map(c => `#${c.order.orderNo}`).join(', ')}`);
                      }
                      if (pendingOrders.length > 0) {
                        parts.push(`⚠️ Με εκκρεμότητες (η πόρτα κατεβαίνει, η εκκρεμότητα μένει σε εξέλιξη):\n${pendingOrders.map(c => `#${c.order.orderNo} (${pendingLabelOf(c)})`).join(', ')}`);
                      }
                      setConfirmModal({
                        visible: true,
                        title: '✅ ΟΛΟΚΛΗΡΩΘΗΚΑΝ ΟΙ ΦΑΣΕΙΣ ΠΑΡΑΓΩΓΗΣ',
                        message: parts.join('\n\n'),
                        confirmText: '📦 ΕΠΙΒΕΒΑΙΩΣΗ',
                        onConfirm: async () => {
                          const now = Date.now();
                          const updsMap = new Map();
                          for (const c of normalOrders)  updsMap.set(c.order.id, { ...c.order, status: 'READY', readyAt: now });
                          for (const c of pendingOrders) updsMap.set(c.order.id, { ...c.order, status: 'READY', readyAt: now,
                            ...(c.staveraPending && { staveraPendingAtReady: true }),
                            ...(c.glassPending && { glassPendingAtReady: true }) });
                          setSpecialOrders(prev => prev.map(o => updsMap.get(o.id) || o));
                          for (const upd of updsMap.values()) await syncToCloud(upd);
                          for (const c of normalOrders) {
                            await logActivity('ΕΙΔΙΚΗ', 'Φάση → ΕΤΟΙΜΟ (όλες done)', { orderNo: c.order.orderNo, customer: c.order.customer, size: `${c.order.h}x${c.order.w}` });
                          }
                          for (const c of pendingOrders) {
                            await logActivity('ΕΙΔΙΚΗ', `Φάση → ΕΤΟΙΜΟ (εκκρεμές ${pendingLabelOf(c)})`, { orderNo: c.order.orderNo, customer: c.order.customer, size: `${c.order.h}x${c.order.w}` });
                          }
                        }
                      });
                    };

                    // Αν υπάρχουν παραβιάσεις, δείξε ένα συγκεντρωτικό popup πρώτα
                    if (violations.length > 0) {
                      const labels = { laser: 'LASER', cases: 'ΚΑΣΕΣ', montSasi: 'ΣΑΣΙ', vafio: 'ΒΑΦΕΙΟ' };
                      const lines = violations.map(v => {
                        if (v.type === 'prevPhases') {
                          return `#${v.orderNo}: ΜΟΝΤΑΡΙΣΜΑ - λείπουν: ${v.phases.map(p => labels[p] || p).join(', ')}`;
                        }
                        if (v.type === 'ependFirst') {
                          return `#${v.orderNo}: ΜΟΝΤΑΡΙΣΜΑ - πρώτα ΕΠΕΝΔΥΣΕΙΣ`;
                        }
                        return `#${v.orderNo}: άγνωστο σφάλμα`;
                      });
                      setConfirmModal({
                        visible: true,
                        title: '⚠️ Κάποιες αλλαγές δεν εφαρμόστηκαν',
                        message: `${violations.length} αλλαγές δεν μπόρεσαν να γίνουν:\n\n${lines.join('\n')}`,
                        confirmText: 'ΟΚ',
                        onConfirm: () => showCompletionPopup()
                      });
                    } else {
                      showCompletionPopup();
                    }
                  }
                });
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>✅ ΕΠΙΒΕΒΑΙΩΣΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODAL ΚΛΕΙΔΑΡΙΕΣ */}
      <Modal visible={showLockPicker} transparent animationType="slide" onRequestClose={()=>setShowLockPicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'70%'}}>
            <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🔒 Κλειδαριά</Text>
              <TouchableOpacity onPress={()=>setShowLockPicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{setLockEditText('');setCustomForm({...customForm,lock:''});setShowLockPicker(false);}}>
                <Text style={{fontSize:15,color:'#888'}}>— Χωρίς κλειδαριά</Text>
                {!customForm.lock&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
              {(locks||[]).map(l=>(
                <TouchableOpacity key={l.id}
                  style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                  onPress={()=>{ const base = l.name+(l.type?' ('+l.type+')':''); setLockEditText(base); setCustomForm({...customForm,lock:base}); }}>
                  <View>
                    <Text style={{fontSize:15,color:'#000',fontWeight:'600'}}>{l.name}</Text>
                    {l.type?<Text style={{fontSize:12,color:'#666'}}>{l.type}</Text>:null}
                  </View>
                  {customForm.lock.startsWith(l.name+(l.type?' ('+l.type+')':''))&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
                </TouchableOpacity>
              ))}
              {(locks||[]).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:24}}>Δεν υπάρχουν καταχωρημένες κλειδαριές.</Text>}
            </ScrollView>
            {/* Πεδίο επεξεργασίας — εμφανίζεται μόνο αν έχει επιλεγεί κλειδαριά */}
            {lockEditText!==''&&(
              <View style={{padding:12,borderTopWidth:1,borderTopColor:'#eee',backgroundColor:'#f9f9f9'}}>
                <Text style={{fontSize:11,fontWeight:'bold',color:'#555',marginBottom:6,letterSpacing:0.5}}>✏️ ΕΠΕΞΕΡΓΑΣΙΑ / ΠΡΟΣΘΗΚΗ ΚΕΙΜΕΝΟΥ</Text>
                <TextInput
                  autoFocus
                  style={{backgroundColor:'#fff',borderWidth:2,borderColor:'#8B0000',borderRadius:8,padding:10,fontSize:14,color:'#1a1a1a',marginBottom:8}}
                  value={lockEditText}
                  onChangeText={v=>{ setLockEditText(v); setCustomForm(f=>({...f,lock:v})); }}
                  returnKeyType="done"
                  onSubmitEditing={()=>setShowLockPicker(false)}
                />
                <TouchableOpacity
                  style={{backgroundColor:'#8B0000',padding:12,borderRadius:8,alignItems:'center'}}
                  onPress={()=>setShowLockPicker(false)}>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>✓ ΟΚ</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{height:lockEditText===''?20:0}}/>
          </View>
        </View>
      </Modal>

      {/* MODAL ΕΠΕΝΔΥΣΕΙΣ */}
      <Modal visible={showCoatingsPicker} transparent animationType="slide" onRequestClose={()=>setShowCoatingsPicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'60%'}}>
            <View style={{backgroundColor:'#007AFF',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🎨 Επένδυση Πόρτας</Text>
              <TouchableOpacity onPress={()=>setShowCoatingsPicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {coatings.length===0 && (
                <Text style={{padding:20,color:'#aaa',textAlign:'center'}}>Δεν υπάρχουν επενδύσεις. Προσθέστε από το μενού ☰.</Text>
              )}
              {[...coatings].sort((a,b)=>{
                const nameA = (a.name||'').toUpperCase();
                const nameB = (b.name||'').toUpperCase();
                const groupOf = n => n.includes('ΕΞΩ') ? 0 : (n.includes('ΜΕΣΑ')||n.includes('ΕΣΩΤ')) ? 1 : 2;
                const gA = groupOf(nameA), gB = groupOf(nameB);
                if (gA !== gB) return gA - gB;
                return (a.name||'').localeCompare(b.name||'', 'el');
              }).map(c=>{
                const curCoatings = pickerEditMode ? (editForm.coatings||[]) : (customForm.coatings||[]);
                const selected = curCoatings.includes(c.name);
                const n = c.name?.toLowerCase()||'';
                const bg = n.includes('μέσα')||n.includes('μεσα') ? '#E8F4FD' : n.includes('έξω')||n.includes('εξω') ? '#FFF3E0' : '#fff';
                return (
                  <TouchableOpacity key={c.id}
                    style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between', backgroundColor: bg}}
                    onPress={()=>{
                      const updated = selected ? curCoatings.filter(x=>x!==c.name) : [...curCoatings,c.name];
                      if (pickerEditMode) setEditForm(f=>({...f,coatings:updated}));
                      else setCustomForm({...customForm,coatings:updated});
                      if (!selected && updated.length >= 2) {
                        setTimeout(()=>setShowCoatingsPicker(false), 150);
                      }
                    }}>
                    <Text style={{fontSize:15,color:'#000'}}>{c.name}</Text>
                    {selected && <Text style={{color:'#007AFF',fontSize:18,fontWeight:'bold'}}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
              {/* Κουμπί εκκαθάρισης */}
              {((pickerEditMode?editForm.coatings:customForm.coatings)||[]).length>0&&(
                <TouchableOpacity
                  style={{margin:12,padding:12,backgroundColor:'#ff4444',borderRadius:8,alignItems:'center'}}
                  onPress={()=>{
                    if (pickerEditMode) setEditForm(f=>({...f,coatings:[]}));
                    else setCustomForm({...customForm,coatings:[]});
                  }}>
                  <Text style={{color:'white',fontWeight:'bold'}}>ΕΚΚΑΘΑΡΙΣΗ ΕΠΙΛΟΓΩΝ</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity
              style={{margin:12,padding:14,backgroundColor:'#007AFF',borderRadius:8,alignItems:'center'}}
              onPress={()=>setShowCoatingsPicker(false)}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΟΛΟΚΛΗΡΩΣΗ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΑΔΟΣΗΣ */}
      <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={()=>setShowDatePicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,padding:16}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <Text style={{fontWeight:'bold',fontSize:16}}>📅 Ημερομηνία Παράδοσης</Text>
              <TouchableOpacity onPress={()=>setShowDatePicker(false)}>
                <Text style={{fontSize:20,fontWeight:'bold',color:'#888'}}>✕</Text>
              </TouchableOpacity>
            </View>
            {(()=>{
              const months = ['ΙΑΝ','ΦΕΒ','ΜΑΡ','ΑΠΡ','ΜΑΙ','ΙΟΥΝ','ΙΟΥΛ','ΑΥΓ','ΣΕΠ','ΟΚΤ','ΝΟΕ','ΔΕΚ'];
              const now = new Date();
              const [selDay,setSelDay] = useState(String(now.getDate()));
              const [selMonth,setSelMonth] = useState(String(now.getMonth()+1));
              const [selYear,setSelYear] = useState(String(now.getFullYear()));
              const days = Array.from({length:31},(_,i)=>String(i+1));
              const years = [String(now.getFullYear()),String(now.getFullYear()+1)];
              return (<>
                <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Ημέρα:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
                  <View style={{flexDirection:'row',gap:6}}>
                    {days.map(d=>(
                      <TouchableOpacity key={d} onPress={()=>setSelDay(d)}
                        style={{width:36,height:36,borderRadius:18,backgroundColor:selDay===d?'#8B0000':'#eee',alignItems:'center',justifyContent:'center'}}>
                        <Text style={{color:selDay===d?'white':'#333',fontWeight:'bold',fontSize:12}}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Μήνας:</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12}}>
                  {months.map((m,i)=>(
                    <TouchableOpacity key={m} onPress={()=>setSelMonth(String(i+1))}
                      style={{paddingHorizontal:10,paddingVertical:6,borderRadius:6,backgroundColor:selMonth===String(i+1)?'#8B0000':'#eee'}}>
                      <Text style={{color:selMonth===String(i+1)?'white':'#333',fontWeight:'bold',fontSize:12}}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{fontWeight:'bold',color:'#555',marginBottom:6}}>Έτος:</Text>
                <View style={{flexDirection:'row',gap:6,marginBottom:16}}>
                  {years.map(y=>(
                    <TouchableOpacity key={y} onPress={()=>setSelYear(y)}
                      style={{paddingHorizontal:16,paddingVertical:8,borderRadius:6,backgroundColor:selYear===y?'#8B0000':'#eee'}}>
                      <Text style={{color:selYear===y?'white':'#333',fontWeight:'bold'}}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={{backgroundColor:'#8B0000',padding:14,borderRadius:8,alignItems:'center'}}
                  onPress={()=>{
                    setCustomForm({...customForm,deliveryDate:`${selDay}/${selMonth}/${selYear}`});
                    setShowDatePicker(false);
                  }}>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΕΠΙΛΟΓΗ</Text>
                </TouchableOpacity>
              </>);
            })()}
            <View style={{height:20}}/>
          </View>
        </View>
      </Modal>


      <DuplicateModal
        visible={dupModal.visible}
        base={dupModal.base}
        suggested={dupModal.suggested}
        onUse={dupModal.onUse}
        onKeep={dupModal.onKeep}
        onCancel={dupModal.onCancel}
      />
      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        onConfirm={()=>{ setConfirmModal(m=>({...m,visible:false})); if(confirmModal.onConfirm) confirmModal.onConfirm(); }}
        onCancel={()=>setConfirmModal(m=>({...m,visible:false}))}
      />

      {/* MODAL ΔΙΑΓΡΑΦΗΣ ΑΡΧΕΙΟΥ — με κωδικό */}
      <Modal visible={archiveDeleteModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#b71c1c', marginBottom:8, textAlign:'center'}}>🗑️ Διαγραφή από Αρχείο</Text>
            <Text style={{fontSize:13, color:'#555', marginBottom:16, textAlign:'center'}}>Εισάγετε τον κωδικό διαγραφής για να συνεχίσετε.</Text>
            <View style={{flexDirection:'row', alignItems:'center', marginBottom:8}}>
              <TextInput
                style={{flex:1, borderWidth:2, borderColor: archiveDeleteModal.error?'#ff4444':'#ddd', borderRadius:8, padding:12, fontSize:16, letterSpacing:4, textAlign:'center'}}
                placeholder="Κωδικός..."
                secureTextEntry={!archiveDeleteModal.showPwd}
                value={archiveDeleteModal.pwd}
                onChangeText={v=>setArchiveDeleteModal(m=>({...m, pwd:v, error:false}))}
                autoFocus
              />
              <TouchableOpacity onPress={()=>setArchiveDeleteModal(m=>({...m, showPwd:!m.showPwd}))} style={{padding:10, marginLeft:4}}>
                <Text style={{fontSize:22}}>{archiveDeleteModal.showPwd?'🙈':'👁️'}</Text>
              </TouchableOpacity>
            </View>
            {archiveDeleteModal.error&&<Text style={{color:'#ff4444', fontSize:12, textAlign:'center', marginBottom:8}}>❌ Λάθος κωδικός</Text>}
            <TouchableOpacity
              style={{backgroundColor:'#b71c1c', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
              onPress={async ()=>{
                if(archiveDeleteModal.pwd === 'vaicon2024'){
                  await confirmDeleteFromArchive(archiveDeleteModal.orderId);
                  setArchiveDeleteModal({visible:false, orderId:null, pwd:'', error:false});
                } else {
                  setArchiveDeleteModal(m=>({...m, error:true, pwd:''}));
                }
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>🗑️ ΔΙΑΓΡΑΦΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setArchiveDeleteModal({visible:false, orderId:null, pwd:'', error:false})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL ΕΠΕΞΕΡΓΑΣΙΑΣ ΠΑΡΑΓΓΕΛΙΑΣ */}
      <Modal visible={editModal.visible && !showHardwarePicker && !showCoatingsPicker && !peepholeWarn.visible} transparent animationType="slide" onRequestClose={()=>setEditModal({visible:false,order:null})}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'85%'}}>
            <View style={{backgroundColor:'#007AFF',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>✏️ Επεξεργασία #{editModal.order?.orderNo}</Text>
              <TouchableOpacity onPress={()=>setEditModal({visible:false,order:null})}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{padding:16}}>
              {/* Ημερομηνία Παράδοσης */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>📅 ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΑΔΟΣΗΣ</Text>
              <TextInput
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,marginBottom:12}}
                placeholder="π.χ. 15/4/2026"
                value={editForm.deliveryDate||''}
                onChangeText={v=>setEditForm(f=>({...f,deliveryDate:v}))}
              />
              {/* Κλειδαριά */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🔒 ΚΛΕΙΔΑΡΙΑ</Text>
              <TextInput
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,marginBottom:12}}
                placeholder="Κλειδαριά..."
                value={editForm.lock||''}
                onChangeText={v=>setEditForm(f=>({...f,lock:v}))}
              />
              {/* Τζάμι */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🪟 ΤΖΑΜΙ</Text>
              <View style={{flexDirection:'row',gap:8,marginBottom:12}}>
                <TextInput
                  ref={editGlassRef}
                  style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,flex:1}}
                  placeholder="Υ × Π"
                  keyboardType="numeric"
                  value={editForm.glassDim||''}
                  onChangeText={v=>setEditForm(f=>({...f,glassDim:v}))}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={()=>{
                    const v = editForm.glassDim||'';
                    if (v && !v.includes('×')) {
                      setEditForm(f=>({...f, glassDim: v + ' × '}));
                      setTimeout(()=>editGlassRef.current?.focus(), 10);
                    } else {
                      editGlassNotesRef.current?.focus();
                    }
                  }}
                />
                <TextInput
                  ref={editGlassNotesRef}
                  style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,flex:2}}
                  placeholder="Παρατήρηση τζαμιού..."
                  value={editForm.glassNotes||''}
                  onChangeText={v=>setEditForm(f=>({...f,glassNotes:v}))}
                  returnKeyType="next"
                />
              </View>
              {/* Χρώμα Εξαρτημάτων */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🎨 ΧΡΩΜΑ ΕΞΑΡΤΗΜΑΤΩΝ</Text>
              <TouchableOpacity
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:12,marginBottom:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}
                onPress={()=>{ setPickerEditMode(true); setShowHardwarePicker(true); }}>
                <Text style={{fontSize:14,color:editForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{editForm.hardware||'Επιλέξτε...'}</Text>
                <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
              </TouchableOpacity>
              {/* Επένδυση */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🎨 ΕΠΕΝΔΥΣΗ</Text>
              <TouchableOpacity
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:12,marginBottom:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}
                onPress={()=>{ setPickerEditMode(true); setShowCoatingsPicker(true); }}>
                <Text style={{fontSize:14,color:(editForm.coatings&&editForm.coatings.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={2}>
                  {(editForm.coatings&&editForm.coatings.length>0)?editForm.coatings.join(', '):'Επιλέξτε...'}
                </Text>
                <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
              </TouchableOpacity>
              {/* Σταθερά */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>📐 ΣΤΑΘΕΡΑ</Text>
              {[0,1,2,3].map(i=>{
                const s=(editForm.stavera||[])[i]||{dim:'',qty:'',note:''};
                return (
                  <View key={i} style={{flexDirection:'row',gap:8,marginBottom:8}}>
                    <TextInput
                      ref={el=>{editStaveraRefs.current[i]=el;}}
                      style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,width:110,textAlign:'center'}}
                      placeholder="Υ × Π"
                      keyboardType="numeric"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      value={s.dim||''}
                      onChangeText={v=>{
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                        upd[i]={...upd[i],dim:v};
                        setEditForm(f=>({...f,stavera:upd}));
                      }}
                      onSubmitEditing={()=>{
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                        const dim=upd[i].dim||'';
                        if(dim && !dim.includes('×')){
                          upd[i]={...upd[i],dim:dim+' × '};
                          setEditForm(f=>({...f,stavera:upd}));
                          setTimeout(()=>editStaveraRefs.current[i]?.focus(),30);
                        } else {
                          editStaveraQtyRefs.current[i]?.focus();
                        }
                      }}
                    />
                    <TextInput
                      ref={el=>{editStaveraQtyRefs.current[i]=el;}}
                      style={{backgroundColor:'#fff',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:17,fontWeight:'900',color:'#d32f2f',width:55,textAlign:'center'}}
                      placeholder="Τεμ."
                      placeholderTextColor="#bbb"
                      keyboardType="numeric"
                      maxLength={2}
                      selectTextOnFocus
                      returnKeyType="next"
                      blurOnSubmit={false}
                      value={s.qty||''}
                      onChangeText={v=>{
                        const clean=v.replace(/[^0-9]/g,'');
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                        upd[i]={...upd[i],qty:clean};
                        setEditForm(f=>({...f,stavera:upd}));
                      }}
                      onSubmitEditing={()=>{ editStaveraNoteRefs.current[i]?.focus(); }}
                    />
                    <TextInput
                      ref={el=>{editStaveraNoteRefs.current[i]=el;}}
                      style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,flex:1}}
                      placeholder="Παρατήρηση..."
                      returnKeyType="next"
                      blurOnSubmit={false}
                      value={s.note||''}
                      onChangeText={v=>{
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                        upd[i]={...upd[i],note:v};
                        setEditForm(f=>({...f,stavera:upd}));
                      }}
                      onSubmitEditing={()=>{ editStaveraRefs.current[i+1]?.focus(); }}
                    />
                  </View>
                );
              })}
              {/* Παρατηρήσεις */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>📝 ΠΑΡΑΤΗΡΗΣΕΙΣ</Text>
              <TextInput
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,marginBottom:20,minHeight:70,textAlignVertical:'top'}}
                placeholder="Παρατηρήσεις..."
                multiline
                value={editForm.notes||''}
                onChangeText={v=>setEditForm(f=>({...f,notes:v}))}
              />
            </ScrollView>
            <View style={{flexDirection:'row',gap:10,padding:16,borderTopWidth:1,borderTopColor:'#eee'}}>
              <TouchableOpacity style={{flex:1,padding:14,borderRadius:10,backgroundColor:'#e0e0e0',alignItems:'center'}} onPress={()=>setEditModal({visible:false,order:null})}>
                <Text style={{fontWeight:'bold',color:'#555'}}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:2,padding:14,borderRadius:10,backgroundColor:'#007AFF',alignItems:'center'}} onPress={async()=>{
                const order = editModal.order;
                const upd = {
                  ...order,
                  deliveryDate: editForm.deliveryDate||order.deliveryDate||'',
                  lock: editForm.lock||'',
                  glassDim: editForm.glassDim||'',
                  glassNotes: editForm.glassNotes||'',
                  hardware: editForm.hardware||'',
                  coatings: editForm.coatings||[],
                  stavera: editForm.stavera||[],
                  notes: editForm.notes||'',
                };
                const persist = async (finalUpd) => {
                  setSpecialOrders(prev=>prev.map(o=>o.id===order.id?finalUpd:o));
                  await syncToCloud(finalUpd);
                  setEditModal({visible:false,order:null});
                };
                const trigs = peepholeTriggers(upd.coatings, upd.notes);
                if (trigs.length > 0) {
                  setPeepholeWarn({
                    visible:true,
                    coatings: trigs,
                    onContinue: () => persist(upd),
                    onAddNote: () => persist({ ...upd, notes: withPeepholeNote(upd.notes) }),
                  });
                } else {
                  await persist(upd);
                }
              }}>
                <Text style={{fontWeight:'bold',color:'white',fontSize:15}}>💾 ΑΠΟΘΗΚΕΥΣΗ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL ΕΠΙΣΤΡΟΦΗΣ ΣΤΗΝ ΑΠΟΘΗΚΗ */}
      <Modal visible={archiveReturnModal.visible} transparent animationType="fade">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:12, textAlign:'center'}}>⟲ Επιστροφή στην Αποθήκη</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:24, textAlign:'center'}}>Η παραγγελία θα επιστρέψει στα ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ.</Text>
            <TouchableOpacity
              style={{backgroundColor:'#00C851', padding:14, borderRadius:10, alignItems:'center', marginBottom:8}}
              onPress={async ()=>{
                await returnToReady(archiveReturnModal.orderId);
                setArchiveReturnModal({visible:false, orderId:null});
              }}>
              <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>✅ ΕΠΙΒΕΒΑΙΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}
              onPress={()=>setArchiveReturnModal({visible:false, orderId:null})}>
              <Text style={{color:'#555', fontWeight:'bold', fontSize:14}}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL ΕΙΔΟΠΟΙΗΣΗΣ ΠΕΛΑΤΗ — μετά από καταχώρηση νέας παραγγελίας */}
      <Modal visible={notifyModal.visible} transparent animationType="fade" onRequestClose={()=>setNotifyModal({visible:false, order:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:420}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:6, textAlign:'center'}}>✅ Η παραγγελία αποθηκεύτηκε</Text>
            <Text style={{fontSize:14, color:'#444', marginBottom:16, textAlign:'center'}}>Θέλεις να ειδοποιήσεις τον πελάτη;</Text>
            {(()=>{
              const o = notifyModal.order; if (!o) return null;
              const cust = findCustomerOf(o);
              const vP = pickViberPhone(cust);
              const sP = pickSmsPhone(cust);
              const viberOptedOut = !!vP && !!cust?.viberOptOut;
              const hasViber = !!vP && !cust?.viberOptOut;
              const hasEmail = !!cust?.email;
              const hasSms = !!sP;
              const contactLine = [cust?.phone, cust?.phone2, cust?.phone3, cust?.phoneViber && `V:${cust.phoneViber}`].filter(Boolean).join('  ');
              return (
                <>
                  <View style={{backgroundColor:'#f5f5f5', padding:10, borderRadius:8, marginBottom:14}}>
                    <Text style={{fontSize:13, color:'#333'}}>👤 {o.customer||'—'}</Text>
                    <Text style={{fontSize:12, color:'#666', marginTop:2}}>📞 {contactLine||'—'}{cust?.email?`   ✉️ ${cust.email}`:''}</Text>
                  </View>
                  <View style={{flexDirection:'row', gap:8, marginBottom:8}}>
                    <TouchableOpacity disabled={!hasViber} onPress={()=>{ setNotifyModal({visible:false,order:null}); confirmSend('viber',o,()=>notifyViber(o)); }}
                      style={{flex:1, backgroundColor: hasViber?'#7360f2':'#ccc', padding:12, borderRadius:10, alignItems:'center'}}>
                      <Text style={{color:'white', fontWeight:'bold', fontSize:13}}>📞 Viber</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!hasEmail} onPress={()=>{ setNotifyModal({visible:false,order:null}); confirmSend('email',o,()=>notifyEmail(o)); }}
                      style={{flex:1, backgroundColor: hasEmail?'#0288d1':'#ccc', padding:12, borderRadius:10, alignItems:'center'}}>
                      <Text style={{color:'white', fontWeight:'bold', fontSize:13}}>✉️ Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!hasSms} onPress={()=>{ setNotifyModal({visible:false,order:null}); confirmSend('sms',o,()=>notifySms(o)); }}
                      style={{flex:1, backgroundColor: hasSms?'#1565C0':'#ccc', padding:12, borderRadius:10, alignItems:'center'}}>
                      <Text style={{color:'white', fontWeight:'bold', fontSize:13}}>📱 SMS</Text>
                    </TouchableOpacity>
                  </View>
                  {(!hasViber||!hasEmail||!hasSms) && (
                    <Text style={{fontSize:11, color:'#888', textAlign:'center', marginBottom:8}}>
                      {viberOptedOut?'🚫 Ο πελάτης απεγγράφηκε από Viber. ':(!hasViber?'⚠️ Λείπει τηλέφωνο Viber. ':'')}{!hasEmail?'⚠️ Λείπει email. ':''}{!hasSms?'⚠️ Λείπει κινητό (SMS).':''}
                    </Text>
                  )}
                  <TouchableOpacity onPress={()=>setNotifyModal({visible:false,order:null})}
                    style={{backgroundColor:'#f5f5f5', padding:12, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd'}}>
                    <Text style={{color:'#555', fontWeight:'bold', fontSize:13}}>Όχι τώρα</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
      <View style={{flex:1, flexDirection:'row'}}>
        {/* SIDEBAR 20% */}
        <View style={{width:'20%', backgroundColor:'#1a1a1a', padding:8, gap:8}}>
          {[
            {key:'form',    icon:'✏️', label:'ΚΑΤΑΧΩΡΗΣΗ', count:null},
            {key:'pending', icon:'📋', label:'ΚΑΤΑΧΩΡΗΜΕΝΕΣ', count:specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)).length, badgeColor:'#ff4444'},
            {key:'prod',    icon:'⚙️', label:'ΠΑΡΑΓΩΓΗ', count:specialOrders.filter(o=>o.status==='PROD').length, badgeColor:'#ff9800'},
            {key:'ready',   icon:'📦', label:'ΕΤΟΙΜΑ', count:specialOrders.filter(o=>o.status==='READY').length, badgeColor:'#2e7d32'},
            {key:'archive', icon:'💰', label:'ΑΡΧΕΙΟ', count:soldSpecialOrders.length, badgeColor:'#555'},
          ].map(item=>(
            <TouchableOpacity key={item.key}
              onPress={()=>setActiveSection(item.key)}
              style={{backgroundColor:activeSection===item.key?'#8B0000':'#2c2c2c', borderRadius:10, padding:12, alignItems:'center', gap:4, borderWidth:2, borderColor:activeSection===item.key?'rgba(255,255,255,0.3)':'transparent', position:'relative'}}>
              {item.count>0&&<View style={{position:'absolute',top:6,right:6,backgroundColor:item.badgeColor,borderRadius:10,paddingHorizontal:5,paddingVertical:1,minWidth:18,alignItems:'center'}}><Text style={{color:'white',fontSize:9,fontWeight:'bold'}}>{item.count}</Text></View>}
              <Text style={{fontSize:22}}>{item.icon}</Text>
              <Text style={{color:'white',fontSize:10,fontWeight:'bold',textAlign:'center',lineHeight:13}}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          {/* Spacer — σπρώχνει το κουμπί ΠΕΛΑΤΕΣ στο κάτω μέρος */}
          <View style={{flex:1}} />
          {/* Διαχωριστικό */}
          <View style={{height:1, backgroundColor:'rgba(255,255,255,0.18)', marginVertical:2}} />
          {/* 🔍 ΠΕΛΑΤΕΣ — αναζήτηση παραγγελιών ανά πελάτη */}
          <TouchableOpacity
            onPress={()=>setShowCustomerLookup(v=>!v)}
            style={{backgroundColor: activeSection==='archive' ? (showCustomerLookup?'#777':'#555') : (showCustomerLookup?'#1565c0':'#0d47a1'), borderRadius:10, padding:12, alignItems:'center', gap:4, borderWidth:2, borderColor: showCustomerLookup?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.15)'}}>
            <Text style={{fontSize:22}}>🔍</Text>
            <Text style={{color:'white', fontSize:10, fontWeight:'bold', textAlign:'center', lineHeight:13}}>{activeSection==='archive' ? 'ΠΕΛΑΤΕΣ ΑΡΧΕΙΟ' : 'ΠΕΛΑΤΕΣ'}</Text>
          </TouchableOpacity>
        </View>
        {/* CONTENT 80% — ΠΑΡΑΓΩΓΗ και ΚΑΤΑΧΩΡΗΜΕΝΕΣ βγαίνουν εκτός ScrollView για flex:1 */}
        {activeSection==='prod' ? (
          <View style={{flex:1}}>
            {renderProdSection()}
          </View>
        ) : activeSection==='pending' ? (
          <View style={{flex:1, flexDirection:'row'}}>
            {/* ΑΡΙΣΤΕΡΑ: Scrollable λίστα καρτών */}
            <ScrollView style={{flex:1, padding:10}} keyboardShouldPersistTaps="handled">
              <View style={{paddingBottom:80}}>
                {[...specialOrders.filter(o => showOnlyStuck
                  ? isOrderReadyForTransfer(o)
                  : (o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone))
                )].sort((a,b)=>
                  pendingSort==='date' ? (b.createdAt||0)-(a.createdAt||0) : (parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)
                ).filter(o=>matchesSearch(o, pendingSearch)).map(o=>renderOrderCard(o, false, true, pendingSearch))}
              </View>
            </ScrollView>
            {/* ΔΕΞΙΑ: Σταθερή μπάρα */}
            <View style={{width:280, backgroundColor:'#f9f9f9', borderLeftWidth:1, borderLeftColor:'#e0e0e0', padding:12, gap:32}}>
              {/* Τίτλος + αριθμός */}
              <View style={{backgroundColor:'#ffbb33', borderRadius:8, padding:14}}>
                <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:18}}>● ΚΑΤΑΧΩΡΗΜΕΝΕΣ</Text>
                <Text style={{color:'#1a1a1a', fontSize:16, marginTop:4}}>
                  {specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)).length} παραγγελίες
                </Text>
                <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:18, marginTop:10}}>● ΑΝΑΜΟΝΗ</Text>
                <Text style={{color:'#1a1a1a', fontSize:16, marginTop:4}}>
                  {specialOrders.filter(o=>o.status==='PENDING').length} παραγγελίες
                </Text>
              </View>
              {/* Ταξινόμηση */}
              <View style={{gap:6}}>
                <Text style={{fontSize:13, fontWeight:'bold', color:'#555', letterSpacing:1}}>ΤΑΞΙΝΟΜΗΣΗ</Text>
                <TouchableOpacity
                  style={{backgroundColor: pendingSort==='no'?'#ff4444':'#e0e0e0', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>setPendingSort('no')}>
                  <Text style={{color: pendingSort==='no'?'white':'#555', fontWeight:'bold', fontSize:16}}>🔢 ΑΡ. ΠΑΡΑΓΓΕΛΙΑΣ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor: pendingSort==='date'?'#ff4444':'#e0e0e0', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>setPendingSort('date')}>
                  <Text style={{color: pendingSort==='date'?'white':'#555', fontWeight:'bold', fontSize:16}}>🕐 ΝΕΟΤΕΡΕΣ</Text>
                </TouchableOpacity>
              </View>
              {/* Εκτύπωση */}
              <View style={{gap:6}}>
                <Text style={{fontSize:13, fontWeight:'bold', color:'#555', letterSpacing:1}}>ΕΚΤΥΠΩΣΗ</Text>
                <TouchableOpacity
                  style={{backgroundColor:'#ff4444', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PENDING'), 'ΕΚΚΡΕΜΕΙΣ')}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>🖨️ ΕΚΚΡΕΜΕΙΣ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#2e7d32', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PROD'), 'ΠΑΡΑΓΩΓΗ')}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>🖨️ ΠΑΡΑΓΩΓΗ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#1a1a1a', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)), 'ΟΛΕΣ')}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>🖨️ ΟΛΕΣ</Text>
                </TouchableOpacity>
              </View>
              {/* Κουμπί ειδοποίησης: παραγγελίες έτοιμες αλλά κολλημένες σε PROD */}
              {specialOrders.filter(isOrderReadyForTransfer).length > 0 && (
                <View style={{marginTop:12}}>
                  <BlinkingStuckButton
                    count={specialOrders.filter(isOrderReadyForTransfer).length}
                    active={showOnlyStuck}
                    onPress={()=>setShowOnlyStuck(v=>!v)}
                  />
                </View>
              )}
              {/* Αναζήτηση */}
              <View style={{gap:6, marginTop:'auto'}}>
                <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                  <Text style={{fontSize:13, fontWeight:'bold', color:'#555', letterSpacing:1}}>ΑΝΑΖΗΤΗΣΗ</Text>
                  {pendingSearch.length > 0 && (
                    <Text style={{fontSize:12, fontWeight:'bold', color:'#007AFF'}}>
                      {[...specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone))].filter(o=>matchesSearch(o, pendingSearch)).length} αποτελ.
                    </Text>
                  )}
                </View>
                <View style={{flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:8, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:10, paddingVertical:6}}>
                  <Text style={{fontSize:16, marginRight:6, color:'#aaa'}}>🔍</Text>
                  <TextInput
                    style={{flex:1, fontSize:14, color:'#1a1a1a', padding:0}}
                    placeholder="Αναζήτηση..."
                    placeholderTextColor="#bbb"
                    value={pendingSearch}
                    onChangeText={v=>setPendingSearch(v)}
                    clearButtonMode="while-editing"
                  />
                  {pendingSearch.length > 0 && (
                    <TouchableOpacity onPress={()=>setPendingSearch('')}>
                      <Text style={{color:'#aaa', fontSize:18, fontWeight:'bold', paddingLeft:6}}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        ) : (
        <ScrollView style={{flex:1, padding:10}} keyboardShouldPersistTaps="handled">
        <View style={{paddingBottom:80}}>
          {activeSection==='form'&&(<>



          {/* ═══ CARD: ΠΕΛΑΤΗΣ + ΑΡ. ΠΑΡΑΓΓΕΛΙΑΣ ═══ */}
          <View style={vstyles.card}>
            <View style={vstyles.cardHeader}><Text style={vstyles.cardHeaderTxt}>👤  ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ</Text></View>
            <View style={vstyles.cardBody}>

          {/* ΠΕΛΑΤΗΣ */}
          <View style={{marginBottom:8,zIndex:100}}>
            {selectedCustomer ? (
              <TouchableOpacity style={styles.selectedCustomerBox} onPress={()=>setShowCustomerInfo(true)}>
                <View style={{flex:1}}>
                  <Text style={styles.selectedCustomerName}>👤 {selectedCustomer.name}</Text>
                  <Text style={styles.selectedCustomerHint}>Πάτα για να δεις τα στοιχεία</Text>
                </View>
                <TouchableOpacity onPress={()=>{setSelectedCustomer(null);setCustomerSearch('');setCustomForm({...customForm,customer:''});}}>
                  <Text style={{color:'#ff4444',fontWeight:'bold',fontSize:18,padding:6}}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <>
                <TextInput ref={customerRef} style={styles.input} placeholder="Αναζήτηση Πελάτη" value={customerSearch}
                  onChangeText={v=>{setCustomerSearch(v);setShowCustomerList(true);setCustomForm({...customForm,customer:v});}}
                  onSubmitEditing={()=>orderNoRef.current?.focus()}
                  returnKeyType="next" blurOnSubmit={false}
                />
                {showCustomerList&&customerSearch.length>0&&(customers||[]).filter(c=>
                  c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                  [c.phone, c.phone2, c.phone3, c.phoneViber].some(p=>p&&String(p).includes(customerSearch))||
                  c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                ).slice(0,5).length>0&&(
                  <View style={styles.customerDropdown}>
                    {(customers||[]).filter(c=>
                      c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                      [c.phone, c.phone2, c.phone3, c.phoneViber].some(p=>p&&String(p).includes(customerSearch))||
                      c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                    ).slice(0,5).map(c=>(
                      <TouchableOpacity key={c.id} style={styles.customerOption}
                        onPressIn={()=>{
                          customerSelectedRef.current = true;
                          setCustomForm({...customForm,customer:c.name,customerId:c.id});
                          setCustomerSearch(c.name); setSelectedCustomer(c); setShowCustomerList(false);
                          setTimeout(()=>orderNoRef.current?.focus(), 100);
                        }}>
                        <Text style={styles.customerOptionName}>{c.name}</Text>
                        {c.phone?<Text style={styles.customerOptionDetail}>📞 {c.phone}</Text>:null}
                        {c.identifier?<Text style={styles.customerOptionDetail}>🏷 {c.identifier}</Text>:null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* MODAL ΕΠΑΛΗΘΕΥΣΗΣ */}
          {showCustomerInfo&&selectedCustomer&&(
            <Modal visible={showCustomerInfo} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>👤 ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ</Text>
                  <Text style={styles.infoRow}>📛 {selectedCustomer.name}</Text>
                  {selectedCustomer.phone?<Text style={styles.infoRow}>📞 {selectedCustomer.phone}</Text>:<Text style={styles.infoRowEmpty}>📞 Χωρίς τηλέφωνο</Text>}
                  {selectedCustomer.identifier?<Text style={styles.infoRow}>🏷 {selectedCustomer.identifier}</Text>:<Text style={styles.infoRowEmpty}>🏷 Χωρίς αναγνωριστικό</Text>}
                  <View style={{flexDirection:'row',gap:10,marginTop:16}}>
                    <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#ff4444',flex:1}]} onPress={()=>{setShowCustomerInfo(false);setSelectedCustomer(null);setCustomerSearch('');setCustomForm({...customForm,customer:''});}}>
                      <Text style={{color:'white',fontWeight:'bold'}}>ΑΛΛΑΓΗ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'#00C851',flex:1}]} onPress={()=>setShowCustomerInfo(false)}>
                      <Text style={{color:'white',fontWeight:'bold'}}>ΣΩΣΤΟΣ ✓</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* ΝΟΥΜΕΡΟ ΠΑΡΑΓΓΕΛΙΑΣ + ΠΑΡΑΔΟΣΗ ίδια γραμμή */}
          <View style={{flexDirection:'row', gap:8, alignItems:'flex-end', marginBottom:2}}>
          <TextInput ref={orderNoRef} style={[styles.input, {fontSize:18, fontWeight:'bold', width:90, letterSpacing:1, marginBottom:0}]} placeholder="Ν/Π" keyboardType="numeric" value={customForm.orderNo} selectTextOnFocus
            onFocus={()=>{
              if (!selectedCustomer && customerSearch.trim()) {
                const exists = (customers||[]).some(c=>c.name?.toLowerCase()===customerSearch.trim().toLowerCase());
                if (!exists) {
                  orderNoRef.current?.blur();
                  Alert.alert(
                    "Πελάτης δεν βρέθηκε",
                    `Ο πελάτης "${customerSearch.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`,
                    [
                      { text:"ΟΧΙ", style:"destructive", onPress:()=>{ setCustomerSearch(''); setCustomForm(f=>({...f,customer:''})); }},
                      { text:"ΝΑΙ", onPress:()=>{
                        if (onRequestAddCustomer) {
                          onRequestAddCustomer(customerSearch.trim(), (newCustomer)=>{
                            setSelectedCustomer(newCustomer);
                            setCustomerSearch(newCustomer.name);
                            setCustomForm(f=>({...f,customer:newCustomer.name,customerId:newCustomer.id}));
                          });
                        }
                      }}
                    ]
                  );
                }
              }
            }}
            onChangeText={v=>setCustomForm({...customForm,orderNo:v})}
            onSubmitEditing={()=>{
              if (!customForm.orderNo) { hRef.current?.focus(); return; }
              const exists = [...specialOrders, ...soldSpecialOrders].some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                const base = customForm.orderNo;
                const suggested = computeSuggested(base, [...specialOrders, ...soldSpecialOrders], editingOrder?.id);
                Keyboard.dismiss();
                setDupModal({
                  visible:true, base, suggested,
                  onUse:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); setTimeout(()=>hRef.current?.focus(),100); },
                  onKeep:()=>{ setDupModal(m=>({...m,visible:false})); hRef.current?.focus(); },
                  onCancel:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
                });
              } else {
                hRef.current?.focus();
              }
            }}
            onBlur={()=>{
              if (!customForm.orderNo) return;
              const exists = [...specialOrders, ...soldSpecialOrders].some(o=>o.orderNo===customForm.orderNo && o.id!==editingOrder?.id);
              if (exists) {
                const base = customForm.orderNo;
                const suggested = computeSuggested(base, [...specialOrders, ...soldSpecialOrders], editingOrder?.id);
                setDupModal({
                  visible:true, base, suggested,
                  onUse:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:suggested})); },
                  onKeep:()=>{ setDupModal(m=>({...m,visible:false})); },
                  onCancel:()=>{ setDupModal(m=>({...m,visible:false})); setCustomForm(f=>({...f,orderNo:''})); }
                });
              }
            }}
            blurOnSubmit={false} />
            <View style={{width:80}}>
              <Text style={[styles.input, {fontSize:10, fontWeight:'bold', color:'#888', marginBottom:3, borderWidth:0, padding:0, backgroundColor:'transparent'}]}>ΑΡ.ΠΡΟΓΡ.</Text>
              <TextInput
                style={[styles.input, {fontSize:18, fontWeight:'bold', width:80, letterSpacing:1, marginBottom:0, color:'#e65100', borderColor: customForm.programNo ? '#e65100' : '#ddd'}]}
                placeholder="—"
                keyboardType="numeric"
                value={customForm.programNo||''}
                selectTextOnFocus
                onChangeText={v=>setCustomForm(f=>({...f, programNo:v}))}
              />
            </View>
            <View style={{width:110}}>
              <Text style={[vstyles.fieldLabel,{marginBottom:3}]}>Παράδοση</Text>
              <TouchableOpacity style={[vstyles.selectBtn,{paddingVertical:8,paddingHorizontal:5}]} onPress={()=>setShowDatePicker(true)}>
                <Text style={{fontSize:11,color:customForm.deliveryDate?'#1a1a1a':'#aaa'}} numberOfLines={1}>📅 {customForm.deliveryDate||'—'}</Text>
              </TouchableOpacity>
            </View>
          </View>{/* end orderno+delivery row */}

            </View>{/* end cardBody */}
          </View>{/* end card */}

          {/* ═══ ΦΟΡΜΑ ΕΙΔΙΚΗΣ — REDESIGNED ═══ */}

          {/* ══ ΦΟΡΜΑ ΕΙΔΙΚΗΣ ══ */}

            {/* CARD: ΔΙΑΣΤΑΣΕΙΣ & ΣΤΑΘΕΡΑ */}
            <View style={vstyles.card}>
              <View style={vstyles.cardHeader}><Text style={vstyles.cardHeaderTxt}>📐  ΔΙΑΣΤΑΣΕΙΣ & ΣΤΑΘΕΡΑ</Text></View>
              <View style={[vstyles.cardBody,{flexDirection:'row',gap:8}]}>

                {/* ΑΡΙΣΤΕΡΑ: Υψ/Πλτ/Τεμ → Μεντ (κάτω από Τεμ) → Φορά → Θωράκιση */}
                <View style={{flex:4}}>
                  {/* Γραμμή 1+2: Ύψος | Πλάτος | [Τεμ. πάνω / Μεντ. κάτω] */}
                  <View style={{flexDirection:'row',gap:4,marginBottom:6,alignItems:'flex-start'}}>
                    {/* Ύψος */}
                    <View style={{alignItems:'center',flex:2}}>
                      <Text style={vstyles.fieldLabelDark}>Ύψος</Text>
                      <TextInput ref={hRef} style={[vstyles.textInput,{marginTop:2,fontWeight:'900',fontSize:20,textAlign:'center',padding:6,width:'100%'}]} placeholder="—" keyboardType="numeric" maxLength={3} value={customForm.h} onChangeText={v=>{setCustomForm({...customForm,h:v}); if(v.length===3) wRef.current?.focus();}} onSubmitEditing={()=>wRef.current?.focus()} blurOnSubmit={false}/>
                    </View>
                    {/* Πλάτος */}
                    <View style={{alignItems:'center',flex:2}}>
                      <Text style={vstyles.fieldLabelDark}>Πλάτος</Text>
                      <TextInput ref={wRef} style={[vstyles.textInput,{marginTop:2,fontWeight:'900',fontSize:20,textAlign:'center',padding:6,width:'100%'}]} placeholder="—" keyboardType="numeric" maxLength={3} value={customForm.w} onChangeText={v=>setCustomForm({...customForm,w:v})} onSubmitEditing={()=>qtyEidikiRef.current?.focus()} blurOnSubmit={false}/>
                    </View>
                    {/* Τεμ. πάνω / Μεντεσέδες κάτω — στήλη */}
                    <View style={{flex:1.5,gap:4}}>
                      <View style={{alignItems:'center'}}>
                        <Text style={vstyles.fieldLabelDark}>Τεμ.</Text>
                        <TextInput ref={qtyEidikiRef} style={[vstyles.textInput,{marginTop:2,fontWeight:'900',fontSize:18,textAlign:'center',padding:6,width:'100%'}]} keyboardType="numeric" value={customForm.qty} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,qty:v})} blurOnSubmit={true} returnKeyType="done"/>
                      </View>
                      <View style={{alignItems:'center'}}>
                        <Text style={vstyles.fieldLabelDark}>Μεντ.</Text>
                        <TextInput ref={hingeRef} style={[vstyles.textInput,{marginTop:2,fontWeight:'900',fontSize:18,textAlign:'center',padding:6,width:'100%'}]} maxLength={1} keyboardType="numeric" value={customForm.hinges} selectTextOnFocus onChangeText={v=>{if(['2','3','4','5',''].includes(v))setCustomForm({...customForm,hinges:v});}} onSubmitEditing={()=>glassRef.current?.focus()} blurOnSubmit={false}/>
                      </View>
                    </View>
                  </View>
                  {/* Γραμμή 3: ΑΡΙΣΤΕΡΗ / ΔΕΞΙΑ — χωρίς label */}
                  <View style={{flexDirection:'row',gap:3,marginBottom:6}}>
                    {['ΑΡΙΣΤΕΡΗ','ΔΕΞΙΑ'].map(s=>(
                      <TouchableOpacity key={s} style={[vstyles.sideChip,customForm.side===s&&vstyles.sideChipOn]} onPress={()=>setCustomForm({...customForm,side:s})}>
                        <Text style={[vstyles.sideChipTxt,customForm.side===s&&vstyles.sideChipTxtOn]}>{s==='ΑΡΙΣΤΕΡΗ'?'◄ ΑΡ.':'ΔΕΞ. ►'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Γραμμή 4: ΜΟΝΗ / ΔΙΠΛΗ — label κεντραρισμένο πάνω */}
                  <Text style={[vstyles.fieldLabelDark,{textAlign:'center',marginBottom:2}]}>ΘΩΡΑΚΙΣΗ</Text>
                  <View style={{flexDirection:'row',gap:3}}>
                    {['ΜΟΝΗ','ΔΙΠΛΗ'].map(a=>(
                      <TouchableOpacity key={a} style={[vstyles.togBtnSm,customForm.armor===a&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,armor:a})}>
                        <Text style={[vstyles.togBtnSmTxt,customForm.armor===a&&vstyles.togBtnTxtOn]}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ΔΙΑΧΩΡΙΣΤΙΚΟ */}
                <View style={{width:1,backgroundColor:'#ddd',marginVertical:2}}/>

                {/* ΔΕΞΙΑ: ΣΤΑΘΕΡΑ grid */}
                <View style={{flex:6}}>
                  <Text style={{fontSize:11,fontWeight:'900',color:'#2c2c2c',letterSpacing:2,marginBottom:4,textAlign:'center'}}>ΣΤΑΘΕΡΑ</Text>
                  <View style={{flexDirection:'row',gap:3,marginBottom:3}}>
                    <Text style={[vstyles.fieldLabel,{width:90,textAlign:'center'}]}>Διάσταση</Text>
                    <Text style={[vstyles.fieldLabel,{width:45,textAlign:'center'}]}>Τεμ.</Text>
                    <Text style={[vstyles.fieldLabel,{flex:1}]}>Παρατήρηση Σταθερά</Text>
                  </View>
                  {[0,1,2,3].map(i=>{
                    const s=(customForm.stavera||[])[i]||{dim:'',qty:'',note:''};
                    return (
                      <View key={i} style={{flexDirection:'row',gap:3,marginBottom:4,alignItems:'center'}}>
                        <TextInput
                          ref={el=>{staveraHRefs.current['e'+i]=el;}}
                          style={[vstyles.staveraCell,{width:90,textAlign:'center',fontSize:13,fontWeight:'700'}]}
                          placeholder="Υ × Π"
                          keyboardType="numeric"
                          returnKeyType="next"
                          value={s.dim||''}
                          onChangeText={v=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                            upd[i]={...upd[i],dim:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                            const dim=upd[i].dim||'';
                            if(dim && !dim.includes(' × ')){
                              upd[i]={...upd[i],dim:dim+' × '};
                              setCustomForm({...customForm,stavera:upd});
                              setTimeout(()=>staveraHRefs.current['e'+i]?.focus(),30);
                            } else {
                              staveraQtyRefs.current['e'+i]?.focus();
                            }
                          }}
                        />
                        <TextInput
                          ref={el=>{staveraQtyRefs.current['e'+i]=el;}}
                          style={[vstyles.staveraCell,{width:45,textAlign:'center',fontSize:17,fontWeight:'900',color:'#d32f2f'}]}
                          placeholder=""
                          keyboardType="numeric"
                          maxLength={2}
                          returnKeyType="next"
                          selectTextOnFocus
                          value={s.qty||''}
                          onChangeText={v=>{
                            const clean=v.replace(/[^0-9]/g,'');
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                            upd[i]={...upd[i],qty:clean};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{ staveraGridNoteRefs.current['e'+i]?.focus(); }}
                        />
                        <TextInput
                          ref={el=>{staveraGridNoteRefs.current['e'+i]=el;}}
                          style={[vstyles.staveraCell,{flex:1,minHeight:32}]}
                          placeholder="..."
                          returnKeyType="next"
                          blurOnSubmit={false}
                          value={s.note||''}
                          onChangeText={v=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                            upd[i]={...upd[i],note:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{ staveraHRefs.current['e'+(i+1)]?.focus(); }}
                        />
                      </View>
                    );
                  })}
                  {/* Μοντάρισμα κάτω από ΣΤΑΘΕΡΑ */}
                  <View style={{flexDirection:'row',alignItems:'center',marginTop:4,gap:6}}>
                    <Text style={[vstyles.fieldLabelDark,{minWidth:80}]}>Μοντάρισμα</Text>
                    <View style={{flexDirection:'row',gap:3,flex:1}}>
                      {['ΝΑΙ','ΟΧΙ'].map(v=>(
                        <TouchableOpacity key={v} style={[vstyles.togBtnSm,{flex:1},customForm.installation===v&&(v==='ΝΑΙ'?vstyles.togBtnGreen:vstyles.togBtnOn)]} onPress={()=>setCustomForm({...customForm,installation:v})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.installation===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* CARD: ΛΟΙΠΑ ΣΤΟΙΧΕΙΑ ΕΙΔΙΚΗΣ */}
            <View style={vstyles.card}>
              <View style={vstyles.cardHeader}><Text style={vstyles.cardHeaderTxt}>⚙️  ΛΟΙΠΑ ΣΤΟΙΧΕΙΑ</Text></View>
              <View style={vstyles.cardBody}>
                {/* Αριστερά: Τύπος Κάσας + Υλικό | Δεξιά: Κλειδαριά + Τζάμι */}
                <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                  <View style={{flex:1}}>
                    <Text style={vstyles.fieldLabelDark}>Τύπος Κάσας</Text>
                    <View style={{flexDirection:'row',gap:3,marginTop:2,marginBottom:6}}>
                      {['ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ','ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ'].map(t=>(
                        <TouchableOpacity key={t} style={[vstyles.togBtnSm,customForm.caseType===t&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,caseType:t})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.caseType===t&&vstyles.togBtnTxtOn]}>{t==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={vstyles.fieldLabelDark}>Υλικό Κάσας</Text>
                    <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                      {['DKP','ΓΑΛΒΑΝΙΖΕ'].map(m=>(
                        <TouchableOpacity key={m} style={[vstyles.togBtnSm,customForm.caseMaterial===m&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,caseMaterial:m})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.caseMaterial===m&&vstyles.togBtnTxtOn]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{flex:2}}>
                    <Text style={vstyles.fieldLabelDark}>Κλειδαριά</Text>
                    <View style={[vstyles.selectBtn,{marginTop:2,marginBottom:6,paddingHorizontal:0,paddingVertical:0}]}>
                      <TextInput
                        style={{flex:1,fontSize:13,color:'#1a1a1a',paddingHorizontal:8,paddingVertical:7,minHeight:36}}
                        placeholder="Επιλέξτε ή γράψτε..."
                        placeholderTextColor="#aaa"
                        value={customForm.lock||''}
                        onChangeText={v=>setCustomForm({...customForm,lock:v})}
                        returnKeyType="done"
                      />
                      <TouchableOpacity style={{paddingHorizontal:8,paddingVertical:7,justifyContent:'center'}} onPress={()=>{blurAll();setLockEditText(customForm.lock||'');setShowLockPicker(true);}}>
                        <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={vstyles.fieldLabelDark}>Τζάμι</Text>
                    <View style={{flexDirection:'row', gap:4, marginTop:2}}>
                      <TextInput ref={glassRef} style={[vstyles.staveraCell,{width:90,textAlign:'center',fontSize:13,fontWeight:'700',minHeight:36}]} placeholder="Υ × Π" keyboardType="numeric" value={customForm.glassDim} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,glassDim:v})} onSubmitEditing={handleGlassEnter} blurOnSubmit={false} returnKeyType="next"/>
                      <TextInput ref={glassNotesRef} style={[vstyles.staveraCell,{flex:4,minHeight:36}]} placeholder="..." keyboardType="default" value={customForm.glassNotes||''} onChangeText={v=>setCustomForm({...customForm,glassNotes:v})} returnKeyType="done" blurOnSubmit={true}/>
                    </View>
                  </View>
                </View>
                {/* Χρώμα Εξαρτημάτων */}
                <Text style={vstyles.fieldLabelDark}>Χρώμα Εξαρτημάτων</Text>
                <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setPickerEditMode(false);setShowHardwarePicker(true);}}>
                  <Text style={{fontSize:13,color:customForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.hardware||'Επιλέξτε...'}</Text>
                  <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                </TouchableOpacity>
                {/* Επένδυση */}
                <Text style={vstyles.fieldLabelDark}>Επένδυση</Text>
                <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setPickerEditMode(false);setShowCoatingsPicker(true);}}>
                  <Text style={{fontSize:13,color:(customForm.coatings&&customForm.coatings.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>
                    {(customForm.coatings&&customForm.coatings.length>0)?customForm.coatings.join(', '):'Επιλέξτε...'}
                  </Text>
                  <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                </TouchableOpacity>
                {/* Παρατηρήσεις */}
                <Text style={vstyles.fieldLabelDark}>Παρατηρήσεις</Text>
                <TextInput ref={notesRef} style={[vstyles.textInput,{height:55,textAlignVertical:'top',marginTop:2}]} placeholder="Προαιρετικά..." value={customForm.notes} multiline onChangeText={v=>setCustomForm({...customForm,notes:v})}/>
              </View>
            </View>




          <View style={{flexDirection:'row', gap:8}}>
            {(editingOrder || customForm.orderNo || customForm.customer || customForm.h || customForm.w || customForm.programNo) ? (
            <TouchableOpacity
              style={[styles.saveBtn, {backgroundColor:'#888', flex:1}]}
              onPress={()=>{
                Keyboard.dismiss();
                const msg = editingOrder
                  ? 'Ακύρωση επεξεργασίας; Η παραγγελία θα επιστρέψει όπως ήταν.'
                  : 'Ακύρωση καταχώρησης; Τα στοιχεία θα διαγραφούν.';
                if (Platform.OS==='web') {
                  if (window.confirm(msg)) cancelForm();
                } else {
                  Alert.alert("Ακύρωση", msg, [
                    {text:"ΟΧΙ", style:"cancel"},
                    {text:"ΑΚΥΡΩΣΗ", style:"destructive", onPress:()=>cancelForm()}
                  ]);
                }
              }}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>✕ ΑΚΥΡΩΣΗ</Text>
            </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#007AFF', flex:2}]} onPress={()=>{
              Keyboard.dismiss();
              const doSave = () => { saveOrder(); setTimeout(()=>customerRef.current?.focus(), 400); };
              const proceed = () => {
                const trigs = peepholeTriggers(customForm.coatings, customForm.notes);
                if (trigs.length > 0) {
                  setPeepholeWarn({
                    visible:true,
                    coatings: trigs,
                    onContinue: () => { saveOrder(); setTimeout(()=>customerRef.current?.focus(), 400); },
                    onAddNote: () => {
                      const newNotes = withPeepholeNote(customForm.notes);
                      setCustomForm(f => ({ ...f, notes: newNotes }));
                      saveOrder({ notes: newNotes });
                      setTimeout(()=>customerRef.current?.focus(), 400);
                    },
                  });
                } else {
                  doSave();
                }
              };
              if(Platform.OS==='web'){
                if(window.confirm('Αποθήκευση παραγγελίας προς παραγωγή;')) proceed();
              } else {
                Alert.alert("Επιβεβαίωση", "Αποθήκευση παραγγελίας προς παραγωγή;", [
                  {text:"ΟΧΙ", style:"cancel"},
                  {text:"ΝΑΙ", onPress: proceed}
                ]);
              }
            }}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΑΠΟΘΗΚΕΥΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text>
            </TouchableOpacity>
          </View>
          </>)}

          {/* ΚΑΤΑΧΩΡΗΜΕΝΕΣ */}
          {activeSection==='pending'&&(
            <View>
              <View style={[styles.listHeader,{backgroundColor:'#ff4444', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                <Text style={styles.listHeaderText}>● ΚΑΤΑΧΩΡΗΜΕΝΕΣ ({specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)).length})</Text>
                  <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                    <TouchableOpacity onPress={()=>setPendingSort('no')}
                      style={{backgroundColor: pendingSort==='no'?'white':'rgba(255,255,255,0.3)', paddingHorizontal:10, paddingVertical:6, borderRadius:20}}>
                      <Text style={{color: pendingSort==='no'?'#ff4444':'white', fontSize:12, fontWeight:'bold'}}>🔢 ΑΡ.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>setPendingSort('date')}
                      style={{backgroundColor: pendingSort==='date'?'white':'rgba(255,255,255,0.3)', paddingHorizontal:10, paddingVertical:6, borderRadius:20}}>
                      <Text style={{color: pendingSort==='date'?'#ff4444':'white', fontSize:12, fontWeight:'bold'}}>🕐 ΝΕΑ</Text>
                    </TouchableOpacity>
                    <View style={{width:20}}/>
                    <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:6, borderRadius:20}}
                      onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PENDING'), 'ΕΚΚΡΕΜΕΙΣ')}>
                      <Text style={{color:'#ff4444', fontSize:12, fontWeight:'bold'}}>🖨️ ΕΚΚΡΕΜΕΙΣ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:6, borderRadius:20}}
                      onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PROD'), 'ΠΑΡΑΓΩΓΗ')}>
                      <Text style={{color:'#2e7d32', fontSize:12, fontWeight:'bold'}}>🖨️ ΠΑΡΑΓΩΓΗ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:6, borderRadius:20}}
                      onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)), 'ΟΛΕΣ')}>
                      <Text style={{color:'#1a1a1a', fontSize:12, fontWeight:'bold'}}>🖨️ ΟΛΕΣ</Text>
                    </TouchableOpacity>
                  </View>
              </View>
              {[...specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone))].sort((a,b)=>
                pendingSort==='date' ? (b.createdAt||0)-(a.createdAt||0) : (parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)
              ).map(o=>renderOrderCard(o, false, true))}
            </View>
          )}

          {/* ΕΤΟΙΜΑ */}
          {activeSection==='ready'&&(
            <View>
              <View style={[styles.listHeader,{backgroundColor:'#00C851', flexDirection:'row', alignItems:'center'}]}>
                <Text style={[styles.listHeaderText,{flex:1}]}>● ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({specialOrders.filter(o=>o.status==='READY').length}){readySearch.length>0?` · ${specialOrders.filter(o=>o.status==='READY').filter(o=>matchesSearch(o, readySearch)).length} αποτελ.`:''}</Text>
                <View style={{flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:8, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:10, paddingVertical:4, width:240, marginRight:10}}>
                  <Text style={{fontSize:14, marginRight:6, color:'#aaa'}}>🔍</Text>
                  <TextInput
                    style={{flex:1, fontSize:13, color:'#1a1a1a', padding:0}}
                    placeholder="Αναζήτηση..."
                    placeholderTextColor="#bbb"
                    value={readySearch}
                    onChangeText={v=>setReadySearch(v)}
                    clearButtonMode="while-editing"
                  />
                  {readySearch.length > 0 && (
                    <TouchableOpacity onPress={()=>setReadySearch('')}>
                      <Text style={{color:'#aaa', fontSize:16, fontWeight:'bold', paddingLeft:4}}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='READY'), 'ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ')}>
                  <Text style={{color:'#00C851', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                </TouchableOpacity>
              </View>
              {[...specialOrders.filter(o=>o.status==='READY')].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)).filter(o=>matchesSearch(o, readySearch)).map(o=>renderOrderCard(o, false, false, readySearch))}
            </View>
          )}

          {/* ΑΡΧΕΙΟ */}
          {activeSection==='archive'&&(
            <View>
              <View style={[styles.listHeader,{backgroundColor:'#333', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                <Text style={styles.listHeaderText}>📂 ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ ({soldSpecialOrders.length})</Text>
                <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                  onPress={()=>handleSimplePrint(soldSpecialOrders, 'ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ')}>
                  <Text style={{color:'#333', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                </TouchableOpacity>
              </View>
              {soldSpecialOrders.map(o=>renderOrderCard(o,true))}
            </View>
          )}

        </View>
        </ScrollView>
        )}
      </View>
    </View>
  );
}

const vstyles = StyleSheet.create({
  // Header φόρμας
  formHeader: { backgroundColor:'#1a1a1a', borderRadius:12, padding:14, marginBottom:10, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  formHeaderTitle: { color:'white', fontSize:14, fontWeight:'900', letterSpacing:2 },
  editBadge: { backgroundColor:'#ff9800', paddingHorizontal:8, paddingVertical:3, borderRadius:6 },
  editBadgeTxt: { color:'white', fontSize:10, fontWeight:'bold' },
  // Type selector
  typeSelector: { flexDirection:'row', marginBottom:10, backgroundColor:'#f0f0f0', borderRadius:10, padding:4, gap:4 },
  typeTab: { flex:1, paddingVertical:10, borderRadius:8, alignItems:'center' },
  typeTabBlue: { backgroundColor:'#007AFF' },
  typeTabRed: { backgroundColor:'#8B0000' },
  typeTabTxt: { fontWeight:'800', fontSize:13, color:'#888', letterSpacing:0.5 },
  // Cards — βασική μονάδα layout
  card: { backgroundColor:'#fff', borderRadius:10, marginBottom:7, overflow:'hidden', elevation:2, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.07, shadowRadius:4 },
  cardHeader: { backgroundColor:'#2c2c2c', paddingHorizontal:12, paddingVertical:7 },
  cardHeaderTxt: { fontSize:10, fontWeight:'800', color:'white', letterSpacing:2 },
  cardBody: { padding:9 },
  // Labels
  fieldLabel: { fontSize:9, fontWeight:'800', color:'#999', letterSpacing:0.8, textTransform:'uppercase', marginBottom:1 },
  fieldLabelDark: { fontSize:9, fontWeight:'900', color:'#444', letterSpacing:0.8, textTransform:'uppercase', marginBottom:1 },
  // Compact toggle για Τύπος Κάσας/Σασί — ίδιο ύψος με textInput (minHeight:36)
  togBtnSm: { flex:1, minHeight:36, borderRadius:5, alignItems:'center', justifyContent:'center', backgroundColor:'#f0f0f0', borderWidth:1.5, borderColor:'transparent' },
  togBtnSmTxt: { fontSize:10, fontWeight:'900', color:'#555', textAlign:'center' },
  // Dimension chips
  chipRow: { flexDirection:'row', gap:4, marginTop:2 },
  dimChip: { flex:1, paddingVertical:7, borderRadius:6, alignItems:'center', backgroundColor:'#f0f0f0', borderWidth:2, borderColor:'transparent' },
  dimChipOn: { backgroundColor:'#1a1a1a', borderColor:'#1a1a1a' },
  dimChipTxt: { fontSize:16, fontWeight:'800', color:'#666' },
  dimChipTxtOn: { color:'white' },
  // Side chips (ΑΡ. / ΔΕΞ.)
  sideChip: { flex:1, paddingVertical:7, borderRadius:6, alignItems:'center', backgroundColor:'#f0f0f0', borderWidth:2, borderColor:'transparent' },
  sideChipOn: { backgroundColor:'#8B0000', borderColor:'#8B0000' },
  sideChipTxt: { fontSize:11, fontWeight:'800', color:'#666', letterSpacing:0.3 },
  sideChipTxtOn: { color:'white' },
  // Toggle buttons (ΑΝΟΙΧΤΗ/ΚΛΕΙΣΤΗ, ΜΟΝΗ/ΔΙΠΛΗ, ΝΑΙ/ΟΧΙ)
  togBtn: { flex:1, paddingVertical:8, minHeight:36, borderRadius:6, alignItems:'center', justifyContent:'center', backgroundColor:'#f0f0f0', borderWidth:1.5, borderColor:'transparent' },
  togBtnOn: { backgroundColor:'#1a1a1a', borderColor:'#1a1a1a' },
  togBtnGreen: { backgroundColor:'#00C851', borderColor:'#00C851' },
  togBtnTxt: { fontSize:10, fontWeight:'800', color:'#666', textAlign:'center' },
  togBtnTxtOn: { color:'white' },
  // Text input
  textInput: { backgroundColor:'#f5f5f5', padding:8, minHeight:36, borderRadius:7, borderWidth:1.5, borderColor:'#e8e8e8', fontSize:13, color:'#1a1a1a' },
  // Select / dropdown button
  selectBtn: { backgroundColor:'#f5f5f5', paddingHorizontal:8, paddingVertical:7, minHeight:36, borderRadius:7, borderWidth:1.5, borderColor:'#e8e8e8', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  // Σταθερά grid cell
  staveraCell: { backgroundColor:'#f5f5f5', borderWidth:1, borderColor:'#ddd', borderRadius:5, paddingHorizontal:5, paddingVertical:4, fontSize:12, color:'#1a1a1a', minHeight:28 },
});

const styles = StyleSheet.create({
  sectionTitle: { fontWeight:'bold', marginBottom:10, fontSize:15 },
  smallLabel: { fontSize:12, marginBottom:4, fontWeight:'bold', color:'#555' },
  row: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  input: { backgroundColor:'#fff', padding:12, borderRadius:5, marginBottom:8, borderWidth:1, borderColor:'#ddd' },
  inputHalf: { width:'49%', backgroundColor:'#fff', padding:12, borderRadius:5, borderWidth:1, borderColor:'#ddd' },
  inputHalfContainer: { width:'49%' },
  inputFull: { backgroundColor:'#fff', padding:12, borderRadius:5, borderWidth:1, borderColor:'#ddd' },
  hingeInput: { backgroundColor:'#fff', padding:5, borderRadius:5, borderWidth:1, borderColor:'#ddd', fontSize:25, fontWeight:'bold', color:'red', textAlign:'center' },
  tab: { flex:1, padding:12, backgroundColor:'#e0e0e0', alignItems:'center', margin:2, borderRadius:8 },
  activeTab: { backgroundColor:'#007AFF' },
  saveBtn: { padding:15, borderRadius:8, alignItems:'center', marginTop:4 },
  mainTitle: { fontSize:18, fontWeight:'bold', textAlign:'center', marginTop:30, marginBottom:10 },
  listHeader: { padding:12, borderRadius:5, marginTop:10 },
  listHeaderText: { color:'white', fontWeight:'bold' },
  orderCard: { backgroundColor:'#fff', borderRadius:8, marginBottom:5, borderLeftWidth:10, flexDirection:'row', elevation:2, minHeight:90 },
  cardContent: { flex:1, padding:10, justifyContent:'center' },
  cardCustomer: { fontSize:13, fontWeight:'bold', color:'#1a1a1a' },
  cardDetails: { fontSize:12, color:'#444' },
  cardSubDetails: { fontSize:11, color:'#666' },
  datesRow: { flexDirection:'row', flexWrap:'wrap', marginTop:4, gap:4 },
  dateChip: { fontSize:10, color:'#555', backgroundColor:'#f0f0f0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, overflow:'hidden' },
  sideBtnContainer: { width:95, borderTopRightRadius:8, borderBottomRightRadius:8, overflow:'hidden' },
  lowerBtn: { flex:2, justifyContent:'center', alignItems:'center' },
  upperBtn: { flex:1, justifyContent:'center', alignItems:'center', borderBottomWidth:1, borderBottomColor:'#444' },
  sideBtnText: { color:'white', fontWeight:'bold', fontSize:12, textAlign:'center' },
  upperBtnText: { fontWeight:'bold', fontSize:10 },
  // TYPE
  typeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  typeBtn: { flex:1, padding:12, borderRadius:8, alignItems:'center', backgroundColor:'#e8e8e8', borderWidth:2, borderColor:'#ddd' },
  typeBtnActive: { backgroundColor:'#007AFF', borderColor:'#007AFF' },
  typeBtnActiveStd: { backgroundColor:'#8B0000', borderColor:'#8B0000' },
  typeBtnTxt: { fontWeight:'bold', fontSize:13, color:'#555' },
  typeBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:12 },
  typeBadgeCustom: { backgroundColor:'#e3f0ff' },
  typeBadgeStd: { backgroundColor:'#fde8e8' },
  typeBadgeTxt: { fontSize:11, fontWeight:'bold', color:'#333' },
  // ΔΙΑΣΤΑΣΕΙΣ
  dimBtn: { paddingHorizontal:14, paddingVertical:10, backgroundColor:'#e8e8e8', borderRadius:8, marginRight:8, marginBottom:8, minWidth:62, alignItems:'center' },
  dimActive: { backgroundColor:'#1a1a1a' },
  dimTxt: { fontSize:15, fontWeight:'700', color:'#555' },
  dimActiveTxt: { color:'white' },
  // HW
  hwRow: { flexDirection:'row', justifyContent:'space-between', marginBottom:10 },
  hwBox: { width:'49%', backgroundColor:'#fff', padding:10, borderRadius:8, borderWidth:1, borderColor:'#ddd' },
  hwBtns: { flexDirection:'row', gap:6, marginTop:4 },
  hwBtn: { flex:1, paddingVertical:6, paddingHorizontal:2, backgroundColor:'#e8e8e8', borderRadius:6, alignItems:'center', justifyContent:'center' },
  hwBtnActive: { backgroundColor:'#1a1a1a' },
  hwBtnYes: { backgroundColor:'#00C851' },
  hwBtnNo: { backgroundColor:'#1a1a1a' },
  hwBtnTxt: { fontSize:11, fontWeight:'bold', color:'#555', textAlign:'center' },
  qtyInput: { backgroundColor:'#fff', padding:8, borderRadius:8, borderWidth:2, borderColor:'#007AFF', fontSize:20, fontWeight:'bold', textAlign:'left', color:'#007AFF', marginBottom:8, width:70 },
  // ΠΕΛΑΤΗΣ
  selectedCustomerBox: { backgroundColor:'#e8f5e9', padding:12, borderRadius:8, borderWidth:2, borderColor:'#00C851', flexDirection:'row', alignItems:'center', marginBottom:8 },
  selectedCustomerName: { fontSize:15, fontWeight:'bold', color:'#1a1a1a' },
  selectedCustomerHint: { fontSize:11, color:'#888', marginTop:2 },
  customerDropdown: { backgroundColor:'#fff', borderWidth:1, borderColor:'#ddd', borderRadius:8, marginTop:-6, marginBottom:4, elevation:10 },
  customerOption: { padding:12, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  customerOptionName: { fontSize:14, fontWeight:'bold', color:'#1a1a1a' },
  customerOptionDetail: { fontSize:12, color:'#666' },
  infoRow: { fontSize:16, color:'#1a1a1a', marginBottom:8, fontWeight:'500' },
  infoRowEmpty: { fontSize:14, color:'#bbb', marginBottom:8, fontStyle:'italic' },
  // MODAL
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
  modalBox: { backgroundColor:'#fff', borderRadius:16, padding:24, width:'80%', alignItems:'center' },
  modalTitle: { fontSize:18, fontWeight:'bold', color:'#8B0000', marginBottom:6 },
  modalSub: { fontSize:14, color:'#444', marginBottom:4, textAlign:'center' },
  modalTotal: { fontSize:13, color:'#888', marginBottom:16 },
  modalInput: { borderWidth:2, borderColor:'#8B0000', borderRadius:8, padding:12, fontSize:28, fontWeight:'bold', textAlign:'center', color:'#8B0000', width:'60%', marginBottom:20 },
  modalBtn: { flex:1, padding:14, borderRadius:8, alignItems:'center' },
  // ΠΑΡΑΓΩΓΗ ΥΠΟΚΑΡΤΕΛΕΣ
  prodContainer: { backgroundColor:'#f9f9f9', borderRadius:8, marginTop:4, padding:8 },
  phaseTabs: { marginBottom:10 },
  phaseTab: { paddingHorizontal:14, paddingVertical:10, backgroundColor:'#e0e0e0', borderRadius:20, marginRight:8, alignItems:'center', minWidth:80 },
  phaseTabActive: { backgroundColor:'#8B0000' },
  phaseTabTxt: { fontSize:15, fontWeight:'bold', color:'#555', textAlign:'center' },
  phaseTabTxtActive: { color:'white' },
  phaseTabCount: { fontSize:14, color:'#888', marginTop:2 },
  printBtn: { backgroundColor:'#1a1a1a', padding:12, borderRadius:8, alignItems:'center', marginBottom:10 },
  printBtnTxt: { color:'white', fontWeight:'bold', fontSize:18 },
  phaseCard: { backgroundColor:'#fff', borderRadius:8, marginBottom:6, borderLeftWidth:5, borderLeftColor:'#ffbb33', flexDirection:'row', alignItems:'center', padding:10, elevation:2 },
  phaseCardDone: { borderLeftColor:'#00C851', opacity:0.7 },
  printCheck: { marginRight:4 },
  checkbox: { width:26, height:26, borderRadius:6, borderWidth:2, borderColor:'#8B0000', alignItems:'center', justifyContent:'center', backgroundColor:'#fff' },
  checkboxSelected: { backgroundColor:'#8B0000' },
  printedBadge: { width:30, alignItems:'center', marginRight:4 },
  printedBadgeTxt: { fontSize:18 },
  printedTxt: { fontSize:10, color:'#007AFF', fontStyle:'italic', marginTop:2 },
  doneTxt: { fontSize:10, color:'#00C851', fontWeight:'bold', marginTop:2 },
  doneBtn: { backgroundColor:'#00C851', borderRadius:6, padding:8, alignItems:'center', marginBottom:4, minWidth:50 },
  doneBtnActive: { backgroundColor:'#888' },
  doneBtnTxt: { color:'white', fontWeight:'bold', fontSize:10, textAlign:'center' },
  removeBtn: { backgroundColor:'#ff4444', borderRadius:6, padding:8, alignItems:'center', minWidth:50 },
  removeBtnTxt: { color:'white', fontWeight:'bold', fontSize:14 },
  // PRINT PREVIEW
  previewContainer: { flex:1, backgroundColor:'#fff' },
  previewHeader: { backgroundColor:'#fff', padding:16, borderBottomWidth:2, borderBottomColor:'#000' },
  previewTitle: { fontSize:18, fontWeight:'bold', color:'#000' },
  previewSub: { fontSize:13, color:'#000', marginTop:4 },
  previewScroll: { flex:1, padding:10 },
  previewThead: { flexDirection:'row', backgroundColor:'#fff', paddingVertical:8, borderBottomWidth:2, borderBottomColor:'#000', borderTopWidth:2, borderTopColor:'#000' },
  previewTh: { width:110, color:'#000', fontWeight:'bold', fontSize:11, paddingHorizontal:6 },
  previewTr: { flexDirection:'row', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#000', alignItems:'flex-start' },
  previewTrEven: { backgroundColor:'#fff' },
  previewTrOdd: { backgroundColor:'#fff' },
  previewTd: { fontSize:11, color:'#000', paddingHorizontal:6 },
  previewBtns: { flexDirection:'row', padding:16, gap:12, borderTopWidth:1, borderTopColor:'#ddd', backgroundColor:'#fff' },
  previewCancelBtn: { flex:1, padding:16, borderRadius:10, backgroundColor:'#e0e0e0', alignItems:'center' },
  previewCancelTxt: { fontWeight:'bold', fontSize:15, color:'#333' },
  previewPrintBtn: { flex:2, padding:16, borderRadius:10, backgroundColor:'#000', alignItems:'center' },
  previewPrintTxt: { fontWeight:'bold', fontSize:15, color:'white' },
  // ΕΚΤΥΠΩΣΗ MODAL
  printHeader: { backgroundColor:'#8B0000', padding:16 },
  printHeaderTitle: { color:'white', fontWeight:'bold', fontSize:16 },
  printHeaderSub: { color:'#ffcccc', fontSize:12, marginTop:4 },
  printTableHeader: { flexDirection:'row', backgroundColor:'#333', padding:8, borderRadius:4, marginBottom:2 },
  printTableRow: { flexDirection:'row', padding:8, backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#e0e0e0' },
  printTH: { color:'white', fontWeight:'bold', fontSize:11 },
  printTD: { fontSize:11, color:'#222' },
  printFooter: { flexDirection:'row', padding:16, gap:12, backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#ddd' },
  printCancelBtn: { flex:1, padding:16, borderRadius:8, alignItems:'center', backgroundColor:'#e0e0e0' },
  printCancelTxt: { fontWeight:'bold', fontSize:15, color:'#333' },
  printConfirmBtn: { flex:2, padding:16, borderRadius:8, alignItems:'center', backgroundColor:'#8B0000' },
  printConfirmTxt: { fontWeight:'bold', fontSize:15, color:'white' },
});
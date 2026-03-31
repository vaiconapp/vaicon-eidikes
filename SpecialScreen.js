import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Share, Dimensions, Platform, Keyboard } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', glassNotes:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', notes:'', status:'PENDING', hardware:'', installation:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', coatings:[], stavera:[], heightReduction:'' };

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
  const [activeSection, setActiveSection] = useState('pending'); // form | pending | prod | ready | archive
  const [pendingSort, setPendingSort] = useState('no');
  const [showHardwarePicker, setShowHardwarePicker] = useState(false);
  const [showLockPicker, setShowLockPicker] = useState(false);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [dupModal, setDupModal] = useState({ visible:false, base:'', suggested:'', onUse:null, onKeep:null, onCancel:null });
  const [confirmModal, setConfirmModal] = useState({ visible:false, title:'', message:'', confirmText:'', onConfirm:null });
  const [archiveDeleteModal, setArchiveDeleteModal] = useState({ visible:false, orderId:null, pwd:'', error:false });
  const [archiveReturnModal, setArchiveReturnModal] = useState({ visible:false, orderId:null });
  const [editModal, setEditModal] = useState({ visible:false, order:null });
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

  const [printSelected, setPrintSelected] = useState({});
  const [printPreview, setPrintPreview] = useState({ visible:false, phaseKey:null, orders:[], copies:1 });

  const customerRef=useRef(); const orderNoRef=useRef(); const hRef=useRef(); const wRef=useRef(); const qtyEidikiRef=useRef();
  const hingeRef=useRef(); const glassRef=useRef(); const glassNotesRef=useRef(); const lockRef=useRef(); const notesRef=useRef();
  const customerSelectedRef = useRef(false);
  const prodScrollRef = useRef(null);
  const staveraWidthRefs = useRef({});
  const staveraNoteRefs = useRef({});
  const staveraHRefs = useRef({});
  const staveraWRefs = useRef({});
  const staveraGridNoteRefs = useRef({});
  const [pageWidth, setPageWidth] = useState(SCREEN_WIDTH);


  const syncToCloud = async (o) => { try { await fetch(`${FIREBASE_URL}/special_orders/${o.id}.json`,{method:'PUT',body:JSON.stringify(o)}); } catch { Alert.alert("Σφάλμα","Δεν αποθηκεύτηκε."); } };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/special_orders/${id}.json`,{method:'DELETE'}); } catch(e){} };

  const resetForm = () => { setCustomForm(INIT_FORM); setCustomerSearch(''); setSelectedCustomer(null); setShowCustomerList(false); setEditingOrder(null); };

  // Auto-focus πελάτη στο mount
  useEffect(()=>{ setTimeout(()=>customerRef.current?.focus(), 300); }, []);

  const blurAll = () => {
    glassRef.current?.blur();
    glassNotesRef.current?.blur();
    Object.values(staveraHRefs.current).forEach(r=>r?.blur());
    Object.values(staveraGridNoteRefs.current).forEach(r=>r?.blur());
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


  const saveOrder = async () => {
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
    const newOrder = {...customForm, orderType:'ΕΙΔΙΚΗ', id:Date.now().toString(), createdAt:Date.now(), status:'PENDING'};
    setSpecialOrders([newOrder,...specialOrders]);
    await syncToCloud(newOrder);
    await logActivity('ΕΙΔΙΚΗ', 'Νέα παραγγελία', { orderNo: newOrder.orderNo, customer: newOrder.customer, size: `${newOrder.h}x${newOrder.w}`, qty: newOrder.qty });
    resetForm();

    Alert.alert("VAICON", "Η παραγγελία αποθηκεύτηκε!");
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
    const phases = {};
    PHASES.forEach(ph => {
      // Το ΜΟΝΤΑΡΙΣΜΑ/ΕΠΕΝΔΥΣΗ μπαίνει μόνο αν είναι τσεκαρισμένο ΝΑΙ
      if (ph.key==='montDoor' && order.installation!=='ΝΑΙ') {
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
        const kleidaria = o.lock||'—';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        return `<tr>
          <td style="font-weight:bold;font-size:20px">${o.orderNo||'—'}</td>
          <td style="font-size:20px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="${mentStyle}">${mentesedesVal}</td>
          <td style="font-size:15px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;max-width:180px">${kleidaria}</td>
          <td style="font-size:15px;text-align:center">${caseTypeVal}</td>
          <td style="font-size:15px">${o.caseMaterial||'DKP'}</td>
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${(o.notes||'').replace(/\n/g,'<br>')}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:55px"><col style="width:100px"><col style="width:35px"><col style="width:28px"><col style="width:130px"><col style="width:28px"><col style="width:70px"><col style="width:160px"><col>
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
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
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
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${(o.notes||'').replace(/\n/g,'<br>')}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:5%"><col style="width:12%"><col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:18%"><col style="width:20%"><col style="width:22%"><col style="width:11%">
      </colgroup><thead><tr>
        <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Μεντ.</th><th>Τζάμι</th><th>Κλειδαριά</th><th>Παρατηρήσεις</th><th>Ημερομηνίες</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    };

    const buildMontDoorTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const deliveryFmt = o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
        const datesLine = [createdFmt, deliveryFmt].filter(Boolean).join('    ');
        // Παρατηρήσεις — ίδια μορφοποίηση με LASER 1 αντίγραφο
        const allCoatings = o.coatings||[];
        const exo = allCoatings.filter(c=>c.toUpperCase().includes('ΕΞΩ'));
        const mesa = allCoatings.filter(c=>c.toUpperCase().includes('ΜΕΣΑ')||c.toUpperCase().includes('ΕΣΩΤ'));
        const staveraEntries = (o.stavera||[]).filter(s=>s&&s.dim);
        const staveraStr = staveraEntries.map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ');
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"";
        const notesLines = [];
        if (o.notes) notesLines.push(`<span style="color:#000">${o.notes}</span>`);
        if (exo.length>0) notesLines.push(`<span style="color:#b8860b;font-weight:bold">🎨 ΕΞΩ: ${exo.join(', ')}</span>`);
        if (mesa.length>0) notesLines.push(`<span style="color:#1565c0;font-weight:bold">🎨 ΜΕΣ: ${mesa.join(', ')}</span>`);
        if (staveraStr) notesLines.push(`<span style="color:#6a0dad;font-weight:bold">📐 ${staveraStr}</span>`);
        if (tzami) notesLines.push(`<span style="color:#555">🪟 ${tzami}</span>`);
        const notesCell = notesLines.join('<br>');
        return `<tr>
          <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
          <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:13px;text-align:center">${armorVal}</td>
          <td style="font-size:13px">${o.hardware||'—'}</td>
          <td style="font-size:13px">${mentesedesVal}</td>
          <td style="font-size:13px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word">${kleidaria}</td>
          <td style="font-size:13px;text-align:center">${caseTypeVal}</td>
          <td style="font-size:13px;white-space:normal;word-wrap:break-word">${notesCell}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:55px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:70px"><col style="width:28px"><col style="width:130px"><col style="width:28px"><col><col style="width:70px">
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
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${(o.notes||'').replace(/\n/g,'<br>')}</td>
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
          const kleidaria = o.lock||'—';
          const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
          return `<tr>
            <td class="col-no" style="font-weight:bold">${o.orderNo||'—'}</td>
            <td class="col-tem">${qtyDisplay(o)}</td>
            <td class="col-dim" style="font-weight:900">${dimCell(o)}</td>
            <td class="col-fora" style="font-weight:bold">${fora}</td>
            <td class="col-thor" style="font-size:10px;text-align:center">${armorVal}</td>
            <td class="col-ment" style="${mentStyle}">${mentesedesVal}</td>
            <td class="col-lock" style="font-size:10px">${kleidaria}</td>
            <td class="notes" style="font-size:10px">${o.notes||''}</td>
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
            <td class="col-lock" style="font-size:10px">${o.lock||'—'}</td>
            <td class="col-type" style="font-size:10px;text-align:center">${caseTypeVal}</td>
            <td class="col-mat" style="font-size:10px;font-weight:bold">${mat}</td>
            <td class="notes" style="font-size:10px">${o.notes||''}</td>
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
            <td class="col-lock" style="font-size:10px">${o.lock||'—'}</td>
            <td class="notes" style="font-size:10px">${o.notes||''}</td>
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
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
        const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
        const caseTypeVal = (o.caseType||'').includes('ΑΝΟΙΧΤΟΥ') ? '<b>Α/Τ</b>' : '';
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        // Επενδύσεις: εξωτερικές / εσωτερικές
        const allCoatings = o.coatings||[];
        const exo = allCoatings.filter(c=>c.toUpperCase().includes('ΕΞΩ'));
        const mesa = allCoatings.filter(c=>c.toUpperCase().includes('ΜΕΣΑ')||c.toUpperCase().includes('ΕΣΩΤ'));
        // Σταθερά
        const staveraEntries = (o.stavera||[]).filter(s=>s&&s.dim);
        const staveraStr = staveraEntries.map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ');
        // Παρατηρήσεις — σύνθεση
        const notesLines = [];
        if (o.notes) notesLines.push(`<span style="color:#000">${o.notes}</span>`);
        if (exo.length>0) notesLines.push(`<span style="color:#b8860b;font-weight:bold">🎨 ΕΞΩ: ${exo.join(', ')}</span>`);
        if (mesa.length>0) notesLines.push(`<span style="color:#1565c0;font-weight:bold">🎨 ΜΕΣ: ${mesa.join(', ')}</span>`);
        if (staveraStr) notesLines.push(`<span style="color:#6a0dad;font-weight:bold">📐 ${staveraStr}</span>`);
        const notesCell = notesLines.join('<br>');
        return `<tr>
          <td class="col-no" style="font-weight:bold">${o.orderNo||'—'}</td>
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
        <col style="width:55px"><col style="width:30px"><col style="width:100px"><col style="width:30px"><col style="width:32px">
        <col style="width:28px"><col style="width:110px"><col style="width:140px"><col style="width:32px"><col style="width:80px"><col>
      </colgroup><thead><tr>
        <th>Νο</th><th>Τεμ.</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th>
        <th>Μεντ.</th><th>Τζάμι</th><th>Κλειδ.</th><th>Τ/Κ</th><th>Υλ.Κάσας</th><th>Παρατηρήσεις</th>
      </tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
    };
    const buildTable = (orders) => {
      const rows = orders.map(o => {
        const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
        const mentesedesVal = (!o.hinges||o.hinges==='2')?'':o.hinges;
        const kleidaria = o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—');
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
          ${showCoatings?`<td>${(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</td>`:''}
          <td style="min-width:140px">${o.notes||''}</td>
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
        ${isLaser ? buildLaserTable(copy.orders, copy.title) : isCases ? buildCasesTable(copy.orders) : isSasi ? buildSasiTable(copy.orders) : isMontDoor ? buildMontDoorTable(copy.orders) : isVafio ? buildVafioTable(copy.orders) : buildTable(copy.orders)}
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
        { title:`VAICON — ${dateStr} — ΠΡΟΓΡΑΜΜΑ ΕΙΔΙΚΩΝ ΠΑΡΑΓΓΕΛΙΩΝ`, orders:copy1 },
        { title:`VAICON — ${dateStr} — ΚΑΣΣΕΣ`, orders:copy2 },
        { title:`VAICON — ${dateStr} — ΣΑΣΙ`, orders:copy3 },
        { title:`VAICON — ${dateStr} — ΠΡΟΦΙΛ`, orders:copy4 },
      ];
    }
    return [{ title:`VAICON — ${dateStr} — ${phaseLabel}`, orders:[...orders].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)) }];
  };

  // Άνοιγμα preview εκτύπωσης
  const handlePrint = async (phaseKey) => {
    const selected = Object.keys(printSelected).filter(id => printSelected[id]);
    if (selected.length===0) {
      if(Platform.OS==='web') window.alert('Επίλεξε τουλάχιστον μία παραγγελία.');
      else Alert.alert("Προσοχή","Επίλεξε τουλάχιστον μία παραγγελία.");
      return;
    }
    // Για ΣΤΑΘΕΡΑ: ίδιο φίλτρο με αυτό που εμφανίζεται στο page
    const prodOrders = specialOrders.filter(o=>o.status==='PROD');
    const staveraOrders = [
      ...prodOrders.filter(o=>o.stavera&&o.stavera.length>0),
      ...specialOrders.filter(o=>o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)
    ];
    const orders = phaseKey==='stavera'
      ? staveraOrders.filter(o => selected.includes(o.id))
      : specialOrders.filter(o => selected.includes(o.id) && o.phases?.[phaseKey]?.active);
    // Για LASER ΚΟΠΕΣ → επιλογή αντιγράφων πριν την εκτύπωση
    if (phaseKey==='laser') {
      if(Platform.OS==='web'){
        const choice = await new Promise(resolve => {
          const modal = document.createElement('div');
          modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
          modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:24px;width:300px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
              <div style="font-size:18px;font-weight:bold;margin-bottom:8px;">🖨️ LASER ΚΟΠΕΣ</div>
              <div style="color:#555;margin-bottom:20px;">${orders.length} παραγγελίες — Πόσα αντίγραφα;</div>
              <div style="display:flex;gap:10px;">
                <button id="btn1" style="flex:1;padding:12px;border:none;border-radius:8px;background:#1a1a1a;color:white;font-weight:bold;font-size:14px;cursor:pointer;">1 ΑΝΤΙΓΡΑΦΟ</button>
                <button id="btn4" style="flex:1;padding:12px;border:none;border-radius:8px;background:#8B0000;color:white;font-weight:bold;font-size:14px;cursor:pointer;">4 ΑΝΤΙΓΡΑΦΑ</button>
              </div>
              <button id="btnCancel" style="margin-top:10px;width:100%;padding:10px;border:none;border-radius:8px;background:#eee;color:#555;font-weight:bold;cursor:pointer;">ΑΚΥΡΟ</button>
            </div>`;
          document.body.appendChild(modal);
          modal.querySelector('#btn1').onclick = () => { document.body.removeChild(modal); resolve(1); };
          modal.querySelector('#btn4').onclick = () => { document.body.removeChild(modal); resolve(4); };
          modal.querySelector('#btnCancel').onclick = () => { document.body.removeChild(modal); resolve(null); };
        });
        if (!choice) return;
        // Εκτύπωση απευθείας
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        const phaseLabel = PHASES.find(p=>p.key===phaseKey)?.label || phaseKey;
        const allCopies = getCopies(orders, phaseLabel, dateStr);
        const selectedCopies = choice===4 ? allCopies : [allCopies[0]];
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
            if (staveraEntries.length===0) {
              return [`<tr>
                <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
                <td style="font-size:13px">${o.caseType||'—'}</td>
                <td style="font-size:20px;font-weight:900">—</td>
                <td style="font-size:13px;min-width:180px"></td>
                <td style="font-size:12px;color:#444">${o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):''}</td>
              </tr>`];
            }
            return staveraEntries.map(s=>`<tr>
              <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
              <td style="font-size:13px">${o.caseType||'—'}</td>
              <td style="font-size:20px;font-weight:900">${s.dim||'—'}</td>
              <td style="font-size:13px;min-width:180px">${s.note||''}</td>
              <td style="font-size:12px;color:#444">${o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):''}</td>
            </tr>`);
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
            <table><thead><tr><th>Νο</th><th>Τ.Κάσας</th><th>Διάσταση Σταθερού</th><th>Παρατήρηση</th><th>Ημερομηνία</th></tr></thead>
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
            if (selectedIds.includes(o.id) && o.phases?.[phaseKey]?.active) {
              return {...o, phases:{...o.phases, [phaseKey]:{...o.phases[phaseKey], printed:true, printHistory:[...(o.phases[phaseKey].printHistory||[]), {ts:Date.now(), copies:1}]}}};
            }
            return o;
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
          if (staveraEntries.length===0) {
            // Εκτύπωσε την παραγγελία χωρίς διάσταση σταθερού
            return [`<tr>
              <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
              <td style="font-size:13px">${o.caseType||'—'}</td>
              <td style="font-size:20px;font-weight:900">—</td>
              <td style="font-size:13px;min-width:180px"></td>
              <td style="font-size:12px;color:#444">${o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):''}</td>
            </tr>`];
          }
          return staveraEntries.map(s=>`<tr>
            <td style="font-weight:bold;font-size:17px">${o.orderNo||'—'}</td>
            <td style="font-size:13px">${o.caseType||'—'}</td>
            <td style="font-size:20px;font-weight:900">${s.dim||'—'}</td>
            <td style="font-size:13px;min-width:180px">${s.note||''}</td>
            <td style="font-size:12px;color:#444">${o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}):''}</td>
          </tr>`);
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
          <table><thead><tr><th>Νο</th><th>Τ.Κάσας</th><th>Διάσταση Σταθερού</th><th>Παρατήρηση</th><th>Ημερομηνία</th></tr></thead>
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
                if (entries.length===0) {
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
                return entries.map((s,si)=>(
                  <View key={o.id+'-'+si} style={[styles.previewTr,(i+si)%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{si===0?o.orderNo||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:90,fontSize:12}]}>{si===0?o.caseType||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>{s.dim||'—'}</Text>
                    <Text style={[styles.previewTd,{width:220,fontSize:12}]}>{s.note||''}</Text>
                    <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{si===0?deliveryFmt:''}</Text>
                  </View>
                ));
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
                    <Text style={[styles.previewTd,{width:80}]}>{o.lock||'—'}</Text>
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
                    <View style={{width:70,paddingHorizontal:6,justifyContent:'center'}}><Text style={{fontSize:11,color:'#000',flexWrap:'wrap'}}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text></View>
                    <Text style={[styles.previewTd,{width:220}]}>{o.notes||''}</Text>
                    <Text style={[styles.previewTd,{width:120,fontSize:11,color:'#555'}]}>{[createdFmt,deliveryFmt].filter(Boolean).join('  ')}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );
      }
      if (phaseKey==='montDoor') {
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
                    <View style={{width:70,paddingHorizontal:6,justifyContent:'center'}}><Text style={{fontSize:11,color:'#000',flexWrap:'wrap'}}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text></View>
                    <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{caseTypeTxt}</Text>
                    <Text style={[styles.previewTd,{width:120}]}>{(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</Text>
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
                <View style={{width:140,paddingHorizontal:6}}><Text style={{fontSize:11,color:'#000'}}>{o.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ'?'—':(o.lock||'—')}</Text></View>
                <Text style={[styles.previewTd,{width:50}]}>{o.hardware||'—'}</Text>
                <Text style={[styles.previewTd,{width:36,fontWeight:'bold'}]}>{caseTypeTxt}</Text>
                <Text style={[styles.previewTd,{width:65}]}>{o.caseMaterial||'DKP'}</Text>
                <Text style={[styles.previewTd,{width:40}]}>{o.installation==='ΝΑΙ'?'✓':''}</Text>
                <Text style={[styles.previewTd,{width:120}]}>{(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</Text>
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
    const allDone = Object.keys(newPhases).every(k => !newPhases[k].active || newPhases[k].done);
    const hasStavera = order.stavera && order.stavera.filter(s=>s.dim).length > 0;
    const staveraPending = hasStavera && !order.staveraDone;

    if (allDone) {
      if (staveraPending) {
        setConfirmModal({
          visible: true,
          title: '⚠️ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ',
          message: 'Όλες οι φάσεις παραγωγής ολοκληρώθηκαν.\n\nΕκκρεμεί σταθερό — η παραγγελία θα κατέβει στην αποθήκη και το σταθερό θα παραμείνει σε εξέλιξη.',
          confirmText: '📦 ΚΑΤΕΒΑΣΗ ΣΤΗΝ ΑΠΟΘΗΚΗ',
          onConfirm: async () => {
            const upd = {...order, phases:newPhases, status:'READY', readyAt:Date.now(), staveraPendingAtReady:true};
            setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
            await syncToCloud(upd);
            await logActivity('ΕΙΔΙΚΗ', 'Φάση → ΕΤΟΙΜΟ (εκκρεμές σταθερό)', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
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
    const upd = {...order, phases:{...order.phases, [phaseKey]:{...order.phases[phaseKey], done:false}}};
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

  const cancelOrder = (id) => Alert.alert("Ακύρωση","Οριστική διαγραφή;",[{text:"Όχι"},{text:"Ναι",style:"destructive",onPress:async()=>{
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

  }}]);
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

  const renderOrderCard = (order, isArchive=false, isInPending=false) => {
    const isProd = order.status==='PROD';
    const bc = isArchive?'#333':(isProd?'#2e7d32':order.status==='PENDING'?'#ff4444':'#00C851');
    const next = order.status==='PENDING'?'PROD':order.status==='PROD'?'READY':'SOLD';
    const btn  = isArchive?'ΔΙΑΓΡΑΦΗ':(order.status==='PENDING'?'ΕΝΑΡΞΗ':order.status==='PROD'?'ΕΤΟΙΜΗ':'ΠΩΛΗΣΗ');
    const btnC = isArchive?'#000':(order.status==='PENDING'?'#ffbb33':order.status==='PROD'?'#00C851':'#222');
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    return (
      <TouchableOpacity key={order.id} onLongPress={()=>!isArchive&&order.status==='PENDING'&&editOrder(order)} delayLongPress={1000} activeOpacity={0.7} style={[styles.orderCard,{borderLeftColor:bc, backgroundColor: isProd?'#e8f5e9':'white'}]}>
        <View style={styles.cardContent}>
          {isProd&&<View style={{backgroundColor:'#2e7d32', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>⚙️ ΣΤΗΝ ΠΑΡΑΓΩΓΗ</Text>
          </View>}
          {order.staveraPendingAtReady&&!order.staveraDone&&<View style={{backgroundColor:'#e65100', borderRadius:6, paddingHorizontal:10, paddingVertical:3, alignSelf:'flex-start', marginBottom:5}}>
            <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>⏳ ΕΚΚΡΕΜΕΙ ΣΤΑΘΕΡΟ</Text>
          </View>}
          <Text style={{fontSize:20,fontWeight:'900',color:'#1a1a1a',letterSpacing:1,marginBottom:2}}>#{order.orderNo}</Text>
          {order.customer?<Text style={{fontSize:14,fontWeight:'bold',color:'#333',marginBottom:3}}>👤 {order.customer}</Text>:null}
          <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginBottom:3}}>
            <Text style={styles.cardDetails}>{order.h}x{order.w}</Text>
            {order.qty&&parseInt(order.qty)>1?<Text style={{fontWeight:'900',fontSize:15,color:'#cc0000'}}>{order.qty}τεμ</Text>:null}
            <Text style={styles.cardDetails}>{order.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}</Text>
            {!isStd?<Text style={styles.cardDetails}>{(order.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ')?'Δ/Θ':'Μ/Θ'}</Text>:null}
            {order.hardware?<Text style={[styles.cardDetails,{color:'#555'}]}>{order.hardware}</Text>:null}
          </View>
          {!isStd&&<Text style={styles.cardSubDetails}>Μεντ: {order.hinges}{(order.glassDim||order.glassNotes)?` | Τζ: ${order.glassDim||''}${order.glassNotes?' '+order.glassNotes:''}`:''}</Text>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κλειδ: {order.lock||'—'}</Text>}
          {!isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κάσα: {order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | {order.caseMaterial||'DKP'}</Text>}
          {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&<Text style={styles.cardSubDetails}>📐 Σταθ: {order.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.lock?`Κλειδ: ${order.lock} | `:''}  {order.hardware}</Text>}
          {isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {isStd&&order.heightReduction?<Text style={[styles.cardSubDetails,{color:'#b71c1c',fontWeight:'bold'}]}>📏 ΜΕΙΩΣΗ ΥΨΟΥΣ: {order.heightReduction} cm</Text>:null}
          {order.coatings&&order.coatings.length>0&&<Text style={[styles.cardSubDetails,{color:'#007AFF'}]}>🎨 {order.coatings.join(', ')}</Text>}
          {order.notes?<Text style={styles.cardSubDetails}>Σημ: {order.notes}</Text>:null}
          <View style={styles.datesRow}>
            {fmtDate(order.createdAt)&&<Text style={styles.dateChip}>📅 {fmtDate(order.createdAt)}</Text>}
            {order.deliveryDate?<Text style={[styles.dateChip,{backgroundColor:'#fff3e0',color:'#e65100'}]}>🚚 {order.deliveryDate}</Text>:null}
            {fmtDate(order.prodAt)&&<Text style={styles.dateChip}>🔨 {fmtDate(order.prodAt)}</Text>}
            {fmtDate(order.readyAt)&&<Text style={styles.dateChip}>✅ {fmtDate(order.readyAt)}</Text>}
          </View>
          {isProd&&order.phases&&(
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:4}}>
              {Object.entries(order.phases).map(([key,phase])=>{
                if(!phase.active) return null;
                const labels = {laser:'LASER',cases:'ΚΑΣΕΣ',montSasi:'ΣΑΣΙ',vafio:'ΒΑΦΕΙΟ',epend:'ΕΠΕΝ.',montDoor:'ΜΟΝΤ.'};
                return (
                  <View key={key} style={{backgroundColor:phase.done?'#2e7d32':'#ff9800',borderRadius:4,paddingHorizontal:6,paddingVertical:2}}>
                    <Text style={{color:'white',fontSize:10,fontWeight:'bold'}}>{phase.done?'✅':'⏳'} {labels[key]||key}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
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
        <View style={styles.sideBtnContainer}>
          {!isArchive&&(order.status==='PENDING'||order.status==='PROD')&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:'#007AFF'}]} onPress={()=>{ setEditForm({ deliveryDate:order.deliveryDate||'', lock:order.lock||'', glassDim:order.glassDim||'', glassNotes:order.glassNotes||'', hardware:order.hardware||'', coatings:order.coatings||[], stavera:order.stavera||[], notes:order.notes||'' }); setEditModal({visible:true,order}); }}><Text style={[styles.upperBtnText,{color:'white'}]}>✏️</Text></TouchableOpacity>}
          {!isArchive&&!(isInPending&&order.status==='READY'&&order.staveraPendingAtReady&&!order.staveraDone)&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:order.status==='PENDING'?'#000':'#666'}]} onPress={()=>order.status==='PENDING'?cancelOrder(order.id):moveBack(order.id,order.status)}><Text style={[styles.upperBtnText,{color:order.status==='PENDING'?'#ff4444':'white'}]}>{order.status==='PENDING'?'ΑΚΥΡΩΣΗ':'⟲'}</Text></TouchableOpacity>}
          {isArchive&&(
            <TouchableOpacity
              style={[styles.upperBtn,{backgroundColor:'#555'}]}
              onLongPress={()=>setArchiveReturnModal({visible:true, orderId:order.id})}
              delayLongPress={2000}>
              <Text style={[styles.upperBtnText,{color:'white'}]}>⟲</Text>
            </TouchableOpacity>
          )}
          {order.status!=='PROD'&&!(isInPending&&order.status==='READY'&&order.staveraPendingAtReady&&!order.staveraDone)&&!isArchive&&<TouchableOpacity style={[styles.lowerBtn,{backgroundColor:btnC}]} onPress={()=>updateStatus(order.id,next)}><Text style={styles.sideBtnText}>{btn}</Text></TouchableOpacity>}
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
  const renderProdPhaseCard = (order, phaseKey) => {
    // Backward compatibility: αν το phase δεν υπάρχει (παλιές παραγγελίες)
    // Για 'epend': active μόνο αν η παραγγελία έχει coatings
    const defaultActive = phaseKey === 'epend'
      ? (order.coatings && order.coatings.length > 0)
      : true;
    const phase = order.phases?.[phaseKey] ?? { active: defaultActive, printed: false, done: false };
    if (!phase.active) return null;
    const isStd = order.orderType==='ΤΥΠΟΠΟΙΗΜΕΝΗ';
    const isSelected = !!printSelected[order.id];
    return (
      <View key={order.id} style={[styles.phaseCard, phase.done&&styles.phaseCardDone]}>
        {/* CHECKBOX ΕΠΙΛΟΓΗΣ — πάντα ορατό */}
        <TouchableOpacity style={styles.printCheck} onPress={()=>setPrintSelected(p=>({...p,[order.id]:!p[order.id]}))}>
          <View style={[styles.checkbox, isSelected&&styles.checkboxSelected]}>
            {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:12}}>✓</Text>}
          </View>
        </TouchableOpacity>
        {phase.printed && (
          <View style={styles.printedBadge}>
            <Text style={styles.printedBadgeTxt}>🖨️</Text>
          </View>
        )}

        {/* ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ */}
        <View style={{flex:1, paddingHorizontal:8}}>
          <View style={{flexDirection:'row', alignItems:'center', flexWrap:'nowrap'}}>
            <Text style={[styles.cardDetails,{fontWeight:'bold'}]}>#{order.orderNo}</Text>
          </View>
          {order.customer?<Text style={[styles.cardSubDetails,{marginTop:2}]}>👤 {order.customer}</Text>:null}
          <Text style={styles.cardDetails}>{order.h}x{order.w} | {order.side}{!isStd?` | ${order.armor} ΘΩΡ.`:''}</Text>
          {!isStd&&<Text style={styles.cardSubDetails}>Μεντ: {order.hinges}{(order.glassDim||order.glassNotes)?` | Τζ: ${order.glassDim||''}${order.glassNotes?' '+order.glassNotes:''}`:''} | Κλειδ: {order.lock||'—'}</Text>}
          {!isStd&&<Text style={styles.cardSubDetails}>Κάσα: {order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | {order.caseMaterial||'DKP'} | {order.hardware||'—'}</Text>}
          {!isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&<Text style={styles.cardSubDetails}>📐 Σταθ: {order.stavera.filter(s=>s.dim).map(s=>s.dim+(s.note?' '+s.note:'')).join(' | ')}</Text>}
          {isStd&&<Text style={styles.cardSubDetails}>{order.hardware||''}</Text>}
          {isStd&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:13}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
          {order.qty&&parseInt(order.qty)>1?<Text style={[styles.cardSubDetails,{color:'#007AFF',fontWeight:'bold'}]}>Τεμ: {order.qty}</Text>:null}
          {order.coatings&&order.coatings.length>0&&<Text style={[styles.cardSubDetails,{color:'#007AFF'}]}>🎨 {order.coatings.join(', ')}</Text>}
          {order.notes?<Text style={[styles.cardSubDetails,{color:'#b71c1c',fontWeight:'bold'}]}>📝 {order.notes}</Text>:null}
          {phase.done&&<Text style={styles.doneTxt}>✅ Ολοκληρώθηκε</Text>}
          {/* ΗΜΕΡΟΜΗΝΙΑ ΕΙΣΟΔΟΥ + ΠΑΡΑΔΟΣΗ */}
          <View style={{marginTop:4}}>
            {order.prodAt&&<Text style={{fontSize:10,color:'#666'}}>📥 Είσοδος: {fmtDateTime(order.prodAt)}</Text>}
            {order.deliveryDate?<Text style={{fontSize:10,color:'#e65100',fontWeight:'bold'}}>🚚 Παράδοση: {order.deliveryDate}</Text>:null}
          </View>
        </View>

        {/* ΚΟΥΜΠΙΑ ΔΕΞΙΑ */}
        <View style={{justifyContent:'space-between', paddingVertical:4, gap:4}}>
          <TouchableOpacity
            style={{backgroundColor:'#007AFF', borderRadius:6, padding:8, alignItems:'center', minWidth:50}}
            onPress={()=>{ setEditForm({ deliveryDate:order.deliveryDate||'', lock:order.lock||'', glassDim:order.glassDim||'', glassNotes:order.glassNotes||'', hardware:order.hardware||'', coatings:order.coatings||[], stavera:order.stavera||[], notes:order.notes||'' }); setEditModal({visible:true,order}); }}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneBtn, phase.done && styles.doneBtnActive]}
            onPress={()=> phase.done ? handlePhaseUndone(order.id, phaseKey) : handlePhaseDone(order.id, phaseKey)}>
            <Text style={styles.doneBtnTxt}>{phase.done ? '↩️\nUNDO' : '✓\nDONE'}</Text>
          </TouchableOpacity>
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
    const copies = [{ title:`VAICON — ${dateStr} — ${title}`, orders:sorted }];
    const html = buildPrintHTML(copies);
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
        ${isMounting?`<td>${(o.coatings&&o.coatings.length>0)?o.coatings.join(', '):''}</td>`:''}
        <td>${o.deliveryDate||'—'}</td>
        <td style="min-width:140px">${o.notes||''}</td>
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
        // Backward compat: αν το phase δεν υπάρχει
        let phase = o.phases?.[ph.key];
        if (phase === undefined) {
          const defaultActive = ph.key === 'epend'
            ? !!(o.coatings && o.coatings.length > 0)
            : true;
          phase = { active: defaultActive, printed: false, done: false };
        }
        if (!phase.active) return `<td style="background:#f0f0f0;text-align:center;color:#999">—</td>`;
        if (phase.done) return `<td style="background:#d4edda;text-align:center;font-weight:bold;color:#155724">✓</td>`;
        if (phase.printed) return `<td style="background:#fff3cd;text-align:center;color:#856404">🖨</td>`;
        return `<td style="background:#f8d7da;text-align:center;color:#721c24">●</td>`;
      }).join('');
      return `<tr>
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
        <th>Νο</th><th>Πελάτης</th><th>Διάσταση</th><th>Φορά</th><th>Θωράκιση</th>
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

  // Ενότητα ΣΤΗΝ ΠΑΡΑΓΩΓΗ με υποκαρτέλες
  const renderProdSection = () => {
    const prodOrders = specialOrders.filter(o=>o.status==='PROD').sort((a,b)=>(b.prodAt||0)-(a.prodAt||0));
    const maxPhaseCount = prodOrders.length === 0 ? 0 : Math.max(...PHASES.map(ph =>
      prodOrders.filter(o => o.phases?.[ph.key]?.active && !o.phases?.[ph.key]?.done).length
    ));

    const phaseKeys = [...PHASES.map(p=>p.key), 'stavera'];

    const handlePageScroll = (e) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (page >= 0 && page < phaseKeys.length) {
        setActiveProdPhase(phaseKeys[page]);
      }
    };
    return (
      <View>
        <View style={[styles.listHeader,{backgroundColor:'#ffbb33', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
          <Text style={styles.listHeaderText}>● ΠΑΡΑΓΓΕΛΙΕΣ ΣΤΗΝ ΠΑΡΑΓΩΓΗ ({maxPhaseCount})</Text>
          <TouchableOpacity
            style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
            onPress={()=>handlePrintProdStatus(prodOrders)}>
            <Text style={{color:'#8B0000', fontSize:11, fontWeight:'bold'}}>📋 ΚΑΤΑΣΤΑΣΗ</Text>
          </TouchableOpacity>
        </View>
        {(
          <View style={styles.prodContainer}>
            {/* ΥΠΟΚΑΡΤΕΛΕΣ */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.phaseTabs}>
              {PHASES.map(ph=>(
                <TouchableOpacity key={ph.key} style={[styles.phaseTab, activeProdPhase===ph.key&&styles.phaseTabActive]} onPress={()=>{
                  setActiveProdPhase(ph.key);
                  const idx = phaseKeys.indexOf(ph.key);
                  prodScrollRef.current?.scrollTo({x: idx * pageWidth, animated:true});
                }}>
                  <Text style={[styles.phaseTabTxt, activeProdPhase===ph.key&&styles.phaseTabTxtActive]}>{ph.label}</Text>
                  <Text style={styles.phaseTabCount}>{prodOrders.filter(o => {
                    if (o.phases?.[ph.key] !== undefined) return o.phases[ph.key].active;
                    // backward compat: epend active μόνο αν έχει coatings
                    if (ph.key === 'epend') return !!(o.coatings && o.coatings.length > 0);
                    return true;
                  }).length}</Text>
                </TouchableOpacity>
              ))}
              {/* ΣΤΑΘΕΡΑ tab */}
              <TouchableOpacity
                style={[styles.phaseTab, activeProdPhase==='stavera'&&styles.phaseTabActive, {backgroundColor: activeProdPhase==='stavera'?'#7b1fa2':'#f3e5f5', minWidth:0, paddingHorizontal:14}]}
                onPress={()=>{ setActiveProdPhase('stavera'); prodScrollRef.current?.scrollTo({x: phaseKeys.indexOf('stavera') * pageWidth, animated:true}); }}>
                <Text style={[styles.phaseTabTxt, activeProdPhase==='stavera'&&styles.phaseTabTxtActive]}>ΣΤΑΘΕΡΑ</Text>
                <Text style={styles.phaseTabCount}>{prodOrders.filter(o=>o.stavera&&o.stavera.some(s=>s&&s.dim)).length + specialOrders.filter(o=>o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone).length}</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* ΚΟΥΜΠΙΑ ΕΠΙΛΟΓΗΣ + ΕΚΤΥΠΩΣΗΣ */}
            {activeProdPhase!=='stavera'&&<View style={{flexDirection:'row', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap'}}>
              {/* ΕΠΙΛΟΓΗ ΟΛΩΝ */}
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#f0f0f0', borderRadius:8, borderWidth:1, borderColor:'#ccc'}}
                onPress={()=>{
                  const phaseOrders = prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active);
                  const allSelected = phaseOrders.every(o=>printSelected[o.id]);
                  const newSelected = {...printSelected};
                  phaseOrders.forEach(o=>{ newSelected[o.id] = !allSelected; });
                  setPrintSelected(newSelected);
                }}>
                <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#555',backgroundColor:
                  prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active).every(o=>printSelected[o.id])&&
                  prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active).length>0
                  ?'#555':'white', alignItems:'center',justifyContent:'center'}}>
                  {prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active).every(o=>printSelected[o.id])&&
                   prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active).length>0
                   ?<Text style={{color:'white',fontSize:11,fontWeight:'bold'}}>✓</Text>:null}
                </View>
                <Text style={{fontSize:11,fontWeight:'bold',color:'#555'}}>ΟΛΩΝ</Text>
              </TouchableOpacity>

              {/* ΕΠΙΛΟΓΗ ΜΗ ΕΚΤΥΠΩΜΕΝΩΝ */}
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#fff3cd', borderRadius:8, borderWidth:1, borderColor:'#ffc107'}}
                onPress={()=>{
                  const phaseOrders = prodOrders.filter(o=>o.phases?.[activeProdPhase]?.active);
                  const newSelected = {...printSelected};
                  phaseOrders.forEach(o=>{ newSelected[o.id] = !o.phases?.[activeProdPhase]?.printed; });
                  setPrintSelected(newSelected);
                }}>
                <Text style={{fontSize:11,fontWeight:'bold',color:'#856404'}}>🖨️ ΜΗ ΕΚΤΥΠ.</Text>
              </TouchableOpacity>

              {/* ΕΚΤΥΠΩΣΗ */}
              <TouchableOpacity style={[styles.printBtn,{flex:1,marginBottom:0}]} onPress={()=>handlePrint(activeProdPhase)}>
                <Text style={styles.printBtnTxt}>🖨️ ΕΚΤΥΠΩΣΗ ΕΠΙΛΕΓΜΕΝΩΝ</Text>
              </TouchableOpacity>
            </View>}

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
                    prodOrders.map(o=>renderProdPhaseCard(o, ph.key))
                  )}
                </View>
              ))}
              {/* ΣΤΑΘΕΡΑ — τελευταίο page */}
              <View style={{width:pageWidth}}>
                {(()=>{
                  const staveraOrders = [
                    ...prodOrders.filter(o=>o.stavera&&o.stavera.some(s=>s&&s.dim)),
                    ...specialOrders.filter(o=>o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)
                  ];
                  const handleStaveraPrint = () => {
                    const selected = Object.keys(printSelected).filter(id=>printSelected[id]);
                    // Φιλτράρω μόνο παραγγελίες που ανήκουν στο ΣΤΑΘΕΡΑ tab
                    const staveraIds = staveraOrders.map(o=>String(o.id));
                    const staveraSelected = selected.filter(id=>staveraIds.includes(String(id)));
                    if (staveraSelected.length===0) {
                      // Αν δεν έχει επιλεγεί τίποτα από ΣΤΑΘΕΡΑ → εκτύπωσε όλες
                      if (staveraOrders.length===0) return Alert.alert("Προσοχή","Δεν υπάρχουν παραγγελίες με σταθερά.");
                      setPrintPreview({ visible:true, phaseKey:'stavera', orders:staveraOrders, copies:1 });
                      return;
                    }
                    const matchedOrders = staveraOrders.filter(o=>staveraSelected.includes(String(o.id)));
                    setPrintPreview({ visible:true, phaseKey:'stavera', orders:matchedOrders, copies:1 });
                  };
                  return (
                    <View style={{marginTop:6}}>
                      {/* PRINT BAR για ΣΤΑΘΕΡΑ */}
                      <View style={{flexDirection:'row', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap'}}>
                        <TouchableOpacity
                          style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#f0f0f0', borderRadius:8, borderWidth:1, borderColor:'#ccc'}}
                          onPress={()=>{
                            const allSelected = staveraOrders.every(o=>printSelected[o.id]);
                            const newSelected = {...printSelected};
                            staveraOrders.forEach(o=>{ newSelected[o.id] = !allSelected; });
                            setPrintSelected(newSelected);
                          }}>
                          <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#555',backgroundColor:
                            staveraOrders.length>0&&staveraOrders.every(o=>printSelected[o.id])?'#555':'white',alignItems:'center',justifyContent:'center'}}>
                            {staveraOrders.length>0&&staveraOrders.every(o=>printSelected[o.id])&&<Text style={{color:'white',fontSize:11,fontWeight:'bold'}}>✓</Text>}
                          </View>
                          <Text style={{fontSize:11,fontWeight:'bold',color:'#555'}}>ΟΛΩΝ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:8, paddingHorizontal:10, backgroundColor:'#fff3cd', borderRadius:8, borderWidth:1, borderColor:'#ffc107'}}
                          onPress={()=>{
                            const newSelected = {...printSelected};
                            staveraOrders.forEach(o=>{ newSelected[o.id] = !o.staveraPrinted; });
                            setPrintSelected(newSelected);
                          }}>
                          <Text style={{fontSize:11,fontWeight:'bold',color:'#856404'}}>🖨️ ΜΗ ΕΚΤΥΠ.</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.printBtn,{flex:1,marginBottom:0}]}
                          onPress={handleStaveraPrint}>
                          <Text style={styles.printBtnTxt}>🖨️ ΕΚΤΥΠΩΣΗ ΕΠΙΛΕΓΜΕΝΩΝ</Text>
                        </TouchableOpacity>
                      </View>
                      {staveraOrders.length===0?(
                        <Text style={{textAlign:'center',color:'#999',padding:16}}>Δεν υπάρχουν παραγγελίες με σταθερά</Text>
                      ):staveraOrders.map(o=>{
                        const isSelected = !!printSelected[o.id];
                        return (
                        <View key={o.id} style={{backgroundColor:o.staveraDone?'#e8f5e9':o.staveraGiven?'#ede7f6':'#f3e5f5', borderRadius:8, padding:10, marginBottom:6, borderLeftWidth:4, borderLeftColor:o.staveraDone?'#00C851':o.staveraGiven?'#4a148c':'#7b1fa2', elevation:1, flexDirection:'row', alignItems:'flex-start'}}>
                          <TouchableOpacity style={{marginRight:10, marginTop:2}} onPress={()=>setPrintSelected(p=>({...p,[o.id]:!p[o.id]}))}>
                            <View style={{width:28,height:28,borderRadius:6,borderWidth:2,borderColor:isSelected?'#1565c0':'#7b1fa2',backgroundColor:isSelected?'#1565c0':'white',alignItems:'center',justifyContent:'center'}}>
                              {isSelected&&<Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✓</Text>}
                            </View>
                          </TouchableOpacity>
                          <View style={{flex:1}}>
                            <Text style={{fontWeight:'bold', fontSize:13, marginBottom:4}}>#{o.orderNo} {o.customer?`— ${o.customer}`:''}</Text>
                            <Text style={{fontSize:12, color:'#555', marginBottom:6}}>{o.h}x{o.w} | {o.side}</Text>
                            {(o.stavera||[]).map((s,idx)=>(
                              <View key={idx} style={{backgroundColor:'white', borderRadius:6, padding:8, marginBottom:4, borderLeftWidth:2, borderLeftColor:'#ce93d8'}}>
                                <Text style={{fontWeight:'bold', fontSize:13, color:'#4a148c'}}>📐 {s.dim||'—'}</Text>
                                {s.note?<Text style={{fontSize:12, color:'#555', marginTop:2}}>{s.note}</Text>:null}
                              </View>
                            ))}
                            {o.staveraDone&&<Text style={{fontSize:11,color:'#00796B',fontWeight:'bold',marginTop:2}}>✅ Ολοκληρώθηκαν</Text>}
                          </View>
                          <View style={{justifyContent:'space-between', gap:6, marginLeft:8, paddingVertical:2}}>
                            <TouchableOpacity
                              style={[styles.doneBtn, o.staveraDone&&styles.doneBtnActive]}
                              onPress={async()=>{
                                const newDone = !o.staveraDone;
                                const upd={...o, staveraDone:newDone, ...(newDone && {staveraPendingAtReady:false})};
                                setSpecialOrders(specialOrders.map(x=>x.id===o.id?upd:x));
                                await syncToCloud(upd);
                              }}>
                              <Text style={styles.doneBtnTxt}>{o.staveraDone?'↩️ UNDO':'✓ DONE'}</Text>
                            </TouchableOpacity>
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
                      })}
                    </View>
                  );
                })()}
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    );
  };


  return (
    <View style={{flex:1}}>
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
            {['Nikel','Bronze','Nikel Best','Bronze Best','Best Παραγγελία',''].map((c,i)=>(
              <TouchableOpacity key={i}
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{
                  if(c===''){
                    setShowCustomHardwareInput(true);
                    setCustomHardwareText('');
                  } else {
                    setCustomForm({...customForm,hardware:c});
                    setShowCustomHardwareInput(false);
                    setShowHardwarePicker(false);
                  }
                }}>
                <Text style={{fontSize:15,color:c?'#000':'#888'}}>{c||'Άλλο (γράψτε εδώ)...'}</Text>
                {customForm.hardware===c&&c!==''&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
            ))}
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
                      setCustomForm({...customForm,hardware:customHardwareText.trim()});
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

      {/* MODAL ΚΛΕΙΔΑΡΙΕΣ */}
      <Modal visible={showLockPicker} transparent animationType="slide" onRequestClose={()=>setShowLockPicker(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'60%'}}>
            <View style={{backgroundColor:'#8B0000',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🔒 Κλειδαριά</Text>
              <TouchableOpacity onPress={()=>setShowLockPicker(false)}>
                <Text style={{color:'white',fontSize:20,fontWeight:'bold'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                onPress={()=>{setCustomForm({...customForm,lock:''});setShowLockPicker(false);}}>
                <Text style={{fontSize:15,color:'#888'}}>— Χωρίς κλειδαριά</Text>
                {!customForm.lock&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
              </TouchableOpacity>
              {(locks||[]).map(l=>(
                <TouchableOpacity key={l.id}
                  style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                  onPress={()=>{setCustomForm({...customForm,lock:l.name+(l.type?' ('+l.type+')':'')});setShowLockPicker(false);}}>
                  <View>
                    <Text style={{fontSize:15,color:'#000',fontWeight:'600'}}>{l.name}</Text>
                    {l.type?<Text style={{fontSize:12,color:'#666'}}>{l.type}</Text>:null}
                  </View>
                  {customForm.lock===l.name+(l.type?' ('+l.type+')':'')&&<Text style={{color:'#00C851',fontSize:18}}>✓</Text>}
                </TouchableOpacity>
              ))}
              {(locks||[]).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:24}}>Δεν υπάρχουν καταχωρημένες κλειδαριές.</Text>}
            </ScrollView>
            <View style={{height:20}}/>
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
              {coatings.map(c=>{
                const selected = (customForm.coatings||[]).includes(c.name);
                const n = c.name?.toLowerCase()||'';
                const bg = n.includes('μέσα')||n.includes('μεσα') ? '#E8F4FD' : n.includes('έξω')||n.includes('εξω') ? '#FFF3E0' : '#fff';
                return (
                  <TouchableOpacity key={c.id}
                    style={{padding:16,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between', backgroundColor: bg}}
                    onPress={()=>{
                      const current = customForm.coatings||[];
                      const updated = selected ? current.filter(x=>x!==c.name) : [...current,c.name];
                      setCustomForm({...customForm,coatings:updated});
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
              {(customForm.coatings||[]).length>0&&(
                <TouchableOpacity
                  style={{margin:12,padding:12,backgroundColor:'#ff4444',borderRadius:8,alignItems:'center'}}
                  onPress={()=>setCustomForm({...customForm,coatings:[]})}>
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
            <TextInput
              style={{borderWidth:2, borderColor: archiveDeleteModal.error?'#ff4444':'#ddd', borderRadius:8, padding:12, fontSize:16, letterSpacing:4, textAlign:'center', marginBottom:8}}
              placeholder="Κωδικός..."
              secureTextEntry
              value={archiveDeleteModal.pwd}
              onChangeText={v=>setArchiveDeleteModal(m=>({...m, pwd:v, error:false}))}
              autoFocus
            />
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
      <Modal visible={editModal.visible} transparent animationType="slide" onRequestClose={()=>setEditModal({visible:false,order:null})}>
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
              <TextInput
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,marginBottom:12}}
                placeholder="π.χ. Nikel, Bronze..."
                value={editForm.hardware||''}
                onChangeText={v=>setEditForm(f=>({...f,hardware:v}))}
              />
              {/* Επένδυση */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🎨 ΕΠΕΝΔΥΣΗ</Text>
              <TextInput
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,marginBottom:12}}
                placeholder="π.χ. ΑΛΟΥΜΙΝΙΟ ΕΞΩ, LAMINATE ΜΕΣΑ..."
                value={(editForm.coatings||[]).join(', ')}
                onChangeText={v=>setEditForm(f=>({...f,coatings:v.split(',').map(x=>x.trim()).filter(Boolean)}))}
              />
              {/* Σταθερά */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>📐 ΣΤΑΘΕΡΑ</Text>
              {[0,1,2,3].map(i=>{
                const s=(editForm.stavera||[])[i]||{dim:'',note:''};
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
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',note:''});
                        upd[i]={...upd[i],dim:v};
                        setEditForm(f=>({...f,stavera:upd}));
                      }}
                      onSubmitEditing={()=>{
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',note:''});
                        const dim=upd[i].dim||'';
                        if(dim && !dim.includes('×')){
                          upd[i]={...upd[i],dim:dim+' × '};
                          setEditForm(f=>({...f,stavera:upd}));
                          setTimeout(()=>editStaveraRefs.current[i]?.focus(),30);
                        } else {
                          editStaveraNoteRefs.current[i]?.focus();
                        }
                      }}
                    />
                    <TextInput
                      ref={el=>{editStaveraNoteRefs.current[i]=el;}}
                      style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,flex:1}}
                      placeholder="Παρατήρηση..."
                      returnKeyType="next"
                      blurOnSubmit={false}
                      value={s.note||''}
                      onChangeText={v=>{
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',note:''});
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
                setSpecialOrders(prev=>prev.map(o=>o.id===order.id?upd:o));
                await syncToCloud(upd);
                setEditModal({visible:false,order:null});
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
        </View>
        {/* CONTENT 80% */}
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
                  c.phone?.includes(customerSearch)||
                  c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                ).slice(0,5).length>0&&(
                  <View style={styles.customerDropdown}>
                    {(customers||[]).filter(c=>
                      c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                      c.phone?.includes(customerSearch)||
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
                    <Text style={[vstyles.fieldLabel,{flex:1}]}>Διάσταση</Text>
                    <Text style={[vstyles.fieldLabel,{flex:2}]}>Παρατήρηση Σταθερά</Text>
                  </View>
                  {[0,1,2,3].map(i=>{
                    const s=(customForm.stavera||[])[i]||{dim:'',note:''};
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
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',note:''});
                            upd[i]={...upd[i],dim:v};
                            setCustomForm({...customForm,stavera:upd});
                          }}
                          onSubmitEditing={()=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',note:''});
                            const dim=upd[i].dim||'';
                            if(dim && !dim.includes(' × ')){
                              upd[i]={...upd[i],dim:dim+' × '};
                              setCustomForm({...customForm,stavera:upd});
                              setTimeout(()=>staveraHRefs.current['e'+i]?.focus(),30);
                            } else {
                              staveraGridNoteRefs.current['e'+i]?.focus();
                            }
                          }}
                        />
                        <TextInput
                          ref={el=>{staveraGridNoteRefs.current['e'+i]=el;}}
                          style={[vstyles.staveraCell,{flex:1,minHeight:32}]}
                          placeholder="..."
                          returnKeyType="next"
                          blurOnSubmit={false}
                          value={s.note||''}
                          onChangeText={v=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',note:''});
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
                    <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:6}]} onPress={()=>{blurAll();setShowLockPicker(true);}}>
                      <Text style={{fontSize:13,color:customForm.lock?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.lock||'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                    <Text style={vstyles.fieldLabelDark}>Τζάμι</Text>
                    <View style={{flexDirection:'row', gap:4, marginTop:2}}>
                      <TextInput ref={glassRef} style={[vstyles.staveraCell,{width:90,textAlign:'center',fontSize:13,fontWeight:'700',minHeight:36}]} placeholder="Υ × Π" keyboardType="numeric" value={customForm.glassDim} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,glassDim:v})} onSubmitEditing={handleGlassEnter} blurOnSubmit={false} returnKeyType="next"/>
                      <TextInput ref={glassNotesRef} style={[vstyles.staveraCell,{flex:4,minHeight:36}]} placeholder="..." keyboardType="default" value={customForm.glassNotes||''} onChangeText={v=>setCustomForm({...customForm,glassNotes:v})} returnKeyType="done" blurOnSubmit={true}/>
                    </View>
                  </View>
                </View>
                {/* Χρώμα Εξαρτημάτων */}
                <Text style={vstyles.fieldLabelDark}>Χρώμα Εξαρτημάτων</Text>
                <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setShowHardwarePicker(true);}}>
                  <Text style={{fontSize:13,color:customForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.hardware||'Επιλέξτε...'}</Text>
                  <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                </TouchableOpacity>
                {/* Επένδυση */}
                <Text style={vstyles.fieldLabelDark}>Επένδυση</Text>
                <TouchableOpacity style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setShowCoatingsPicker(true);}}>
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




          <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#007AFF'}]} onPress={()=>{
            Keyboard.dismiss();
            if(Platform.OS==='web'){
              if(window.confirm('Αποθήκευση παραγγελίας προς παραγωγή;')){ saveOrder(); setTimeout(()=>customerRef.current?.focus(), 400); }
            } else {
              Alert.alert("Επιβεβαίωση", "Αποθήκευση παραγγελίας προς παραγωγή;", [
                {text:"ΟΧΙ", style:"cancel"},
                {text:"ΝΑΙ", onPress:()=>{ saveOrder(); setTimeout(()=>customerRef.current?.focus(), 400); }}
              ]);
            }
          }}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>ΑΠΟΘΗΚΕΥΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text>
          </TouchableOpacity>
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

          {/* ΠΑΡΑΓΩΓΗ */}
          {activeSection==='prod'&&renderProdSection()}

          {/* ΕΤΟΙΜΑ */}
          {activeSection==='ready'&&(
            <View>
              <View style={[styles.listHeader,{backgroundColor:'#00C851', flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                <Text style={styles.listHeaderText}>● ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ ({specialOrders.filter(o=>o.status==='READY').length})</Text>
                <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='READY'), 'ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ')}>
                  <Text style={{color:'#00C851', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                </TouchableOpacity>
              </View>
              {[...specialOrders.filter(o=>o.status==='READY')].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)).map(o=>renderOrderCard(o))}
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
  phaseTabTxt: { fontSize:11, fontWeight:'bold', color:'#555', textAlign:'center' },
  phaseTabTxtActive: { color:'white' },
  phaseTabCount: { fontSize:10, color:'#888', marginTop:2 },
  printBtn: { backgroundColor:'#1a1a1a', padding:12, borderRadius:8, alignItems:'center', marginBottom:10 },
  printBtnTxt: { color:'white', fontWeight:'bold', fontSize:13 },
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
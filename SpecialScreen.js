import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, LayoutAnimation, Modal, Share, Dimensions, Platform, Keyboard, PanResponder, Animated, Image } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { FIREBASE_URL } from './App';
import { logActivity } from './activityLog';
import PriceListModal, { priceListTotal, priceFinalTotal, priceCatalogTotal } from './PriceListModal';
import { autoPriceLines, applyAutoPriceLines } from './utils';
import MiniCalendar from './MiniCalendar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import qrcode from 'qrcode-generator';

const makeQrDataUrl = (text) => { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createDataURL(6, 8); };
import { findFormatItem, getFormatStyle, formatNamesHtml, wrapHtml, sortCoatingsGrouped, suggestNextOrderNo, groupOrderNo, splitBaseNo, nextGroupSuffix } from './formatHelpers';
import { SpecialOrderPreview } from './OrderPreview';

// Κρατά μόνο τα coatingDetails των επιλεγμένων επενδύσεων (καθαρίζει «φαντάσματα» — π.χ. κλειδιά με τελεία που σπάνε το Firebase).
const pruneCoatingDetails = (coatings, cd) => {
  const keep = new Set((coatings || []).filter(n => n && String(n).trim()));
  const out = {};
  Object.keys(cd || {}).forEach(k => { if (keep.has(k)) out[k] = cd[k]; });
  return out;
};

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
const INIT_FORM   = { customer:'', orderNo:'', h:'', w:'', hinges:'2', qty:'1', glassDim:'', glassNotes:'', glassDesign:'', armor:'ΜΟΝΗ', side:'ΔΕΞΙΑ', lock:'', cylinder:'', kypri:'ΟΧΙ', notes:'', status:'PENDING', hardware:'', casePaint:'', installation:'ΟΧΙ', placement:'ΟΧΙ', caseType:'ΚΛΕΙΣΤΟΥ ΤΥΠΟΥ', caseMaterial:'DKP', deliveryDate:'', sasiType:'ΜΟΝΗ ΘΩΡΑΚΙΣΗ', coatings:[], coatingDetails:{}, stavera:[], stavColumn:null, misc:[], heightReduction:'', programNo:'', priceList:[], priceDiscount:'', priceLog:[], priceNote:'' };

const getCoatingType = (name) => {
  const n = String(name||'').toUpperCase();
  if (n.includes('ΕΞΩ')) return 'EXO';
  if (n.includes('ΜΕΣΑ') || n.includes('ΕΣΩΤ')) return 'MESA';
  return 'OTHER';
};

const fmtNum = (n) => {
  if (!isFinite(n)) return '';
  const r = Math.round(n*10)/10;
  return String(r).replace('.', ',');
};
const computeCoatingDim = (h, w, type, pihaki) => {
  const H = parseFloat(String(h||'').replace(',','.'));
  const W = parseFloat(String(w||'').replace(',','.'));
  if (!isFinite(H) || !isFinite(W)) return '';
  let dh, dw;
  if (type === 'EXO') { dh = H - 5.3; dw = W - 8.3; }
  else if (type === 'MESA') {
    if (pihaki) { dh = H - 5.3; dw = W - 8.5; }
    else        { dh = H - 3.5; dw = W - 4.3; }
  } else return '';
  return `${fmtNum(dh)} × ${fmtNum(dw)}`;
};
const buildEpendSpecialHtml = (orders) => {
  const SLASH = '<b style="color:#d32f2f">&nbsp;&nbsp;/&nbsp;&nbsp;</b>';
  const escapeHtml = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const buildRow = (d, keys) => keys.map(k=>d[k]&&String(d[k]).trim()?escapeHtml(d[k]).trim():null).filter(Boolean).join(SLASH);
  const orderBlock = (o) => {
    const cd = o.coatingDetails || {};
    const sections = [];
    (o.coatings||[]).filter(n=>n&&String(n).trim()).forEach(name=>{
      const d = cd[name]||{};
      const fyllo = buildRow(d, ['dim','design','color']);
      const perv  = buildRow(d, ['frameW','frameColor']);
      const kasa  = buildRow(d, ['caseW','caseColor']);
      if (!fyllo && !perv && !kasa) return;
      const type = getCoatingType(name);
      const color = type==='EXO'?'#e65100':type==='MESA'?'#1565c0':'#444';
      const parts = [`<div style="font-weight:900;color:${color};font-size:44px;letter-spacing:0.5px;margin-bottom:6px;line-height:1.15">${escapeHtml(name)}</div>`];
      if (fyllo) parts.push(`<div style="margin-left:20px;font-size:36px;line-height:1.3;margin-bottom:3px"><b>Φύλλο:</b> ${fyllo}</div>`);
      if (perv)  parts.push(`<div style="margin-left:20px;font-size:36px;line-height:1.3;margin-bottom:3px"><b>Περβάζι:</b> ${perv}</div>`);
      if (type==='EXO' && kasa) parts.push(`<div style="margin-left:20px;font-size:36px;line-height:1.3;margin-bottom:3px"><b>Κάσα:</b> ${kasa}</div>`);
      if (type==='MESA' && d.pihaki) parts.push(`<div style="margin-left:20px;font-size:32px;line-height:1.3;color:#1565C0;font-weight:900;margin-top:4px">✓ Πηχάκι (ξυλογωνιά)</div>`);
      sections.push(parts.join(''));
    });
    const sectionsHtml = sections.join('<div style="border-top:2px dashed #999;margin:10px 0"></div>') || '<div style="font-size:30px;color:#777;font-style:italic">(χωρίς στοιχεία επένδυσης)</div>';
    const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡΙΣΤΕΡΗ':'ΔΕΞΙΑ';
    const installBadge = o.installation==='ΝΑΙ'
      ? `<span style="background:#1565C0;color:white;font-weight:900;font-size:34px;padding:6px 18px;border-radius:8px;margin-left:14px">ΜΟΝΤΑΡΙΣΜΑ</span>` : '';
    return `<div class="ord">
      <div class="ordno">${escapeHtml(o.orderNo||'—')}</div>
      <div class="ordbody">
        <div style="display:flex;align-items:center;gap:18px;border-bottom:3px solid #1a1a1a;padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap">
          <div style="font-size:52px;font-weight:900;color:#1565C0">${escapeHtml(o.h||'—')} × ${escapeHtml(o.w||'—')}</div>
          <div style="font-size:40px;font-weight:900;color:#8B0000">${fora}</div>
          ${installBadge}
        </div>
        ${sectionsHtml}
      </div>
    </div>`;
  };
  let pages = '';
  for (let i=0; i<orders.length; i+=2) {
    const top = orderBlock(orders[i]);
    const bottom = orders[i+1] ? orderBlock(orders[i+1]) : '<div class="ord empty"></div>';
    pages += `<table class="page"><tbody>
      <tr><td class="slot">${top}</td></tr>
      <tr><td class="cut">✂ — — — — — — — — — — — — — — — — — — — — — — — — — — — —</td></tr>
      <tr><td class="slot">${bottom}</td></tr>
    </tbody></table>`;
  }
  return `<html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 8mm; }
    html, body { margin:0; padding:0; height:100%; }
    body { font-family: Arial, sans-serif; color:#000; }
    table.page { width:100%; height:100vh; border-collapse:collapse; page-break-after:always; }
    table.page td { padding:0; }
    table.page td.slot { height:50%; vertical-align:top; }
    table.page td.cut { height:8mm; vertical-align:middle; text-align:center; color:#999; font-size:18px; letter-spacing:1px; white-space:nowrap; }
    .ord { width:100%; height:100%; box-sizing:border-box; padding:3mm 5mm 3mm 2mm; border:2px solid #1a1a1a; border-radius:8px; display:flex; overflow:hidden; }
    .ord.empty { border-style:dashed; border-color:#bbb; }
    .ordno { width: 22mm; margin-right:4mm; display:flex; align-items:center; justify-content:center;
             font-size:80px; font-weight:900; color:#1a1a1a; letter-spacing:2px;
             writing-mode: vertical-rl; transform: rotate(180deg); white-space:nowrap; }
    .ordbody { flex:1; min-width:0; }
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  </style></head><body>${pages}</body></html>`;
};

const recomputeCoatingDetails = (form) => {
  const coatings = (form.coatings||[]).filter(n=>n&&String(n).trim());
  if (coatings.length === 0) return form.coatingDetails || {};
  const cd = {...(form.coatingDetails||{})};
  coatings.forEach(name=>{
    const type = getCoatingType(name);
    if (type==='OTHER') return;
    const d = {...(cd[name]||{})};
    if (!d.dimUser) {
      const newDim = computeCoatingDim(form.h, form.w, type, !!d.pihaki);
      if (newDim) d.dim = newDim;
    }
    if (!d.frameW) {
      d.frameW = type==='EXO' ? '9,5 cm' : '6 cm';
    }
    cd[name] = d;
  });
  return cd;
};

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

// ── SplitModal — σπάσιμο παραγγελίας σε τεμάχια ──
function SplitModal({ visible, totalQty, onConfirm, onCancel }) {
  const [qty, setQty] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24, width:'85%', maxWidth:380 }}>
          <Text style={{ fontSize:17, fontWeight:'bold', color:'#6a1b9a', marginBottom:8, textAlign:'center' }}>✂️ ΣΠΑΣΙΜΟ ΠΑΡΑΓΓΕΛΙΑΣ</Text>
          <Text style={{ fontSize:14, color:'#444', marginBottom:6, textAlign:'center' }}>Πόσα τεμάχια να ξεχωρίσω σε νέα παραγγελία;</Text>
          <Text style={{ fontSize:13, color:'#888', marginBottom:12, textAlign:'center' }}>Σύνολο: {totalQty} τεμ.</Text>
          <TextInput style={{ borderWidth:1, borderColor:'#ccc', borderRadius:10, padding:12, fontSize:16, textAlign:'center', marginBottom:16 }} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder={`π.χ. 1 έως ${totalQty-1}`} autoFocus />
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity style={{ flex:1, backgroundColor:'#f5f5f5', padding:14, borderRadius:10, alignItems:'center', borderWidth:1, borderColor:'#ddd' }} onPress={()=>{ setQty(''); onCancel(); }}>
              <Text style={{ color:'#555', fontWeight:'bold' }}>ΑΚΥΡΟ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex:1, backgroundColor:'#6a1b9a', padding:14, borderRadius:10, alignItems:'center' }} onPress={()=>{
              const n = parseInt(qty);
              if (!n || n<1 || n>=totalQty) return Alert.alert('Σφάλμα', `Βάλτε αριθμό 1 έως ${totalQty-1}`);
              setQty(''); onConfirm(n);
            }}>
              <Text style={{ color:'white', fontWeight:'bold' }}>ΣΠΑΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Ένδειξη «νούμερο διαίρεσης» δίπλα στον αριθμό παραγγελίας (μόνο σε σπασμένα κομμάτια).
const noTag = (o) => (o && o.splitTag != null && String(o.splitTag).trim() !== '') ? ` (${o.splitTag})` : '';

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

// Helper: επένδυση τύπου laminate/pvc (δεν μπλοκάρει το μοντάρισμα ακόμα κι αν εκκρεμεί)
const isLaminateOrPvc = (name) => { const n = String(name||'').toUpperCase(); if (n.includes('ΔΙΚΟ ΤΟΥ') || n.includes('ΔΙΚΑ ΤΟΥ')) return false; return n.includes('LAMINATE') || n.includes('PVC'); };
// Helper: παραγγελία έτοιμη προς μοντάρισμα (προηγούμενες φάσεις done· επένδυση: laminate/pvc δεν μετράει, οι υπόλοιπες πρέπει να είναι done)
const isReadyForMont = (o) => {
  if (!o || o.installation !== 'ΝΑΙ') return false;
  const m = o.phases?.montDoor;
  if (!m?.active || m.done) return false;
  if (!['laser','cases','montSasi','vafio'].every(k => !o.phases?.[k]?.active || o.phases?.[k]?.done)) return false;
  const coats = (o.coatings||[]).filter(c => c && String(c).trim());
  if (coats.length === 0 || o.phases?.epend?.done) return true;
  return coats.every((c, i) => isLaminateOrPvc(c) || !!(o.coatingChecks && o.coatingChecks[String(i)]));
};

const isReadyForEpend = (o) => {
  if (!o) return false;
  const e = o.phases?.epend; if (!e?.active || e.done) return false;
  if (!['laser','cases','montSasi','vafio'].every(k => !o.phases?.[k]?.active || o.phases?.[k]?.done)) return false;
  const coats = (o.coatings||[]).filter(c => c && String(c).trim());
  if (!coats.some(isLaminateOrPvc)) return false;
  return coats.every((c, i) => isLaminateOrPvc(c) || !!(o.coatingChecks && o.coatingChecks[String(i)]));
};

// Helpers για ανοιγόμενο τζάμι (ίδια λογική με σταθερό αλλά ξεχωριστή διαδικασία)
const hasGlass = (o) => !!(o && o.glassDim && String(o.glassDim).trim());
const isGlassPending = (o) => hasGlass(o) && !o.glassDone;
const hasXiasti = (s) => String(s||'').toLowerCase().includes('χιαστ');
// Σχέδια σταθερού/τζαμιού (επεκτείνεται). Η επιλογή μπαίνει δίπλα στη διάσταση (βάση χρέωσης).
const STAV_DESIGNS = ['ΧΙΑΣΤΗ'];
const stavCycle = (d, list=STAV_DESIGNS) => { const opts=['',...((list&&list.length)?list:STAV_DESIGNS)]; return opts[(opts.indexOf(d||'')+1)%opts.length]; };
const stavParts = (s) => String(s?.dim||'') + (s?.design ? ' ' + s.design : '');
const staveraKind = (o, s) => `ΣΤΑΘΕΡΟ${(hasXiasti(s&&s.design)||hasXiasti(s&&s.note)||hasXiasti(o.notes))?' ΧΙΑΣΤΗ':''}`;
const plaisioKind = (o) => `ΠΛΑΙΣΙΟ${(hasXiasti(o.glassDesign)||hasXiasti(o.glassNotes)||hasXiasti(o.notes))?' ΧΙΑΣΤΙ':''}`;

// Helpers ειδοποίησης πελάτη (Viber / Email / SMS)
const normalizePhone = (p) => {
  const d = String(p||'').replace(/\D/g,'');
  if (!d) return '';
  return d.startsWith('30') ? d : '30' + d.replace(/^0+/,'');
};
const buildOrderMessage = (o) => {
  const isStd = o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ';
  const coats = (o.coatings||[]).filter(c=>c&&String(c).trim()).join(', ');
  const stav = (o.stavera||[]).filter(s=>s&&s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(', ');
  const tzami = (o.glassDim||'')+(o.glassDesign?' '+o.glassDesign:'')+(o.glassNotes?' '+o.glassNotes:'');
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
    o.docCount > 0 ? 'Έχει επισυναφθεί το έγγραφο της παραγγελίας σας για επαλήθευση.' : null,
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
const COMPANY_SIGNATURE = [
  'Με εκτίμηση,',
  '',
  'VAICON — Πόρτες Ασφαλείας · Πόρτες Εσωτερικές Laminate',
  'Διεύθυνση εργοστασίου: Λούβαρη 11, Περιστέρι, Αθήνα',
  'Τηλ.: 210 5774975 · 210 5774976 · 210 5752259',
  'Viber: 6944 002082',
  'Email: info@vairaktarakis.gr',
  'Web: www.vaicon.gr · www.vairaktarakis.gr',
  'Ωράριο: Δευτ-Παρ 08:00-16:00',
].join('\n');
const buildOrderEmail = (o) => {
  const isStd = o.orderType === 'ΤΥΠΟΠΟΙΗΜΕΝΗ';
  const coats = (o.coatings||[]).filter(c=>c&&String(c).trim()).join(', ');
  const stav = (o.stavera||[]).filter(s=>s&&s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(', ');
  const tzami = (o.glassDim||'')+(o.glassDesign?' '+o.glassDesign:'')+(o.glassNotes?' '+o.glassNotes:'');
  return [
    'Αγαπητοί συνεργάτες,',
    '',
    'Σας ευχαριστούμε για την παραγγελία σας. Ακολουθούν αναλυτικά τα στοιχεία της, όπως καταχωρήθηκαν:',
    '',
    `Αρ. παραγγελίας: ${o.orderNo||'-'}`,
    `Διαστάσεις: ${o.h||''} x ${o.w||''}`,
    `Πλευρά: ${o.side||''}`,
    `Θωράκιση: ${o.armor||'ΜΟΝΗ'}`,
    !isStd ? `Κάσα: ${o.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | ${o.caseMaterial||'DKP'} | Μεντεσέδες: ${o.hinges||'2'}` : null,
    `Κλειδαριά: ${o.lock||'—'}`,
    coats ? `Επενδύσεις: ${coats}` : null,
    stav ? `Σταθερό: ${stav}` : null,
    tzami ? `Τζάμι: ${tzami}` : null,
    o.notes ? `Σημειώσεις: ${o.notes}` : null,
    '',
    o.docCount > 0 ? 'Έχει επισυναφθεί το έγγραφο της παραγγελίας σας για επαλήθευση.' : null,
    'Παρακαλούμε ελέγξτε προσεκτικά τα παραπάνω στοιχεία. Μετά την έναρξη της παραγωγής δεν είναι δυνατές αλλαγές και η εταιρεία δεν φέρει ευθύνη για τυχόν διαφορές.',
    '',
    COMPANY_SIGNATURE,
  ].filter(v => v !== null).join('\n');
};
const buildReadyEmail = (o) => [
  'Αγαπητοί συνεργάτες,',
  '',
  `Σας ενημερώνουμε ότι η παραγγελία σας Νο ${o.orderNo||'-'} είναι έτοιμη προς παραλαβή.`,
  'Ώρες παραλαβής: εργάσιμες 08:00-16:00.',
  '',
  COMPANY_SIGNATURE,
].join('\n');
const emailMessageFor = (o) => o?.status === 'READY' ? buildReadyEmail(o) : buildOrderEmail(o);
const messageFor = (o) => o?.status === 'READY' ? buildReadyMessage(o) : buildOrderMessage(o);
const smsMessageFor = (o) => o?.status === 'READY' ? buildReadyMessage(o) : buildSmsOrderMessage(o);
const openEmail = (email, msg, orderNo) => {
  if (!email) return;
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = `mailto:${email}?subject=${encodeURIComponent('Παραγγελία πόρτας ασφαλείας Νο '+(orderNo||''))}&body=${encodeURIComponent(msg)}`;
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
const escapeHtmlSafe = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notesHtmlWithExtras = (o, opts = {}) => {
  const parts = [];
  const base = formatNotesHtml(o?.notes);
  if (base) parts.push(base);
  if (opts.galvanize && o?.caseMaterial === 'ΓΑΛΒΑΝΙΖΕ') {
    parts.push('<span style="font-weight:bold">Υλικό:</span> ΓΑΛΒΑΝΙΖΕ');
  }
  const paint = String(o?.casePaint||'').trim();
  if (paint) parts.push(`<span style="font-weight:bold">Βαφή:</span> ${escapeHtmlSafe(paint)}`);
  return parts.join('<br>');
};

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

export default function SpecialScreen({ specialOrders=[], setSpecialOrders, soldSpecialOrders=[], setSoldSpecialOrders, specialQuotes=[], setSpecialQuotes=()=>{}, customers=[], onRequestAddCustomer, coatings=[], locks=[], misc=[], cylinders=[], readOnly=false, isForeman=false, codeModalOpen=false, isAdmin=false, currentUserName='', resolveName=(u)=>u, isSeller=false, sellerKey=null, sellers=[], onOpenSubmissions=()=>{}, editSubmission=null, onEditSubmissionDone=()=>{} }) {
  const [filterSellerKey, setFilterSellerKey] = useState('');
  const [filterSellerOpen, setFilterSellerOpen] = useState(false);
  const lockKey = (u) => String(u || '').toUpperCase().replace(/\s+/g, '');
  // Πωλητής: βλέπει μόνο τις παραγγελίες των δικών του πελατών. Το προσωπικό μπορεί να φιλτράρει ανά πωλητή.
  const effSellerKey = isSeller ? sellerKey : (filterSellerKey || null);
  const sellerOwnsOrder = (o) => {
    if (!effSellerKey) return true;
    const c = o.customerId ? customers.find(x => x.id === o.customerId) : customers.find(x => String(x.name) === String(o.customer));
    return (c?.seller || '') === effSellerKey;
  };
  const pickCustomers = isSeller ? (customers||[]).filter(c => (c.seller||'') === sellerKey) : (customers||[]);
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
    const s = o.status;
    if (s === 'SOLD'  || s === 'STD_SOLD')  return { label: 'ΑΡΧΕΙΟ',        color: '#555'    };
    if (s === 'READY' || s === 'STD_READY') return { label: 'ΕΤΟΙΜΑ',        color: '#00C851' };
    if (s === 'PROD')                       return { label: 'ΠΑΡΑΓΩΓΗ',      color: '#2e7d32' };
    if (s === 'STD_BUILD')                  return { label: 'ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ', color: '#2e7d32' };
    if (s === 'PENDING' || s === 'STD_PENDING' || !s) return { label: 'ΚΑΤΑΧΩΡΗΜΕΝΕΣ', color: '#ff4444' };
    return { label: s, color: '#999' };
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
            <div class="kv" style="min-width:220px;"><b>Βαφή Κάσας</b><span>${o.casePaint||'—'}</span></div>
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
  const [showMiscPicker, setShowMiscPicker] = useState(false);
  const [showStavColPicker, setShowStavColPicker] = useState(false);
  const [showCoatingsPicker, setShowCoatingsPicker] = useState(false);
  const [pickerEditMode, setPickerEditMode] = useState(false);
  const [lockEditText, setLockEditText] = useState('');
  const [cylEditText, setCylEditText] = useState('');
  const [lockAnchor, setLockAnchor] = useState(null);
  const lockBtnRef = useRef(null);
  const [pickerAnchor, setPickerAnchor] = useState(null);
  const hardwareBtnRef = useRef(null), coatingsBtnRef = useRef(null), miscBtnRef = useRef(null), stavColBtnRef = useRef(null);
  const editHardwareBtnRef = useRef(null), editCoatingsBtnRef = useRef(null);
  const measureAnchor = (ref)=>{ ref.current&&ref.current.measureInWindow&&ref.current.measureInWindow((x,y,w,h)=>setPickerAnchor({x,y,w,h})); };
  const popupPos = (W, footer=60)=>{ const winH=Dimensions.get('window').height;
    const left=pickerAnchor?Math.max(6,Math.min(pickerAnchor.x,SCREEN_WIDTH-W-6)):6;
    const top=pickerAnchor?Math.max(6,pickerAnchor.y):80;
    return { left, top, maxH:Math.max(120, winH-top-footer) }; };
  const [dupModal, setDupModal] = useState({ visible:false, base:'', suggested:'', onUse:null, onKeep:null, onCancel:null });
  const [confirmModal, setConfirmModal] = useState({ visible:false, title:'', message:'', confirmText:'', onConfirm:null });
  const [splitModal, setSplitModal] = useState({ visible:false, order:null });
  const [archiveDeleteModal, setArchiveDeleteModal] = useState({ visible:false, orderId:null, pwd:'', error:false });
  const [smsToast, setSmsToast] = useState({ visible:false, text:'', kind:'ok' });
  const [peepholeWarn, setPeepholeWarn] = useState({ visible:false, coatings:[], onContinue:null, onAddNote:null });
  const showSmsToast = (text, kind='ok') => {
    setSmsToast({ visible:true, text, kind });
    setTimeout(()=>setSmsToast(t => t.text===text ? { visible:false, text:'', kind:'ok' } : t), 4500);
  };
  const [archiveReturnModal, setArchiveReturnModal] = useState({ visible:false, orderId:null });
  const [editModal, setEditModal] = useState({ visible:false, order:null });
  const [priceModal, setPriceModal] = useState({ visible:false, order:null });
  const [notifyModal, setNotifyModal] = useState({ visible:false, order:null });
  const [editForm, setEditForm] = useState({});
  const [coatDetailsModal, setCoatDetailsModal] = useState({ visible:false, order:null });
  const [dimChangeModal, setDimChangeModal] = useState({ visible:false, oldH:'', oldW:'', newH:'', newW:'', rows:[], onConfirm:null });
  const editGlassRef = useRef();
  const editGlassNotesRef = useRef();
  const editStaveraRefs = useRef({});
  const editStaveraNoteRefs = useRef({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeProdPhase, setActiveProdPhase] = useState('laser');
  const [customHardwareText, setCustomHardwareText] = useState('');
  const [showCustomHardwareInput, setShowCustomHardwareInput] = useState(false);
  const [customForm, setCustomForm] = useState(INIT_FORM);
  const [designOpts, setDesignOpts] = useState(STAV_DESIGNS);
  useEffect(() => { (async () => { try { const cat = await (await fetch(`${FIREBASE_URL}/price_catalog.json`)).json(); const names = Object.values(cat||{}).filter(e=>e&&e.ruleKind==='design'&&String(e.name||'').trim()).map(e=>e.name.trim()); if (names.length) setDesignOpts([...new Set(names)]); } catch {} })(); }, []);
  const [editingOrder, setEditingOrder] = useState(null); // η πόρτα που επεξεργαζόμαστε
  const [orderNoAuto, setOrderNoAuto] = useState(true); // true = το Ν/Π είναι αυτόματη πρόταση
  const [groupState, setGroupState] = useState(null); // ομάδα πορτών ίδιου πελάτη: { base, count, groupId } ή null
  const [quoteGroup, setQuoteGroup] = useState(null); // ομάδα πορτών προσφοράς: { count, groupId } ή null
  const [editingQuote, setEditingQuote] = useState(null); // προσφορά υπό επεξεργασία
  const formSubIdRef = useRef(null); // σταθερό id για έγγραφα φόρμας (υποβολή πωλητή)
  const [crossOrderNos, setCrossOrderNos] = useState([]); // αριθμοί τυποποιημένων (κοινή αρίθμηση)
  const [orderSeq, setOrderSeq] = useState({}); // μητρώο εκδοθέντων αριθμών (order_seq)
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [pendingSearch, setPendingSearch] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [readySearch, setReadySearch] = useState('');
  const [quoteSearch, setQuoteSearch] = useState('');
  const [archivePage, setArchivePage] = useState(0);
  const [archiveView, setArchiveView] = useState('calendar');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveMonth, setArchiveMonth] = useState(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); });
  const [archiveFrom, setArchiveFrom] = useState(null);
  const [archiveTo, setArchiveTo] = useState(null);
  const [readyMonth, setReadyMonth] = useState(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); });
  const [readyFrom, setReadyFrom] = useState(null);
  const [readyTo, setReadyTo] = useState(null);
  const [calPos, setCalPos] = useState({ x: 0, y: 0 });
  const calDragStart = useRef({ mx:0, my:0, px:0, py:0 });
  const calDragging = useRef(false);

  const [printSelected, setPrintSelected] = useState({});
  const [montReadyFilter, setMontReadyFilter] = useState(false);
  const [epRdyFilter, setEpRdyFilter] = useState(false);
  const [printPreview, setPrintPreview] = useState({ visible:false, phaseKey:null, orders:[], copies:1 });
  const [pendingChanges, setPendingChanges] = useState([]); // καλάθι αλλαγών done/undone
  const [lastChangedIds, setLastChangedIds] = useState([]); // τελευταία παρτίδα αλλαγών
  const [prodBatch, setProdBatch] = useState([]); // καλάθι παραγγελιών για ΕΝΑΡΞΗ ΠΑΡΑΓΩΓΗΣ
  const [programModal, setProgramModal] = useState({ visible: false, programNo: '' }); // modal αριθμού προγράμματος
  const [printProgramModal, setPrintProgramModal] = useState({ visible: false, programs: [], selected: null, phaseKey: null, readyOnly: false }); // modal επιλογής programNo για εκτύπωση ΠΡΟΓΡΑΜΜΑ / φάσεων
  const [docQR, setDocQR] = useState({ visible:false, orderId:null, token:null, mode:'add', photoId:null, url:'', initial:null, status:'waiting' }); // QR ανεβάσματος εγγράφου
  const [docViewer, setDocViewer] = useState({ visible:false, orderId:null, orderNo:'', photos:[], idx:0, loading:false, zoom:1, rot:0 }); // προβολή εγγράφων πελάτη
  const panPosition = useRef({ x: 0, y: 0 });
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const [dayModal, setDayModal] = useState({ visible:false, ts:null, mode:null, phaseKey:null }); // mode: 'pending' | 'prod'

  // === Customer Lookup (🔍 ΠΕΛΑΤΕΣ) panel state ===
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [customerLookupSearch, setCustomerLookupSearch] = useState('');
  const [lookupCustomerId, setLookupCustomerId] = useState(null);
  const [lookupCustInfo, setLookupCustInfo] = useState(false);
  const [lookupOrderModal, setLookupOrderModal] = useState({ visible: false, order: null });
  const [custPanPos, setCustPanPos] = useState({ x: 0, y: 0 });
  const custIsDragging = useRef(false);
  const custDragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const [lookupStdOrders, setLookupStdOrders] = useState([]);
  const [lookupStdQuotes, setLookupStdQuotes] = useState([]);
  useEffect(() => {
    if (!showCustomerLookup || lookupStdOrders.length) return;
    (async () => {
      try {
        const [od, qd] = await Promise.all([
          fetch(`${FIREBASE_URL}/std_orders.json`).then(r=>r.json()),
          fetch(`${FIREBASE_URL}/std_quotes.json`).then(r=>r.json()),
        ]);
        if (od) setLookupStdOrders(Object.entries(od).map(([id,v])=>({ id: v?.id||id, ...v })));
        if (qd) setLookupStdQuotes(Object.entries(qd).map(([id,v])=>({ id: v?.id||id, ...v })));
      } catch {}
    })();
  }, [showCustomerLookup]);

  const [docWinPos, setDocWinPos] = useState({ x: 0, y: 0 });
  const [docWinSize, setDocWinSize] = useState({ w: 700, h: 660 });
  const [docImgPos, setDocImgPos] = useState({ x: 0, y: 0 });
  const docDragRef = useRef(null);
  const docDragStart = useRef({ mx: 0, my: 0, a: 0, b: 0 });
  const startDocDrag = (kind) => (e) => {
    if (Platform.OS !== 'web') return;
    if (e.stopPropagation) e.stopPropagation();
    docDragRef.current = kind;
    const mx = e.clientX || e.touches?.[0]?.clientX || 0;
    const my = e.clientY || e.touches?.[0]?.clientY || 0;
    const base = kind === 'resize' ? docWinSize : kind === 'move' ? docWinPos : docImgPos;
    docDragStart.current = { mx, my, a: kind === 'resize' ? base.w : base.x, b: kind === 'resize' ? base.h : base.y };
    const onMove = (ev) => {
      if (docDragRef.current !== kind) return;
      const cx = ev.clientX || ev.touches?.[0]?.clientX || 0;
      const cy = ev.clientY || ev.touches?.[0]?.clientY || 0;
      const dx = cx - docDragStart.current.mx, dy = cy - docDragStart.current.my;
      if (kind === 'move') setDocWinPos({ x: docDragStart.current.a + dx, y: docDragStart.current.b + dy });
      else if (kind === 'resize') setDocWinSize({ w: Math.max(380, docDragStart.current.a + dx), h: Math.max(380, docDragStart.current.b + dy) });
      else setDocImgPos({ x: docDragStart.current.a + dx, y: docDragStart.current.b + dy });
    };
    const onUp = () => {
      docDragRef.current = null;
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove); window.addEventListener('touchend', onUp);
  };

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

  // Σύρσιμο πλωτού ημερολογίου ΕΤΟΙΜΩΝ (ανεξάρτητο από το panPos)
  const handleCalDragStart = (e) => {
    calDragging.current = true;
    calDragStart.current = { mx: e.clientX || e.touches?.[0]?.clientX || 0, my: e.clientY || e.touches?.[0]?.clientY || 0, px: calPos.x, py: calPos.y };
    const onMove = (ev) => {
      if (!calDragging.current) return;
      const cx = ev.clientX || ev.touches?.[0]?.clientX || 0;
      const cy = ev.clientY || ev.touches?.[0]?.clientY || 0;
      setCalPos({ x: calDragStart.current.px + (cx - calDragStart.current.mx), y: calDragStart.current.py + (cy - calDragStart.current.my) });
    };
    const onUp = () => {
      calDragging.current = false;
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove); window.addEventListener('touchend', onUp);
  };

  // ── Δεδομένα ημερολογίων (τεμάχια = άθροισμα qty) ──
  const pieceQty = (o) => parseInt(o.qty) || 1;
  const phaseDoneAt = (o, k) => o.phases?.[k]?.doneAt || o.dipliPhases?.[k]?.doneAt || null;
  const calData = (orders, getTs) => orders.filter(sellerOwnsOrder).map(o => ({ ts: getTs(o), qty: pieceQty(o) })).filter(x => x.ts);
  const sameDay = (ts, dayTs) => { const a = new Date(ts), b = new Date(dayTs); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };

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


  const syncToCloud = async (o) => { try { const r = await fetch(`${FIREBASE_URL}/special_orders/${o.id}.json`,{method:'PUT',body:JSON.stringify(o)}); return r.ok; } catch { return false; } };
  const deleteFromCloud = async (id) => { try { await fetch(`${FIREBASE_URL}/special_orders/${id}.json`,{method:'DELETE'}); await fetch(`${FIREBASE_URL}/order_files/${id}.json`,{method:'DELETE'}); } catch(e){} };

  // ---------- Έγγραφα πελάτη (φωτό μέσω κινητού με QR) ----------
  const randToken = () => { const a = new Uint8Array(18); ((typeof globalThis!=='undefined'&&globalThis.crypto)||window.crypto).getRandomValues(a); return Array.from(a, b=>b.toString(16).padStart(2,'0')).join(''); };
  const setDocCountLocal = (orderId, count) => {
    setSpecialOrders(prev=>prev.map(o=>o.id===orderId?{...o, docCount:count}:o));
    setSoldSpecialOrders(prev=>prev.map(o=>o.id===orderId?{...o, docCount:count}:o));
    setSpecialQuotes(prev=>prev.map(o=>o.id===orderId?{...o, docCount:count}:o));
  };
  const ensureSellerSubId = () => {
    const existing = editingOrder?._submissionId || formSubIdRef.current;
    if (existing) { formSubIdRef.current = existing; return existing; }
    const id = Date.now().toString();
    formSubIdRef.current = id;
    return id;
  };
  const countDocs = async (id) => { try { const d = await (await fetch(`${FIREBASE_URL}/order_files/${id}.json`)).json(); return d ? Object.keys(d).length : 0; } catch { return 0; } };
  const loadOrderFiles = async (orderId) => {
    const data = await (await fetch(`${FIREBASE_URL}/order_files/${orderId}.json`)).json();
    return data ? Object.keys(data).map(k=>({ id:k, ...data[k] })).sort((a,b)=>(a.ts||0)-(b.ts||0)) : [];
  };
  const moveOrderFiles = async (oldId, newId) => {
    if (!oldId || !newId || oldId===newId) return 0;
    try {
      const data = await (await fetch(`${FIREBASE_URL}/order_files/${oldId}.json`)).json();
      if (!data) return 0;
      await fetch(`${FIREBASE_URL}/order_files/${newId}.json`,{method:'PUT',body:JSON.stringify(data)});
      await fetch(`${FIREBASE_URL}/order_files/${oldId}.json`,{method:'DELETE'});
      return Object.keys(data).length;
    } catch { return 0; }
  };
  const openDocQR = async (order, mode='add', photoId=null) => {
    if (Platform.OS!=='web' || typeof window==='undefined') { Alert.alert('Έγγραφο πελάτη','Διαθέσιμο μόνο από υπολογιστή.'); return; }
    const token = randToken();
    const node = order._sellerSub ? 'seller_submissions' : order.isQuote ? 'special_quotes' : null;
    const payload = { orderId:order.id, mode, exp:Date.now()+5*60*1000, by:currentUserName||'', ...(node ? {node} : {}) };
    if (mode==='replace' && photoId) payload.photoId = photoId;
    try { const r = await fetch(`${FIREBASE_URL}/upload_tokens/${token}.json`,{method:'PUT',body:JSON.stringify(payload)}); if(!r.ok) throw new Error(); }
    catch { Alert.alert('Σφάλμα','Αποτυχία δημιουργίας συνδέσμου.'); return; }
    let initial=null; try { initial = await (await fetch(`${FIREBASE_URL}/order_files/${order.id}.json`)).text(); } catch {}
    setDocQR({ visible:true, orderId:order.id, token, mode, photoId, url:`${window.location.origin}/.netlify/functions/upload-doc?t=${token}`, initial, status:'waiting' });
  };
  const openDocViewer = async (order) => {
    setDocWinPos({ x:0, y:0 }); setDocImgPos({ x:0, y:0 });
    setDocViewer({ visible:true, orderId:order.id, orderNo:order.orderNo||'', photos:[], idx:0, loading:true, zoom:1, rot:0 });
    try { const photos = await loadOrderFiles(order.id); setDocViewer(v=>({...v, photos, idx:0, loading:false })); }
    catch { setDocViewer(v=>({...v, loading:false })); }
  };
  const refreshDocViewer = async (orderId) => {
    try { const photos = await loadOrderFiles(orderId); setDocViewer(v=>v.visible&&v.orderId===orderId?{...v, photos, idx:Math.max(0,Math.min(v.idx, photos.length-1)) }:v); } catch {}
  };
  const deleteDocPhoto = (orderId, photoId) => {
    const doDel = async () => {
      try {
        await fetch(`${FIREBASE_URL}/order_files/${orderId}/${photoId}.json`,{method:'DELETE'});
        const photos = await loadOrderFiles(orderId);
        const node = specialQuotes.some(q=>q.id===orderId) ? 'special_quotes' : 'special_orders';
        await fetch(`${FIREBASE_URL}/${node}/${orderId}.json`,{method:'PATCH',body:JSON.stringify({docCount:photos.length})});
        setDocCountLocal(orderId, photos.length);
        setDocViewer(v=>({...v, photos, idx:Math.max(0,Math.min(v.idx, photos.length-1)) }));
      } catch {}
    };
    if (Platform.OS==='web') { if (window.confirm('Διαγραφή αυτού του εγγράφου;')) doDel(); }
    else Alert.alert('Διαγραφή','Διαγραφή εγγράφου;',[{text:'Όχι'},{text:'Ναι',style:'destructive',onPress:doDel}]);
  };
  const printDocPhotos = (photos, title, rot=0) => {
    if (!photos.length) return;
    const r = ((rot % 360) + 360) % 360;
    const imgStyle = (r===90||r===270) ? `transform:rotate(${r}deg);max-width:90vh;max-height:90vw;` : `transform:rotate(${r}deg);max-width:100%;max-height:96vh;`;
    const imgs = photos.map(p=>`<div style="height:100vh;display:flex;align-items:center;justify-content:center;page-break-after:always;"><img src="${p.img}" style="${imgStyle}display:block;"></div>`).join('');
    printHTML(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:0;">${imgs}</body></html>`, title);
  };
  useEffect(() => {
    if (!docQR.visible || !docQR.orderId || docQR.status==='done') return;
    let alive = true;
    const iv = setInterval(async () => {
      try {
        const txt = await (await fetch(`${FIREBASE_URL}/order_files/${docQR.orderId}.json`)).text();
        if (alive && txt !== docQR.initial) {
          const photos = await loadOrderFiles(docQR.orderId);
          setDocCountLocal(docQR.orderId, photos.length);
          if (docQR.orderId === formSubIdRef.current) setCustomForm(f=>({...f, docCount: photos.length}));
          setDocQR(d=>d.visible?{...d, status:'done'}:d);
          refreshDocViewer(docQR.orderId);
        }
      } catch {}
    }, 3000);
    return () => { alive=false; clearInterval(iv); };
  }, [docQR.visible, docQR.orderId, docQR.initial, docQR.status]);

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
  const notifyEmail = (o) => { const c = findCustomerOf(o); if (!c?.email) return; openEmail(c.email, emailMessageFor(o), o.orderNo); markNotified(o.id, 'email'); };
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

  const resetForm = () => { setCustomForm(INIT_FORM); setCustomerSearch(''); setSelectedCustomer(null); setShowCustomerList(false); setEditingOrder(null); setOrderNoAuto(true); setGroupState(null); setQuoteGroup(null); setEditingQuote(null); formSubIdRef.current = null; };

  // Πωλητής: «Διόρθωση» απορριφθείσας υποβολής → πρόγεμιση φόρμας.
  useEffect(() => {
    if (!editSubmission) return;
    const { _sid, status, submittedAt, submittedBy, rejectNote, rejectedBy, rejectedAt, ...data } = editSubmission;
    setCustomForm({ ...INIT_FORM, ...data, orderNo: '' });
    const c = data.customerId ? (customers||[]).find(x => x.id === data.customerId) : (customers||[]).find(x => x.name === data.customer);
    setSelectedCustomer(c || (data.customer ? { name: data.customer, id: data.customerId } : null));
    setCustomerSearch(data.customer || '');
    setEditingOrder({ _submissionId: _sid });
    formSubIdRef.current = _sid;
    setActiveSection('form');
    onEditSubmissionDone();
  }, [editSubmission]);

  // ── Αυτόματη αρίθμηση: παρόντες αριθμοί (ειδικές ενεργές+πωλημένες + τυποποιημένες) ──
  const allPresentNos = () => [...specialOrders.map(o=>o.orderNo), ...soldSpecialOrders.map(o=>o.orderNo), ...crossOrderNos];
  const computeAutoNo = (present = allPresentNos(), ledger = Object.keys(orderSeq)) => suggestNextOrderNo(present, ledger);

  useEffect(() => {
    (async () => {
      try {
        const [std, seq] = await Promise.all([
          fetch(`${FIREBASE_URL}/std_orders.json`).then(r=>r.json()).catch(()=>null),
          fetch(`${FIREBASE_URL}/order_seq.json`).then(r=>r.json()).catch(()=>null),
        ]);
        setCrossOrderNos(std ? Object.values(std).map(o=>o?.orderNo).filter(Boolean) : []);
        setOrderSeq(seq || {});
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (editingOrder || !orderNoAuto) return;
    const next = computeAutoNo();
    setCustomForm(f => f.orderNo === next ? f : { ...f, orderNo: next });
  }, [crossOrderNos, orderSeq, specialOrders, soldSpecialOrders, editingOrder, orderNoAuto, customForm.orderNo]);

  const isFormDirty = () => {
    if (groupState || quoteGroup || editingOrder || editingQuote) return true;
    const f = customForm || {};
    return !!(
      (f.customer && f.customer.trim()) ||
      (!orderNoAuto && f.orderNo && String(f.orderNo).trim()) ||
      (f.h && f.h.trim()) ||
      (f.w && f.w.trim()) ||
      (f.notes && f.notes.trim()) ||
      (f.programNo && String(f.programNo).trim()) ||
      (f.coatings || []).some(c => c && String(c).trim()) ||
      (f.priceList || []).length > 0 ||
      (formSubIdRef.current && (f.docCount || 0) > 0)
    );
  };
  const requestSection = (key) => {
    if (key!=='form' && activeSection==='form' && isFormDirty()) {
      const msg = '⚠️ Έχεις παραγγελία που ΔΕΝ αποθηκεύτηκε.\nΑν αλλάξεις καρτέλα θα ΧΑΘΟΥΝ τα στοιχεία.\nΣίγουρα θες να φύγεις;';
      const leave = () => { if (editingOrder) cancelForm(); else resetForm(); setActiveSection(key); };
      if (Platform.OS==='web') { if (window.confirm(msg)) leave(); return; }
      Alert.alert('Μη αποθηκευμένη παραγγελία', msg, [{text:'ΑΚΥΡΟ',style:'cancel'},{text:'ΦΥΓΕ — ΧΩΡΙΣ ΑΠΟΘΗΚΕΥΣΗ',style:'destructive',onPress:leave}]);
      return;
    }
    setActiveSection(key);
  };

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

  useEffect(() => { if (activeSection === 'archive') setArchivePage(0); }, [activeSection]);

  // Ο browser αυτοσυμπληρώνει το username στο πεδίο αναζήτησης όταν εμφανίζεται κωδικός·
  // καθάρισέ το μόλις κλείσει το modal ώστε να μη μένει κρυφό φίλτρο που αδειάζει τη λίστα.
  useEffect(() => {
    if (codeModalOpen) return;
    setProdSearch(''); setPendingSearch(''); setReadySearch(''); setCustomerLookupSearch('');
  }, [codeModalOpen]);

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


  // Αυτόματες χρεώσεις ειδικής — ίδιες για παραγγελία & προσφορά (καθρέφτης).
  const buildEidAutoLines = async (src) => {
    const cat = await (await fetch(`${FIREBASE_URL}/price_catalog.json`)).json();
    const lines = autoPriceLines(cat ? Object.values(cat) : [], 'ΕΙΔΙΚΗ', src);
    const doors = parseInt(src.qty, 10) > 0 ? parseInt(src.qty, 10) : 1;
    const pNum = (v) => parseFloat(String(v).replace(',', '.'));
    const addLink = (link, q) => { for (const it of (misc || []).filter(x => x && x.link === link)) { if (pNum(it.price) > 0 && !lines.some(l => l.label === it.name)) lines.push({ label: it.name, value: String(it.price), qty: String(q) }); } };
    const colQ = parseInt(src.stavColumn?.qty, 10) || 0, colName = src.stavColumn?.name;
    if (colName && colQ > 0 && !lines.some(l => l.label === colName)) {
      const it = (misc || []).find(x => x && x.name === colName);
      if (it && pNum(it.price) > 0) lines.push({ label: colName, value: String(it.price), qty: String(colQ * doors) });
    }
    const pihQ = (src.coatings || []).filter(c => c && String(c).trim() && getCoatingType(c) === 'MESA' && src.coatingDetails?.[c]?.pihaki).length;
    if (pihQ > 0) addLink('pihaki', pihQ * doors);
    if (src.installation === 'ΝΑΙ') addLink('montage', doors);
    if (src.caseMaterial && src.caseMaterial !== 'DKP') addLink('galva', doors);
    if (String(src.casePaint || '').trim()) {
      const paintTxt = String(src.casePaint).trim();
      for (const it of (misc || []).filter(x => x && x.link === 'casePaint')) {
        const lbl = `${it.name} — ${paintTxt}`;
        if (pNum(it.price) > 0 && !lines.some(l => l.label === lbl)) lines.push({ label: lbl, value: String(it.price), qty: String(doors) });
      }
    }
    const extraH = Math.max(0, (parseInt(src.hinges, 10) || 0) - 2);
    if (extraH > 0) addLink('hinges3', extraH * doors);
    if (src.kypri === 'ΝΑΙ') addLink('kypri', doors);
    if (src.cylinder) {
      const it = (cylinders || []).find(x => x && x.name === src.cylinder);
      if (it && pNum(it.price) > 0 && !lines.some(l => l.label === it.name)) lines.push({ label: it.name, value: String(it.price), qty: String(doors) });
    }
    for (const nm of (src.misc || [])) {
      const it = (misc || []).find(x => x && x.name === nm);
      if (it && pNum(it.price) > 0 && !lines.some(l => l.label === it.name)) lines.push({ label: it.name, value: String(it.price), qty: String(doors) });
    }
    return lines.map(l => ({ ...l, def: (l.value !== '' && l.value != null) ? String(l.value) : '' }));
  };
  const applyEidAutoPricing = async (target) => {
    target.priceList = applyAutoPriceLines(target.priceList, await buildEidAutoLines(target));
    if (target.placement === 'ΝΑΙ' && !(target.priceList || []).some(l => String(l.label || '').trim() === 'Τοποθέτηση'))
      target.priceList = [...(target.priceList || []), { label: 'Τοποθέτηση', value: '', qty: '1' }];
  };

  // Σπάσιμο παραγγελίας σε τεμάχια (ίδιο με τυποποιημένες). Η «μάνα» κρατά τον αριθμό, το κομμάτι παίρνει παύλα-σειρά + νούμερο διαίρεσης.
  const dropFreshAuto = (list) => (Array.isArray(list) ? list : []).filter(l => {
    const def = String(l?.def ?? '').trim();
    return !(def !== '' && def === String(l?.value ?? '').trim());
  });
  const splitOrder = async (order, peelQty) => {
    if (readOnly || isForeman || isSeller || !order) return;
    const totalQty = parseInt(order.qty) || 1;
    const qty = Math.max(1, Math.min(parseInt(peelQty) || 0, totalQty - 1));
    if (qty < 1 || qty >= totalQty) return;
    const base = splitBaseNo(order.orderNo);
    const nos = [...specialOrders, ...soldSpecialOrders].map(o => o.orderNo).concat(Object.keys(orderSeq));
    const newNo = groupOrderNo(base, nextGroupSuffix(base, nos));
    const gId = order.groupId || `g${base}`;
    const srcTag = parseInt(order.splitTag, 10);
    const divTag = Number.isFinite(srcTag) ? srcTag
      : [...specialOrders, ...soldSpecialOrders].filter(o => splitBaseNo(o.orderNo) === base).reduce((m, o) => { const t = parseInt(o.splitTag, 10); return Number.isFinite(t) && t > m ? t : m; }, 0) + 1;
    const clone = (v) => v ? JSON.parse(JSON.stringify(v)) : v;
    const remaining = { ...order, qty: String(totalQty - qty), groupId: gId, splitTag: divTag, priceList: clone(order.priceList), coatingDetails: clone(order.coatingDetails) };
    const newOrder = { ...order, id: `${Date.now()}_s`, orderNo: newNo, qty: String(qty), groupId: gId, splitTag: divTag, priceList: clone(order.priceList), coatingDetails: clone(order.coatingDetails), phases: clone(order.phases) };
    for (const o of [remaining, newOrder]) {
      o.priceList = dropFreshAuto(o.priceList);
      try { await applyEidAutoPricing(o); } catch {}
      o.priceTotal = priceFinalTotal(o.priceList, o.priceDiscount);
      o.priceLog = appendPriceLog(o.priceLog, o.priceTotal, (o.priceList || []).length > 0);
    }
    setSpecialOrders(prev => [newOrder, ...prev.map(o => o.id === order.id ? remaining : o)]);
    await syncToCloud(remaining);
    await syncToCloud(newOrder);
    setOrderSeq(prev => ({ ...prev, [newNo]: 1 }));
    try { await fetch(`${FIREBASE_URL}/order_seq.json`, { method: 'PATCH', body: JSON.stringify({ [newNo]: 1 }) }); } catch {}
    await logActivity('ΕΙΔΙΚΗ', 'Σπάσιμο παραγγελίας', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}`, qty: `${totalQty - qty}+${qty}` });
  };
  const handleSplitConfirm = (peelQty) => {
    const o = splitModal.order;
    setSplitModal({ visible: false, order: null });
    if (!o) return;
    const total = parseInt(o.qty) || 1;
    const peel = Math.max(1, Math.min(parseInt(peelQty) || 0, total - 1));
    setConfirmModal({ visible: true, title: '✂️ Σπάσιμο παραγγελίας', message: `Η #${o.orderNo} θα χωριστεί σε ${total - peel} + ${peel} τεμάχια.\nΝα προχωρήσω;`, confirmText: '✂️ ΣΠΑΣΙΜΟ', onConfirm: () => splitOrder(o, peel) });
  };

  const saveOrder = async (overrides = {}, groupInfo = null) => {
    if (!customForm.h||!customForm.w) { Alert.alert("Προσοχή","Βάλτε Ύψος και Πλάτος."); return false; }
    const intermediate = groupInfo && !groupInfo.final;

    // ── ΠΩΛΗΤΗΣ: υποβολή προς έγκριση (χωρίς αριθμό, ξεχωριστό καλάθι) ──
    if (isSeller) {
      if (!selectedCustomer) {
        if (Platform.OS === 'web') window.alert('Διάλεξε έναν από τους πελάτες σου από τη λίστα.');
        else Alert.alert('Επιλογή πελάτη', 'Διάλεξε έναν από τους πελάτες σου από τη λίστα.');
        return false;
      }
      const submissionId = editingOrder?._submissionId || formSubIdRef.current || Date.now().toString();
      const gId = groupInfo?.groupId || customForm.groupId;
      const gSeq = groupInfo?.groupSeq ?? customForm.groupSeq;
      const dc = await countDocs(submissionId);
      const submission = {
        ...customForm, ...overrides, orderNo: '', orderType: 'ΕΙΔΙΚΗ',
        submittedBy: sellerKey, submittedAt: Date.now(), status: 'PENDING',
        createdAt: customForm.createdAt || Date.now(),
        ...(gId ? { groupId: gId, groupSeq: gSeq } : {}),
      };
      delete submission._submissionId; delete submission._sid;
      delete submission.rejectNote; delete submission.rejectedBy; delete submission.rejectedAt;
      delete submission.isQuote; delete submission.quotedAt;
      submission.coatingDetails = pruneCoatingDetails(submission.coatings, submission.coatingDetails);
      if (dc) submission.docCount = dc; else delete submission.docCount;
      if (editingOrder?._submissionId) {
        const cur = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`).then(r=>r.json()).catch(()=>undefined);
        if (cur === undefined) { Alert.alert('Σφάλμα','Δεν έγινε έλεγχος κατάστασης. Δοκίμασε ξανά.'); return false; }
        if (cur && cur.status !== 'PENDING' && cur.status !== 'REJECTED') {
          Alert.alert('Δεν γίνεται διόρθωση','Η παραγγελία εγκρίθηκε ήδη από το γραφείο. Επικοινώνησε με το γραφείο για αλλαγές.');
          return false;
        }
      }
      try {
        const r = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`, { method:'PUT', body: JSON.stringify(submission) });
        if (!r.ok) throw new Error();
      } catch { Alert.alert('Σφάλμα','Η υποβολή δεν στάλθηκε. Δοκίμασε ξανά.'); return false; }
      if (intermediate) { formSubIdRef.current = null; return true; }
      resetForm();
      Alert.alert('✅ Υποβλήθηκε', groupInfo ? 'Όλες οι πόρτες της παραγγελίας υποβλήθηκαν για έγκριση από το γραφείο.' : 'Η παραγγελία υποβλήθηκε για έγκριση από το γραφείο.');
      return true;
    }

    // Φρέσκο διάβασμα για κοινή/μοναδική αρίθμηση (ειδικές + τυποποιημένες + μητρώο)
    const [freshSp, freshStd, freshSeq] = await Promise.all([
      fetch(`${FIREBASE_URL}/special_orders.json`).then(r=>r.json()).catch(()=>null),
      fetch(`${FIREBASE_URL}/std_orders.json`).then(r=>r.json()).catch(()=>null),
      fetch(`${FIREBASE_URL}/order_seq.json`).then(r=>r.json()).catch(()=>null),
    ]);
    const spArr = freshSp ? Object.values(freshSp) : [...specialOrders, ...soldSpecialOrders];
    const stdArr = freshStd ? Object.values(freshStd) : crossOrderNos.map(n=>({orderNo:n}));
    const crossList = [...spArr, ...stdArr].filter(o=>o && o.id!==editingOrder?.id);
    const ledgerKeys = freshSeq ? Object.keys(freshSeq) : Object.keys(orderSeq);

    let finalOrderNo = String(customForm.orderNo||'').trim();
    if (groupInfo) finalOrderNo = groupInfo.orderNo;
    else if (orderNoAuto && !editingOrder) finalOrderNo = suggestNextOrderNo(crossList.map(o=>o.orderNo), ledgerKeys);
    if (!finalOrderNo) { Alert.alert("Προσοχή","Το Νούμερο Παραγγελίας είναι υποχρεωτικό."); return false; }

    // Σε ομάδα ο αριθμός με παύλα είναι μοναδικός εκ κατασκευής → δεν ελέγχουμε διπλότυπο.
    if (!groupInfo) {
      const isDuplicate = crossList.some(o=>String(o.orderNo)===finalOrderNo);
      if (isDuplicate) {
        Alert.alert("⚠️ Διπλότυπο", `Το νούμερο ${finalOrderNo} υπάρχει ήδη.\nΑλλάξτε τον αριθμό παραγγελίας.`);
        return false;
      }
    }

    // Πωλητής: δεν δημιουργεί πελάτες — πρέπει να επιλέξει δικό του καταχωρημένο πελάτη.
    if (isSeller && !selectedCustomer) {
      if (Platform.OS === 'web') window.alert('Διάλεξε έναν από τους πελάτες σου από τη λίστα. Νέοι πελάτες καταχωρούνται μόνο από το προσωπικό.');
      else Alert.alert('Επιλογή πελάτη', 'Διάλεξε έναν από τους πελάτες σου από τη λίστα. Νέοι πελάτες καταχωρούνται μόνο από το προσωπικό.');
      return false;
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
        return false;
      }
    }
    if (editingOrder && (String(editingOrder.h||'')!==String(customForm.h||'') || String(editingOrder.w||'')!==String(customForm.w||''))) {
      const oldCD = editingOrder.coatingDetails || {};
      const newCD = customForm.coatingDetails || {};
      const rows = (customForm.coatings||[]).filter(n=>n&&String(n).trim()).map(name=>({
        name,
        oldDim: oldCD[name]?.dim || '',
        newDim: newCD[name]?.dim || '',
      })).filter(r => r.oldDim || r.newDim);
      const proceed = () => { setDimChangeModal(m=>({...m,visible:false})); doSave(); };
      setDimChangeModal({ visible:true, oldH:String(editingOrder.h||''), oldW:String(editingOrder.w||''), newH:String(customForm.h||''), newW:String(customForm.w||''), rows, onConfirm:proceed });
      return false;
    }
    return await doSave();

    async function doSave() {
      const newOrder = {...customForm, ...overrides, orderNo: finalOrderNo, orderType:'ΕΙΔΙΚΗ', id:Date.now().toString(), createdAt:Date.now(), status:'PENDING', enteredBy: customForm.enteredBy || currentUserName,
        ...(groupInfo ? { groupId: groupInfo.groupId, groupSeq: groupInfo.groupSeq } : {})};
      delete newOrder.isQuote; delete newOrder.quotedAt;
      newOrder.coatingDetails = pruneCoatingDetails(newOrder.coatings, newOrder.coatingDetails);
      if (!editingOrder) { try { await applyEidAutoPricing(newOrder); } catch {} }
      newOrder.priceTotal = priceFinalTotal(newOrder.priceList, newOrder.priceDiscount);
      newOrder.priceLog = appendPriceLog(newOrder.priceLog, newOrder.priceTotal, (newOrder.priceList||[]).length>0);
      const ok = await syncToCloud(newOrder);
      if (!ok) {
        const msg = `⚠️ Η παραγγελία ${newOrder.orderNo} ΔΕΝ αποθηκεύτηκε στη βάση.\nΈλεγξε τη σύνδεση και πάτησε ξανά Αποθήκευση.\n(Τα στοιχεία παραμένουν στη φόρμα.)`;
        if (Platform.OS==='web') window.alert(msg); else Alert.alert('ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ', msg);
        return false;
      }
      if (editingOrder && editingOrder.id !== newOrder.id) {
        const cnt = await moveOrderFiles(editingOrder.id, newOrder.id);
        if (cnt > 0) { await fetch(`${FIREBASE_URL}/special_orders/${newOrder.id}.json`,{method:'PATCH',body:JSON.stringify({docCount:cnt})}); newOrder.docCount = cnt; }
      }
      setSpecialOrders([newOrder,...specialOrders]);
      if (!editingOrder) {
        const seqKey = groupInfo ? groupInfo.base : finalOrderNo;
        setOrderSeq(prev => ({ ...prev, [seqKey]: 1 }));
        try { await fetch(`${FIREBASE_URL}/order_seq.json`, { method:'PATCH', body: JSON.stringify({ [seqKey]: 1 }) }); } catch {}
      }
      await logActivity('ΕΙΔΙΚΗ', 'Νέα παραγγελία', { orderNo: newOrder.orderNo, customer: newOrder.customer, size: `${newOrder.h}x${newOrder.w}`, qty: newOrder.qty });
      if (intermediate) return true; // ενδιάμεση πόρτα ομάδας — ο caller καθαρίζει κρατώντας τον πελάτη
      resetForm();
      setNotifyModal({ visible:true, order:newOrder });
      return true;
    }
  };

  // ── Ομάδα πορτών: «Προσθήκη νέας πόρτας» (αποθηκεύει & ετοιμάζει την επόμενη) ──
  const addAnotherDoor = async (overrides = {}) => {
    const form = { ...customForm, ...overrides };
    if (!form.h || !form.w) return Alert.alert('Προσοχή', 'Βάλτε Ύψος και Πλάτος.');
    let gs = groupState;
    if (!gs) {
      const base = isSeller ? '' : String(form.orderNo || '').trim();
      if (!isSeller && !base) return Alert.alert('Προσοχή', 'Το Νούμερο Παραγγελίας είναι υποχρεωτικό.');
      gs = { base, count: 0, groupId: `g${Date.now()}` };
      setOrderNoAuto(false);
    }
    const seq = gs.count + 1;
    const orderNo = isSeller ? '' : groupOrderNo(gs.base, seq);
    const ok = await saveOrder(overrides, { orderNo, base: gs.base, groupId: gs.groupId, groupSeq: seq, final: false });
    if (!ok) return;
    const next = { ...gs, count: seq };
    setGroupState(next);
    setCustomForm(f => ({ ...INIT_FORM, customer: f.customer, customerId: f.customerId, orderNo: isSeller ? '' : groupOrderNo(next.base, next.count + 1) }));
    setTimeout(() => customerRef.current?.focus(), 300);
  };

  // Τελική αποθήκευση: αν είμαστε σε ομάδα, η τελευταία πόρτα παίρνει την επόμενη παύλα.
  const doFinalSave = (overrides = {}) => {
    if (customForm.isQuote) return doFinalSaveQuote(overrides);
    if (groupState) {
      const seq = groupState.count + 1;
      const orderNo = isSeller ? '' : groupOrderNo(groupState.base, seq);
      return saveOrder(overrides, { orderNo, base: groupState.base, groupId: groupState.groupId, groupSeq: seq, final: true });
    }
    return saveOrder(overrides);
  };

  // ════════════ ΠΡΟΣΦΟΡΕΣ (special_quotes) ════════════
  const quoteDays = (q) => { const ts = q.quotedAt || q.createdAt; return ts ? Math.max(0, Math.floor((Date.now() - ts) / 86400000)) : 0; };
  const quoteDaysLabel = (q) => { const d = quoteDays(q); return d === 0 ? 'σήμερα' : d === 1 ? '1 ημέρα' : `${d} ημέρες`; };

  const saveQuoteWith = async (form, groupInfo = null) => {
    if (readOnly && !isSeller) return false;
    if (!form.h || !form.w) { Alert.alert('Προσοχή', 'Βάλτε Ύψος και Πλάτος.'); return false; }
    const intermediate = groupInfo && !groupInfo.final;

    // ── ΠΩΛΗΤΗΣ: υποβολή προσφοράς προς έγκριση (διόρθωση μετά απόρριψη όπως οι παραγγελίες) ──
    if (isSeller) {
      if (!selectedCustomer) { Alert.alert('Επιλογή πελάτη', 'Διάλεξε έναν από τους πελάτες σου από τη λίστα.'); return false; }
      const submissionId = editingOrder?._submissionId || formSubIdRef.current || Date.now().toString();
      const gId = groupInfo?.groupId || form.groupId;
      const gSeq = groupInfo?.groupSeq ?? form.groupSeq;
      const dc = await countDocs(submissionId);
      const submission = {
        ...form, orderNo: '', orderType: 'ΕΙΔΙΚΗ', isQuote: true,
        submittedBy: sellerKey, submittedAt: Date.now(), status: 'PENDING',
        createdAt: form.createdAt || Date.now(),
        ...(gId ? { groupId: gId, groupSeq: gSeq } : {}),
      };
      delete submission._submissionId; delete submission._sid;
      delete submission.rejectNote; delete submission.rejectedBy; delete submission.rejectedAt;
      submission.coatingDetails = pruneCoatingDetails(submission.coatings, submission.coatingDetails);
      if (dc) submission.docCount = dc; else delete submission.docCount;
      if (editingOrder?._submissionId) {
        const cur = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`).then(r=>r.json()).catch(()=>undefined);
        if (cur === undefined) { Alert.alert('Σφάλμα','Δεν έγινε έλεγχος κατάστασης. Δοκίμασε ξανά.'); return false; }
        if (cur && cur.status !== 'PENDING' && cur.status !== 'REJECTED') {
          Alert.alert('Δεν γίνεται διόρθωση','Η προσφορά εγκρίθηκε ήδη από το γραφείο. Επικοινώνησε με το γραφείο για αλλαγές.');
          return false;
        }
      }
      try {
        const r = await fetch(`${FIREBASE_URL}/seller_submissions/${submissionId}.json`, { method:'PUT', body: JSON.stringify(submission) });
        if (!r.ok) throw new Error();
      } catch { Alert.alert('Σφάλμα','Η υποβολή δεν στάλθηκε. Δοκίμασε ξανά.'); return false; }
      if (intermediate) { formSubIdRef.current = null; return true; }
      resetForm();
      Alert.alert('✅ Υποβλήθηκε', 'Η προσφορά υποβλήθηκε για έγκριση από το γραφείο.');
      return true;
    }

    // Έλεγχος καταχωρημένου πελάτη (ίδιος με παραγγελία)
    if (form.customer && !selectedCustomer) {
      const exists = (customers || []).some(c => c.name?.toLowerCase() === form.customer.trim().toLowerCase());
      if (!exists) {
        const doRegister = () => { if (onRequestAddCustomer) onRequestAddCustomer(form.customer.trim(), (nc) => { setSelectedCustomer(nc); setCustomerSearch(nc.name); setCustomForm(f => ({ ...f, customer: nc.name, customerId: nc.id })); }); };
        const clearCustomer = () => { setCustomerSearch(''); setCustomForm(f => ({ ...f, customer: '' })); };
        if (Platform.OS === 'web') { if (window.confirm(`Ο πελάτης "${form.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`)) doRegister(); else clearCustomer(); }
        else Alert.alert('Πελάτης δεν βρέθηκε', `Ο πελάτης "${form.customer.trim()}" δεν είναι καταχωρημένος.\nΘέλεις να τον καταχωρήσεις;`, [{ text: 'ΟΧΙ', style: 'destructive', onPress: clearCustomer }, { text: 'ΝΑΙ', onPress: doRegister }]);
        return false;
      }
    }

    const quote = {
      ...form, orderNo: '', orderType: 'ΕΙΔΙΚΗ', isQuote: true, status: 'QUOTE',
      id: editingQuote ? editingQuote.id : Date.now().toString() + (groupInfo ? `_${groupInfo.groupSeq}` : ''),
      createdAt: editingQuote ? (editingQuote.createdAt || Date.now()) : Date.now(),
      quotedAt: editingQuote ? (editingQuote.quotedAt || editingQuote.createdAt || Date.now()) : Date.now(),
      enteredBy: editingQuote ? (editingQuote.enteredBy || form.enteredBy || currentUserName) : (form.enteredBy || currentUserName),
      ...(editingQuote?.docCount ? { docCount: editingQuote.docCount } : {}),
      ...(groupInfo ? { groupId: groupInfo.groupId, groupSeq: groupInfo.groupSeq }
          : (editingQuote?.groupId ? { groupId: editingQuote.groupId, groupSeq: editingQuote.groupSeq } : {})),
    };
    if (!editingQuote) { try { await applyEidAutoPricing(quote); } catch {} }
    quote.priceTotal = priceFinalTotal(quote.priceList, quote.priceDiscount);
    quote.priceLog = appendPriceLog(quote.priceLog, quote.priceTotal, (quote.priceList || []).length > 0);
    quote.coatingDetails = pruneCoatingDetails(quote.coatings, quote.coatingDetails);
    try {
      const r = await fetch(`${FIREBASE_URL}/special_quotes/${quote.id}.json`, { method: 'PUT', body: JSON.stringify(quote) });
      if (!r.ok) throw new Error();
    } catch { Alert.alert('Σφάλμα', 'Η προσφορά δεν αποθηκεύτηκε στο Cloud.'); return false; }
    setSpecialQuotes(prev => [quote, ...prev.filter(q => q.id !== quote.id)]);
    if (intermediate) return true;
    resetForm();
    Alert.alert('✅ Προσφορά', 'Η προσφορά καταχωρήθηκε.');
    return true;
  };
  const saveQuote = (overrides = null, groupInfo = null) => saveQuoteWith(overrides ? { ...customForm, ...overrides } : customForm, groupInfo);

  const addAnotherDoorQuote = async (overrides = null) => {
    const form = overrides ? { ...customForm, ...overrides } : customForm;
    if (!form.h || !form.w) return Alert.alert('Προσοχή', 'Βάλτε Ύψος και Πλάτος.');
    let gq = quoteGroup || { count: 0, groupId: `q${Date.now()}` };
    const seq = gq.count + 1;
    const ok = await saveQuote(overrides, { groupId: gq.groupId, groupSeq: seq, final: false });
    if (!ok) return;
    setQuoteGroup({ ...gq, count: seq });
    setCustomForm(f => ({ ...INIT_FORM, customer: f.customer, customerId: f.customerId }));
    setTimeout(() => customerRef.current?.focus(), 300);
  };
  const doFinalSaveQuote = async (overrides = null) => {
    if (quoteGroup) {
      const seq = quoteGroup.count + 1;
      const ok = await saveQuote(overrides, { groupId: quoteGroup.groupId, groupSeq: seq, final: true });
      if (ok) setQuoteGroup(null);
      return ok;
    }
    return saveQuote(overrides);
  };

  // ── Μετατροπή προσφοράς → παραγγελία (μόνο προσωπικό): παίρνει αριθμό, σβήνει την προσφορά ──
  const nextNumberFresh = async () => {
    const [sp, std, seq] = await Promise.all([
      fetch(`${FIREBASE_URL}/special_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/std_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/order_seq.json`).then(r => r.json()).catch(() => null),
    ]);
    const cross = [...Object.values(sp || {}), ...Object.values(std || {})];
    return suggestNextOrderNo(cross.map(o => o.orderNo), Object.keys(seq || {}));
  };
  const claimBaseNumber = async () => {
    let n = Number(await nextNumberFresh());
    for (let i = 0; i < 100; i++, n++) {
      const res = await fetch(`${FIREBASE_URL}/order_seq/${n}.json`, { method: 'PUT', body: JSON.stringify(Date.now()) });
      if (res.ok) return String(n);
    }
    throw new Error('order number claim failed');
  };
  const persistConvertedDoor = async (q, number, groupMeta) => {
    const { isQuote, quotedAt, status: _st, ...rest } = q;
    const order = {
      ...rest, id: q.id, orderNo: number, orderType: 'ΕΙΔΙΚΗ', status: 'PENDING',
      createdAt: q.createdAt || Date.now(), enteredBy: q.enteredBy || currentUserName,
      ...(groupMeta ? { groupId: groupMeta.groupId, groupSeq: groupMeta.groupSeq } : {}),
    };
    if (!groupMeta) { delete order.groupId; delete order.groupSeq; }
    order.coatingDetails = pruneCoatingDetails(order.coatings, order.coatingDetails);
    order.priceTotal = priceFinalTotal(order.priceList, order.priceDiscount);
    const r = await fetch(`${FIREBASE_URL}/special_orders/${order.id}.json`, { method: 'PUT', body: JSON.stringify(order) });
    if (!r.ok) throw new Error();
    setSpecialOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
    await fetch(`${FIREBASE_URL}/special_quotes/${q.id}.json`, { method: 'DELETE' }).catch(() => {});
    setSpecialQuotes(prev => prev.filter(x => x.id !== q.id));
  };
  const convertQuoteToOrder = async (q) => {
    if (isSeller || readOnly) return;
    const doors = q.groupId ? specialQuotes.filter(x => x.groupId === q.groupId).sort((a, b) => (a.groupSeq || 0) - (b.groupSeq || 0)) : [q];
    const msg = doors.length > 1 ? `Μετατροπή προσφοράς σε παραγγελία; (${doors.length} πόρτες)` : 'Μετατροπή προσφοράς σε παραγγελία;';
    if (Platform.OS === 'web') { if (!window.confirm(msg)) return; }
    try {
      const base = await claimBaseNumber();
      if (doors.length > 1) {
        const gId = `g${Date.now()}`;
        let i = 1;
        for (const d of doors) { await persistConvertedDoor(d, groupOrderNo(base, i), { groupId: gId, groupSeq: i }); i++; }
      } else {
        await persistConvertedDoor(doors[0], base, null);
      }
      await logActivity('ΕΙΔΙΚΗ', 'Μετατροπή προσφοράς σε παραγγελία', { orderNo: base, customer: q.customer || '' });
      Alert.alert('✅ Έγινε', `Η προσφορά μετατράπηκε σε παραγγελία #${base}.`);
    } catch { Alert.alert('Σφάλμα', 'Η μετατροπή απέτυχε. Δοκίμασε ξανά.'); }
  };
  const deleteQuote = (q) => {
    if (isSeller || readOnly) return;
    const doors = q.groupId ? specialQuotes.filter(x => x.groupId === q.groupId) : [q];
    const doDel = async () => {
      for (const d of doors) {
        const r = await fetch(`${FIREBASE_URL}/special_quotes/${d.id}.json`, { method: 'DELETE' });
        if (!r.ok) {
          Alert.alert('Σφάλμα', 'Η διαγραφή ΔΕΝ έγινε στη βάση.\nΗ εγγραφή θα ξαναεμφανιστεί όταν κλείσεις το πρόγραμμα.\n(Πιθανό πρόβλημα δικαιωμάτων — special_quotes στο Firebase.)');
          return;
        }
      }
      setSpecialQuotes(prev => prev.filter(x => q.groupId ? x.groupId !== q.groupId : x.id !== q.id));
    };
    if (Platform.OS === 'web') { if (window.confirm(doors.length > 1 ? `Διαγραφή προσφοράς (${doors.length} πόρτες);` : 'Διαγραφή προσφοράς;')) doDel(); }
    else Alert.alert('Διαγραφή', 'Διαγραφή προσφοράς;', [{ text: 'Όχι' }, { text: 'Ναι', style: 'destructive', onPress: doDel }]);
  };
  const editQuote = (q) => {
    if (isSeller || readOnly || isForeman) return;
    const { id, isQuote, status, createdAt, quotedAt, groupId, groupSeq, approvedBy, approvedAt, docCount, ...formData } = q;
    setOrderNoAuto(false);
    setCustomForm({ ...INIT_FORM, ...formData, orderNo: '', isQuote: true, coatingDetails: q.coatingDetails || {} });
    const c = q.customerId ? (customers || []).find(x => x.id === q.customerId) : (customers || []).find(x => x.name === q.customer);
    setSelectedCustomer(c || (q.customer ? { name: q.customer, id: q.customerId } : null));
    setCustomerSearch(q.customer || '');
    setEditingOrder(null);
    setEditingQuote(q);
    setActiveSection('form');
  };
  const savePriceListQuote = async (q, items, discount, note = '') => {
    const priceTotal = priceFinalTotal(items, discount);
    const priceLog = appendPriceLog(q.priceLog, priceTotal, (items || []).length > 0);
    const upd = { ...q, priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note };
    setSpecialQuotes(prev => prev.map(x => x.id === q.id ? upd : x));
    try { await fetch(`${FIREBASE_URL}/special_quotes/${q.id}.json`, { method: 'PATCH', body: JSON.stringify({ priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note }) }); } catch {}
  };
  // Κουμπί εγγράφου στη φόρμα — μόνο για πωλητή (συνημμένα κατά την υποβολή).
  const sellerFormDocBtn = (extraStyle = {}) => {
    if (!isSeller) return null;
    const n = customForm.docCount || 0;
    return (
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: n ? '#6a1b9a' : '#777', paddingHorizontal: 22, marginTop: 0 }, extraStyle]}
        onPress={() => { Keyboard.dismiss(); const id = ensureSellerSubId(); n ? openDocViewer({ id, orderNo: '' }) : openDocQR({ id, _sellerSub: true }, 'add'); }}>
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>📎 ΕΓΓΡΑΦΟ{n ? ` (${n})` : ''}</Text>
      </TouchableOpacity>
    );
  };

  const editOrder = async (order) => {
    if (isForeman) return;
    setOrderNoAuto(false);
    setCustomForm(order);
    setCustomerSearch(order.customer||'');
    setEditingOrder(order);
    setSpecialOrders(specialOrders.filter(o=>o.id!==order.id));
    try { await fetch(`${FIREBASE_URL}/special_orders/${order.id}.json`,{method:'DELETE'}); } catch(e){}
    logActivity('ΕΙΔΙΚΗ', 'Επεξεργασία (άνοιγμα)', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
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
      td:first-child{white-space:nowrap;word-break:keep-all;overflow-wrap:normal;}
      td.nowrap{white-space:nowrap;}
      td.notes{white-space:normal;min-width:120px;width:auto;}
      td.col-glass{white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;width:120px;max-width:120px;}
      td.col-lock{white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;width:140px;max-width:140px;}
      .col-no{width:70px;white-space:nowrap;}
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
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${notesHtmlWithExtras(o)}</td>
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
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
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
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${notesHtmlWithExtras(o)}</td>
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
      const SLASH = '<b style="color:#d32f2f">&nbsp;&nbsp;/&nbsp;&nbsp;</b>';
      const buildCoatDetailsHtml = (o) => {
        const cd = o.coatingDetails||{};
        const buildRow = (d, keys) => keys.map(k=>d[k]&&String(d[k]).trim()?String(d[k]).trim():null).filter(Boolean).join(SLASH);
        const sections = [];
        (o.coatings||[]).filter(n=>n&&String(n).trim()).forEach(name=>{
          const d = cd[name]||{};
          const fyllo = buildRow(d, ['dim','design','color']);
          const perv  = buildRow(d, ['frameW','frameColor']);
          const kasa  = buildRow(d, ['caseW','caseColor']);
          if (!fyllo && !perv && !kasa) return;
          const type = getCoatingType(name);
          const color = type==='EXO'?'#e65100':type==='MESA'?'#1565c0':'#444';
          const parts = [`<div style="font-weight:900;color:${color};font-size:16px;letter-spacing:0.4px;margin-bottom:2px">${name}</div>`];
          if (fyllo) parts.push(`<div style="margin-left:6px;font-size:15px;line-height:1.35"><b>Φύλλο:</b> ${fyllo}</div>`);
          if (perv)  parts.push(`<div style="margin-left:6px;font-size:15px;line-height:1.35"><b>Περβάζι:</b> ${perv}</div>`);
          if (type==='EXO' && kasa) parts.push(`<div style="margin-left:6px;font-size:15px;line-height:1.35"><b>Κάσα:</b> ${kasa}</div>`);
          sections.push(parts.join(''));
        });
        return sections.join('<div style="border-top:1px dashed #aaa;margin:6px 0"></div>');
      };
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
        const staveraStr = staveraEntries.map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(' | ');
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"";
        const ependDone = !isEpend && o.phases?.epend?.done;
        const checkMark = ` <span style="color:#00C851;font-size:22px;font-weight:900">✔</span>`;
        const exoCheck = ependDone && exo.length>0 ? checkMark : '';
        const mesaCheck = ependDone && mesa.length>0 ? checkMark : '';
        const notesLines = [];
        if (o.notes) notesLines.push(`<span style="color:#000">${formatNotesHtml(o.notes)}</span>`);
        if (o.casePaint && String(o.casePaint).trim()) notesLines.push(`<span style="color:#000"><b>Βαφή:</b> ${escapeHtmlSafe(String(o.casePaint).trim())}</span>`);
        if (exo.length>0) notesLines.push(`<span style="color:#b8860b;font-weight:bold">🎨 ΕΞΩ: ${coatingsHtml(exo)}${exoCheck}</span>`);
        if (mesa.length>0) notesLines.push(`<span style="color:#1565c0;font-weight:bold">🎨 ΜΕΣ: ${coatingsHtml(mesa)}${mesaCheck}</span>`);
        if (staveraStr) notesLines.push(`<span style="color:#6a0dad;font-weight:bold">📐 ${staveraStr}</span>`);
        if (tzami) notesLines.push(`<span style="color:#555">🪟 ${tzami}</span>`);
        const notesCell = notesLines.join('<br>');
        const installBadge = isEpend && o.installation==='ΝΑΙ'
          ? `<div style="margin-top:3px;background:#1565C0;color:white;font-weight:bold;font-size:11px;padding:2px 6px;border-radius:4px;display:inline-block">ΜΟΝΤΑΡΙΣΜΑ</div>`
          : '';
        const coatDetailsCell = isEpend
          ? `<td style="font-size:15px;white-space:normal;word-wrap:break-word;vertical-align:top">${buildCoatDetailsHtml(o)}</td>`
          : '';
        return `<tr>
          <td style="font-weight:bold;font-size:17px;vertical-align:top">${o.orderNo||'—'}${installBadge}</td>
          <td style="font-size:17px;font-weight:900">${o.h||'—'} × ${o.w||'—'}</td>
          <td style="font-weight:bold;font-size:17px">${fora}</td>
          <td style="font-size:13px;text-align:center">${armorVal}</td>
          <td style="font-size:13px">${o.hardware||'—'}</td>
          ${!isEpend ? `<td style="font-size:13px">${mentesedesVal}</td>` : ''}
          ${!isEpend ? `<td style="font-size:13px;white-space:normal;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word">${kleidaria}</td>` : ''}
          ${!isEpend ? `<td style="font-size:13px;text-align:center">${caseTypeVal}</td>` : ''}
          <td style="font-size:13px;white-space:normal;word-wrap:break-word;vertical-align:top">${notesCell}</td>
          ${coatDetailsCell}
          <td style="font-size:12px;color:#444;vertical-align:top">${datesLine}</td>
        </tr>`;
      }).join('');
      if (isEpend) {
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:70px"><col style="width:125px"><col style="width:35px"><col style="width:39px"><col style="width:105px"><col><col><col style="width:70px">
        </colgroup><thead><tr>
          <th>Νο</th><th>Διάσταση</th><th>Φορά</th><th>Θ/Σ</th><th>Χρώμα</th><th>Παρατηρήσεις</th><th>Στοιχεία Επένδυσης</th><th>Ημερομηνίες</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
      }
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:70px"><col style="width:125px"><col style="width:35px"><col style="width:39px"><col style="width:105px"><col style="width:28px"><col style="width:169px"><col style="width:28px"><col><col style="width:70px">
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
          <td style="min-width:160px;font-size:13px;white-space:pre-wrap">${notesHtmlWithExtras(o)}</td>
          <td style="font-size:12px;color:#444">${datesLine}</td>
        </tr>`;
      }).join('');
      return `<table style="table-layout:fixed;width:100%"><colgroup>
        <col style="width:70px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:28px"><col style="width:28px"><col style="width:70px"><col style="width:200px"><col style="width:80px">
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

      // Φιλτράρισμα παρατηρήσεων για εκτυπώσεις laser — σβήνει στάνταρ φράσεις
      const LASER_SKIP = ['ΣΟΥΣΤ','ΠΟΜΟΛ','ΠΕΤΡΟΒΑΜΒΑΚ','ΜΠΟΥΛ','ΑΦΑΛΟ','ΝΕΥΡ','DEFENDER','ΥΠΟΓΕΙ','ΙΣΟΓΕΙ','ΟΡΟΦ','ΠΗΧΑΚ','ΤΖΑΜ','ΜΑΤΙ','ΑΝΑΠΟΔ','ΦΡΕΖΑ'];
      const LASER_LOCK_SKIP = ['SECUREMME','ΚΑΤΑΠΕΛΤΗ'];
      const LASER_LOCK_KEEP = ['ΗΛΕΚΤΡΙΚ','ΗΛΕΚΤΡΟΝΙΚ'];
      const normForMatch = s => String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const cleanLaserNotes = (notes) => {
        if (!notes) return '';
        const cleaned = String(notes).split('\n').map(line => {
          const parts = line.split(',').filter(p => {
            const n = normForMatch(p);
            return !LASER_SKIP.some(k => n.includes(k));
          });
          return parts.join(',');
        }).filter(l => l.trim()).join('\n');
        return formatNotesHtml(cleaned);
      };
      const cleanLaserLock = (lockName) => {
        if (!lockName) return '—';
        const n = normForMatch(lockName);
        if (LASER_LOCK_KEEP.some(k => n.includes(k))) return lockHtml(lockName);
        if (LASER_LOCK_SKIP.some(k => n.includes(k))) return '';
        return lockHtml(lockName);
      };
      const cleanLaserMat = (mat) => mat === 'DKP' ? '' : mat;

      // ΠΡΟΦΙΛ: χωρίς τζάμι, τ.κάσας, υλ.κάσας
      if (isProfil) {
        const rows = orders.map(o => {
          const fora = o.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ';
          const hingesNum = parseInt(o.hinges)||2;
          const mentesedesVal = (!o.hinges||o.hinges==='2')?'—':o.hinges;
          const mentStyle = hingesNum>=3 ? 'font-size:14px;font-weight:900;color:#cc0000;' : 'font-size:10px;';
          const kleidaria = cleanLaserLock(o.lock);
          const armorVal = (o.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ') ? '' : '<b>Μ/Θ</b>';
          return `<tr>
            <td class="col-no" style="font-weight:bold">${o.orderNo||'—'}</td>
            <td class="col-tem">${qtyDisplay(o)}</td>
            <td class="col-dim" style="font-weight:900">${dimCell(o)}</td>
            <td class="col-fora" style="font-weight:bold">${fora}</td>
            <td class="col-thor" style="font-size:10px;text-align:center">${armorVal}</td>
            <td class="col-ment" style="${mentStyle}">${mentesedesVal}</td>
            <td class="col-lock" style="font-size:10px">${kleidaria}</td>
            <td class="notes" style="font-size:10px">${cleanLaserNotes(o.notes)}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000"><td style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="6"></td></tr>`;
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:70px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:28px"><col style="width:130px"><col>
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
            <td class="col-lock" style="font-size:10px">${cleanLaserLock(o.lock)}</td>
            <td class="col-type" style="font-size:10px;text-align:center">${caseTypeVal}</td>
            <td class="col-mat" style="font-size:10px;font-weight:bold">${cleanLaserMat(mat)}</td>
            <td class="notes" style="font-size:10px">${cleanLaserNotes(o.notes)}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="6"></td></tr>`;
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:70px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:28px"><col style="width:130px"><col style="width:28px"><col style="width:70px"><col>
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
            <td class="col-glass" style="font-size:10px">${((o.glassDim||'')+(o.glassDesign?' '+o.glassDesign:'')+(o.glassNotes?' '+o.glassNotes:''))||'—'}</td>
            <td class="col-lock" style="font-size:10px">${cleanLaserLock(o.lock)}</td>
            <td class="notes" style="font-size:10px">${cleanLaserNotes(o.notes)}</td>
          </tr>`;
        }).join('');
        const total = totalQty(orders);
        const totalRow = `<tr style="border-top:2px solid #000;background:#f5f5f5"><td colspan="1" style="font-weight:bold">ΣΥΝΟΛΟ</td><td style="text-align:center;font-weight:900;font-size:14px">${total}</td><td colspan="4"></td></tr>`;
        return `<table style="table-layout:fixed;width:100%"><colgroup>
          <col style="width:70px"><col style="width:30px"><col style="width:100px"><col style="width:35px"><col style="width:30px"><col style="width:28px"><col style="width:110px"><col style="width:130px"><col>
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
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
        // Επενδύσεις: εξωτερικές / εσωτερικές
        const allCoatings = o.coatings||[];
        const exo = allCoatings.filter(c=>c.toUpperCase().includes('ΕΞΩ'));
        const mesa = allCoatings.filter(c=>c.toUpperCase().includes('ΜΕΣΑ')||c.toUpperCase().includes('ΕΣΩΤ'));
        // Σταθερά
        const staveraEntries = (o.stavera||[]).filter(s=>s&&s.dim);
        const staveraStr = staveraEntries.map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(' | ');
        // Παρατηρήσεις — σύνθεση
        const notesLines = [];
        if (o.notes) notesLines.push(`<span style="color:#000;font-size:12px">${formatNotesHtml(o.notes)}</span>`);
        if (o.casePaint && String(o.casePaint).trim()) notesLines.push(`<span style="color:#000;font-size:12px"><b>Βαφή:</b> ${escapeHtmlSafe(String(o.casePaint).trim())}</span>`);
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
        const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
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
          <td style="min-width:140px">${notesHtmlWithExtras(o)}</td>
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
            const orderNoCell = `${o.orderNo||'—'}${o.programNo?` (${escapeHtmlSafe(o.programNo)})`:''}`;
            const ylikoCell = o.caseMaterial==='ΓΑΛΒΑΝΙΖΕ' ? 'ΓΑΛΒΑΝΙΖΕ' : '';
            const paint = String(o.casePaint||'').trim();
            const extrasHtml = paint ? `<br><b>Βαφή:</b> ${escapeHtmlSafe(paint)}` : '';
            const staveraRows = staveraEntries.map(s=>`<tr>
              <td style="font-weight:bold;font-size:17px">${orderNoCell}</td>
              <td style="font-size:16px;font-weight:bold;padding-right:24px">${staveraKind(o, s)}</td>
              <td style="font-size:13px;font-weight:bold;width:70px;white-space:nowrap;padding-left:24px">${ylikoCell}</td>
              <td style="font-size:20px;font-weight:900">📐 ${s.dim||'—'}</td>
              <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center">${s.qty||''}</td>
              <td style="font-size:13px;min-width:180px">${s.note||''}${extrasHtml}</td>
              <td style="font-size:12px;color:#444">${dateCell}</td>
            </tr>`);
            const glassRows = hasGlass(o) ? [`<tr>
              <td style="font-weight:bold;font-size:17px">${orderNoCell}</td>
              <td style="font-size:16px;font-weight:bold;padding-right:24px;color:#0d47a1">${plaisioKind(o)}</td>
              <td style="font-size:13px;font-weight:bold;width:70px;white-space:nowrap;padding-left:24px">${ylikoCell}</td>
              <td style="font-size:20px;font-weight:900;color:#0d47a1">🪟 ${o.glassDim||'—'}</td>
              <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
              <td style="font-size:13px;min-width:180px">${o.glassNotes||''}${extrasHtml}</td>
              <td style="font-size:12px;color:#444">${dateCell}</td>
            </tr>`] : [];
            if (staveraRows.length===0 && glassRows.length===0) {
              return [`<tr>
                <td style="font-weight:bold;font-size:17px">${orderNoCell}</td>
                <td style="font-size:13px">—</td>
                <td style="font-size:13px;font-weight:bold;width:70px;white-space:nowrap;padding-left:24px">${ylikoCell}</td>
                <td style="font-size:20px;font-weight:900">—</td>
                <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
                <td style="font-size:13px;min-width:180px">${paint?`<b>Βαφή:</b> ${escapeHtmlSafe(paint)}`:''}</td>
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
            <table><thead><tr><th style="width:90px">Νο</th><th style="width:130px;padding-right:24px">Είδος<br>κατασκευής</th><th style="width:70px;padding-left:24px">Υλικό</th><th style="width:140px">Διάσταση</th><th style="text-align:center;width:50px">Τεμ.</th><th>Παρατήρηση</th><th style="width:80px">Ημερομηνία</th></tr></thead>
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
          const orderNoCell = `${o.orderNo||'—'}${o.programNo?` (${escapeHtmlSafe(o.programNo)})`:''}`;
          const ylikoCell = o.caseMaterial==='ΓΑΛΒΑΝΙΖΕ' ? 'ΓΑΛΒΑΝΙΖΕ' : '';
          const paint = String(o.casePaint||'').trim();
          const extrasHtml = paint ? `<br><b>Βαφή:</b> ${escapeHtmlSafe(paint)}` : '';
          const staveraRows = staveraEntries.map(s=>`<tr>
            <td style="font-weight:bold;font-size:17px">${orderNoCell}</td>
            <td style="font-size:16px;font-weight:bold;padding-right:24px">${staveraKind(o, s)}</td>
            <td style="font-size:13px;font-weight:bold;width:70px;white-space:nowrap;padding-left:24px">${ylikoCell}</td>
            <td style="font-size:20px;font-weight:900">📐 ${s.dim||'—'}</td>
            <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center">${s.qty||''}</td>
            <td style="font-size:13px;min-width:180px">${s.note||''}${extrasHtml}</td>
            <td style="font-size:12px;color:#444">${dateCell}</td>
          </tr>`);
          const glassRows = hasGlass(o) ? [`<tr>
            <td style="font-weight:bold;font-size:17px">${orderNoCell}</td>
            <td style="font-size:16px;font-weight:bold;padding-right:24px;color:#0d47a1">${plaisioKind(o)}</td>
            <td style="font-size:13px;font-weight:bold;width:70px;white-space:nowrap;padding-left:24px">${ylikoCell}</td>
            <td style="font-size:20px;font-weight:900;color:#0d47a1">🪟 ${o.glassDim||'—'}</td>
            <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
            <td style="font-size:13px;min-width:180px">${o.glassNotes||''}${extrasHtml}</td>
            <td style="font-size:12px;color:#444">${dateCell}</td>
          </tr>`] : [];
          if (staveraRows.length===0 && glassRows.length===0) {
            return [`<tr>
              <td style="font-weight:bold;font-size:17px">${orderNoCell}</td>
              <td style="font-size:13px">—</td>
              <td style="font-size:13px;font-weight:bold;width:70px;white-space:nowrap;padding-left:24px">${ylikoCell}</td>
              <td style="font-size:20px;font-weight:900">—</td>
              <td style="font-size:18px;font-weight:900;color:#d32f2f;text-align:center"></td>
              <td style="font-size:13px;min-width:180px">${paint?`<b>Βαφή:</b> ${escapeHtmlSafe(paint)}`:''}</td>
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
          <table><thead><tr><th style="width:90px">Νο</th><th style="width:130px;padding-right:24px">Είδος<br>κατασκευής</th><th style="width:70px;padding-left:24px">Υλικό</th><th style="width:140px">Διάσταση</th><th style="text-align:center;width:50px">Τεμ.</th><th>Παρατήρηση</th><th style="width:80px">Ημερομηνία</th></tr></thead>
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
          {label:'Νο',w:50},{label:'Είδος\nκατασκευής',w:130},{label:'Υλικό',w:80},{label:'Διάσταση',w:130},
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
                const yliko = o.caseMaterial==='ΓΑΛΒΑΝΙΖΕ' ? 'ΓΑΛΒΑΝΙΖΕ' : '';
                if (entries.length===0 && !orderHasGlass) {
                  return [(
                    <View key={o.id+'-0'} style={[styles.previewTr,i%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                      <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{o.orderNo||'—'}</Text>
                      <Text style={[styles.previewTd,{width:130,fontSize:12}]}>—</Text>
                      <Text style={[styles.previewTd,{width:80,fontSize:12,fontWeight:'bold',paddingLeft:24}]}>{yliko}</Text>
                      <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>—</Text>
                      <Text style={[styles.previewTd,{width:220,fontSize:12}]}></Text>
                      <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{deliveryFmt}</Text>
                    </View>
                  )];
                }
                const staveraRows = entries.map((s,si)=>(
                  <View key={o.id+'-s-'+si} style={[styles.previewTr,(i+si)%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{si===0?o.orderNo||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:130,fontSize:15,fontWeight:'bold',paddingRight:24}]}>{staveraKind(o, s)}</Text>
                    <Text style={[styles.previewTd,{width:80,fontSize:12,fontWeight:'bold',paddingLeft:24}]}>{si===0?yliko:''}</Text>
                    <Text style={[styles.previewTd,{width:130,fontWeight:'900',fontSize:15}]}>📐 {s.dim||'—'}</Text>
                    <Text style={[styles.previewTd,{width:220,fontSize:12}]}>{s.note||''}</Text>
                    <Text style={[styles.previewTd,{width:110,fontSize:11,color:'#555'}]}>{si===0?deliveryFmt:''}</Text>
                  </View>
                ));
                const glassRows = orderHasGlass ? [(
                  <View key={o.id+'-g'} style={[styles.previewTr,(i+entries.length)%2===0?styles.previewTrEven:styles.previewTrOdd]}>
                    <Text style={[styles.previewTd,{width:50,fontWeight:'bold'}]}>{entries.length===0?o.orderNo||'—':''}</Text>
                    <Text style={[styles.previewTd,{width:130,fontSize:15,fontWeight:'bold',paddingRight:24,color:'#0d47a1'}]}>{plaisioKind(o)}</Text>
                    <Text style={[styles.previewTd,{width:80,fontSize:12,fontWeight:'bold',paddingLeft:24}]}>{entries.length===0?yliko:''}</Text>
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
                const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
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
                const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
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
            const tzami = o.orderType==="ΤΥΠΟΠΟΙΗΜΕΝΗ"?"—":((o.glassDim||"")+(o.glassDesign?` ${o.glassDesign}`:"")+(o.glassNotes?` ${o.glassNotes}`:""))||"—";
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
    const newPhases = {...order.phases, [phaseKey]:{...order.phases[phaseKey], done:true, doneAt:Date.now()}};
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
    const updatedPhase = { ...existingPhase, done: false, doneAt: null, active: forceActive ? true : existingPhase.active };
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
    const newPhases = {...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:true, doneAt:Date.now()}};
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
    const upd = {...order, dipliPhases:{...order.dipliPhases, [phaseKey]:{...order.dipliPhases[phaseKey], done:false, doneAt:null}}};
    setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
    await syncToCloud(upd);
  };
  const removeFromPhase = (orderId, phaseKey) => {
    const doRemove = async () => {
      const order = specialOrders.find(o=>o.id===orderId); if(!order) return;
      const upd = {...order, phases:{...order.phases, [phaseKey]:{...order.phases[phaseKey], active:false}}};
      setSpecialOrders(specialOrders.map(o=>o.id===orderId?upd:o));
      await syncToCloud(upd);
    };
    if (Platform.OS === 'web') { if (window.confirm("Αφαίρεση από αυτή τη φάση παραγωγής;")) doRemove(); }
    else Alert.alert("Αφαίρεση","Αφαίρεση από αυτή τη φάση παραγωγής;",[{text:"Όχι"},{text:"Ναι",onPress:doRemove}]);
  };

  const cancelOrder = (id) => {
    const doCancel = async () => {
      const order = specialOrders.find(o=>o.id===id);
      setSpecialOrders(specialOrders.filter(o=>o.id!==id));
      await deleteFromCloud(id);
      if (order) await logActivity('ΕΙΔΙΚΗ', 'Ακύρωση/Διαγραφή', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
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
    const order = soldSpecialOrders.find(o=>o.id===id);
    setSoldSpecialOrders(soldSpecialOrders.filter(o=>o.id!==id));
    await deleteFromCloud(id);
    if (order) await logActivity('ΕΙΔΙΚΗ', 'Διαγραφή από Αρχείο', { orderNo: order.orderNo, customer: order.customer, size: `${order.h}x${order.w}` });
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
  const appendPriceLog = (prevLog, newTotal, hasItems) => {
    const logArr = Array.isArray(prevLog) ? [...prevLog] : [];
    if (!hasItems) return logArr;
    const last = logArr[logArr.length-1];
    if (!last || last.total !== newTotal) logArr.push({ user: currentUserName, ts: Date.now(), total: newTotal });
    return logArr;
  };
  const savePriceList = async (order, items, discount, note='') => {
    const priceTotal = priceFinalTotal(items, discount);
    const priceLog = appendPriceLog(order.priceLog, priceTotal, (items||[]).length>0);
    const upd = { ...order, priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note };
    if (order.status === 'SOLD') setSoldSpecialOrders(prev=>prev.map(o=>o.id===order.id?upd:o));
    else setSpecialOrders(prev=>prev.map(o=>o.id===order.id?upd:o));
    await fetch(`${FIREBASE_URL}/special_orders/${order.id}.json`, { method:'PATCH', body:JSON.stringify({ priceList: items, priceDiscount: discount, priceTotal, priceLog, priceNote: note }) });
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
      order.glassDesign,
      order.deliveryDate,
      (order.coatings || []).join(' '),
      (order.stavera || []).map(s => (s.dim || '') + ' ' + (s.qty || '') + ' ' + (s.design || '') + ' ' + (s.note || '')).join(' '),
    ];
    return fields.some(f => f && String(f).toLowerCase().includes(q));
  };

  const hasAnyCoatingDetails = (order) => {
    const cd = order?.coatingDetails; if (!cd) return false;
    return Object.values(cd).some(d => d && Object.values(d).some(v => v && String(v).trim()));
  };
  const renderCoatDetailsContent = (order) => {
    const cd = order?.coatingDetails || {};
    const buildRow = (d, keys) => keys.map(k=>d[k]&&String(d[k]).trim()?{key:k, value:String(d[k]).trim()}:null).filter(Boolean);
    const userStyle = {color:'#d32f2f',fontWeight:'900',fontStyle:'italic'};
    const joinSep = (items, userKeys=[]) => items.flatMap((it,i)=>{
      const isUser = userKeys.includes(it.key);
      const valEl = <Text key={i} style={isUser?userStyle:undefined}>{it.value}</Text>;
      return i===0 ? [valEl] : [<Text key={'s'+i} style={{fontWeight:'900',color:'#d32f2f'}}>{'  /  '}</Text>, valEl];
    });
    return (order.coatings||[]).filter(n=>n&&String(n).trim()).map(name=>{
      const d = cd[name]||{};
      const fyllo = buildRow(d, ['dim','design','color']);
      const perv  = buildRow(d, ['frameW','frameColor']);
      const kasa  = buildRow(d, ['caseW','caseColor']);
      if (fyllo.length===0 && perv.length===0 && kasa.length===0) return null;
      const type = getCoatingType(name);
      const c = type==='EXO'?'#e65100':type==='MESA'?'#1565C0':'#444';
      const rowStyle = {fontSize:18,color:'#1a1a1a',marginLeft:10,marginBottom:4,lineHeight:26};
      const userKeys = [d.dimUser&&'dim', d.frameColorUser&&'frameColor', d.caseColorUser&&'caseColor'].filter(Boolean);
      return (
        <View key={name} style={{marginBottom:16}}>
          <Text style={{fontSize:19,fontWeight:'900',color:c,letterSpacing:0.5,marginBottom:7}}>{name}</Text>
          {fyllo.length>0&&<Text style={rowStyle}><Text style={{fontWeight:'900'}}>Φύλλο: </Text>{joinSep(fyllo, userKeys)}</Text>}
          {perv.length>0&&<Text style={rowStyle}><Text style={{fontWeight:'900'}}>Περβάζι: </Text>{joinSep(perv, userKeys)}</Text>}
          {type==='EXO'&&kasa.length>0&&<Text style={rowStyle}><Text style={{fontWeight:'900'}}>Κάσα: </Text>{joinSep(kasa, userKeys)}</Text>}
          {type==='MESA'&&d.pihaki&&<Text style={[rowStyle,{color:'#1565C0',fontWeight:'900'}]}>✓ Πηχάκι (ξυλογωνιά)</Text>}
        </View>
      );
    });
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
            <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:16,marginBottom:2}}>
              {highlightText('#'+order.orderNo+noTag(order), searchQuery, {fontSize:24,fontWeight:'900',color:'#1a1a1a',letterSpacing:1})}
              {(order.groupId || String(order.orderNo||'').includes('-')) ? <Text style={{fontSize:16,color:'#7b1fa2',fontWeight:'bold'}}>🔗</Text> : null}
              {isAdmin&&order.enteredBy?<View style={{borderWidth:2,borderColor:'#cc0000',borderRadius:6,paddingHorizontal:8,paddingVertical:2}}><Text style={{color:'#cc0000',fontWeight:'bold',fontSize:13}}>✍️ {resolveName(order.enteredBy)}</Text></View>:null}
            </View>
            {order.customer?highlightText('👤 '+order.customer, searchQuery, {fontSize:17,fontWeight:'bold',color:'#333',marginBottom:3}):null}
            <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginBottom:3}}>
              {highlightText(`${order.h}x${order.w}`, searchQuery, [styles.cardDetails,{fontSize:14}])}
              {order.qty&&parseInt(order.qty)>1?((!isArchive&&!readOnly&&!isForeman&&!isSeller)
                ? <TouchableOpacity onPress={()=>setSplitModal({visible:true,order})} style={{backgroundColor:'#fff',borderWidth:1.5,borderColor:'#cc0000',borderRadius:6,paddingHorizontal:7,paddingVertical:1,...(Platform.OS==='web'?{cursor:'pointer'}:{})}}><Text style={{fontWeight:'900',fontSize:17,color:'#cc0000'}}>{order.qty}τεμ</Text></TouchableOpacity>
                : <Text style={{fontWeight:'900',fontSize:17,color:'#cc0000'}}>{order.qty}τεμ</Text>):null}
              <Text style={[styles.cardDetails,{fontSize:14}]}>{order.side==='ΑΡΙΣΤΕΡΗ'?'ΑΡ':'ΔΕ'}</Text>
              {!isStd?<Text style={[styles.cardDetails,{fontSize:14}]}>{(order.armor||'ΜΟΝΗ').includes('ΔΙΠΛΗ')?'Δ/Θ':'Μ/Θ'}</Text>:null}
              {order.hardware?highlightText(order.hardware, searchQuery, [styles.cardDetails,{fontSize:14,color:'#555'}]):null}
            </View>
            {!isStd&&highlightText(`Μεντ: ${order.hinges}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {isStd&&order.hardware?<Text style={[styles.cardSubDetails,{fontSize:13}]}>{order.hardware}</Text>:null}
            {(isStd||!isStd)&&order.installation==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#1565C0',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>🪛 ΜΟΝΤΑΡΙΣΜΑ</Text></View></View>}
            {order.placement==='ΝΑΙ'&&<View style={{flexDirection:'row',marginTop:2}}><View style={{backgroundColor:'#E65100',borderRadius:5,paddingHorizontal:8,paddingVertical:2,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'bold',fontSize:16}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text></View></View>}
          </View>

          {/* ΚΕΝΟ ΔΙΑΧΩΡΙΣΤΙΚΟ */}
          <View style={{width:24}}/>

          {/* ΣΤΗΛΗ 2 */}
          <View style={{flex:1}}>
            <Text style={[styles.cardSubDetails,{fontSize:13}]}>Κλειδ: <Text style={lockStyle(order.lock,13)}>{order.lock||'—'}</Text></Text>
            {!isStd&&highlightText(`Κάσα: ${order.caseType==='ΑΝΟΙΧΤΟΥ ΤΥΠΟΥ'?'ΑΝΟΙΧΤΗ':'ΚΛΕΙΣΤΗ'} | ${order.caseMaterial||'DKP'}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&highlightText(`📐 Σταθ: ${order.stavera.filter(s=>s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {!isStd&&(order.glassDim||order.glassNotes)&&highlightText(`🪟 Τζ: ${order.glassDim||''}${order.glassDesign?' '+order.glassDesign:''}${order.glassNotes?' '+order.glassNotes:''}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {isStd&&order.heightReduction?<Text style={[styles.cardSubDetails,{fontSize:13,color:'#b71c1c',fontWeight:'bold'}]}>📏 ΜΕΙΩΣΗ ΥΨΟΥΣ: {order.heightReduction} cm</Text>:null}
            {order.coatings&&order.coatings.length>0&&(
              <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap'}}>
                <Text style={[styles.cardSubDetails,{fontSize:13,color:'#007AFF'}]}>
                  {'🎨 '}
                  {order.coatings.map((n,i)=>(<Text key={i} style={[{fontSize:13,color:'#007AFF'}, coatingStyle(n,13)]}>{i>0?', ':''}{n}</Text>))}
                </Text>
                {hasAnyCoatingDetails(order)&&(
                  <TouchableOpacity onPress={()=>setCoatDetailsModal({visible:true,order})} style={{marginLeft:6,backgroundColor:'#d32f2f',borderRadius:4,width:18,height:18,alignItems:'center',justifyContent:'center'}}>
                    <Text style={{color:'white',fontWeight:'900',fontSize:12,lineHeight:14}}>i</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {order.casePaint?<Text style={[styles.cardSubDetails,{fontSize:13}]}><Text style={{fontWeight:'bold'}}>Βαφή: </Text>{order.casePaint}</Text>:null}
            {renderNotesWithWarning(order.notes, [styles.cardSubDetails,{fontSize:13}], 'Σημ: ', searchQuery)}
            <View style={styles.datesRow}>
              {fmtDate(order.createdAt)&&<Text style={[styles.dateChip,{fontSize:12}]}>📅 {fmtDate(order.createdAt)}</Text>}
              {order.deliveryDate?<Text style={[styles.dateChip,{fontSize:12,backgroundColor:'#fff3e0',color:'#e65100'}]}>🚚 {order.deliveryDate}</Text>:null}
              {fmtDate(order.prodAt)&&<Text style={[styles.dateChip,{fontSize:12}]}>🔨 {fmtDate(order.prodAt)}</Text>}
              {fmtDate(order.readyAt)&&<Text style={[styles.dateChip,{fontSize:12}]}>✅ {fmtDate(order.readyAt)}</Text>}
            </View>
            <PhaseBadges order={order} />
            {isReadyForTransfer && <View style={{marginTop:8}}><BlinkingReadyBadge onPress={()=>transferOrderToReady(order.id)} /></View>}
            <View style={{flexDirection:'row', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginTop:8}}>
            {order.docCount > 0 ? (
              <TouchableOpacity onPress={()=>openDocViewer(order)} style={{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#43a047',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                <Text style={{fontSize:13,fontWeight:'bold',color:'#2e7d32'}}>📎 ΠΡΟΒΟΛΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ</Text>
                <View style={{backgroundColor:'#2e7d32',borderRadius:10,minWidth:20,paddingHorizontal:5,paddingVertical:1}}><Text style={{color:'#fff',fontSize:12,fontWeight:'900',textAlign:'center'}}>{order.docCount}</Text></View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={()=>openDocQR(order,'add')} style={{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#bbb',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                <Text style={{fontSize:13,fontWeight:'bold',color:'#555'}}>📎 ΚΑΤΑΧΩΡΗΣΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ</Text>
              </TouchableOpacity>
            )}
            {isForeman ? null : (order.priceList||[]).length ? (
              isSeller ? (
                <View style={{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#2e7d32',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                  {(order.priceList||[]).some(it=>String(it?.label||'').trim()&&!String(it?.value||'').trim())?<Text style={{color:'#d32f2f',fontSize:15,fontWeight:'900'}}>●</Text>:null}
                  <Text style={{fontSize:13,fontWeight:'bold',color:'#2e7d32'}}>💶 ΤΙΜΕΣ — <Text style={{color:(priceFinalTotal(order.priceList, order.priceDiscount) < priceCatalogTotal(order.priceList) - 0.005)?'#d32f2f':'#2e7d32'}}>{priceFinalTotal(order.priceList, order.priceDiscount).toFixed(2).replace('.', ',')}€</Text></Text>
                </View>
              ) : (
                <TouchableOpacity onPress={()=>setPriceModal({visible:true, order})} style={{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,backgroundColor:'#e8f5e9',borderWidth:1,borderColor:'#2e7d32',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                  {(order.priceList||[]).some(it=>String(it?.label||'').trim()&&!String(it?.value||'').trim())?<Text style={{color:'#d32f2f',fontSize:15,fontWeight:'900'}}>●</Text>:null}
                  <Text style={{fontSize:13,fontWeight:'bold',color:'#2e7d32'}}>💶 ΤΙΜΕΣ — <Text style={{color:(priceFinalTotal(order.priceList, order.priceDiscount) < priceCatalogTotal(order.priceList) - 0.005)?'#d32f2f':'#2e7d32'}}>{priceFinalTotal(order.priceList, order.priceDiscount).toFixed(2).replace('.', ',')}€</Text></Text>
                </TouchableOpacity>
              )
            ) : (isSeller ? null : (
              <TouchableOpacity onPress={()=>setPriceModal({visible:true, order})} style={{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#bbb',borderRadius:8,paddingHorizontal:10,paddingVertical:6}}>
                <Text style={{fontSize:13,fontWeight:'bold',color:'#555'}}>💶 ΚΑΤΑΧΩΡΗΣΗ ΤΙΜΩΝ</Text>
              </TouchableOpacity>
            ))}
            </View>
          </View>
        </View>
        {!isForeman && !isArchive && anyChannel && (
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
          {!isForeman&&!isArchive&&(order.status==='PENDING'||order.status==='PROD')&&<TouchableOpacity style={[styles.upperBtn,{backgroundColor:'#007AFF'}]} delayLongPress={2000} onLongPress={()=>{ setEditForm({ h:order.h||'', w:order.w||'', deliveryDate:order.deliveryDate||'', lock:order.lock||'', glassDim:order.glassDim||'', glassNotes:order.glassNotes||'', glassDesign:order.glassDesign||'', hardware:order.hardware||'', casePaint:order.casePaint||'', coatings:order.coatings||[], coatingDetails:order.coatingDetails||{}, stavera:order.stavera||[], placement:order.placement||'ΟΧΙ', notes:order.notes||'' }); setEditModal({visible:true,order}); }} onPress={()=>{ if(Platform.OS==='web') window.alert('Κράτα πατημένο 2 δευτερόλεπτα για επεξεργασία'); }}><Text style={[styles.upperBtnText,{color:'white'}]}>✏️</Text></TouchableOpacity>}
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
            {highlightText('#'+order.orderNo+noTag(order), searchQuery, [styles.cardDetails,{fontWeight:'bold',fontSize:14}])}
            {order.customer?highlightText('👤 '+order.customer, searchQuery, [styles.cardSubDetails,{marginTop:2,fontSize:13}]):null}
            {highlightText(`${order.h}x${order.w} | ${order.side}${!isStd?` | ${order.armor} ΘΩΡ.`:''}`, searchQuery, [styles.cardDetails,{fontSize:14}])}
            {!isStd&&(
              <Text style={[styles.cardSubDetails,{fontSize:13}]}>
                Μεντ: {order.hinges}
                {(order.glassDim||order.glassNotes)?` | Τζ: ${order.glassDim||''}${order.glassDesign?' '+order.glassDesign:''}${order.glassNotes?' '+order.glassNotes:''}`:''}
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
            {!isStd&&order.stavera&&order.stavera.filter(s=>s.dim).length>0&&highlightText(`📐 Σταθ: ${order.stavera.filter(s=>s.dim).map(s=>(s.qty?`${s.qty}τεμ `:'')+stavParts(s)+(s.note?' '+s.note:'')).join(' | ')}`, searchQuery, [styles.cardSubDetails,{fontSize:13}])}
            {order.qty&&parseInt(order.qty)>1?<Text style={[styles.cardSubDetails,{color:'#007AFF',fontWeight:'bold',fontSize:13}]}>Τεμ: {order.qty}</Text>:null}
            {order.coatings&&order.coatings.length>0&&(
              <View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap'}}>
                <Text style={[styles.cardSubDetails,{color:'#007AFF',fontSize:13}]}>
                  {'🎨 '}
                  {order.coatings.map((n,i)=>(<Text key={i} style={[{fontSize:13,color:'#007AFF'}, coatingStyle(n,13)]}>{i>0?', ':''}{n}</Text>))}
                </Text>
                {phaseKey==='epend'&&hasAnyCoatingDetails(order)&&(
                  <TouchableOpacity onPress={()=>setCoatDetailsModal({visible:true,order})} style={{marginLeft:6,backgroundColor:'#d32f2f',borderRadius:4,width:18,height:18,alignItems:'center',justifyContent:'center'}}>
                    <Text style={{color:'white',fontWeight:'900',fontSize:12,lineHeight:14}}>i</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {order.casePaint?<Text style={[styles.cardSubDetails,{fontSize:13}]}><Text style={{fontWeight:'bold'}}>Βαφή: </Text>{order.casePaint}</Text>:null}
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
          {!isForeman&&<TouchableOpacity
            style={{backgroundColor:'#007AFF', borderRadius:6, padding:8, alignItems:'center', minWidth:50}}
            delayLongPress={2000}
            onLongPress={()=>{ setEditForm({ h:order.h||'', w:order.w||'', deliveryDate:order.deliveryDate||'', lock:order.lock||'', glassDim:order.glassDim||'', glassNotes:order.glassNotes||'', glassDesign:order.glassDesign||'', hardware:order.hardware||'', casePaint:order.casePaint||'', coatings:order.coatings||[], coatingDetails:order.coatingDetails||{}, stavera:order.stavera||[], placement:order.placement||'ΟΧΙ', notes:order.notes||'' }); setEditModal({visible:true,order}); }}
            onPress={()=>{ if(Platform.OS==='web') window.alert('Κράτα πατημένο 2 δευτερόλεπτα για επεξεργασία'); }}>
            <Text style={{color:'white',fontWeight:'bold',fontSize:14}}>✏️</Text>
          </TouchableOpacity>}
          {/* DONE + οπτικά ticks επενδύσεων αριστερά (μόνο για ΕΠΕΝΔΥΣΕΙΣ με 2+ επενδύσεις) */}
          <View style={{flexDirection:'row', alignItems:'stretch', gap:4}}>
            {phaseKey === 'epend' && (order.coatings||[]).filter(c=>c&&String(c).trim()).length >= 1 && (
              <View style={{flexDirection:'column', gap:3, justifyContent:'space-between'}}>
                {(order.coatings||[]).filter(c=>c&&String(c).trim()).map((_, i) => {
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
        <td style="min-width:140px">${notesHtmlWithExtras(o)}</td>
      </tr>`;
    }).join('');

    const tableCSS = `
      body{font-family:Arial,sans-serif;margin:5mm;color:#000;background:#fff;}
      h1{font-size:15px;margin-bottom:2px;font-weight:bold;}
      h2{font-size:11px;margin-top:0;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;font-size:10px;}
      th{padding:5px 4px;text-align:left;border-top:2px solid #000;border-bottom:1px solid #000;font-weight:bold;white-space:nowrap;}
      td{padding:5px 4px;border-bottom:1px solid #000;vertical-align:top;}
      td:first-child{white-space:nowrap;word-break:keep-all;overflow-wrap:normal;}
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
    const prodOrders = specialOrders.filter(o=>o.status==='PROD'&&sellerOwnsOrder(o)).sort((a,b)=>(b.prodAt||0)-(a.prodAt||0));
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
        if (isSeller) return null;
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
            {/* 3α: Κουμπί ΑΡΙΘΜΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ */}
            <TouchableOpacity
              style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#e8f0fe', borderRadius:8, borderWidth:1, borderColor:'#4a90d9'}}
              onPress={async ()=>{
                const readyMontOnly = activeProdPhase==='montDoor' && montReadyFilter;
                const readyEpendOnly = activeProdPhase==='epend' && epRdyFilter;
                const prodWithProgram = specialOrders.filter(o=>o.status==='PROD' && o.programNo && (!readyMontOnly || isReadyForMont(o)) && (!readyEpendOnly || isReadyForEpend(o)));
                if (prodWithProgram.length === 0) {
                  const msg = readyMontOnly ? 'Δεν υπάρχουν έτοιμες προς μοντάρισμα παραγγελίες με αριθμό προγράμματος.' : readyEpendOnly ? 'Δεν υπάρχουν έτοιμες για επένδυση παραγγελίες με αριθμό προγράμματος.' : 'Δεν υπάρχουν παραγγελίες στην παραγωγή με αριθμό προγράμματος.';
                  if (Platform.OS==='web') window.alert(msg);
                  else Alert.alert("Προσοχή", msg);
                  return;
                }
                // Έλεγχος unique programNo
                const uniquePrograms = [...new Set(prodWithProgram.map(o=>o.programNo))];
                if (uniquePrograms.length >= 2) {
                  // Πολλαπλά προγράμματα → άνοιγμα modal επιλογής, με την τρέχουσα φάση ώστε να εκτυπωθούν οι σωστές σελίδες
                  setPrintProgramModal({ visible: true, programs: uniquePrograms, selected: null, phaseKey: activeProdPhase, readyOnly: readyMontOnly || readyEpendOnly });
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
                  td:first-child{white-space:nowrap;word-break:keep-all;overflow-wrap:normal;}
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
            {activeProdPhase==='epend' && (
              <>
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor: epRdyFilter?'#FF9800':'#fff3e0', borderRadius:8, borderWidth:1, borderColor:'#FF9800'}}
                onPress={()=>{
                  const next = !epRdyFilter;
                  setEpRdyFilter(next);
                  setPrintSelected(prev=>{
                    const upd = {...prev};
                    phaseOrders.filter(isReadyForEpend).forEach(o=>{ upd[o.id] = next; });
                    return upd;
                  });
                }}>
                <Text style={{fontSize:14,fontWeight:'bold',color: epRdyFilter?'white':'#e65100'}}>🎨 ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flexDirection:'row', alignItems:'center', gap:5, paddingVertical:10, paddingHorizontal:10, backgroundColor:'#1a1a2e', borderRadius:8}}
                onPress={async()=>{
                  const selected = phaseOrders.filter(o=>printSelected[o.id]);
                  const list = (selected.length>0?selected:phaseOrders.filter(isReadyForEpend)).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                  if (list.length===0) { Alert.alert('Προσοχή','Δεν υπάρχουν επιλεγμένες παραγγελίες.'); return; }
                  const html = buildEpendSpecialHtml(list);
                  await printHTML(html, 'VAICON — ΕΚΤΥΠΩΣΗ ΠΡΟΣ ΠΑΡΑΓΩΓΗ');
                }}>
                <Text style={{fontSize:14,fontWeight:'bold',color:'#FFD600'}}>🖨️ ΠΡΟΣ ΠΑΡΑΓΩΓΗ</Text>
              </TouchableOpacity>
              </>
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

          <ScrollView style={{flex:1}} contentContainerStyle={{paddingBottom:8}}>
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

          {/* Ημερολόγιο: ολοκληρώσεις επιλεγμένης φάσης (σε τεμάχια) */}
          {activeProdPhase!=='stavera' && (
            <View style={{padding:8, borderTopWidth:1, borderTopColor:'#e0e0e0'}}>
              <MiniCalendar
                title={`ΟΛΟΚΛΗΡΩΣΕΙΣ — ${(PHASES.find(p=>p.key===activeProdPhase)?.label||'').replace(/🔴|🟡|🔵|⚫|🟠|🟢/g,'').trim()}`}
                series={[{ color:'#2e7d32', data: calData([...specialOrders, ...soldSpecialOrders].filter(sellerOwnsOrder), o=>phaseDoneAt(o, activeProdPhase)) }]}
                selectedTs={dayModal.mode==='prod'?dayModal.ts:null}
                onPickDay={(ts)=>setDayModal({visible:true, ts, mode:'prod', phaseKey:activeProdPhase})}
              />
            </View>
          )}

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
                autoComplete="off"
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
          </ScrollView>
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
                  prodOrders.filter(o=>matchesSearch(o, prodSearch)).filter(o=>!(ph.key==='montDoor' && montReadyFilter) || isReadyForMont(o)).filter(o=>!(ph.key==='epend' && epRdyFilter) || isReadyForEpend(o)).map(o=>renderProdPhaseCard(o, ph.key, prodSearch))
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
                        onPress={()=>{
                          const doDel = async()=>{ setSpecialOrders(specialOrders.filter(x=>x.id!==o.id)); await deleteFromCloud(o.id); };
                          if (Platform.OS==='web') { if (window.confirm(`Διαγραφή παραγγελίας #${o.orderNo};`)) doDel(); }
                          else Alert.alert("⚠️ Διαγραφή",`Διαγραφή παραγγελίας #${o.orderNo};`,[{text:"ΑΚΥΡΟ",style:"cancel"},{text:"ΔΙΑΓΡΑΦΗ",style:"destructive",onPress:doDel}]);
                        }}>
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
      <Modal visible={showHardwarePicker} transparent animationType="fade" onRequestClose={()=>setShowHardwarePicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setShowHardwarePicker(false)} style={{flex:1}}>
          {(()=>{ const W=Math.min(300,SCREEN_WIDTH-12); const {left,top,maxH}=popupPos(W,90);
            return (
            <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#8B0000',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
              <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΧΡΩΜΑ ΕΞΑΡΤΗΜΑΤΩΝ</Text>
              <ScrollView style={{maxHeight:maxH}}>
                {['Nikel','Bronze','Nikel Best','Bronze Best','Best Παραγγελία',''].map((c,i)=>{
                  const curHardware = pickerEditMode ? editForm.hardware : customForm.hardware;
                  const setHardware = (v) => pickerEditMode ? setEditForm(f=>({...f,hardware:v})) : setCustomForm({...customForm,hardware:v});
                  return (
                  <TouchableOpacity key={i}
                    style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                    onPress={()=>{ if(c===''){setShowCustomHardwareInput(true);setCustomHardwareText('');} else {setHardware(c);setShowCustomHardwareInput(false);setShowHardwarePicker(false);} }}>
                    <Text style={{fontSize:13,color:c?'#000':'#888'}}>{c||'Άλλο (γράψτε εδώ)...'}</Text>
                    {curHardware===c&&c!==''&&<Text style={{color:'#00C851',fontSize:16}}>✓</Text>}
                  </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {showCustomHardwareInput&&(
                <View style={{padding:9,borderTopWidth:1,borderTopColor:'#eee',backgroundColor:'#f9f9f9'}}>
                  <TextInput autoFocus
                    style={{backgroundColor:'#fff',padding:8,borderRadius:8,borderWidth:1.5,borderColor:'#8B0000',fontSize:13}}
                    placeholder="Γράψτε χρώμα εξαρτημάτων..." placeholderTextColor="#aaa"
                    value={customHardwareText} onChangeText={v=>setCustomHardwareText(v)} returnKeyType="done"/>
                  <TouchableOpacity style={{backgroundColor:'#8B0000',padding:9,borderRadius:8,alignItems:'center',marginTop:6}}
                    onPress={()=>{ if(customHardwareText.trim()){ if(pickerEditMode) setEditForm(f=>({...f,hardware:customHardwareText.trim()})); else setCustomForm({...customForm,hardware:customHardwareText.trim()}); } setShowCustomHardwareInput(false);setShowHardwarePicker(false); }}>
                    <Text style={{color:'white',fontWeight:'bold',fontSize:13}}>ΟΚ</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            ); })()}
        </TouchableOpacity>
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

      {/* FLOATING ΗΜΕΡΟΛΟΓΙΟ ΕΤΟΙΜΩΝ (σερνόμενο) */}
      {activeSection==='ready' && (()=>{
        const monthNames=['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
        const startOfDay=(ts)=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();};
        const mDate=new Date(readyMonth); const year=mDate.getFullYear(), month=mDate.getMonth();
        const readyList=specialOrders.filter(o=>o.status==='READY'&&sellerOwnsOrder(o)&&o.readyAt);
        const counts={}; readyList.forEach(o=>{const d=new Date(o.readyAt); if(d.getFullYear()===year&&d.getMonth()===month) counts[d.getDate()]=(counts[d.getDate()]||0)+1;});
        const firstDow=(new Date(year,month,1).getDay()+6)%7; const daysInMonth=new Date(year,month+1,0).getDate();
        const cells=[]; for(let i=0;i<firstDow;i++)cells.push(null); for(let d=1;d<=daysInMonth;d++)cells.push(d);
        const years=[...new Set(readyList.map(o=>new Date(o.readyAt).getFullYear()))].sort((a,b)=>b-a);
        const lo=readyFrom, hi=readyTo!=null?readyTo:readyFrom;
        const pickDay=(ts)=>{ if(readyFrom==null||readyTo!=null){setReadyFrom(ts);setReadyTo(null);} else if(ts<readyFrom){setReadyTo(readyFrom);setReadyFrom(ts);} else setReadyTo(ts); };
        const selCount=lo!=null?readyList.filter(o=>{const t=startOfDay(o.readyAt);return t>=lo&&t<=hi;}).length:0;
        return (
          <View style={{position:'absolute', top:120+calPos.y, left:`calc(100% - 372px + ${calPos.x}px)`, width:352, backgroundColor:'#fff', borderRadius:12, elevation:24, zIndex:1500, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.4, shadowRadius:10, borderWidth:1, borderColor:'#00C851'}}>
            <View style={{backgroundColor:'#00C851', borderTopLeftRadius:12, borderTopRightRadius:12, paddingHorizontal:10, paddingVertical:9, flexDirection:'row', alignItems:'center', justifyContent:'space-between', cursor:'grab'}}
              {...(Platform.OS==='web'?{onMouseDown:handleCalDragStart, onTouchStart:handleCalDragStart}:{})}>
              <Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>📅 ΗΜΕΡΟΛΟΓΙΟ ΕΤΟΙΜΩΝ{lo!=null?` · ${selCount}`:''}</Text>
              {lo!=null && <TouchableOpacity onPress={()=>{setReadyFrom(null);setReadyTo(null);}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>✕ Καθάρισμα</Text></TouchableOpacity>}
            </View>
            <View style={{padding:10}}>
              <View style={{flexDirection:'row', alignItems:'center', marginBottom:6}}>
                <TouchableOpacity onPress={()=>setReadyMonth(new Date(year,month-1,1).getTime())} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:8,backgroundColor:'#333'}}><Text style={{color:'white',fontWeight:'bold'}}>◀</Text></TouchableOpacity>
                <Text style={{fontSize:14,fontWeight:'bold',color:'#333',marginHorizontal:6,flex:1,textAlign:'center'}}>{monthNames[month]} {year}</Text>
                <TouchableOpacity onPress={()=>setReadyMonth(new Date(year,month+1,1).getTime())} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:8,backgroundColor:'#333'}}><Text style={{color:'white',fontWeight:'bold'}}>▶</Text></TouchableOpacity>
                <TouchableOpacity onPress={()=>setReadyMonth(new Date().getTime())} style={{paddingHorizontal:10,paddingVertical:6,borderRadius:8,backgroundColor:'#2e7d32',marginLeft:6}}><Text style={{color:'white',fontWeight:'bold',fontSize:12}}>Σήμερα</Text></TouchableOpacity>
              </View>
              {years.length>1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:6}} contentContainerStyle={{gap:6, alignItems:'center'}}>
                {years.map(y=>(<TouchableOpacity key={y} onPress={()=>setReadyMonth(new Date(y,month,1).getTime())} style={{paddingHorizontal:10,paddingVertical:5,borderRadius:16,backgroundColor:y===year?'#333':'#e0e0e0'}}><Text style={{color:y===year?'white':'#555',fontWeight:'bold',fontSize:12}}>{y}</Text></TouchableOpacity>))}
              </ScrollView>}
              <View style={{flexDirection:'row'}}>
                {['Δε','Τρ','Τε','Πε','Πα','Σα','Κυ'].map(w=>(<View key={w} style={{flex:1,alignItems:'center',paddingVertical:2}}><Text style={{fontSize:10,fontWeight:'bold',color:'#888'}}>{w}</Text></View>))}
              </View>
              <View style={{flexDirection:'row',flexWrap:'wrap'}}>
                {cells.map((d,i)=>{
                  if(d===null) return <View key={'e'+i} style={{width:`${100/7}%`,padding:2}} />;
                  const c=counts[d]||0; const cellTs=new Date(year,month,d).getTime();
                  const inRange=readyFrom!=null&&cellTs>=lo&&cellTs<=hi; const isToday=cellTs===startOfDay(Date.now());
                  return (<View key={d} style={{width:`${100/7}%`,padding:2}}>
                    <TouchableOpacity disabled={c===0} onPress={()=>pickDay(cellTs)} style={{minHeight:34,borderRadius:6,alignItems:'center',justifyContent:'center',backgroundColor:inRange?'#333':(isToday?'#2e7d32':(c>0?'#e8f5e9':'#f5f5f5')),borderWidth:(c>0||isToday)?1.5:1,borderColor:inRange?'#333':(isToday?'#2e7d32':(c>0?'#a5d6a7':'#eee'))}}>
                      <Text style={{fontSize:12,fontWeight:'bold',color:(inRange||isToday)?'white':'#333'}}>{d}</Text>
                      {c>0&&<Text style={{fontSize:13,fontWeight:'900',color:(inRange||isToday)?'#fff':'#2e7d32'}}>{c}</Text>}
                    </TouchableOpacity>
                  </View>);
                })}
              </View>
            </View>
          </View>
        );
      })()}

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
                  const mode = printProgramModal.mode;
                  setPrintProgramModal({visible:false, programs:[], selected:null, phaseKey:null});

                  if (mode === 'pending') {
                    const visible = specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone));
                    const filtered = visible.filter(o=>o.programNo===selectedPNo).sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0));
                    if (filtered.length === 0) { Alert.alert('Προσοχή', `Δεν υπάρχουν παραγγελίες με πρόγραμμα ${selectedPNo}.`); return; }
                    await handleSimplePrint(filtered, `ΠΡΟΓΡΑΜΜΑ ${selectedPNo}`);
                    return;
                  }

                  if (phaseKey) {
                    // Εκτύπωση συγκεκριμένης φάσης με φιλτράρισμα programNo
                    const prodOrders = specialOrders.filter(o=>o.status==='PROD');
                    const readyFn = phaseKey==='epend' ? isReadyForEpend : isReadyForMont;
                    const filteredOrders = prodOrders.filter(o=>o.programNo===selectedPNo && o.phases?.[phaseKey]?.active && (!readyOnly || readyFn(o)));
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

      {/* ΠΡΟΒΟΛΗ ΕΓΓΡΑΦΩΝ ΠΕΛΑΤΗ */}
      <Modal visible={docViewer.visible} transparent animationType="slide" onRequestClose={()=>setDocViewer(v=>({...v,visible:false}))}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', alignItems:'center'}}>
          <View style={[
            { width: docWinSize.w, height: docWinSize.h, maxWidth:'98%', backgroundColor:'#fff', borderRadius:16, overflow:'hidden', elevation:24, shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:12 },
            Platform.OS==='web' ? { position:'absolute', top: 30 + docWinPos.y, left: `calc(50% - ${docWinSize.w/2}px + ${docWinPos.x}px)` } : {},
          ]}>
            <View
              style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingVertical:12, backgroundColor:'#0d47a1', ...(Platform.OS==='web'?{cursor:'grab'}:{})}}
              {...(Platform.OS==='web' ? { onMouseDown: startDocDrag('move'), onTouchStart: startDocDrag('move') } : {})}>
              <Text style={{fontSize:15, fontWeight:'bold', color:'#fff'}}>☰ 📎 ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ #{docViewer.orderNo}</Text>
              <TouchableOpacity onPress={()=>setDocViewer(v=>({...v,visible:false}))}><Text style={{fontSize:20, color:'#fff', fontWeight:'bold', paddingHorizontal:6}}>✕</Text></TouchableOpacity>
            </View>
            {docViewer.loading ? (
              <Text style={{textAlign:'center', padding:30, color:'#888'}}>Φόρτωση…</Text>
            ) : docViewer.photos.length===0 ? (
              <View style={{alignItems:'center', padding:20}}>
                <Text style={{color:'#888', marginBottom:16}}>Δεν υπάρχουν έγγραφα.</Text>
                <TouchableOpacity style={{backgroundColor:'#1565C0', borderRadius:8, paddingHorizontal:18, paddingVertical:10}} onPress={()=>{ const o=[...specialOrders,...soldSpecialOrders,...specialQuotes].find(x=>x.id===docViewer.orderId) || (docViewer.orderId===formSubIdRef.current ? {id:docViewer.orderId, _sellerSub:true} : null); if(o) openDocQR(o,'add'); }}><Text style={{color:'#fff', fontWeight:'bold'}}>➕ ΠΡΟΣΘΗΚΗ</Text></TouchableOpacity>
              </View>
            ) : (()=>{
              const baseDoc = Math.max(220, Math.min(docWinSize.w - 56, docWinSize.h - 250));
              const dragImg = Platform.OS==='web' && docViewer.zoom>1;
              return (
              <View style={{flex:1, padding:12}}>
                <View
                  style={{flex:1, borderRadius:8, backgroundColor:'#000', overflow:'hidden', justifyContent:'center', alignItems:'center', ...(dragImg?{cursor:'grab'}:{})}}
                  {...(dragImg ? { onMouseDown: startDocDrag('pan'), onTouchStart: startDocDrag('pan') } : {})}>
                  <Image source={{uri:docViewer.photos[docViewer.idx]?.img}} style={{width:baseDoc*docViewer.zoom, height:baseDoc*docViewer.zoom, transform:[{translateX:docImgPos.x},{translateY:docImgPos.y},{rotate:`${docViewer.rot}deg`}]}} resizeMode="contain" />
                </View>
                <View style={{flexDirection:'row', justifyContent:'center', alignItems:'center', gap:10, marginTop:8}}>
                  <TouchableOpacity onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v, zoom:Math.max(1, +(v.zoom-0.5).toFixed(1))}));}} style={{backgroundColor:'#eee', borderRadius:8, width:42, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:20, fontWeight:'bold', color:'#333'}}>🔍−</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>setDocViewer(v=>({...v, zoom:Math.min(5, +(v.zoom+0.5).toFixed(1))}))} style={{backgroundColor:'#eee', borderRadius:8, width:42, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:20, fontWeight:'bold', color:'#333'}}>🔍+</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>setDocViewer(v=>({...v, rot:(v.rot+90)%360}))} style={{backgroundColor:'#eee', borderRadius:8, width:42, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:20, fontWeight:'bold', color:'#333'}}>↻</Text></TouchableOpacity>
                  <TouchableOpacity onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v, zoom:1, rot:0}));}} style={{backgroundColor:'#eee', borderRadius:8, paddingHorizontal:12, height:38, alignItems:'center', justifyContent:'center'}}><Text style={{fontSize:13, fontWeight:'bold', color:'#333'}}>ΕΠΑΝΑΦΟΡΑ</Text></TouchableOpacity>
                </View>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
                  <TouchableOpacity disabled={docViewer.idx<=0} onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v,idx:v.idx-1, zoom:1, rot:0}));}} style={{padding:8, opacity:docViewer.idx<=0?0.3:1}}><Text style={{fontSize:20}}>◀</Text></TouchableOpacity>
                  <Text style={{fontWeight:'bold', color:'#555'}}>{docViewer.idx+1} / {docViewer.photos.length}</Text>
                  <TouchableOpacity disabled={docViewer.idx>=docViewer.photos.length-1} onPress={()=>{setDocImgPos({x:0,y:0});setDocViewer(v=>({...v,idx:v.idx+1, zoom:1, rot:0}));}} style={{padding:8, opacity:docViewer.idx>=docViewer.photos.length-1?0.3:1}}><Text style={{fontSize:20}}>▶</Text></TouchableOpacity>
                </View>
                <View style={{flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:10}}>
                  <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#1565C0', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>{ const o=[...specialOrders,...soldSpecialOrders,...specialQuotes].find(x=>x.id===docViewer.orderId) || (docViewer.orderId===formSubIdRef.current ? {id:docViewer.orderId, _sellerSub:true} : null); if(o) openDocQR(o,'add'); }}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>➕ ΠΡΟΣΘΗΚΗ</Text></TouchableOpacity>
                  <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#f9a825', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>{ const o=[...specialOrders,...soldSpecialOrders,...specialQuotes].find(x=>x.id===docViewer.orderId) || (docViewer.orderId===formSubIdRef.current ? {id:docViewer.orderId, _sellerSub:true} : null); const ph=docViewer.photos[docViewer.idx]; if(o&&ph) openDocQR(o,'replace',ph.id); }}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🔄 ΑΝΤΙΚΑΤΑΣΤΑΣΗ</Text></TouchableOpacity>
                  {!isSeller && <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#2e7d32', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>printDocPhotos([docViewer.photos[docViewer.idx]], `Έγγραφο #${docViewer.orderNo}`, docViewer.rot)}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🖨️ ΕΚΤΥΠΩΣΗ</Text></TouchableOpacity>}
                  {!isSeller && docViewer.photos.length>1 && <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#1b5e20', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>printDocPhotos(docViewer.photos, `Έγγραφα #${docViewer.orderNo}`)}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🖨️ ΟΛΑ</Text></TouchableOpacity>}
                  <TouchableOpacity style={{flex:1, minWidth:120, backgroundColor:'#b71c1c', borderRadius:8, padding:10, alignItems:'center'}} onPress={()=>deleteDocPhoto(docViewer.orderId, docViewer.photos[docViewer.idx]?.id)}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🗑 ΔΙΑΓΡΑΦΗ</Text></TouchableOpacity>
                </View>
              </View>
              );
            })()}
            {Platform.OS==='web' && (
              <View
                style={{position:'absolute', right:0, bottom:0, width:24, height:24, backgroundColor:'rgba(0,0,0,0.18)', borderTopLeftRadius:8, cursor:'nwse-resize'}}
                onMouseDown={startDocDrag('resize')} onTouchStart={startDocDrag('resize')} />
            )}
          </View>
        </View>
      </Modal>

      {/* QR ΑΝΕΒΑΣΜΑΤΟΣ ΕΓΓΡΑΦΟΥ */}
      <Modal visible={docQR.visible} transparent animationType="fade" onRequestClose={()=>setDocQR(d=>({...d,visible:false}))}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center'}}>
          <View style={{backgroundColor:'#fff', borderRadius:16, padding:22, width:'85%', maxWidth:440, alignItems:'center'}}>
            <Text style={{fontSize:17, fontWeight:'bold', color:'#1a1a1a', marginBottom:6, textAlign:'center'}}>{docQR.mode==='replace'?'🔄 ΑΝΤΙΚΑΤΑΣΤΑΣΗ ΕΓΓΡΑΦΟΥ':'📎 ΚΑΤΑΧΩΡΗΣΗ ΕΓΓΡΑΦΟ ΠΕΛΑΤΗ'}</Text>
            {docQR.status==='done' ? (
              <View style={{alignItems:'center', width:'100%'}}>
                <Text style={{fontSize:40, marginVertical:12}}>✅</Text>
                <Text style={{fontSize:15, fontWeight:'bold', color:'#2e7d32', textAlign:'center', marginBottom:18}}>Η φωτό ανέβηκε!</Text>
                <View style={{flexDirection:'row', gap:8, width:'100%'}}>
                  <TouchableOpacity style={{flex:1, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#e0e0e0'}} onPress={()=>setDocQR(d=>({...d,visible:false}))}><Text style={{fontWeight:'bold', color:'#555'}}>ΚΛΕΙΣΙΜΟ</Text></TouchableOpacity>
                  <TouchableOpacity style={{flex:1, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#2e7d32'}} onPress={()=>{ const id=docQR.orderId; setDocQR(d=>({...d,visible:false})); const o=[...specialOrders,...soldSpecialOrders,...specialQuotes].find(x=>x.id===id) || (id===formSubIdRef.current ? {id, orderNo:''} : null); if(o) openDocViewer(o); }}><Text style={{fontWeight:'bold', color:'#fff'}}>ΠΡΟΒΟΛΗ</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{alignItems:'center', width:'100%'}}>
                <Text style={{fontSize:13, color:'#666', textAlign:'center', marginBottom:14}}>Σκάναρε τον κωδικό με το κινητό για να τραβήξεις φωτό.</Text>
                {docQR.url ? <Image source={{uri:makeQrDataUrl(docQR.url)}} style={{width:230, height:230}} resizeMode="contain" /> : null}
                <Text style={{fontSize:12, color:'#888', marginTop:10, textAlign:'center'}}>Ισχύει 5 λεπτά ή για μία φωτό.</Text>
                <Text style={{fontSize:13, color:'#1565C0', marginTop:8, fontWeight:'bold'}}>Αναμονή για φωτό…</Text>
                <TouchableOpacity style={{marginTop:16, padding:12, borderRadius:10, alignItems:'center', backgroundColor:'#e0e0e0', width:'100%'}} onPress={()=>setDocQR(d=>({...d,visible:false}))}><Text style={{fontWeight:'bold', color:'#555'}}>ΑΚΥΡΟ</Text></TouchableOpacity>
              </View>
            )}
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
        const nameMatch = (o, c) => o.customer && c.name && o.customer.trim().toLowerCase() === c.name.trim().toLowerCase();
        const notSold = (o) => o.status !== 'SOLD' && o.status !== 'STD_SOLD';
        const customerOrders = selectedCust
          ? (specialOrders||[]).filter(o => notSold(o)&&nameMatch(o, selectedCust)).sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
          : [];
        const stdCustomerOrders = selectedCust
          ? (lookupStdOrders||[]).filter(o => notSold(o)&&nameMatch(o, selectedCust)).sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
          : [];
        const totalCustomerOrders = customerOrders.length + stdCustomerOrders.length;
        const qSort = (a,b)=>(b.quotedAt||b.createdAt||0)-(a.quotedAt||a.createdAt||0);
        const specialCustomerQuotes = selectedCust ? (specialQuotes||[]).filter(o=>nameMatch(o, selectedCust)).sort(qSort) : [];
        const stdCustomerQuotes = selectedCust ? (lookupStdQuotes||[]).filter(o=>nameMatch(o, selectedCust)).sort(qSort) : [];
        const totalCustomerQuotes = specialCustomerQuotes.length + stdCustomerQuotes.length;
        const renderQuoteRow = (o, isStd) => {
          const createdFmt = (o.quotedAt||o.createdAt) ? new Date(o.quotedAt||o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
          return (
            <TouchableOpacity key={o.id} onPress={()=>setLookupOrderModal({ visible:true, order: isStd ? {...o, _std:true} : o })}
              style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor: isStd?'#ede7f6':'#f3e5f5'}}>
              <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                <Text style={{fontSize:14, fontWeight:'900', color:'#1a1a1a', minWidth:54}}>#{o.orderNo||'—'}</Text>
                <Text style={{fontSize:12, color:'#1a1a1a', fontWeight:'bold'}}>{o.h||'—'}×{o.w||'—'}</Text>
                <Text style={{fontSize:11, color:'#555'}}>{o.side||'—'}</Text>
                <Text style={{fontSize:11, color:'#555'}}>{isStd ? (o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ') : (o.armor||'—')}</Text>
                <View style={{backgroundColor:'#8e24aa', borderRadius:4, paddingHorizontal:6, paddingVertical:1, marginLeft:'auto'}}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:10}}>💼 ΠΡΟΣΦΟΡΑ</Text>
                </View>
              </View>
              {createdFmt ? <Text style={{fontSize:11, color:'#888', marginTop:3}}>📅 {createdFmt}</Text> : null}
            </TouchableOpacity>
          );
        };
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
                  autoComplete="off"
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
                      <Text style={{fontSize:11, color:'#777', marginTop:2}}>{totalCustomerOrders} παραγγελ{totalCustomerOrders===1?'ία':'ίες'} · ⭐ {customerOrders.length} / 🛡️ {stdCustomerOrders.length}{totalCustomerQuotes>0?` · 💼 ${totalCustomerQuotes} προσφ.`:''}</Text>
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
                      const orderCount = (specialOrders||[]).filter(o => notSold(o)&&nameMatch(o,c)).length + (lookupStdOrders||[]).filter(o => notSold(o)&&nameMatch(o,c)).length + (specialQuotes||[]).filter(o=>nameMatch(o,c)).length + (lookupStdQuotes||[]).filter(o=>nameMatch(o,c)).length;
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
                    {totalCustomerOrders === 0 && totalCustomerQuotes === 0 && (
                      <Text style={{color:'#aaa', fontSize:12, textAlign:'center', padding:20}}>Ο πελάτης δεν έχει παραγγελίες ή προσφορές.</Text>
                    )}
                    {customerOrders.length > 0 && (
                      <View style={{backgroundColor:'#ef6c00', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:6, marginBottom:2}}>
                        <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>⭐ ΕΙΔΙΚΕΣ ({customerOrders.length})</Text>
                      </View>
                    )}
                    {customerOrders.map(o => {
                      const tab = getOrderTabInfo(o);
                      const dims = `${o.h||'—'}×${o.w||'—'}`;
                      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                      return (
                        <TouchableOpacity key={o.id}
                          onPress={()=>setLookupOrderModal({ visible:true, order:o })}
                          style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor:'#fff8e1'}}>
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
                    {stdCustomerOrders.length > 0 && (
                      <View style={{backgroundColor:'#0d47a1', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:10, marginBottom:2}}>
                        <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>🛡️ ΤΥΠΟΠΟΙΗΜΕΝΕΣ ({stdCustomerOrders.length})</Text>
                      </View>
                    )}
                    {stdCustomerOrders.map(o => {
                      const tab = getOrderTabInfo(o);
                      const dims = `${o.h||'—'}×${o.w||'—'}`;
                      const createdFmt = o.createdAt ? new Date(o.createdAt).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
                      return (
                        <TouchableOpacity key={o.id}
                          onPress={()=>setLookupOrderModal({ visible:true, order:{...o, _std:true} })}
                          style={{padding:10, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor:'#e3f2fd'}}>
                          <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                            <Text style={{fontSize:14, fontWeight:'900', color:'#1a1a1a', minWidth:54}}>#{o.orderNo||'—'}</Text>
                            <Text style={{fontSize:12, color:'#1a1a1a', fontWeight:'bold'}}>{dims}</Text>
                            <Text style={{fontSize:11, color:'#555'}}>{o.side||'—'}</Text>
                            <Text style={{fontSize:11, color:'#555'}}>{o.sasiType==='ΔΙΠΛΗ ΘΩΡΑΚΙΣΗ'?'ΔΙΠΛΗ':'ΜΟΝΗ'}</Text>
                            <View style={{backgroundColor:tab.color, borderRadius:4, paddingHorizontal:6, paddingVertical:1, marginLeft:'auto'}}>
                              <Text style={{color:'white', fontWeight:'bold', fontSize:10}}>{tab.label}</Text>
                            </View>
                          </View>
                          <View style={{flexDirection:'row', alignItems:'center', gap:10, marginTop:3}}>
                            {createdFmt ? <Text style={{fontSize:11, color:'#888'}}>📅 {createdFmt}</Text> : null}
                            {o.lock ? <Text style={{fontSize:11, color:'#555'}} numberOfLines={1}>🔒 {o.lock}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    {specialCustomerQuotes.length > 0 && (
                      <View style={{backgroundColor:'#8e24aa', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:10, marginBottom:2}}>
                        <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>💼 ΠΡΟΣΦΟΡΕΣ ΕΙΔΙΚΩΝ ({specialCustomerQuotes.length})</Text>
                      </View>
                    )}
                    {specialCustomerQuotes.map(o=>renderQuoteRow(o, false))}
                    {stdCustomerQuotes.length > 0 && (
                      <View style={{backgroundColor:'#6a1b9a', borderRadius:6, paddingHorizontal:8, paddingVertical:4, marginTop:10, marginBottom:2}}>
                        <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>💼 ΠΡΟΣΦΟΡΕΣ ΤΥΠΟΠΟΙΗΜΕΝΩΝ ({stdCustomerQuotes.length})</Text>
                      </View>
                    )}
                    {stdCustomerQuotes.map(o=>renderQuoteRow(o, true))}
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
                <Text style={{color:'rgba(255,255,255,0.75)', fontSize:11, marginTop:2}}>{lookupOrderModal.order?._std?'🛡️ ΤΥΠΟΠΟΙΗΜΕΝΗ':'⭐ ΕΙΔΙΚΗ'} · Μόνο προβολή</Text>
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
                        {o.kypri ? <K label="ΚΥΠΡΙ" value={o.kypri}/> : null}
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
                        <K label="ΑΦΑΛΟΣ" value={o.cylinder}/>
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
                        const updatedPhase = { ...existingPhase, done: false, doneAt: null, active: forceActive ? true : existingPhase.active };
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

                      const newPhases = { ...order.phases, [c.phaseKey]: { ...order.phases[c.phaseKey], done: true, doneAt: Date.now() } };
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

      {/* ΠΑΡΑΘΥΡΟ ΚΛΕΙΔΑΡΙΑ / ΑΦΑΛΟΣ — αγκυρωμένο κάτω από το κουμπί (όπως τυποποιημένες) */}
      <Modal visible={showLockPicker} transparent animationType="fade" onRequestClose={()=>setShowLockPicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setShowLockPicker(false)} style={{flex:1}}>
          {(()=>{ const W=Math.min(480,SCREEN_WIDTH-12);
            const left=lockAnchor?Math.max(6,Math.min(lockAnchor.x,SCREEN_WIDTH-W-6)):6;
            const top=lockAnchor?Math.max(6,lockAnchor.y-24):80;
            return (
            <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#8B0000',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
              <View style={{flexDirection:'row'}}>
                <View style={{flex:2,borderRightWidth:1,borderRightColor:'#eee'}}>
                  <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΚΛΕΙΔΑΡΙΕΣ</Text>
                  <ScrollView style={{maxHeight:240}}>
                    <TouchableOpacity style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                      onPress={()=>{setLockEditText('');setCustomForm(f=>({...f,lock:''}));}}>
                      <Text style={{fontSize:12,color:'#888'}}>— Χωρίς</Text>
                      {!customForm.lock&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
                    </TouchableOpacity>
                    {(locks||[]).map(l=>{ const base=l.name+(l.type?' ('+l.type+')':''); return (
                      <TouchableOpacity key={l.id} style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                        onPress={()=>{setLockEditText(base);setCustomForm(f=>({...f,lock:base}));}}>
                        <View style={{flex:1}}>
                          <Text style={{fontSize:12,color:'#000',fontWeight:'600'}}>{l.name}</Text>
                          {l.type?<Text style={{fontSize:11,color:'#666'}}>{l.type}</Text>:null}
                        </View>
                        {(customForm.lock||'').startsWith(base)&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
                      </TouchableOpacity>
                    );})}
                    {(locks||[]).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:14,fontSize:11}}>Καμία κλειδαριά.</Text>}
                  </ScrollView>
                </View>
                <View style={{flex:1.6}}>
                  <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΑΦΑΛΟΙ</Text>
                  <ScrollView style={{maxHeight:240}}>
                    <TouchableOpacity style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                      onPress={()=>{setCylEditText('');setCustomForm(f=>({...f,cylinder:''}));}}>
                      <Text style={{fontSize:12,color:'#888'}}>— Χωρίς</Text>
                      {!customForm.cylinder&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
                    </TouchableOpacity>
                    {(cylinders||[]).map(c=>(
                      <TouchableOpacity key={c.id} style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                        onPress={()=>{setCylEditText(c.name);setCustomForm(f=>({...f,cylinder:c.name}));}}>
                        <Text style={{fontSize:12,color:'#000',fontWeight:'600',flex:1}}>{c.name}</Text>
                        {(customForm.cylinder||'').startsWith(c.name)&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                    {(cylinders||[]).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:14,fontSize:11}}>Κανένας άφαλος.</Text>}
                  </ScrollView>
                </View>
              </View>
              <View style={{padding:9,borderTopWidth:1,borderTopColor:'#eee',backgroundColor:'#f9f9f9'}}>
                <TextInput style={{backgroundColor:'#fff',borderWidth:1.5,borderColor:'#8B0000',borderRadius:8,padding:7,fontSize:13,color:'#1a1a1a',marginBottom:6}}
                  placeholder="Κλειδαριά (κείμενο)" placeholderTextColor="#aaa"
                  value={lockEditText} onChangeText={v=>{setLockEditText(v);setCustomForm(f=>({...f,lock:v}));}} returnKeyType="done"/>
                <TextInput style={{backgroundColor:'#fff',borderWidth:1.5,borderColor:'#8B0000',borderRadius:8,padding:7,fontSize:13,color:'#1a1a1a',marginBottom:6}}
                  placeholder="Άφαλος (κείμενο)" placeholderTextColor="#aaa"
                  value={cylEditText} onChangeText={v=>{setCylEditText(v);setCustomForm(f=>({...f,cylinder:v}));}} returnKeyType="done" onSubmitEditing={()=>setShowLockPicker(false)}/>
                <TouchableOpacity style={{backgroundColor:'#8B0000',padding:9,borderRadius:8,alignItems:'center'}} onPress={()=>setShowLockPicker(false)}>
                  <Text style={{color:'white',fontWeight:'bold',fontSize:13}}>✓ ΟΚ</Text>
                </TouchableOpacity>
              </View>
            </View>
            ); })()}
        </TouchableOpacity>
      </Modal>

      {/* ΠΑΡΑΘΥΡΟ ΔΙΑΦΟΡΑ — πολλαπλή επιλογή (κοινή λίστα ΔΙΑΦΟΡΑ, flag Ειδ) */}
      <Modal visible={showMiscPicker} transparent animationType="fade" onRequestClose={()=>setShowMiscPicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setShowMiscPicker(false)} style={{flex:1}}>
          {(()=>{ const W=Math.min(320,SCREEN_WIDTH-12); const {left,top,maxH}=popupPos(W,100);
            return (
            <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#8B0000',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
              <Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#FBEEEE'}}>ΔΙΑΦΟΡΑ — πολλαπλή επιλογή</Text>
              <ScrollView style={{maxHeight:maxH}}>
                {(misc||[]).filter(m=>m&&m.showEid).sort((a,b)=>(a.order??a.createdAt)-(b.order??b.createdAt)).map(it=>{
                  const on=(customForm.misc||[]).includes(it.name);
                  return (
                    <TouchableOpacity key={it.id||it.name}
                      style={{paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:on?'#FFF6D6':'#fff'}}
                      onPress={()=>{const cur=customForm.misc||[];setCustomForm({...customForm,misc:cur.includes(it.name)?cur.filter(x=>x!==it.name):[...cur,it.name]});}}>
                      <Text style={{fontSize:12,color:on?'#8B0000':'#1a1a1a',fontWeight:on?'700':'500',flex:1}} numberOfLines={2}>{it.name}</Text>
                      {!!String(it.price||'').trim()&&<Text style={{fontSize:11,fontWeight:'700',color:'#8B0000',marginHorizontal:4}}>€{it.price}</Text>}
                      {on&&<Text style={{color:'#00C851',fontSize:14}}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
                {(misc||[]).filter(m=>m&&m.showEid).length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:14,fontSize:12}}>Δεν υπάρχουν είδη. Τσέκαρε «Ειδ» στο μενού 📦 ΔΙΑΦΟΡΑ.</Text>}
              </ScrollView>
              <TouchableOpacity style={{margin:8,padding:9,backgroundColor:'#8B0000',borderRadius:8,alignItems:'center'}} onPress={()=>setShowMiscPicker(false)}>
                <Text style={{color:'white',fontWeight:'bold',fontSize:13}}>ΚΑΤΑΧΩΡΗΣΗ</Text>
              </TouchableOpacity>
            </View>
            ); })()}
        </TouchableOpacity>
      </Modal>

      {/* ΠΑΡΑΘΥΡΟ ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ — χρώμα (κοινή λίστα ΔΙΑΦΟΡΑ) */}
      <Modal visible={showStavColPicker} transparent animationType="fade" onRequestClose={()=>setShowStavColPicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setShowStavColPicker(false)} style={{flex:1}}>
          {(()=>{ const W=Math.min(300,SCREEN_WIDTH-12); const {left,top,maxH}=popupPos(W,50);
            return (
            <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#5D4037',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
              <Text style={{fontSize:11,fontWeight:'700',color:'#5D4037',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#F1E9E3'}}>ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ — ΧΡΩΜΑ</Text>
              <ScrollView style={{maxHeight:maxH}}>
                <TouchableOpacity style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}
                  onPress={()=>{setCustomForm(f=>({...f,stavColumn:null}));setShowStavColPicker(false);}}>
                  <Text style={{fontSize:13,color:'#888'}}>— Καμία</Text>
                  {!customForm.stavColumn?.name&&<Text style={{color:'#00C851',fontSize:16}}>✓</Text>}
                </TouchableOpacity>
                {(misc||[]).filter(m=>m&&m.link==='stavCol').sort((a,b)=>(a.order??a.createdAt)-(b.order??b.createdAt)).map(it=>{
                  const sel=customForm.stavColumn?.name===it.name;
                  return (
                    <TouchableOpacity key={it.id||it.name}
                      style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:sel?'#F1E9E3':'#fff'}}
                      onPress={()=>{setCustomForm(f=>({...f,stavColumn:{name:it.name,qty:f.stavColumn?.qty||'1'}}));setShowStavColPicker(false);}}>
                      <Text style={{fontSize:13,color:'#000',fontWeight:'600',flex:1}}>{String(it.name).replace('ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ','')}</Text>
                      <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                        {!!String(it.price||'').trim()&&<Text style={{fontSize:12,fontWeight:'700',color:'#5D4037'}}>€{it.price}</Text>}
                        {sel&&<Text style={{color:'#00C851',fontSize:16}}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {(misc||[]).filter(m=>m&&m.link==='stavCol').length===0&&<Text style={{textAlign:'center',color:'#aaa',padding:14,fontSize:12}}>Δεν υπάρχουν χρώματα. Πρόσθεσέ τα από τις Τυποποιημένες → 📦 ΔΙΑΦΟΡΑ.</Text>}
              </ScrollView>
            </View>
            ); })()}
        </TouchableOpacity>
      </Modal>

      {/* ΠΑΡΑΘΥΡΟ ΕΠΕΝΔΥΣΕΙΣ */}
      <Modal visible={showCoatingsPicker} transparent animationType="fade" onRequestClose={()=>setShowCoatingsPicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setShowCoatingsPicker(false)} style={{flex:1}}>
          {(()=>{ const W=Math.min(340,SCREEN_WIDTH-12); const {left,top,maxH}=popupPos(W,100);
            return (
            <View style={{position:'absolute',left,top,width:W,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#007AFF',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:6,elevation:6,overflow:'hidden'}}>
              <Text style={{fontSize:11,fontWeight:'700',color:'#007AFF',paddingVertical:5,paddingHorizontal:9,backgroundColor:'#E8F4FD'}}>ΕΠΕΝΔΥΣΗ ΠΟΡΤΑΣ</Text>
              <ScrollView style={{maxHeight:maxH}}>
                {coatings.length===0 && (<Text style={{padding:14,color:'#aaa',textAlign:'center',fontSize:12}}>Δεν υπάρχουν επενδύσεις. Προσθέστε από το μενού ☰.</Text>)}
                {sortCoatingsGrouped(coatings).map(c=>{
                  const curCoatings = pickerEditMode ? (editForm.coatings||[]) : (customForm.coatings||[]);
                  const selected = curCoatings.includes(c.name);
                  const n = c.name?.toLowerCase()||'';
                  const bg = n.includes('μέσα')||n.includes('μεσα') ? '#E8F4FD' : n.includes('έξω')||n.includes('εξω') ? '#FFF3E0' : '#fff';
                  return (
                    <TouchableOpacity key={c.id}
                      style={{paddingVertical:8,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#eee',flexDirection:'row',alignItems:'center',justifyContent:'space-between', backgroundColor: bg}}
                      onPress={()=>{
                        const updated = selected ? curCoatings.filter(x=>x!==c.name) : [...curCoatings,c.name];
                        if (pickerEditMode) setEditForm(f=>{const n={...f,coatings:updated};return {...n,coatingDetails:recomputeCoatingDetails(n)};});
                        else setCustomForm(f=>{const n={...f,coatings:updated};return {...n,coatingDetails:recomputeCoatingDetails(n)};});
                        if (!selected && updated.length >= 2) setTimeout(()=>setShowCoatingsPicker(false), 150);
                      }}>
                      <Text style={{fontSize:13,color:'#000',flex:1}}>{c.name}</Text>
                      {selected && <Text style={{color:'#007AFF',fontSize:16,fontWeight:'bold'}}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
                {((pickerEditMode?editForm.coatings:customForm.coatings)||[]).length>0&&(
                  <TouchableOpacity style={{margin:8,padding:9,backgroundColor:'#ff4444',borderRadius:8,alignItems:'center'}}
                    onPress={()=>{ if (pickerEditMode) setEditForm(f=>({...f,coatings:[],coatingDetails:{}})); else setCustomForm(f=>({...f,coatings:[],coatingDetails:{}})); }}>
                    <Text style={{color:'white',fontWeight:'bold',fontSize:12}}>ΕΚΚΑΘΑΡΙΣΗ ΕΠΙΛΟΓΩΝ</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              <TouchableOpacity style={{margin:8,padding:10,backgroundColor:'#007AFF',borderRadius:8,alignItems:'center'}} onPress={()=>setShowCoatingsPicker(false)}>
                <Text style={{color:'white',fontWeight:'bold',fontSize:13}}>ΟΛΟΚΛΗΡΩΣΗ</Text>
              </TouchableOpacity>
            </View>
            ); })()}
        </TouchableOpacity>
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

      <SplitModal
        visible={splitModal.visible && !isForeman}
        totalQty={parseInt(splitModal.order?.qty)||1}
        onConfirm={handleSplitConfirm}
        onCancel={()=>setSplitModal({visible:false,order:null})}
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

      {/* ΛΙΣΤΑ ΤΙΜΩΝ */}
      <PriceListModal
        visible={priceModal.visible && !isForeman}
        title={priceModal.order ? (priceModal.order.isQuote ? 'Τιμές προσφοράς' : `Τιμές #${priceModal.order.orderNo}`) : 'Καταχώρηση τιμών'}
        startLocked={!!(priceModal.order && (priceModal.order.priceList||[]).length)}
        readOnly={!!(priceModal.order && !priceModal.order.isQuote && (priceModal.order.status==='SOLD' || soldSpecialOrders.some(o=>o.id===priceModal.order.id)))}
        initialItems={priceModal.order ? (priceModal.order.priceList||[]) : (customForm.priceList||[])}
        initialDiscount={priceModal.order ? (priceModal.order.priceDiscount||'') : (customForm.priceDiscount||'')}
        initialNote={priceModal.order ? (priceModal.order.priceNote||'') : (customForm.priceNote||'')}
        log={priceModal.order ? (priceModal.order.priceLog||[]) : (customForm.priceLog||[])}
        onClose={()=>setPriceModal({visible:false, order:null})}
        onSave={(items, discount, note)=>{
          if (priceModal.order) (priceModal.order.isQuote ? savePriceListQuote : savePriceList)(priceModal.order, items, discount, note);
          else setCustomForm(f=>({...f, priceList: items, priceDiscount: discount, priceNote: note}));
          setPriceModal({visible:false, order:null});
        }}
      />

      {/* MODAL ΕΠΕΞΕΡΓΑΣΙΑΣ ΠΑΡΑΓΓΕΛΙΑΣ */}
      <Modal visible={editModal.visible && !isForeman && !showHardwarePicker && !showCoatingsPicker && !peepholeWarn.visible} transparent animationType="slide" onRequestClose={()=>setEditModal({visible:false,order:null})}>
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
                <TouchableOpacity style={{backgroundColor:editForm.glassDesign?'#ede7f6':'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,paddingHorizontal:10,justifyContent:'center',alignItems:'center'}} onPress={()=>setEditForm(f=>({...f,glassDesign:stavCycle(f.glassDesign,designOpts)}))}>
                  <Text style={{fontSize:13,fontWeight:'700',color:editForm.glassDesign?'#4a148c':'#bbb'}}>{editForm.glassDesign||'—'}</Text>
                </TouchableOpacity>
                <TextInput
                  ref={editGlassNotesRef}
                  style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,fontSize:14,flex:2}}
                  placeholder="Παρατήρηση τζαμιού..."
                  value={editForm.glassNotes||''}
                  onChangeText={v=>setEditForm(f=>({...f,glassNotes:v}))}
                  returnKeyType="next"
                />
              </View>
              {/* Βαφή Κάσας + Χρώμα Εξαρτημάτων */}
              <View style={{flexDirection:'row',gap:8,marginBottom:12}}>
                <View style={{flex:1}}>
                  <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🎨 ΒΑΦΗ ΚΑΣΑΣ</Text>
                  <TextInput
                    style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:12,fontSize:14,color:'#1a1a1a'}}
                    placeholder="π.χ. STUCTURA 7036"
                    placeholderTextColor="#aaa"
                    value={editForm.casePaint||''}
                    onChangeText={v=>setEditForm(f=>({...f,casePaint:v}))}
                  />
                </View>
                <View style={{flex:1}}>
                  <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🎨 ΧΡΩΜΑ ΕΞΑΡΤΗΜΑΤΩΝ</Text>
                  <TouchableOpacity ref={editHardwareBtnRef}
                    style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}
                    onPress={()=>{ setPickerEditMode(true); measureAnchor(editHardwareBtnRef); setShowHardwarePicker(true); }}>
                    <Text style={{fontSize:14,color:editForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{editForm.hardware||'Επιλέξτε...'}</Text>
                    <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* Επένδυση */}
              <Text style={{fontWeight:'bold',color:'#555',marginBottom:4,fontSize:12}}>🎨 ΕΠΕΝΔΥΣΗ</Text>
              <TouchableOpacity ref={editCoatingsBtnRef}
                style={{backgroundColor:'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:12,marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}
                onPress={()=>{ setPickerEditMode(true); measureAnchor(editCoatingsBtnRef); setShowCoatingsPicker(true); }}>
                <Text style={{fontSize:14,color:(editForm.coatings&&editForm.coatings.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={2}>
                  {(editForm.coatings&&editForm.coatings.length>0)?editForm.coatings.join(', '):'Επιλέξτε...'}
                </Text>
                <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
              </TouchableOpacity>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:6}}>
              {(editForm.coatings||[]).filter(c=>c&&String(c).trim()).map(name=>{
                const type = getCoatingType(name);
                const d = editForm.coatingDetails?.[name] || {};
                const upd = (k,v)=>setEditForm(f=>{
                  const prev = f.coatingDetails?.[name] || {};
                  const next = {...prev, [k]:v};
                  if (k==='dim') next.dimUser = true;
                  if (k==='frameColor') next.frameColorUser = true;
                  if (k==='caseColor') next.caseColorUser = true;
                  if (k==='color') {
                    if (!prev.frameColorUser) next.frameColor = v;
                    if (type==='EXO' && !prev.caseColorUser) next.caseColor = v;
                  }
                  if (k==='pihaki' && type==='MESA' && !prev.dimUser) {
                    const newDim = computeCoatingDim(f.h, f.w, 'MESA', !!v);
                    if (newDim) next.dim = newDim;
                  }
                  return {...f, coatingDetails:{...(f.coatingDetails||{}), [name]: next}};
                });
                const bg = type==='EXO'?'#FFF3E0':type==='MESA'?'#E8F4FD':'#F5F5F5';
                const bd = type==='EXO'?'#FF9800':type==='MESA'?'#2196F3':'#BBB';
                const inp = {backgroundColor:'#fff',borderWidth:1,borderColor:'#ddd',borderRadius:6,padding:7,fontSize:13,color:'#1a1a1a'};
                const inpDimUser = {...inp, color:'#d32f2f', fontWeight:'900', fontStyle:'italic'};
                const lbl = {fontSize:10,fontWeight:'800',color:'#666',marginBottom:2,letterSpacing:0.3};
                return (
                  <View key={name} style={{flex:1,minWidth:220,backgroundColor:bg,borderWidth:1.5,borderColor:bd,borderRadius:8,padding:8}}>
                    <Text style={{fontWeight:'800',fontSize:12,color:'#1a1a1a',marginBottom:6,letterSpacing:0.5}}>{name}</Text>
                    <View style={{flexDirection:'row',gap:6,marginBottom:5}}>
                      <View style={{flex:1}}><Text style={lbl}>Διάσταση</Text>
                        <TextInput style={d.dimUser?inpDimUser:inp} value={d.dim||''} onChangeText={v=>upd('dim',v)}/></View>
                      <View style={{flex:2}}><Text style={lbl}>Χρώμα</Text>
                        <TextInput style={inp} value={d.color||''} onChangeText={v=>upd('color',v)}/></View>
                    </View>
                    <View style={{marginBottom:5}}>
                      <Text style={lbl}>Σχέδιο</Text>
                      <TextInput style={inp} value={d.design||''} onChangeText={v=>upd('design',v)}/>
                    </View>
                    <View style={{flexDirection:'row',gap:6}}>
                      <View style={{flex:1}}><Text style={lbl}>Πλ./Είδος Περβ.</Text>
                        <TextInput style={inp} value={d.frameW||''} onChangeText={v=>upd('frameW',v)}/></View>
                      <View style={{flex:2}}><Text style={lbl}>Χρώμα Περβ.</Text>
                        <TextInput style={inp} value={d.frameColor||''} onChangeText={v=>upd('frameColor',v)}/></View>
                    </View>
                    {type==='EXO'&&(
                      <View style={{flexDirection:'row',gap:6,marginTop:5}}>
                        <View style={{flex:1}}><Text style={lbl}>Πλάτος Κάσας</Text>
                          <TextInput style={inp} value={d.caseW||''} onChangeText={v=>upd('caseW',v)}/></View>
                        <View style={{flex:2}}><Text style={lbl}>Χρώμα Κάσας</Text>
                          <TextInput style={inp} value={d.caseColor||''} onChangeText={v=>upd('caseColor',v)}/></View>
                      </View>
                    )}
                    {type==='MESA'&&(
                      <TouchableOpacity onPress={()=>upd('pihaki', !d.pihaki)} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:6,paddingVertical:3}}>
                        <View style={{width:20,height:20,borderRadius:4,borderWidth:2,borderColor:'#1565C0',backgroundColor:d.pihaki?'#1565C0':'#fff',alignItems:'center',justifyContent:'center'}}>
                          {d.pihaki&&<Text style={{color:'#fff',fontWeight:'900',fontSize:14,lineHeight:14}}>✓</Text>}
                        </View>
                        <Text style={{fontSize:13,fontWeight:'700',color:'#1565C0'}}>Πηχάκι (ξυλογωνιά)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              </View>
              <View style={{height:4}}/>
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
                    <TouchableOpacity style={{backgroundColor:s.design?'#ede7f6':'#f5f5f5',borderWidth:1,borderColor:'#ddd',borderRadius:8,paddingHorizontal:8,justifyContent:'center',alignItems:'center',width:78}} onPress={()=>{
                        const upd=[...(editForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                        while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                        upd[i]={...upd[i],design:stavCycle(upd[i].design,designOpts)};
                        setEditForm(f=>({...f,stavera:upd}));
                      }}>
                      <Text style={{fontSize:12,fontWeight:'700',color:s.design?'#4a148c':'#bbb'}}>{s.design||'—'}</Text>
                    </TouchableOpacity>
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
              {/* Τοποθέτηση */}
              <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:14}}>
                <Text style={{fontWeight:'bold',color:'#555',fontSize:13}}>📍 ΤΟΠΟΘΕΤΗΣΗ</Text>
                <View style={{flexDirection:'row',gap:6}}>
                  {['ΝΑΙ','ΟΧΙ'].map(v=>{
                    const on=(editForm.placement||'ΟΧΙ')===v;
                    return (
                      <TouchableOpacity key={v} onPress={()=>setEditForm(f=>({...f,placement:v}))} style={{paddingHorizontal:18,paddingVertical:8,borderRadius:6,borderWidth:1.5,borderColor:on?(v==='ΝΑΙ'?'#E65100':'#1a1a1a'):'#ccc',backgroundColor:on?(v==='ΝΑΙ'?'#E65100':'#1a1a1a'):'#f0f0f0'}}>
                        <Text style={{fontWeight:'900',fontSize:13,color:on?'#fff':'#555'}}>{v}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
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
                  glassDesign: editForm.glassDesign||'',
                  hardware: editForm.hardware||'',
                  casePaint: editForm.casePaint||'',
                  coatings: editForm.coatings||[],
                  coatingDetails: editForm.coatingDetails||{},
                  stavera: editForm.stavera||[],
                  placement: editForm.placement||'ΟΧΙ',
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
      <Modal visible={dimChangeModal.visible} transparent animationType="fade" onRequestClose={()=>setDimChangeModal(m=>({...m,visible:false}))}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.55)',justifyContent:'center',alignItems:'center',padding:20}}>
          <View style={{backgroundColor:'#fff',borderRadius:16,padding:28,width:'100%',maxWidth:640,borderTopWidth:10,borderTopColor:'#FF9800'}}>
            <Text style={{fontSize:40,fontWeight:'900',color:'#d32f2f',letterSpacing:2,textAlign:'center',marginBottom:6}}>ΠΡΟΣΟΧΗ</Text>
            <Text style={{fontSize:24,fontWeight:'900',color:'#e65100',marginBottom:12,textAlign:'center'}}>Άλλαξε η διάσταση πόρτας</Text>
            <Text style={{fontSize:20,color:'#333',marginBottom:16,textAlign:'center'}}>
              <Text style={{fontWeight:'700'}}>{dimChangeModal.oldH} × {dimChangeModal.oldW}</Text>
              <Text style={{color:'#999'}}>  →  </Text>
              <Text style={{fontWeight:'900',color:'#1565C0'}}>{dimChangeModal.newH} × {dimChangeModal.newW}</Text>
            </Text>
            {dimChangeModal.rows.length>0 && (
              <View style={{backgroundColor:'#fff8e1',borderWidth:1,borderColor:'#ffb300',borderRadius:10,padding:14,marginBottom:18}}>
                <Text style={{fontSize:17,fontWeight:'800',color:'#444',marginBottom:10}}>Νέες διαστάσεις φύλλων:</Text>
                {dimChangeModal.rows.map(r=>(
                  <View key={r.name} style={{marginBottom:8}}>
                    <Text style={{fontSize:17,fontWeight:'800',color:'#1a1a1a'}}>{r.name}</Text>
                    <Text style={{fontSize:18,color:'#555',marginLeft:8}}>
                      {r.oldDim||'—'} <Text style={{color:'#999'}}>→</Text> <Text style={{fontWeight:'900',color:'#2e7d32'}}>{r.newDim||'—'}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View style={{flexDirection:'row',gap:12}}>
              <TouchableOpacity style={{flex:1,padding:16,borderRadius:10,backgroundColor:'#e0e0e0',alignItems:'center'}} onPress={()=>setDimChangeModal(m=>({...m,visible:false}))}>
                <Text style={{fontWeight:'bold',color:'#555',fontSize:18}}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:2,padding:16,borderRadius:10,backgroundColor:'#2e7d32',alignItems:'center'}} onPress={()=>dimChangeModal.onConfirm&&dimChangeModal.onConfirm()}>
                <Text style={{fontWeight:'bold',color:'#fff',fontSize:18}}>ΟΚ — ΑΠΟΘΗΚΕΥΣΗ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={coatDetailsModal.visible} transparent animationType="fade" onRequestClose={()=>setCoatDetailsModal({visible:false,order:null})}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setCoatDetailsModal({visible:false,order:null})} style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:20}}>
          <TouchableOpacity activeOpacity={1} onPress={()=>{}} style={{backgroundColor:'#fff8e1',borderWidth:2,borderColor:'#ffb300',borderRadius:14,padding:22,width:'100%',maxWidth:640,elevation:12,shadowColor:'#000',shadowOffset:{width:0,height:6},shadowOpacity:0.35,shadowRadius:14}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:14,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#ffd54f'}}>
              <Text style={{fontSize:20,fontWeight:'900',color:'#e65100',letterSpacing:0.5,flex:1}} numberOfLines={1}>🎨 ΣΤΟΙΧΕΙΑ ΕΠΕΝΔΥΣΕΩΝ #{coatDetailsModal.order?.orderNo}</Text>
              {!isForeman&&<TouchableOpacity onPress={()=>{
                const o = coatDetailsModal.order; if (!o) return;
                setEditForm({ h:o.h||'', w:o.w||'', deliveryDate:o.deliveryDate||'', lock:o.lock||'', glassDim:o.glassDim||'', glassNotes:o.glassNotes||'', glassDesign:o.glassDesign||'', hardware:o.hardware||'', casePaint:o.casePaint||'', coatings:o.coatings||[], coatingDetails:o.coatingDetails||{}, stavera:o.stavera||[], placement:o.placement||'ΟΧΙ', notes:o.notes||'' });
                setCoatDetailsModal({visible:false,order:null});
                setEditModal({visible:true,order:o});
              }} style={{backgroundColor:'#007AFF',paddingHorizontal:10,paddingVertical:6,borderRadius:6,marginRight:8}}>
                <Text style={{color:'#fff',fontWeight:'900',fontSize:13}}>✏️ Edit</Text>
              </TouchableOpacity>}
              <TouchableOpacity onPress={()=>setCoatDetailsModal({visible:false,order:null})} style={{padding:6}}>
                <Text style={{fontSize:26,color:'#999',fontWeight:'900',lineHeight:26}}>×</Text>
              </TouchableOpacity>
            </View>
            {coatDetailsModal.order&&renderCoatDetailsContent(coatDetailsModal.order)}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
      {/* Modal: λίστα παραγγελιών επιλεγμένης μέρας (από τα ημερολόγια) */}
      <Modal visible={dayModal.visible} transparent animationType="fade" onRequestClose={()=>setDayModal({visible:false,ts:null,mode:null,phaseKey:null})}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center'}}>
          <View style={{width:'90%', maxWidth:560, maxHeight:'80%', backgroundColor:'#fff', borderRadius:12, overflow:'hidden'}}>
            {dayModal.visible && (()=>{
              const ts = dayModal.ts;
              const d = new Date(ts);
              const dStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
              const all = [...specialOrders, ...soldSpecialOrders].filter(sellerOwnsOrder);
              const byNo = (a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0);
              const row = (o,i) => (
                <View key={o.id+'_'+i} style={{flexDirection:'row', alignItems:'center', paddingVertical:8, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#eee'}}>
                  <Text style={{width:70, fontWeight:'900', color:'#1a1a1a'}}>#{o.orderNo||'-'}</Text>
                  <Text style={{flex:1, color:'#333'}} numberOfLines={1}>{o.customer||'-'}</Text>
                  <Text style={{width:90, color:'#666', textAlign:'right'}}>{o.h||'?'}x{o.w||'?'}</Text>
                  <Text style={{width:54, fontWeight:'900', color:'#c62828', textAlign:'right'}}>{pieceQty(o)}τεμ</Text>
                </View>
              );
              const section = (label, color, list) => (
                <View>
                  <View style={{flexDirection:'row', justifyContent:'space-between', backgroundColor:color, paddingVertical:6, paddingHorizontal:12}}>
                    <Text style={{color:'#fff', fontWeight:'900'}}>{label}</Text>
                    <Text style={{color:'#fff', fontWeight:'900'}}>{list.reduce((s,o)=>s+pieceQty(o),0)} τεμ ({list.length})</Text>
                  </View>
                  {list.length ? list.map(row) : <Text style={{padding:12, color:'#999'}}>—</Text>}
                </View>
              );
              let body;
              if (dayModal.mode==='pending') {
                const reg  = all.filter(o=>o.createdAt && sameDay(o.createdAt, ts)).sort(byNo);
                const prod = all.filter(o=>o.prodAt && sameDay(o.prodAt, ts)).sort(byNo);
                body = <>{section('ΚΑΤΑΧΩΡΗΣΕΙΣ','#1565c0',reg)}{section('ΕΙΣΟΔΟΣ ΠΑΡΑΓΩΓΗΣ','#2e7d32',prod)}</>;
              } else {
                const k = dayModal.phaseKey;
                const list = all.filter(o=>{ const t=phaseDoneAt(o,k); return t && sameDay(t, ts); }).sort(byNo);
                const lbl = (PHASES.find(p=>p.key===k)?.label||'').replace(/🔴|🟡|🔵|⚫|🟠|🟢/g,'').trim();
                body = section('ΟΛΟΚΛΗΡΩΘΗΚΑΝ — '+lbl, '#2e7d32', list);
              }
              return (<>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#1a1a1a', paddingVertical:10, paddingHorizontal:12}}>
                  <Text style={{color:'#fff', fontWeight:'900', fontSize:15}}>📅 {dStr}</Text>
                  <TouchableOpacity onPress={()=>setDayModal({visible:false,ts:null,mode:null,phaseKey:null})}><Text style={{color:'#fff', fontSize:18, fontWeight:'bold', paddingHorizontal:6}}>✕</Text></TouchableOpacity>
                </View>
                <ScrollView>{body}</ScrollView>
              </>);
            })()}
          </View>
        </View>
      </Modal>
      <View style={{flex:1, flexDirection:'row'}}>
        {/* SIDEBAR 20% */}
        <View style={{width:'20%', backgroundColor:'#1a1a1a', padding:8, gap:8}}>
          {[
            {key:'form',    icon:'✏️', label:'ΚΑΤΑΧΩΡΗΣΗ', count:null},
            {key:'quotes',  icon:'💼', label:'ΠΡΟΣΦΟΡΕΣ', count:specialQuotes.filter(sellerOwnsOrder).length, badgeColor:'#8e24aa'},
            {key:'pending', icon:'📋', label:'ΚΑΤΑΧΩΡΗΜΕΝΕΣ', count:specialOrders.filter(o=>(o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone))&&sellerOwnsOrder(o)).length, badgeColor:'#ff4444'},
            {key:'prod',    icon:'⚙️', label:'ΠΑΡΑΓΩΓΗ', count:specialOrders.filter(o=>o.status==='PROD'&&sellerOwnsOrder(o)).length, badgeColor:'#ff9800'},
            {key:'ready',   icon:'📦', label:'ΕΤΟΙΜΑ', count:specialOrders.filter(o=>o.status==='READY'&&sellerOwnsOrder(o)).length, badgeColor:'#2e7d32'},
            {key:'archive', icon:'💰', label:'ΑΡΧΕΙΟ', count:soldSpecialOrders.length, badgeColor:'#555'},
          ].filter(item=>(!readOnly||item.key==='pending') && !(isSeller&&(item.key==='archive'||item.key==='prod')) && !(isForeman&&(item.key==='form'||item.key==='quotes'))).map(item=>(
            <TouchableOpacity key={item.key}
              onPress={()=>requestSection(item.key)}
              style={{backgroundColor:activeSection===item.key?'#8B0000':'#2c2c2c', borderRadius:10, padding:12, alignItems:'center', gap:4, borderWidth:2, borderColor:activeSection===item.key?'rgba(255,255,255,0.3)':'transparent', position:'relative'}}>
              {item.count>0&&<View style={{position:'absolute',top:6,right:6,backgroundColor:item.badgeColor,borderRadius:10,paddingHorizontal:5,paddingVertical:1,minWidth:18,alignItems:'center'}}><Text style={{color:'white',fontSize:9,fontWeight:'bold'}}>{item.count}</Text></View>}
              <Text style={{fontSize:22}}>{item.icon}</Text>
              <Text style={{color:'white',fontSize:10,fontWeight:'bold',textAlign:'center',lineHeight:13}}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          {/* ΟΙ ΥΠΟΒΟΛΕΣ ΜΟΥ — μόνο πωλητής, κάτω από τις καρτέλες */}
          {isSeller && (
            <TouchableOpacity onPress={onOpenSubmissions}
              style={{ marginTop: 22, backgroundColor: '#0d47a1', borderRadius: 10, padding: 12, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Text style={{ fontSize: 22 }}>📤</Text>
              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold', textAlign: 'center', lineHeight: 13 }}>ΟΙ ΥΠΟΒΟΛΕΣ ΜΟΥ</Text>
            </TouchableOpacity>
          )}
          {/* Spacer — σπρώχνει το κουμπί ΠΕΛΑΤΕΣ στο κάτω μέρος */}
          <View style={{flex:1}} />
          {/* ΦΙΛΤΡΟ ΠΩΛΗΤΗ — μόνο προσωπικό (όχι ο ίδιος ο πωλητής) */}
          {!readOnly && !isSeller && sellers.length > 0 && (
          <View style={{ zIndex:40 }}>
            <TouchableOpacity onPress={()=>setFilterSellerOpen(o=>!o)}
              style={{ backgroundColor: filterSellerKey?'#1565c0':'#2c2c2c', borderRadius:10, padding:10, alignItems:'center', gap:2, borderWidth:2, borderColor:'rgba(255,255,255,0.18)' }}>
              <Text style={{fontSize:18}}>🧑‍💼</Text>
              <Text style={{color:'white', fontSize:10, fontWeight:'bold', textAlign:'center', lineHeight:13}} numberOfLines={1}>
                {filterSellerKey ? (resolveName(filterSellerKey) || filterSellerKey) : 'ΠΩΛΗΤΗΣ'}
              </Text>
            </TouchableOpacity>
            {filterSellerOpen && (
              <View style={{ position:'absolute', bottom:60, left:0, right:0, backgroundColor:'#fff', borderRadius:8, borderWidth:1, borderColor:'#1565C0', overflow:'hidden', elevation:10 }}>
                <TouchableOpacity onPress={()=>{ setFilterSellerKey(''); setFilterSellerOpen(false); }} style={{ paddingVertical:10, paddingHorizontal:10, borderBottomWidth:1, borderBottomColor:'#eee' }}>
                  <Text style={{ color:'#555', fontWeight:'bold', fontSize:13 }}>— Όλοι</Text>
                </TouchableOpacity>
                {sellers.map(s => { const k = lockKey(s); return (
                  <TouchableOpacity key={k} onPress={()=>{ setFilterSellerKey(k); setFilterSellerOpen(false); }} style={{ paddingVertical:10, paddingHorizontal:10, borderBottomWidth:1, borderBottomColor:'#eee', backgroundColor: filterSellerKey===k?'#e3f2fd':'#fff' }}>
                    <Text style={{ color:'#1a1a1a', fontWeight:'bold', fontSize:13 }}>{resolveName(k) || s}</Text>
                  </TouchableOpacity>
                ); })}
              </View>
            )}
          </View>
          )}
          {/* Διαχωριστικό */}
          <View style={{height:1, backgroundColor:'rgba(255,255,255,0.18)', marginVertical:2}} />
          {/* 🔍 ΠΕΛΑΤΕΣ — αναζήτηση παραγγελιών ανά πελάτη (στο αρχείο γίνεται από το κεντρικό explorer) */}
          {!readOnly && !isSeller && activeSection!=='archive' && (
          <TouchableOpacity
            onPress={()=>setShowCustomerLookup(v=>!v)}
            style={{backgroundColor: activeSection==='archive' ? (showCustomerLookup?'#777':'#555') : (showCustomerLookup?'#1565c0':'#0d47a1'), borderRadius:10, padding:12, alignItems:'center', gap:4, borderWidth:2, borderColor: showCustomerLookup?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.15)'}}>
            <Text style={{fontSize:22}}>🔍</Text>
            <Text style={{color:'white', fontSize:10, fontWeight:'bold', textAlign:'center', lineHeight:13}}>{activeSection==='archive' ? 'ΠΕΛΑΤΕΣ ΑΡΧΕΙΟ' : 'ΠΕΛΑΤΕΣ'}</Text>
          </TouchableOpacity>
          )}
        </View>
        {/* CONTENT 80% — ΠΑΡΑΓΩΓΗ και ΚΑΤΑΧΩΡΗΜΕΝΕΣ βγαίνουν εκτός ScrollView για flex:1 */}
        {activeSection==='prod' && !isSeller ? (
          <View style={{flex:1}}>
            {renderProdSection()}
          </View>
        ) : activeSection==='pending' ? (
          <View style={{flex:1, flexDirection:'row'}}>
            {/* ΑΡΙΣΤΕΡΑ: Scrollable λίστα καρτών */}
            <ScrollView style={{flex:1, padding:10}} keyboardShouldPersistTaps="handled">
              <View style={{paddingBottom:80}} pointerEvents={readOnly?'none':'auto'}>
                {[...specialOrders.filter(o => sellerOwnsOrder(o) && (showOnlyStuck
                  ? isOrderReadyForTransfer(o)
                  : (o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)))
                )].sort((a,b)=>
                  pendingSort==='date' ? (b.createdAt||0)-(a.createdAt||0) : (parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)
                ).filter(o=>matchesSearch(o, pendingSearch)).map(o=>renderOrderCard(o, false, true, pendingSearch))}
              </View>
            </ScrollView>
            {/* ΔΕΞΙΑ: Σταθερή μπάρα */}
            <View style={{width:280, backgroundColor:'#f9f9f9', borderLeftWidth:1, borderLeftColor:'#e0e0e0', padding:12, gap:32}} pointerEvents={readOnly?'none':'auto'}>
              {/* Τίτλος + αριθμός */}
              <View style={{backgroundColor:'#ffbb33', borderRadius:8, padding:14}}>
                <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:18}}>● ΚΑΤΑΧΩΡΗΜΕΝΕΣ</Text>
                <Text style={{color:'#1a1a1a', fontSize:16, marginTop:4}}>
                  {specialOrders.filter(o=>(o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone))&&sellerOwnsOrder(o)).length} παραγγελίες
                </Text>
                <Text style={{color:'#1a1a1a', fontWeight:'bold', fontSize:18, marginTop:10}}>● ΑΝΑΜΟΝΗ</Text>
                <Text style={{color:'#1a1a1a', fontSize:16, marginTop:4}}>
                  {specialOrders.filter(o=>o.status==='PENDING'&&sellerOwnsOrder(o)).length} παραγγελίες
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
              {!isSeller && <View style={{gap:6}}>
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
                  style={{backgroundColor:'#1a1a2e', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>{
                    const visible = specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone));
                    const programs = [...new Set(visible.filter(o=>o.programNo).map(o=>o.programNo))];
                    if (programs.length===0) { Alert.alert('Προσοχή','Δεν υπάρχουν παραγγελίες με αριθμό προγράμματος.'); return; }
                    setPrintProgramModal({visible:true, programs, selected: programs.length===1?programs[0]:null, phaseKey:null, readyOnly:false, mode:'pending'});
                  }}>
                  <Text style={{color:'#FFD600', fontWeight:'bold', fontSize:16}}>🖨️ ΠΡΟΓΡΑΜΜΑ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#1a1a1a', borderRadius:8, padding:11, alignItems:'center'}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='PENDING'||o.status==='PROD'||(o.status==='READY'&&o.staveraPendingAtReady&&!o.staveraDone)), 'ΟΛΕΣ')}>
                  <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>🖨️ ΟΛΕΣ</Text>
                </TouchableOpacity>
              </View>}
              {/* Ημερολόγιο: καταχωρήσεις + είσοδος παραγωγής (σε τεμάχια) — ο πωλητής βλέπει μόνο τα δικά του */}
              <MiniCalendar
                title="ΗΜΕΡΟΛΟΓΙΟ (ΤΕΜΑΧΙΑ)"
                series={[
                  { color:'#1565c0', label:'Καταχωρήσεις', data: calData([...specialOrders, ...soldSpecialOrders].filter(sellerOwnsOrder), o=>o.createdAt) },
                  { color:'#c62828', label:'Παραγωγή',     data: calData([...specialOrders, ...soldSpecialOrders].filter(sellerOwnsOrder), o=>o.prodAt) },
                ]}
                selectedTs={dayModal.mode==='pending'?dayModal.ts:null}
                onPickDay={(ts)=>setDayModal({visible:true, ts, mode:'pending', phaseKey:null})}
              />
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
                    autoComplete="off"
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
                <TextInput ref={customerRef} style={styles.input} placeholder="Αναζήτηση Πελάτη" autoComplete="off" value={customerSearch}
                  onChangeText={v=>{setCustomerSearch(v);setShowCustomerList(true);setCustomForm({...customForm,customer:v});}}
                  onSubmitEditing={()=>orderNoRef.current?.focus()}
                  returnKeyType="next" blurOnSubmit={false}
                />
                {showCustomerList&&customerSearch.length>0&&pickCustomers.filter(c=>
                  c.name?.toLowerCase().includes(customerSearch.toLowerCase())||
                  [c.phone, c.phone2, c.phone3, c.phoneViber].some(p=>p&&String(p).includes(customerSearch))||
                  c.identifier?.toLowerCase().includes(customerSearch.toLowerCase())
                ).slice(0,5).length>0&&(
                  <View style={styles.customerDropdown}>
                    {pickCustomers.filter(c=>
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
          {!isSeller && <TextInput ref={orderNoRef} style={[styles.input, {fontSize:18, fontWeight:'bold', width:90, letterSpacing:1, marginBottom:0}]} placeholder="Ν/Π" keyboardType="numeric" value={customForm.orderNo} selectTextOnFocus
            onFocus={()=>{
              if (!selectedCustomer && customerSearch.trim() && !isSeller) {
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
            onChangeText={v=>{ setOrderNoAuto(false); setCustomForm({...customForm,orderNo:v}); }}
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
            blurOnSubmit={false} />}
            {!isSeller && <View style={{width:80}}>
              <Text style={[styles.input, {fontSize:10, fontWeight:'bold', color:'#888', marginBottom:3, borderWidth:0, padding:0, backgroundColor:'transparent'}]}>ΑΡ.ΠΡΟΓΡ.</Text>
              <TextInput
                style={[styles.input, {fontSize:18, fontWeight:'bold', width:80, letterSpacing:1, marginBottom:0, color:'#e65100', borderColor: customForm.programNo ? '#e65100' : '#ddd'}]}
                placeholder="—"
                keyboardType="numeric"
                value={customForm.programNo||''}
                selectTextOnFocus
                onChangeText={v=>setCustomForm(f=>({...f, programNo:v}))}
              />
            </View>}
            <View style={{width:110}}>
              <Text style={[vstyles.fieldLabel,{marginBottom:3}]}>Παράδοση</Text>
              <TouchableOpacity style={[vstyles.selectBtn,{paddingVertical:8,paddingHorizontal:5}]} onPress={()=>setShowDatePicker(true)}>
                <Text style={{fontSize:11,color:customForm.deliveryDate?'#1a1a1a':'#aaa'}} numberOfLines={1}>📅 {customForm.deliveryDate||'—'}</Text>
              </TouchableOpacity>
            </View>
            {/* ── ΠΡΟΣΦΟΡΑ: κουμπιά στο ύψος του αριθμού (η προσφορά δεν παίρνει αριθμό) ── */}
            {!editingOrder && !groupState && (
              <View style={{flex:1, alignItems:'flex-end', justifyContent:'flex-end'}}>
                <View style={{flexDirection:'row', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
                  {!editingQuote ? (
                  <TouchableOpacity
                    style={[styles.saveBtn, {backgroundColor:'#8e24aa', paddingHorizontal:22, paddingVertical:13, marginTop:0}]}
                    onPress={()=>{
                      Keyboard.dismiss();
                      const trigs = peepholeTriggers(customForm.coatings, customForm.notes);
                      if (trigs.length > 0) setPeepholeWarn({ visible:true, coatings:trigs, onContinue:()=>addAnotherDoorQuote(), onAddNote:()=>{ const n=withPeepholeNote(customForm.notes); setCustomForm(f=>({...f,notes:n})); addAnotherDoorQuote({notes:n}); } });
                      else addAnotherDoorQuote();
                    }}>
                    <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>➕ ΠΟΡΤΑ ΠΡΟΣΦΟΡΑΣ</Text>
                  </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, {backgroundColor:'#6a1b9a', paddingHorizontal:22, paddingVertical:13, marginTop:0}]}
                    onPress={()=>{
                      Keyboard.dismiss();
                      const trigs = peepholeTriggers(customForm.coatings, customForm.notes);
                      if (trigs.length > 0) setPeepholeWarn({ visible:true, coatings:trigs, onContinue:()=>doFinalSaveQuote(), onAddNote:()=>{ const n=withPeepholeNote(customForm.notes); setCustomForm(f=>({...f,notes:n})); doFinalSaveQuote({notes:n}); } });
                      else doFinalSaveQuote();
                    }}>
                    <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>💼 ΚΑΤΑΧΩΡΗΣΗ ΠΡΟΣΦΟΡΑΣ</Text>
                  </TouchableOpacity>
                </View>
                {quoteGroup && <Text style={{color:'#6a1b9a', fontWeight:'bold', fontSize:12, marginTop:4}}>💼 {quoteGroup.count} {quoteGroup.count===1?'πόρτα':'πόρτες'} στην προσφορά</Text>}
              </View>
            )}
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
                      <TextInput ref={hRef} style={[vstyles.textInput,{marginTop:2,fontWeight:'900',fontSize:20,textAlign:'center',padding:6,width:'100%'}]} placeholder="—" keyboardType="numeric" maxLength={3} value={customForm.h} onChangeText={v=>{setCustomForm(f=>{const n={...f,h:v};return {...n,coatingDetails:recomputeCoatingDetails(n)};}); if(v.length===3) wRef.current?.focus();}} onSubmitEditing={()=>wRef.current?.focus()} blurOnSubmit={false}/>
                    </View>
                    {/* Πλάτος */}
                    <View style={{alignItems:'center',flex:2}}>
                      <Text style={vstyles.fieldLabelDark}>Πλάτος</Text>
                      <TextInput ref={wRef} style={[vstyles.textInput,{marginTop:2,fontWeight:'900',fontSize:20,textAlign:'center',padding:6,width:'100%'}]} placeholder="—" keyboardType="numeric" maxLength={3} value={customForm.w} onChangeText={v=>setCustomForm(f=>{const n={...f,w:v};return {...n,coatingDetails:recomputeCoatingDetails(n)};})} onSubmitEditing={()=>qtyEidikiRef.current?.focus()} blurOnSubmit={false}/>
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
                  {/* Μοντάρισμα / Τοποθέτηση — μία γραμμή, μικρά κουμπιά, δεξί άκρο = ΔΙΠΛΗ */}
                  <View style={{flexDirection:'row',alignItems:'center',marginTop:6}}>
                    <Text style={vstyles.fieldLabelDark}>Μοντάρισμα</Text>
                    <View style={{flexDirection:'row',gap:3,marginLeft:4}}>
                      {['ΝΑΙ','ΟΧΙ'].map(v=>(
                        <TouchableOpacity key={v} style={[vstyles.togBtnSm,{flexGrow:0,flexShrink:0,flexBasis:90,width:90,minHeight:34},customForm.installation===v&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,installation:v})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.installation===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{flex:1}}/>
                    <Text style={vstyles.fieldLabelDark}>Τοποθέτηση</Text>
                    <View style={{flexDirection:'row',gap:3,marginLeft:4}}>
                      {['ΝΑΙ','ΟΧΙ'].map(v=>(
                        <TouchableOpacity key={v} style={[vstyles.togBtnSm,{flexGrow:0,flexShrink:0,flexBasis:90,width:90,minHeight:34},customForm.placement===v&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,placement:v})}>
                          <Text style={[vstyles.togBtnSmTxt,customForm.placement===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
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
                    <Text style={[vstyles.fieldLabel,{width:74,textAlign:'center'}]}>Σχέδιο</Text>
                    <Text style={[vstyles.fieldLabel,{flex:1}]}>Παρατήρηση</Text>
                  </View>
                  {[0,1,2,3].map(i=>{
                    const s=(customForm.stavera||[])[i]||{dim:'',qty:'',design:'',note:''};
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
                        <TouchableOpacity
                          style={[vstyles.staveraCell,{width:74,minHeight:32,justifyContent:'center',alignItems:'center',backgroundColor:s.design?'#ede7f6':'#fff'}]}
                          onPress={()=>{
                            const upd=[...(customForm.stavera||Array(4).fill(null).map(()=>({dim:'',qty:'',note:''})))];
                            while(upd.length<=i) upd.push({dim:'',qty:'',note:''});
                            upd[i]={...upd[i],design:stavCycle(upd[i].design,designOpts)};
                            setCustomForm({...customForm,stavera:upd});
                          }}>
                          <Text style={{fontSize:12,fontWeight:'700',color:s.design?'#4a148c':'#bbb'}}>{s.design||'—'}</Text>
                        </TouchableOpacity>
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
                  {/* Κολώνες σταθερών: ένα χρώμα + τεμάχια (χρέωση × πόρτες) */}
                  <View style={{flexDirection:'row',gap:3,marginTop:6,alignItems:'center'}}>
                    <Text style={[vstyles.fieldLabel,{width:90,textAlign:'center'}]}>Κολώνες{'\n'}σταθερών</Text>
                    <TextInput
                      style={[vstyles.staveraCell,{width:45,textAlign:'center',fontSize:17,fontWeight:'900',color:'#d32f2f'}]}
                      placeholder="" keyboardType="numeric" maxLength={2} selectTextOnFocus
                      value={customForm.stavColumn?.qty||''}
                      onChangeText={v=>{const clean=v.replace(/[^0-9]/g,'');setCustomForm(f=>({...f,stavColumn:{...(f.stavColumn||{}),qty:clean}}));}}
                    />
                    <TouchableOpacity ref={stavColBtnRef}
                      style={[vstyles.staveraCell,{flex:1,minHeight:32,justifyContent:'center',backgroundColor:customForm.stavColumn?.name?'#ede7f6':'#fff'}]}
                      onPress={()=>{blurAll();measureAnchor(stavColBtnRef);setShowStavColPicker(true);}}>
                      <Text style={{fontSize:12,fontWeight:'700',color:customForm.stavColumn?.name?'#4a148c':'#bbb'}} numberOfLines={1}>{customForm.stavColumn?.name?String(customForm.stavColumn.name).replace('ΚΟΛΩΝΕΣ ΣΤΑΘΕΡΩΝ ',''):'Επιλέξτε χρώμα...'}</Text>
                    </TouchableOpacity>
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
                    <View style={{flexDirection:'row',gap:8,marginTop:6}}>
                      <View style={{flex:1}}>
                        <Text style={vstyles.fieldLabelDark}>Υλικό Κάσας</Text>
                        <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                          {['DKP','ΓΑΛΒΑΝΙΖΕ'].map(m=>(
                            <TouchableOpacity key={m} style={[vstyles.togBtnSm,{minHeight:30},customForm.caseMaterial===m&&vstyles.togBtnOn]} onPress={()=>setCustomForm({...customForm,caseMaterial:m})}>
                              <Text style={[vstyles.togBtnSmTxt,customForm.caseMaterial===m&&vstyles.togBtnTxtOn]}>{m}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <View style={{flex:1}}>
                        <Text style={vstyles.fieldLabelDark}>Κυπρί</Text>
                        <View style={{flexDirection:'row',gap:3,marginTop:2}}>
                          {['ΝΑΙ','ΟΧΙ'].map(v=>(
                            <TouchableOpacity key={v} style={[vstyles.togBtnSm,{minHeight:30},customForm.kypri===v&&(v==='ΝΑΙ'?vstyles.togBtnGreen:vstyles.togBtnOn)]} onPress={()=>setCustomForm({...customForm,kypri:v})}>
                              <Text style={[vstyles.togBtnSmTxt,customForm.kypri===v&&vstyles.togBtnTxtOn]}>{v}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={{flex:2}}>
                    <Text style={vstyles.fieldLabelDark}>Κλειδαριά / Άφαλος</Text>
                    <TouchableOpacity ref={lockBtnRef} style={[vstyles.selectBtn,{marginTop:2,marginBottom:6}]} onPress={()=>{blurAll();setLockEditText(customForm.lock||'');setCylEditText(customForm.cylinder||'');lockBtnRef.current&&lockBtnRef.current.measureInWindow&&lockBtnRef.current.measureInWindow((x,y,w,h)=>setLockAnchor({x,y,w,h}));setShowLockPicker(true);}}>
                      <Text style={{fontSize:13,color:(customForm.lock||customForm.cylinder)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{[customForm.lock,customForm.cylinder].filter(Boolean).join(' · ')||'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                    <Text style={vstyles.fieldLabelDark}>Τζάμι</Text>
                    <View style={{flexDirection:'row', gap:4, marginTop:2}}>
                      <TextInput ref={glassRef} style={[vstyles.staveraCell,{width:90,textAlign:'center',fontSize:13,fontWeight:'700',minHeight:36}]} placeholder="Υ × Π" keyboardType="numeric" value={customForm.glassDim} selectTextOnFocus onChangeText={v=>setCustomForm({...customForm,glassDim:v})} onSubmitEditing={handleGlassEnter} blurOnSubmit={false} returnKeyType="next"/>
                      <TouchableOpacity style={[vstyles.staveraCell,{width:74,minHeight:36,justifyContent:'center',alignItems:'center',backgroundColor:customForm.glassDesign?'#ede7f6':'#fff'}]} onPress={()=>setCustomForm({...customForm,glassDesign:stavCycle(customForm.glassDesign,designOpts)})}>
                        <Text style={{fontSize:12,fontWeight:'700',color:customForm.glassDesign?'#4a148c':'#bbb'}}>{customForm.glassDesign||'—'}</Text>
                      </TouchableOpacity>
                      <TextInput ref={glassNotesRef} style={[vstyles.staveraCell,{flex:4,minHeight:36}]} placeholder="..." keyboardType="default" value={customForm.glassNotes||''} onChangeText={v=>setCustomForm({...customForm,glassNotes:v})} returnKeyType="done" blurOnSubmit={true}/>
                    </View>
                  </View>
                </View>
                {/* Βαφή Κάσας + Χρώμα Εξαρτημάτων */}
                <View style={{flexDirection:'row',gap:8}}>
                  <View style={{flex:1}}>
                    <Text style={vstyles.fieldLabelDark}>Βαφή Κάσας</Text>
                    <TextInput
                      style={[vstyles.selectBtn,{marginTop:2,marginBottom:8,fontSize:13,color:'#1a1a1a'}]}
                      placeholder="π.χ. STUCTURA 7036"
                      placeholderTextColor="#aaa"
                      value={customForm.casePaint||''}
                      onChangeText={v=>setCustomForm({...customForm,casePaint:v})}
                    />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={vstyles.fieldLabelDark}>Χρώμα Εξαρτημάτων</Text>
                    <TouchableOpacity ref={hardwareBtnRef} style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setPickerEditMode(false);measureAnchor(hardwareBtnRef);setShowHardwarePicker(true);}}>
                      <Text style={{fontSize:13,color:customForm.hardware?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{customForm.hardware||'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={vstyles.fieldLabelDark}>Διάφορα</Text>
                    <TouchableOpacity ref={miscBtnRef} style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();measureAnchor(miscBtnRef);setShowMiscPicker(true);}}>
                      <Text style={{fontSize:13,color:(customForm.misc&&customForm.misc.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>{(customForm.misc&&customForm.misc.length>0)?(customForm.misc[0]+(customForm.misc.length>1?`  +${customForm.misc.length-1}`:'')):'Επιλέξτε...'}</Text>
                      <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Επένδυση */}
                <Text style={vstyles.fieldLabelDark}>Επένδυση</Text>
                <TouchableOpacity ref={coatingsBtnRef} style={[vstyles.selectBtn,{marginTop:2,marginBottom:8}]} onPress={()=>{blurAll();setPickerEditMode(false);measureAnchor(coatingsBtnRef);setShowCoatingsPicker(true);}}>
                  <Text style={{fontSize:13,color:(customForm.coatings&&customForm.coatings.length>0)?'#1a1a1a':'#aaa',flex:1}} numberOfLines={1}>
                    {(customForm.coatings&&customForm.coatings.length>0)?customForm.coatings.join(', '):'Επιλέξτε...'}
                  </Text>
                  <Text style={{color:'#aaa',fontSize:11}}>▼</Text>
                </TouchableOpacity>
                {/* Στοιχεία Επενδύσεων (ανά επιλεγμένη επένδυση) */}
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:6}}>
                {(customForm.coatings||[]).filter(c=>c&&String(c).trim()).map(name=>{
                  const type = getCoatingType(name);
                  const d = customForm.coatingDetails?.[name] || {};
                  const upd = (k,v)=>setCustomForm(f=>{
                    const prev = f.coatingDetails?.[name] || {};
                    const next = {...prev, [k]:v};
                    if (k==='dim') next.dimUser = true;
                    if (k==='frameColor') next.frameColorUser = true;
                    if (k==='caseColor') next.caseColorUser = true;
                    if (k==='color') {
                      if (!prev.frameColorUser) next.frameColor = v;
                      if (type==='EXO' && !prev.caseColorUser) next.caseColor = v;
                    }
                    if (k==='pihaki' && type==='MESA' && !prev.dimUser) {
                      const newDim = computeCoatingDim(f.h, f.w, 'MESA', !!v);
                      if (newDim) next.dim = newDim;
                    }
                    return {...f, coatingDetails:{...(f.coatingDetails||{}), [name]: next}};
                  });
                  const bg = type==='EXO'?'#FFF3E0':type==='MESA'?'#E8F4FD':'#F5F5F5';
                  const bd = type==='EXO'?'#FF9800':type==='MESA'?'#2196F3':'#BBB';
                  const dimStyle = d.dimUser ? {color:'#d32f2f',fontWeight:'900',fontStyle:'italic'} : {};
                  return (
                    <View key={name} style={{flex:1,minWidth:200,backgroundColor:bg,borderWidth:1.5,borderColor:bd,borderRadius:8,padding:8}}>
                      <Text style={{fontWeight:'800',fontSize:11,color:'#1a1a1a',marginBottom:6,letterSpacing:0.5}}>{name}</Text>
                      <View style={{flexDirection:'row',gap:6,marginBottom:5}}>
                        <View style={{flex:1}}><Text style={vstyles.fieldLabel}>Διάσταση</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12},dimStyle]} value={d.dim||''} onChangeText={v=>upd('dim',v)}/></View>
                        <View style={{flex:2}}><Text style={vstyles.fieldLabel}>Χρώμα</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.color||''} onChangeText={v=>upd('color',v)}/></View>
                      </View>
                      <View style={{marginBottom:5}}>
                        <Text style={vstyles.fieldLabel}>Σχέδιο</Text>
                        <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.design||''} onChangeText={v=>upd('design',v)}/>
                      </View>
                      <View style={{flexDirection:'row',gap:6}}>
                        <View style={{flex:1}}><Text style={vstyles.fieldLabel}>Πλ./Είδος Περβ.</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.frameW||''} onChangeText={v=>upd('frameW',v)}/></View>
                        <View style={{flex:2}}><Text style={vstyles.fieldLabel}>Χρώμα Περβ.</Text>
                          <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.frameColor||''} onChangeText={v=>upd('frameColor',v)}/></View>
                      </View>
                      {type==='EXO'&&(
                        <View style={{flexDirection:'row',gap:6,marginTop:5}}>
                          <View style={{flex:1}}><Text style={vstyles.fieldLabel}>Πλάτος Κάσας</Text>
                            <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.caseW||''} onChangeText={v=>upd('caseW',v)}/></View>
                          <View style={{flex:2}}><Text style={vstyles.fieldLabel}>Χρώμα Κάσας</Text>
                            <TextInput style={[vstyles.textInput,{minHeight:32,padding:6,fontSize:12}]} value={d.caseColor||''} onChangeText={v=>upd('caseColor',v)}/></View>
                        </View>
                      )}
                      {type==='MESA'&&(
                        <TouchableOpacity onPress={()=>upd('pihaki', !d.pihaki)} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:6,paddingVertical:3}}>
                          <View style={{width:18,height:18,borderRadius:4,borderWidth:2,borderColor:'#1565C0',backgroundColor:d.pihaki?'#1565C0':'#fff',alignItems:'center',justifyContent:'center'}}>
                            {d.pihaki&&<Text style={{color:'#fff',fontWeight:'900',fontSize:13,lineHeight:13}}>✓</Text>}
                          </View>
                          <Text style={{fontSize:12,fontWeight:'700',color:'#1565C0'}}>Πηχάκι (ξυλογωνιά)</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                </View>
                {/* Παρατηρήσεις */}
                <Text style={vstyles.fieldLabelDark}>Παρατηρήσεις</Text>
                <TextInput ref={notesRef} style={[vstyles.textInput,{height:55,textAlignVertical:'top',marginTop:2}]} placeholder="Προαιρετικά..." value={customForm.notes} multiline onChangeText={v=>setCustomForm({...customForm,notes:v})}/>
              </View>
            </View>




          {groupState && (
            <Text style={{textAlign:'center', color:'#7b1fa2', fontWeight:'bold', fontSize:13, marginBottom:6}}>
              🔗 Συνδεδεμένη παραγγελία{groupState.base ? ` #${groupState.base}` : ''} — {groupState.count} {groupState.count===1?'πόρτα':'πόρτες'} αποθηκευμένες
            </Text>
          )}
          {quoteGroup && (
            <Text style={{textAlign:'center', color:'#6a1b9a', fontWeight:'bold', fontSize:13, marginBottom:6}}>
              💼 Προσφορά — {quoteGroup.count} {quoteGroup.count===1?'πόρτα':'πόρτες'} στην προσφορά
            </Text>
          )}
          <View style={{flexDirection:'row', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
            {!isSeller ? (
            <TouchableOpacity
              style={[styles.saveBtn, {backgroundColor:'#2e7d32', paddingHorizontal:22, marginTop:0}]}
              onPress={()=>{ Keyboard.dismiss(); setPriceModal({visible:true, order:null}); }}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>💶 ΤΙΜΕΣ{(customForm.priceList||[]).length ? ` (${priceFinalTotal(customForm.priceList, customForm.priceDiscount).toFixed(2).replace('.', ',')}€)` : ''}</Text>
            </TouchableOpacity>
            ) : null}
            {(editingOrder || customForm.orderNo || customForm.customer || customForm.h || customForm.w || customForm.programNo) ? (
            <TouchableOpacity
              style={[styles.saveBtn, {backgroundColor:'#555', paddingHorizontal:22, marginTop:0}]}
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
            {sellerFormDocBtn()}
            {!quoteGroup && (<>
            {!editingOrder ? (
            <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#1565C0', paddingHorizontal:22, marginTop:0}]} onPress={()=>{
              Keyboard.dismiss();
              const trigs = peepholeTriggers(customForm.coatings, customForm.notes);
              if (trigs.length > 0) {
                setPeepholeWarn({
                  visible:true, coatings: trigs,
                  onContinue: () => addAnotherDoor(),
                  onAddNote: () => {
                    const newNotes = withPeepholeNote(customForm.notes);
                    setCustomForm(f => ({ ...f, notes: newNotes }));
                    addAnotherDoor({ notes: newNotes });
                  },
                });
              } else {
                addAnotherDoor();
              }
            }}>
              <Text style={{color:'white',fontWeight:'bold',fontSize:15}}>➕ ΠΡΟΣΘΗΚΗ ΝΕΑΣ ΠΟΡΤΑΣ</Text>
            </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#8B0000', paddingHorizontal:22, marginTop:0}]} onPress={()=>{
              Keyboard.dismiss();
              const doSave = () => { doFinalSave(); setTimeout(()=>customerRef.current?.focus(), 400); };
              const proceed = () => {
                const trigs = peepholeTriggers(customForm.coatings, customForm.notes);
                if (trigs.length > 0) {
                  setPeepholeWarn({
                    visible:true,
                    coatings: trigs,
                    onContinue: () => { doFinalSave(); setTimeout(()=>customerRef.current?.focus(), 400); },
                    onAddNote: () => {
                      const newNotes = withPeepholeNote(customForm.notes);
                      setCustomForm(f => ({ ...f, notes: newNotes }));
                      doFinalSave({ notes: newNotes });
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
            </>)}
          </View>
          </>)}

          {/* ═══ ΠΡΟΣΦΟΡΕΣ ═══ */}
          {activeSection==='quotes'&&(
            <View>
              <View style={[styles.listHeader,{backgroundColor:'#8e24aa'}]}>
                <Text style={styles.listHeaderText}>💼 ΠΡΟΣΦΟΡΕΣ{isSeller?' (οι δικές μου)':''} ({specialQuotes.filter(sellerOwnsOrder).length})</Text>
              </View>
              <View style={{flexDirection:'row', alignItems:'center', alignSelf:'flex-start', width:'33%', minWidth:200, backgroundColor:'#fff', borderRadius:8, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:8, paddingVertical:4, marginVertical:8}}>
                <Text style={{fontSize:14, marginRight:4, color:'#aaa'}}>🔍</Text>
                <TextInput style={{flex:1, fontSize:13, color:'#1a1a1a', padding:0}} placeholder="Αναζήτηση πελάτη..." placeholderTextColor="#bbb" autoComplete="off" value={quoteSearch} onChangeText={setQuoteSearch} clearButtonMode="while-editing" />
                {quoteSearch.length>0 && <TouchableOpacity onPress={()=>setQuoteSearch('')}><Text style={{color:'#aaa', fontSize:16, fontWeight:'bold', paddingLeft:4}}>✕</Text></TouchableOpacity>}
              </View>
              {(() => {
                const mine = specialQuotes.filter(sellerOwnsOrder).filter(q=>matchesSearch(q, quoteSearch));
                if (mine.length === 0) return <Text style={{textAlign:'center', color:'#999', marginTop:30}}>Δεν υπάρχουν προσφορές.</Text>;
                const groupsMap = {}; const singles = [];
                mine.forEach(q => { if (q.groupId) (groupsMap[q.groupId] = groupsMap[q.groupId] || []).push(q); else singles.push(q); });
                const entries = [
                  ...singles.map(q => ({ type:'single', q, ts:q.quotedAt||q.createdAt||0 })),
                  ...Object.entries(groupsMap).map(([gid, ds]) => ({ type:'group', gid, doors: ds.slice().sort((a,b)=>(a.groupSeq||0)-(b.groupSeq||0)), q: ds[0], ts: Math.max(...ds.map(d=>d.quotedAt||d.createdAt||0)) })),
                ].sort((a,b)=> b.ts - a.ts);
                const dayBadge = (q) => { const d = quoteDays(q); return (<View style={{backgroundColor: d>=30?'#c62828':d>=7?'#ef6c00':'#2e7d32', borderRadius:6, paddingHorizontal:8, paddingVertical:3, alignSelf:'flex-start'}}><Text style={{color:'#fff', fontSize:12, fontWeight:'bold'}}>⏱ {quoteDaysLabel(q)}</Text></View>); };
                const qBtn = (bg) => ({ backgroundColor:bg, borderRadius:8, paddingHorizontal:12, paddingVertical:8 });
                const qBtnTxt = { color:'#fff', fontWeight:'bold', fontSize:13 };
                const itemBtns = (q) => isForeman ? (
                  q.docCount>0 ? (
                    <View style={{flexDirection:'row', gap:8, marginTop:6, flexWrap:'wrap'}}>
                      <TouchableOpacity onPress={()=>openDocViewer(q)} style={qBtn('#6a1b9a')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ ({q.docCount})</Text></TouchableOpacity>
                    </View>
                  ) : null
                ) : isSeller ? (
                  ((q.priceList||[]).length || q.docCount>0) ? (
                    <View style={{flexDirection:'row', gap:10, marginTop:6, flexWrap:'wrap', alignItems:'center'}}>
                      {(q.priceList||[]).length ? <Text style={{fontSize:15, fontWeight:'bold', color:'#2e7d32'}}>💶 {priceFinalTotal(q.priceList, q.priceDiscount).toFixed(2).replace('.', ',')}€</Text> : null}
                      {q.docCount>0 ? <TouchableOpacity onPress={()=>openDocViewer(q)} style={qBtn('#6a1b9a')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ ({q.docCount})</Text></TouchableOpacity> : null}
                    </View>
                  ) : null
                ) : (
                  <View style={{flexDirection:'row', gap:8, marginTop:6, flexWrap:'wrap'}}>
                    <TouchableOpacity onPress={()=>editQuote(q)} style={qBtn('#1565C0')}><Text style={qBtnTxt}>✏️ ΔΙΟΡΘΩΣΗ</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=>setPriceModal({visible:true, order:q})} style={qBtn('#2e7d32')}><Text style={qBtnTxt}>💶 {(q.priceList||[]).length ? priceFinalTotal(q.priceList, q.priceDiscount).toFixed(2).replace('.', ',')+'€' : 'ΤΙΜΗ'}</Text></TouchableOpacity>
                    {q.docCount>0
                      ? <TouchableOpacity onPress={()=>openDocViewer(q)} style={qBtn('#6a1b9a')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ ({q.docCount})</Text></TouchableOpacity>
                      : <TouchableOpacity onPress={()=>openDocQR(q,'add')} style={qBtn('#777')}><Text style={qBtnTxt}>📎 ΕΓΓΡΑΦΟ</Text></TouchableOpacity>}
                  </View>
                );
                const actions = (entry) => isSeller ? null : (
                  <View style={{flexDirection:'row', gap:8, marginTop:8, flexWrap:'wrap'}}>
                    <TouchableOpacity onPress={()=>convertQuoteToOrder(entry.q)} style={{backgroundColor:'#00C851', borderRadius:8, paddingHorizontal:14, paddingVertical:9}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>✅ ΜΕΤΑΤΡΟΠΗ ΣΕ ΠΑΡΑΓΓΕΛΙΑ</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=>deleteQuote(entry.q)} style={{backgroundColor:'#c62828', borderRadius:8, paddingHorizontal:14, paddingVertical:9}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:13}}>🗑 ΔΙΑΓΡΑΦΗ</Text></TouchableOpacity>
                  </View>
                );
                return entries.map(entry => entry.type==='single' ? (
                  <View key={entry.q.id} style={{backgroundColor:'#fff', borderRadius:10, padding:12, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#8e24aa', elevation:2}}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                      <Text style={{fontSize:16, fontWeight:'bold', color:'#1a1a1a', flex:1}}>{entry.q.customer || '—'}</Text>
                      {dayBadge(entry.q)}
                    </View>
                    <SpecialOrderPreview order={entry.q} coatings={coatings} locks={locks} showCustomer={false} />
                    {itemBtns(entry.q)}
                    {actions(entry)}
                  </View>
                ) : (
                  <View key={entry.gid} style={{backgroundColor:'#fff', borderRadius:10, padding:12, marginBottom:8, borderLeftWidth:5, borderLeftColor:'#6a1b9a', elevation:2}}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                      <Text style={{fontSize:16, fontWeight:'bold', color:'#1a1a1a', flex:1}}>{entry.q.customer || '—'}</Text>
                      {dayBadge(entry.q)}
                    </View>
                    <Text style={{fontSize:13, color:'#6a1b9a', fontWeight:'bold', marginTop:2}}>🔗 Προσφορά — {entry.doors.length} πόρτες</Text>
                    {entry.doors.map((d,i)=>(
                      <View key={d.id} style={{borderTopWidth:1, borderTopColor:'#eee', paddingTop:6, marginTop:6}}>
                        <Text style={{fontSize:13, fontWeight:'bold', color:'#6a1b9a'}}>{i+1}.</Text>
                        <SpecialOrderPreview order={d} coatings={coatings} locks={locks} showCustomer={false} />
                        {itemBtns(d)}
                      </View>
                    ))}
                    {(() => { if (isForeman) return null; const tot = entry.doors.reduce((s,d)=>s+priceFinalTotal(d.priceList, d.priceDiscount),0); return tot ? <Text style={{fontSize:14, fontWeight:'bold', color:'#2e7d32', marginTop:4}}>💶 Σύνολο: {tot.toFixed(2).replace('.', ',')}€</Text> : null; })()}
                    {actions(entry)}
                  </View>
                ));
              })()}
            </View>
          )}

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
                    autoComplete="off"
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
                {!isSeller && <TouchableOpacity style={{backgroundColor:'white', paddingHorizontal:10, paddingVertical:5, borderRadius:20}}
                  onPress={()=>handleSimplePrint(specialOrders.filter(o=>o.status==='READY'), 'ΕΤΟΙΜΑ ΑΠΟΘΗΚΗΣ')}>
                  <Text style={{color:'#00C851', fontSize:11, fontWeight:'bold'}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                </TouchableOpacity>}
              </View>
              {[...specialOrders.filter(o=>o.status==='READY'&&sellerOwnsOrder(o))].sort((a,b)=>(parseInt(a.orderNo)||0)-(parseInt(b.orderNo)||0)).filter(o=>matchesSearch(o, readySearch)).filter(o=>{ if(readyFrom==null) return true; if(!o.readyAt) return false; const d=new Date(o.readyAt); const day=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); const hi=readyTo!=null?readyTo:readyFrom; return day>=readyFrom&&day<=hi; }).map(o=>renderOrderCard(o, false, false, readySearch))}
            </View>
          )}

          {/* ΑΡΧΕΙΟ */}
          {activeSection==='archive'&&(()=>{
            const PAGE = 30;
            const PagerBtn = ({label, disabled, onPress}) => (
              <TouchableOpacity disabled={disabled} onPress={onPress}
                style={{paddingHorizontal:14, paddingVertical:8, borderRadius:8, backgroundColor: disabled?'#ccc':'#333'}}>
                <Text style={{color:'white', fontWeight:'bold', fontSize:13}}>{label}</Text>
              </TouchableOpacity>
            );
            const renderList = (list) => {
              const totalPages = Math.max(1, Math.ceil(list.length / PAGE));
              const page = Math.min(archivePage, totalPages - 1);
              const items = list.slice(page * PAGE, page * PAGE + PAGE);
              return (<>
                {list.length===0 && <Text style={{textAlign:'center', color:'#999', padding:20}}>Καμία παραγγελία.</Text>}
                {items.map(o=>renderOrderCard(o,true))}
                {totalPages > 1 && (
                  <View style={{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:14, flexWrap:'wrap'}}>
                    <PagerBtn label="⏮ ΑΡΧΗ" disabled={page===0} onPress={()=>setArchivePage(0)} />
                    <PagerBtn label="◀" disabled={page===0} onPress={()=>setArchivePage(page-1)} />
                    <Text style={{fontWeight:'bold', color:'#333', minWidth:110, textAlign:'center'}}>Σελίδα {page+1} / {totalPages}</Text>
                    <PagerBtn label="▶" disabled={page>=totalPages-1} onPress={()=>setArchivePage(page+1)} />
                    <PagerBtn label="ΤΕΛΟΣ ⏭" disabled={page>=totalPages-1} onPress={()=>setArchivePage(totalPages-1)} />
                  </View>
                )}
              </>);
            };
            const ToggleBtn = ({label, active, onPress}) => (
              <TouchableOpacity onPress={onPress}
                style={{paddingVertical:10, paddingHorizontal:8, borderRadius:8, alignItems:'center', backgroundColor: active?'#333':'#e0e0e0'}}>
                <Text style={{color: active?'white':'#555', fontWeight:'bold', fontSize:13}}>{label}</Text>
              </TouchableOpacity>
            );
            const startOfDay = (ts) => { const d=new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
            const fmt = (ts) => { const d=new Date(ts); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; };
            const mDate = new Date(archiveMonth);
            const year = mDate.getFullYear(), month = mDate.getMonth();
            const monthNames = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
            const counts = {};
            soldSpecialOrders.forEach(o=>{ if(!o.soldAt) return; const d=new Date(o.soldAt); if(d.getFullYear()===year && d.getMonth()===month) counts[d.getDate()]=(counts[d.getDate()]||0)+1; });
            const firstDow = (new Date(year, month, 1).getDay()+6)%7;
            const daysInMonth = new Date(year, month+1, 0).getDate();
            const cells = [];
            for(let i=0;i<firstDow;i++) cells.push(null);
            for(let d=1;d<=daysInMonth;d++) cells.push(d);
            const years = [...new Set(soldSpecialOrders.filter(o=>o.soldAt).map(o=>new Date(o.soldAt).getFullYear()))].sort((a,b)=>b-a);
            const lo = archiveFrom;
            const hi = archiveTo!=null ? archiveTo : archiveFrom;
            const pickDay = (ts) => {
              setArchivePage(0);
              if (archiveFrom==null || archiveTo!=null) { setArchiveFrom(ts); setArchiveTo(null); }
              else if (ts < archiveFrom) { setArchiveTo(archiveFrom); setArchiveFrom(ts); }
              else setArchiveTo(ts);
            };
            const rangeList = lo!=null ? soldSpecialOrders.filter(o=>{ if(!o.soldAt) return false; const t=startOfDay(o.soldAt); return t>=lo && t<=hi; }).sort((a,b)=>(a.soldAt||0)-(b.soldAt||0)) : [];
            const q = archiveSearch.trim();
            const searchResults = q ? soldSpecialOrders.filter(o=>matchesSearch(o, q)).sort((a,b)=>(b.soldAt||0)-(a.soldAt||0)) : [];
            const shownList = archiveView==='search' ? searchResults : rangeList;
            return (
            <View>
              <View style={{flexDirection:'row', gap:24, paddingVertical:10, alignItems:'flex-start'}}>
                <View style={{width:430}}>
                  {archiveView==='search' ? (
                    <View style={{flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:8, borderWidth:1.5, borderColor:'#ddd', paddingHorizontal:10, paddingVertical:6}}>
                      <Text style={{fontSize:16, marginRight:6, color:'#aaa'}}>🔍</Text>
                      <TextInput
                        style={{flex:1, fontSize:14, color:'#1a1a1a', padding:0}}
                        placeholder="Πελάτης ή αριθμός παραγγελίας..."
                        placeholderTextColor="#bbb"
                        autoComplete="off"
                        value={archiveSearch}
                        onChangeText={v=>{ setArchiveSearch(v); setArchivePage(0); }}
                      />
                      {archiveSearch.length>0 && (
                        <TouchableOpacity onPress={()=>{ setArchiveSearch(''); setArchivePage(0); }}>
                          <Text style={{color:'#aaa', fontSize:16, fontWeight:'bold', paddingLeft:6}}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <View style={{maxWidth:430}}>
                      <View style={{flexDirection:'row', alignItems:'center', marginBottom:6}}>
                        <TouchableOpacity onPress={()=>setArchiveMonth(new Date(year, month-1, 1).getTime())}
                          style={{paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor:'#333'}}>
                          <Text style={{color:'white', fontWeight:'bold'}}>◀</Text>
                        </TouchableOpacity>
                        <Text style={{fontSize:15, fontWeight:'bold', color:'#333', marginHorizontal:6}}>{monthNames[month]} {year}</Text>
                        <TouchableOpacity onPress={()=>setArchiveMonth(new Date(year, month+1, 1).getTime())}
                          style={{paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor:'#333'}}>
                          <Text style={{color:'white', fontWeight:'bold'}}>▶</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={()=>setArchiveMonth(new Date().getTime())}
                          style={{paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor:'#2e7d32', marginLeft:6}}>
                          <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>Σήμερα</Text>
                        </TouchableOpacity>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flex:1, marginLeft:8}}
                          contentContainerStyle={{flexGrow:1, justifyContent:'flex-end', alignItems:'center', gap:6}}>
                          {years.map(y=>(
                            <TouchableOpacity key={y} onPress={()=>setArchiveMonth(new Date(y, month, 1).getTime())}
                              style={{paddingHorizontal:10, paddingVertical:5, borderRadius:16, backgroundColor: y===year?'#333':'#e0e0e0'}}>
                              <Text style={{color: y===year?'white':'#555', fontWeight:'bold', fontSize:12}}>{y}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                      <View style={{flexDirection:'row'}}>
                        {['Δε','Τρ','Τε','Πε','Πα','Σα','Κυ'].map(w=>(
                          <View key={w} style={{flex:1, alignItems:'center', paddingVertical:2}}>
                            <Text style={{fontSize:10, fontWeight:'bold', color:'#888'}}>{w}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={{flexDirection:'row', flexWrap:'wrap'}}>
                        {cells.map((d,i)=>{
                          if(d===null) return <View key={'e'+i} style={{width:`${100/7}%`, padding:2}} />;
                          const c = counts[d]||0;
                          const cellTs = new Date(year, month, d).getTime();
                          const inRange = archiveFrom!=null && cellTs>=lo && cellTs<=hi;
                          const isToday = cellTs===startOfDay(Date.now());
                          return (
                            <View key={d} style={{width:`${100/7}%`, padding:2}}>
                              <TouchableOpacity disabled={c===0}
                                onPress={()=>pickDay(cellTs)}
                                style={{minHeight:34, borderRadius:6, alignItems:'center', justifyContent:'center', backgroundColor: inRange?'#333':(isToday?'#2e7d32':(c>0?'#e3f2fd':'#f5f5f5')), borderWidth: (c>0||isToday)?1.5:1, borderColor: inRange?'#333':(isToday?'#2e7d32':(c>0?'#90caf9':'#eee'))}}>
                                <Text style={{fontSize:12, fontWeight:'bold', color: (inRange||isToday)?'white':'#333'}}>{d}</Text>
                                {c>0 && <Text style={{fontSize:13, fontWeight:'900', color: (inRange||isToday)?'#fff':'#c62828'}}>{c}</Text>}
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>

                <View style={{width:140, gap:16}}>
                  <ToggleBtn label="🔍 Αναζήτηση" active={archiveView==='search'} onPress={()=>{ setArchiveView('search'); setArchivePage(0); }} />
                  <ToggleBtn label="📅 Ημερολόγιο" active={archiveView==='calendar'} onPress={()=>{ setArchiveView('calendar'); setArchivePage(0); }} />
                  {archiveView==='calendar' && archiveFrom!=null && (
                    <TouchableOpacity onPress={()=>{ setArchiveFrom(null); setArchiveTo(null); setArchivePage(0); }}
                      style={{paddingVertical:8, borderRadius:8, alignItems:'center', backgroundColor:'#c62828'}}>
                      <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>✕ Καθάρισμα</Text>
                    </TouchableOpacity>
                  )}
                  {isAdmin && (
                    <TouchableOpacity onPress={()=>handleSimplePrint(shownList, 'ΑΡΧΕΙΟ ΠΩΛΗΣΕΩΝ')}
                      style={{paddingVertical:8, borderRadius:8, alignItems:'center', backgroundColor:'#1976d2'}}>
                      <Text style={{color:'white', fontWeight:'bold', fontSize:12}}>🖨️ ΕΚΤΥΠΩΣΗ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {archiveView==='search'
                ? (q ? renderList(searchResults) : <Text style={{textAlign:'center', color:'#999', padding:20}}>Γράψε όνομα πελάτη ή αριθμό παραγγελίας.</Text>)
                : (archiveFrom!=null
                    ? (<View style={{marginTop:12}}>
                        <Text style={{fontSize:14, fontWeight:'bold', color:'#333', marginBottom:8}}>Πωλήσεις {fmt(lo)}{hi!==lo?` έως ${fmt(hi)}`:''} ({rangeList.length})</Text>
                        {renderList(rangeList)}
                      </View>)
                    : <Text style={{textAlign:'center', color:'#999', padding:20}}>Διάλεξε μέρα στο ημερολόγιο (ή δύο μέρες για διάστημα).</Text>)
              }
            </View>
            );
          })()}

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
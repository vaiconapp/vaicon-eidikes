import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Platform, Alert } from 'react-native';
import { FIREBASE_URL } from './App';
import { suggestNextOrderNo, groupOrderNo, groupSubmissions } from './formatHelpers';
import { SpecialOrderPreview } from './OrderPreview';
import { fmtDateTime } from './utils';
// Οθόνη εγκρίσεων παραγγελιών πωλητή (Ειδικές).
export default function ApprovalScreen({ onClose, currentUserName = '', resolveLabel = (u) => u, coatings = [], locks = [], customers = [], onOpenSubmission = null }) {
  // Σφραγίδα πωλητή = ο πωλητής του πελάτη· fallback ο υποβάλλων.
  const sellerOfSub = (sub) => {
    const c = sub.customerId ? customers.find(x => x.id === sub.customerId) : customers.find(x => String(x.name) === String(sub.customer));
    return c?.seller || sub.submittedBy || '';
  };
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ visible: false, sub: null, group: null, note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FIREBASE_URL}/seller_submissions.json`);
      const data = await res.json();
      const list = data ? Object.keys(data).map(k => ({ _sid: k, ...data[k] })) : [];
      setSubs(list.filter(s => s.status === 'PENDING' && s.orderType === 'ΕΙΔΙΚΗ').sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)));
    } catch { setSubs([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const notify = (t, m) => Platform.OS === 'web' ? window.alert(`${t}\n${m}`) : Alert.alert(t, m);

  const nextBaseNumber = async () => {
    const [sp, std, seq] = await Promise.all([
      fetch(`${FIREBASE_URL}/special_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/std_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/order_seq.json`).then(r => r.json()).catch(() => null),
    ]);
    const cross = [...Object.values(sp || {}), ...Object.values(std || {})];
    return suggestNextOrderNo(cross.map(o => o.orderNo), Object.keys(seq || {}));
  };

  // «Κουπόνι»: κλειδώνει το νούμερο γράφοντας μόνο αν ΔΕΝ υπάρχει (atomic μέσω κανόνα order_seq/$num).
  // Σε ταυτόχρονη έγκριση, ο δεύτερος παίρνει permission-denied και δοκιμάζει το επόμενο.
  const claimBaseNumber = async () => {
    let n = Number(await nextBaseNumber());
    for (let i = 0; i < 100; i++, n++) {
      const res = await fetch(`${FIREBASE_URL}/order_seq/${n}.json`, { method: 'PUT', body: JSON.stringify(Date.now()) });
      if (res.ok) return String(n);
    }
    throw new Error('order number claim failed');
  };

  // Δημιουργία εγκεκριμένης ειδικής παραγγελίας (1 πόρτα) + log. Δεν αγγίζει το order_seq.
  const persistApproved = async (sub, number, id, groupMeta) => {
    const { status: _st, submittedBy, submittedAt, _sid, ...rest } = sub;
    const order = {
      ...rest, id, orderNo: number, orderType: 'ΕΙΔΙΚΗ', status: 'PENDING', seller: sellerOfSub(sub),
      createdAt: sub.createdAt || Date.now(), enteredBy: submittedBy,
      approvedBy: currentUserName, approvedAt: Date.now(),
      ...(groupMeta ? { groupId: groupMeta.groupId, groupSeq: groupMeta.groupSeq } : {}),
    };
    const r = await fetch(`${FIREBASE_URL}/special_orders/${id}.json`, { method: 'PUT', body: JSON.stringify(order) });
    if (!r.ok) throw new Error();
    await fetch(`${FIREBASE_URL}/approval_log.json`, { method: 'POST', body: JSON.stringify({ ts: Date.now(), section: 'ΕΙΔΙΚΗ', action: 'APPROVED', orderNo: number, customer: sub.customer || '', submittedBy: submittedBy || '', submittedAt: sub.submittedAt || null, approvedBy: currentUserName || '' }) }).catch(() => {});
    // Η υποβολή μένει στον φάκελο του πωλητή ως εγκεκριμένη (καθαρίζεται αυτόματα μετά από λίγες μέρες).
    // Δεν «καταπίνουμε» αποτυχία εδώ: αλλιώς η παραγγελία υπάρχει αλλά η υποβολή μένει PENDING.
    const subRes = await fetch(`${FIREBASE_URL}/seller_submissions/${sub._sid}.json`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', approvedOrderNo: number, approvedBy: currentUserName || '', approvedAt: Date.now() }) });
    if (!subRes.ok) throw new Error();
  };

  // Έγκριση ΠΡΟΣΦΟΡΑΣ πωλητή → δημιουργία στο special_quotes (χωρίς αριθμό).
  const persistApprovedQuote = async (sub) => {
    const { status: _st, submittedBy, submittedAt, _sid, ...rest } = sub;
    const quote = {
      ...rest, id: sub._sid, orderNo: '', orderType: 'ΕΙΔΙΚΗ', isQuote: true, status: 'QUOTE', seller: sellerOfSub(sub),
      quotedAt: Date.now(), createdAt: sub.createdAt || Date.now(), enteredBy: submittedBy,
      approvedBy: currentUserName, approvedAt: Date.now(),
    };
    const r = await fetch(`${FIREBASE_URL}/special_quotes/${quote.id}.json`, { method: 'PUT', body: JSON.stringify(quote) });
    if (!r.ok) throw new Error();
    await fetch(`${FIREBASE_URL}/approval_log.json`, { method: 'POST', body: JSON.stringify({ ts: Date.now(), section: 'ΕΙΔΙΚΗ', action: 'APPROVED_QUOTE', customer: sub.customer || '', submittedBy: submittedBy || '', submittedAt: sub.submittedAt || null, approvedBy: currentUserName || '' }) }).catch(() => {});
    const subRes = await fetch(`${FIREBASE_URL}/seller_submissions/${sub._sid}.json`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', approvedBy: currentUserName || '', approvedAt: Date.now() }) });
    if (!subRes.ok) throw new Error();
  };

  // Φρέσκο διάβασμα της υποβολής τη στιγμή της ενέργειας (αποτρέπει διπλή έγκριση & έγκριση μη-ορατών αλλαγών).
  const freshSub = async (sid) => await fetch(`${FIREBASE_URL}/seller_submissions/${sid}.json`).then(r => r.json()).catch(() => null);
  const stillPending = async (sid) => (await freshSub(sid))?.status === 'PENDING';
  // 'gone' = δεν είναι πια σε αναμονή, 'changed' = ο πωλητής τη διόρθωσε από τότε που φορτώθηκε, 'ok' = ίδια & σε αναμονή.
  const checkApprovable = (fresh, sub) =>
    (!fresh || fresh.status !== 'PENDING') ? 'gone'
      : ((fresh.submittedAt || 0) !== (sub.submittedAt || 0)) ? 'changed' : 'ok';

  const approve = async (sub) => {
    setBusyId(sub._sid);
    try {
      const st = checkApprovable(await freshSub(sub._sid), sub);
      if (st === 'gone') { notify('Ήδη διεκπεραιωμένη', 'Η παραγγελία έχει ήδη εγκριθεί ή απορριφθεί.'); await load(); setBusyId(null); return; }
      if (st === 'changed') { notify('Άλλαξε η παραγγελία', 'Ο πωλητής τη διόρθωσε στο μεταξύ — δες την ξανά πριν την εγκρίνεις.'); await load(); setBusyId(null); return; }
      if (sub.isQuote) { await persistApprovedQuote(sub); await load(); setBusyId(null); return; }
      const number = await claimBaseNumber();
      await persistApproved(sub, number, sub._sid);
      await load();
    } catch { notify('Σφάλμα', 'Η έγκριση απέτυχε. Δοκίμασε ξανά.'); }
    setBusyId(null);
  };

  const approveGroup = async (group) => {
    setBusyId(group.groupId);
    try {
      const fresh = await Promise.all(group.subs.map(s => freshSub(s._sid)));
      const states = fresh.map((f, idx) => checkApprovable(f, group.subs[idx]));
      if (states.some(s => s === 'gone')) { notify('Ήδη διεκπεραιωμένη', 'Κάποια πόρτα της ομάδας έχει ήδη εγκριθεί ή απορριφθεί.'); await load(); setBusyId(null); return; }
      if (states.some(s => s === 'changed')) { notify('Άλλαξε η παραγγελία', 'Ο πωλητής διόρθωσε κάποια πόρτα στο μεταξύ — δες την ξανά πριν την εγκρίνεις.'); await load(); setBusyId(null); return; }
      if (group.subs[0]?.isQuote) {
        for (const sub of group.subs) await persistApprovedQuote(sub);
        await load(); setBusyId(null); return;
      }
      const base = await claimBaseNumber();
      let i = 1;
      for (const sub of group.subs) {
        await persistApproved(sub, groupOrderNo(base, i), sub._sid, { groupId: group.groupId, groupSeq: i });
        i++;
      }
      await load();
    } catch { notify('Σφάλμα', 'Η έγκριση απέτυχε. Δοκίμασε ξανά.'); }
    setBusyId(null);
  };

  const doReject = async () => {
    const targets = rejectModal.group ? rejectModal.group.subs : (rejectModal.sub ? [rejectModal.sub] : []);
    if (targets.length === 0) return;
    setBusyId(rejectModal.group ? rejectModal.group.groupId : rejectModal.sub._sid);
    try {
      const checks = await Promise.all(targets.map(s => stillPending(s._sid)));
      if (checks.some(ok => !ok)) { notify('Άλλαξε κατάσταση', 'Κάποια παραγγελία εγκρίθηκε ή άλλαξε στο μεταξύ — ανανεώθηκε η λίστα.'); setRejectModal({ visible: false, sub: null, group: null, note: '' }); await load(); setBusyId(null); return; }
      for (const sub of targets) {
        const res = await fetch(`${FIREBASE_URL}/seller_submissions/${sub._sid}.json`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'REJECTED', rejectNote: rejectModal.note || '', rejectedBy: currentUserName || '', rejectedAt: Date.now() }),
        });
        if (!res.ok) throw new Error();
      }
      const first = targets[0];
      await fetch(`${FIREBASE_URL}/approval_log.json`, { method: 'POST', body: JSON.stringify({ ts: Date.now(), section: 'ΕΙΔΙΚΗ', action: 'REJECTED', customer: first.customer || '', submittedBy: first.submittedBy || '', submittedAt: first.submittedAt || null, approvedBy: currentUserName || '', rejectNote: rejectModal.note || '' }) }).catch(() => {});
      setRejectModal({ visible: false, sub: null, group: null, note: '' });
      await load();
    } catch { notify('Σφάλμα', 'Η απόρριψη απέτυχε.'); }
    setBusyId(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔔 ΠΡΟΣ ΕΓΚΡΙΣΗ ({subs.length})</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8B0000" style={{ marginTop: 24 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
          {subs.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν παραγγελίες προς έγκριση.</Text> :
            groupSubmissions(subs).map(entry => entry.type === 'group' ? (
              <View key={entry.groupId} style={[styles.card, { flexDirection: 'column', borderLeftColor: '#7b1fa2' }]}>
                <View style={styles.sellerBadge}><Text style={styles.sellerBadgeTxt}>🧑‍💼 {resolveLabel(entry.subs[0].submittedBy) || entry.subs[0].submittedBy}</Text></View>
                {entry.subs[0].submittedAt ? <Text style={styles.timeTag}>📤 Υποβολή: {fmtDateTime(entry.subs[0].submittedAt)}</Text> : null}
                {entry.subs[0].isQuote && <View style={styles.quoteBadge}><Text style={styles.quoteBadgeTxt}>💼 ΠΡΟΣΦΟΡΑ</Text></View>}
                <Text style={styles.customer}>{entry.subs[0].customer || '—'}</Text>
                <Text style={styles.linkTag}>🔗 {entry.subs[0].isQuote ? 'Προσφορά' : 'Συνδεδεμένη παραγγελία'} — {entry.subs.length} πόρτες</Text>
                {entry.subs.map((sub, i) => (
                  <View key={sub._sid} style={styles.doorRow}>
                    <Text style={styles.doorNum}>{i + 1}.</Text>
                    <View style={{ flex: 1 }}>
                      <SpecialOrderPreview order={sub} coatings={coatings} locks={locks} showCustomer={false} />
                    </View>
                    {!entry.subs[0].isQuote && onOpenSubmission && (
                      <TouchableOpacity style={[styles.openBtn, { alignSelf: 'center' }]} onPress={() => onOpenSubmission(sub)}>
                        <Text style={styles.btnTxt}>📂 ΑΝΟΙΓΜΑ</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {entry.subs[0].isQuote && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity disabled={busyId === entry.groupId} style={[styles.approveBtn, { flex: 1, minWidth: 0 }, busyId === entry.groupId && { opacity: 0.5 }]} onPress={() => approveGroup(entry)}>
                      <Text style={styles.btnTxt}>✅ ΕΓΚΡΙΣΗ ΟΛΩΝ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={busyId === entry.groupId} style={[styles.rejectBtn, { flex: 1, minWidth: 0 }, busyId === entry.groupId && { opacity: 0.5 }]} onPress={() => setRejectModal({ visible: true, sub: null, group: entry, note: '' })}>
                      <Text style={styles.btnTxt}>✕ ΑΠΟΡΡΙΨΗ ΟΛΩΝ</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View key={entry.sub._sid} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <View style={styles.sellerBadge}><Text style={styles.sellerBadgeTxt}>🧑‍💼 {resolveLabel(entry.sub.submittedBy) || entry.sub.submittedBy}</Text></View>
                  {entry.sub.submittedAt ? <Text style={styles.timeTag}>📤 Υποβολή: {fmtDateTime(entry.sub.submittedAt)}</Text> : null}
                  {entry.sub.isQuote && <View style={styles.quoteBadge}><Text style={styles.quoteBadgeTxt}>💼 ΠΡΟΣΦΟΡΑ</Text></View>}
                  <SpecialOrderPreview order={entry.sub} coatings={coatings} locks={locks} />
                </View>
                <View style={{ gap: 8, justifyContent: 'center' }}>
                  {!entry.sub.isQuote && onOpenSubmission ? (
                    <TouchableOpacity style={styles.openBtn} onPress={() => onOpenSubmission(entry.sub)}>
                      <Text style={styles.btnTxt}>📂 ΑΝΟΙΓΜΑ</Text>
                    </TouchableOpacity>
                  ) : (<>
                    <TouchableOpacity disabled={busyId === entry.sub._sid} style={[styles.approveBtn, busyId === entry.sub._sid && { opacity: 0.5 }]} onPress={() => approve(entry.sub)}>
                      <Text style={styles.btnTxt}>✅ ΕΓΚΡΙΣΗ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={busyId === entry.sub._sid} style={[styles.rejectBtn, busyId === entry.sub._sid && { opacity: 0.5 }]} onPress={() => setRejectModal({ visible: true, sub: entry.sub, group: null, note: '' })}>
                      <Text style={styles.btnTxt}>✕ ΑΠΟΡΡΙΨΗ</Text>
                    </TouchableOpacity>
                  </>)}
                </View>
              </View>
            ))}
        </ScrollView>
      )}

      <Modal visible={rejectModal.visible} transparent animationType="fade" onRequestClose={() => setRejectModal({ visible: false, sub: null, group: null, note: '' })}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>✕ Απόρριψη {rejectModal.group ? `ομάδας (${rejectModal.group.subs.length} πόρτες)` : 'παραγγελίας'}</Text>
            <Text style={styles.boxSub}>Πελάτης: {(rejectModal.group ? rejectModal.group.subs[0]?.customer : rejectModal.sub?.customer) || '—'}</Text>
            <Text style={styles.boxSub}>Σημείωση για τον πωλητή (προαιρετικό):</Text>
            <TextInput style={styles.noteInput} multiline placeholder="π.χ. λάθος διάσταση, διευκρίνισε..." value={rejectModal.note} onChangeText={t => setRejectModal(m => ({ ...m, note: t }))} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#eee' }]} onPress={() => setRejectModal({ visible: false, sub: null, group: null, note: '' })}><Text style={{ color: '#555', fontWeight: 'bold' }}>ΑΚΥΡΟ</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#c62828' }]} onPress={doReject}><Text style={{ color: '#fff', fontWeight: 'bold' }}>ΑΠΟΡΡΙΨΗ</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#8B0000', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  close: { color: '#fff', fontSize: 22, fontWeight: 'bold', paddingHorizontal: 6 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 5, borderLeftColor: '#8B0000', elevation: 2, gap: 8 },
  sellerBadge: { alignSelf: 'flex-start', backgroundColor: '#e3f2fd', borderColor: '#1565C0', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  sellerBadgeTxt: { color: '#1565C0', fontWeight: 'bold', fontSize: 12 },
  timeTag: { fontSize: 12, color: '#555', marginBottom: 4 },
  quoteBadge: { alignSelf: 'flex-start', backgroundColor: '#f3e5f5', borderColor: '#8e24aa', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  quoteBadgeTxt: { color: '#6a1b9a', fontWeight: 'bold', fontSize: 12 },
  customer: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  detail: { fontSize: 13, color: '#555', marginTop: 2 },
  linkTag: { fontSize: 13, color: '#7b1fa2', fontWeight: 'bold', marginTop: 4 },
  doorRow: { flexDirection: 'row', gap: 8, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#eee' },
  doorNum: { fontSize: 14, fontWeight: 'bold', color: '#7b1fa2', minWidth: 18 },
  openBtn: { backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 120 },
  approveBtn: { backgroundColor: '#00C851', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 120 },
  rejectBtn: { backgroundColor: '#c62828', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 120 },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 },
  boxTitle: { fontSize: 17, fontWeight: 'bold', color: '#c62828', marginBottom: 8 },
  boxSub: { fontSize: 13, color: '#555', marginTop: 6 },
  noteInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginTop: 6, minHeight: 70, textAlignVertical: 'top' },
  modalBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
});

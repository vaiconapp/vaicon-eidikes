import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { FIREBASE_URL } from './App';
import { groupSubmissions } from './formatHelpers';
import { SpecialOrderPreview } from './OrderPreview';
import { fmtDateTime } from './utils';

// Εγκεκριμένες υποβολές φαίνονται μόνο την ημέρα της έγκρισης· την επόμενη μέρα καθαρίζονται.
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Πλευρά πωλητή: οι δικές του υποβολές (Υπό έγκριση / Εγκρίθηκαν / Απορρίφθηκαν).
export default function SellerSubmissionsScreen({ sellerKey, onEditSubmission, coatings = [], locks = [] }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${FIREBASE_URL}/seller_submissions.json`);
      const data = await res.json();
      const list = data ? Object.keys(data).map(k => ({ _sid: k, ...data[k] })) : [];
      const mine = list.filter(s => s.submittedBy === sellerKey && s.orderType === 'ΕΙΔΙΚΗ');
      const cutoff = startOfToday();
      const stale = mine.filter(s => s.status === 'APPROVED' && (s.approvedAt || 0) < cutoff);
      if (stale.length) await Promise.all(stale.map(s => fetch(`${FIREBASE_URL}/seller_submissions/${s._sid}.json`, { method: 'DELETE' }).catch(() => {})));
      const staleIds = new Set(stale.map(s => s._sid));
      setSubs(mine.filter(s => !staleIds.has(s._sid)).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)));
    } catch { setSubs([]); }
    setLoading(false);
  }, [sellerKey]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const del = (sub) => {
    const doDel = async () => { await fetch(`${FIREBASE_URL}/seller_submissions/${sub._sid}.json`, { method: 'DELETE' }).catch(() => {}); load(); };
    if (Platform.OS === 'web') { if (window.confirm('Διαγραφή αυτής της υποβολής;')) doDel(); }
    else Alert.alert('Διαγραφή', 'Διαγραφή αυτής της υποβολής;', [{ text: 'Όχι' }, { text: 'Ναι', style: 'destructive', onPress: doDel }]);
  };

  const pending = subs.filter(s => s.status === 'PENDING');
  const approved = subs.filter(s => s.status === 'APPROVED');
  const rejected = subs.filter(s => s.status === 'REJECTED');

  const renderEntries = (list, kind) => groupSubmissions(list).map(entry => entry.type === 'group' ? (
    <View key={entry.groupId} style={styles.groupBox}>
      <Text style={styles.groupHeader}>{entry.subs[0].isQuote ? '💼 Προσφορά' : '🔗 Συνδεδεμένη παραγγελία'} — {entry.subs[0].customer || '—'} ({entry.subs.length} πόρτες)</Text>
      {entry.subs.map(s => renderCard(s, kind, true))}
    </View>
  ) : renderCard(entry.sub, kind, false));

  const renderCard = (sub, kind, inGroup) => {
    const isRejected = kind === 'rejected', isApproved = kind === 'approved';
    return (
    <View key={sub._sid} style={[styles.card, { borderLeftColor: isRejected ? '#c62828' : isApproved ? '#2e7d32' : '#ff9800' }]}>
      <View style={{ flex: 1 }}>
        {sub.isQuote ? <Text style={styles.quoteTag}>💼 ΠΡΟΣΦΟΡΑ</Text> : null}
        <SpecialOrderPreview order={sub} coatings={coatings} locks={locks} showCustomer={!inGroup} />
        {sub.submittedAt ? <Text style={styles.timeTag}>📤 Στάλθηκε: {fmtDateTime(sub.submittedAt)}</Text> : null}
        {isRejected && sub.rejectNote ? <Text style={styles.note}>📝 {sub.rejectNote}</Text> : null}
        {isApproved ? <Text style={styles.approvedTag}>✅ Εγκρίθηκε{sub.approvedAt ? `: ${fmtDateTime(sub.approvedAt)}` : ''}{sub.approvedOrderNo ? ` — Νο ${sub.approvedOrderNo}` : ''}{sub.approvedBy ? ` · ${sub.approvedBy}` : ''}</Text>
          : isRejected ? <Text style={styles.rejectedTag}>↩️ Απορρίφθηκε{sub.rejectedAt ? `: ${fmtDateTime(sub.rejectedAt)}` : ''}{sub.rejectedBy ? ` · ${sub.rejectedBy}` : ''}</Text>
          : <Text style={styles.pendingTag}>⏳ Αναμονή έγκρισης</Text>}
      </View>
      <View style={{ gap: 8, justifyContent: 'center' }}>
        {!isApproved && onEditSubmission ? (
          <TouchableOpacity style={styles.editBtn} onPress={() => onEditSubmission(sub)}><Text style={styles.btnTxt}>✏️ Διόρθωση</Text></TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.delBtn} onPress={() => del(sub)}><Text style={styles.btnTxt}>🗑 Διαγραφή</Text></TouchableOpacity>
      </View>
    </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator size="large" color="#8B0000" style={{ marginTop: 24 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.sectionTitle}>⏳ ΥΠΟ ΕΓΚΡΙΣΗ ({pending.length})</Text>
          {pending.length === 0 ? <Text style={styles.empty}>Καμία υποβολή σε αναμονή.</Text> : renderEntries(pending, 'pending')}
          <Text style={[styles.sectionTitle, { marginTop: 18, color: '#2e7d32' }]}>✅ ΕΓΚΡΙΘΗΚΑΝ ({approved.length})</Text>
          {approved.length === 0 ? <Text style={styles.empty}>Καμία εγκεκριμένη.</Text> : renderEntries(approved, 'approved')}
          <Text style={[styles.sectionTitle, { marginTop: 18, color: '#c62828' }]}>↩️ ΑΠΟΡΡΙΦΘΗΚΑΝ ({rejected.length})</Text>
          {rejected.length === 0 ? <Text style={styles.empty}>Καμία απορριφθείσα.</Text> : renderEntries(rejected, 'rejected')}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#e65100', marginBottom: 8 },
  empty: { color: '#999', fontStyle: 'italic', marginBottom: 8 },
  groupBox: { borderWidth: 1, borderColor: '#7b1fa2', borderRadius: 10, padding: 6, marginBottom: 8, backgroundColor: '#faf5fc' },
  groupHeader: { fontSize: 13, fontWeight: 'bold', color: '#7b1fa2', marginBottom: 4, marginLeft: 2 },
  quoteTag: { alignSelf: 'flex-start', backgroundColor: '#f3e5f5', color: '#6a1b9a', borderWidth: 1, borderColor: '#8e24aa', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, fontWeight: 'bold', fontSize: 12, marginBottom: 4 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 5, elevation: 1, gap: 8 },
  customer: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  detail: { fontSize: 13, color: '#555', marginTop: 2 },
  note: { fontSize: 13, color: '#c62828', fontWeight: 'bold', marginTop: 4 },
  pendingTag: { fontSize: 12, color: '#e65100', fontWeight: 'bold', marginTop: 4 },
  timeTag: { fontSize: 12, color: '#555', marginTop: 4 },
  approvedTag: { fontSize: 13, color: '#2e7d32', fontWeight: 'bold', marginTop: 4 },
  rejectedTag: { fontSize: 12, color: '#c62828', fontWeight: 'bold', marginTop: 4 },
  editBtn: { backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', minWidth: 110 },
  delBtn: { backgroundColor: '#b71c1c', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', minWidth: 110 },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});

import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, Platform,
  StatusBar, TouchableOpacity, Modal, TextInput, Alert, BackHandler
} from 'react-native';
import SpecialScreen from './SpecialScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import LocksScreen from './LocksScreen';
import ActivityScreen from './ActivityScreen';

// ============================================================
//  🔥 FIREBASE — αλλάξτε με το νέο σας Firebase URL
// ============================================================
export const FIREBASE_URL = "https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app";

// ============================================================
//  🔐 ΚΩΔΙΚΟΣ ΠΡΟΣΒΑΣΗΣ
// ============================================================
const VAICON_PASSWORD = "vaicon2024";
const STORAGE_KEY = "vaicon_special_auth_v1";

const isRemembered = () => {
  if (Platform.OS !== 'web') return false;
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
};
const rememberLogin = () => {
  if (Platform.OS !== 'web') return;
  try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
};
const forgetLogin = () => {
  if (Platform.OS !== 'web') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

// ============================================================
//  Οθόνη Login
// ============================================================
function LoginScreen({ onSuccess }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleLogin = () => {
    if (pwd === VAICON_PASSWORD) {
      rememberLogin();
      onSuccess();
    } else {
      setError(true);
      setPwd('');
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <View style={loginStyles.bg}>
      <View style={loginStyles.card}>
        <View style={loginStyles.logoBox}>
          <Text style={loginStyles.logoText}>VAICON</Text>
          <Text style={loginStyles.logoSub}>Ειδικές Παραγγελίες</Text>
        </View>
        <Text style={loginStyles.label}>Κωδικός Πρόσβασης</Text>
        <View style={loginStyles.inputRow}>
          <TextInput
            style={[loginStyles.input, error && loginStyles.inputError]}
            secureTextEntry={!showPwd}
            value={pwd}
            onChangeText={setPwd}
            placeholder="Κωδικός..."
            autoFocus
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity style={loginStyles.eyeBtn} onPress={() => setShowPwd(v => !v)}>
            <Text style={{ fontSize: 20 }}>{showPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={loginStyles.errorTxt}>❌ Λάθος κωδικός. Δοκιμάστε ξανά.</Text>}
        <TouchableOpacity style={loginStyles.btn} onPress={handleLogin}>
          <Text style={loginStyles.btnTxt}>🔓 ΕΙΣΟΔΟΣ</Text>
        </TouchableOpacity>
        <Text style={loginStyles.hint}>
          Αυτή η συσκευή θα απομνημονεύσει την είσοδό σας.
        </Text>
      </View>
    </View>
  );
}

const loginStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#8B0000', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 32, width: '90%', maxWidth: 400, elevation: 10 },
  logoBox: { alignItems: 'center', marginBottom: 28 },
  logoText: { fontSize: 36, fontWeight: '900', color: '#8B0000', letterSpacing: 4 },
  logoSub: { fontSize: 13, color: '#888', marginTop: 4, letterSpacing: 1 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  input: { flex: 1, borderWidth: 2, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 18, letterSpacing: 2 },
  inputError: { borderColor: '#ff4444' },
  eyeBtn: { padding: 10, marginLeft: 8 },
  errorTxt: { color: '#ff4444', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  btn: { backgroundColor: '#8B0000', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  btnTxt: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  hint: { color: '#aaa', fontSize: 11, textAlign: 'center', marginTop: 16 },
});

// ============================================================
//  Κύρια Εφαρμογή
// ============================================================
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(isRemembered());
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Data states
  const [specialOrders, setSpecialOrders] = useState([]);
  const [soldSpecialOrders, setSoldSpecialOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [coatings, setCoatings] = useState([]);
  const [locks, setLocks] = useState([]);

  // Modal states
  const [showCustomers, setShowCustomers] = useState(false);
  const [showCoatings, setShowCoatings] = useState(false);
  const [showLocks, setShowLocks] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState(null);
  const [pendingCustomerCallback, setPendingCustomerCallback] = useState(null);

  useEffect(() => {
    if (isLoggedIn) fetchData();
    else setLoading(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) { setMenuOpen(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      return false;
    });
    return () => handler.remove();
  }, [menuOpen, showActivity, showCoatings, showLocks, showCustomers]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resS = await fetch(`${FIREBASE_URL}/special_orders.json`);
      const dataS = await resS.json();
      if (dataS) {
        const loadedS = Object.keys(dataS).map(key => ({ id: key, ...dataS[key] }));
        setSpecialOrders(loadedS.filter(o => o.status !== 'SOLD'));
        setSoldSpecialOrders(loadedS.filter(o => o.status === 'SOLD'));
      }
      const res4 = await fetch(`${FIREBASE_URL}/customers.json`);
      const data4 = await res4.json();
      if (data4) setCustomers(Object.keys(data4).map(key => ({ id: key, ...data4[key] })));

      const res5 = await fetch(`${FIREBASE_URL}/coatings.json`);
      const data5 = await res5.json();
      if (data5) setCoatings(Object.keys(data5).map(key => ({ id: key, ...data5[key] })));

      const res7 = await fetch(`${FIREBASE_URL}/locks.json`);
      const data7 = await res7.json();
      if (data7) setLocks(Object.keys(data7).map(key => ({ id: key, ...data7[key] })));

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) return <LoginScreen onSuccess={() => setIsLoggedIn(true)} />;
  if (loading) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#8B0000" />
      <Text style={styles.loadingText}>Φόρτωση δεδομένων...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#8B0000" barStyle="light-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>VAICON</Text>
        <Text style={styles.headerSubtitle}>ΕΙΔΙΚΕΣ ΠΑΡΑΓΓΕΛΙΕΣ</Text>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* MAIN SCREEN */}
      <View style={{ flex: 1 }}>
        <SpecialScreen
          specialOrders={specialOrders}
          setSpecialOrders={setSpecialOrders}
          soldSpecialOrders={soldSpecialOrders}
          setSoldSpecialOrders={setSoldSpecialOrders}
          customers={customers}
          onRequestAddCustomer={(name, cb) => {
            setPendingCustomer(name);
            setPendingCustomerCallback(() => cb);
            setShowCustomers(true);
          }}
          coatings={coatings}
          locks={locks}
        />
      </View>

      {/* HAMBURGER MENU */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>ΜΕΝΟΥ</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCustomers(true); }}>
              <Text style={styles.menuItemText}>👥 ΠΕΛΑΤΕΣ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCoatings(true); }}>
              <Text style={styles.menuItemText}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowLocks(true); }}>
              <Text style={styles.menuItemText}>🔒 ΚΛΕΙΔΑΡΙΕΣ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
              <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); fetchData(); Alert.alert("VAICON", "Ανανέωση δεδομένων..."); }}>
              <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff0f0', marginTop: 12 }]} onPress={() => {
              Alert.alert("🔐 Αποσύνδεση", "Θέλεις να αποσυνδεθείς;", [
                { text: "ΑΚΥΡΟ", style: "cancel" },
                { text: "ΑΠΟΣΥΝΔΕΣΗ", style: "destructive", onPress: () => { forgetLogin(); setIsLoggedIn(false); setMenuOpen(false); } }
              ]);
            }}>
              <Text style={[styles.menuItemText, { color: '#8B0000' }]}>🔐 ΑΠΟΣΥΝΔΕΣΗ</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ΙΣΤΟΡΙΚΟ */}
      <Modal visible={showActivity} animationType="slide" onRequestClose={() => setShowActivity(false)}>
        <ActivityScreen onClose={() => setShowActivity(false)} />
      </Modal>

      {/* ΕΠΕΝΔΥΣΕΙΣ */}
      <Modal visible={showCoatings} animationType="slide" onRequestClose={() => setShowCoatings(false)}>
        <CoatingsScreen coatings={coatings} setCoatings={setCoatings} onClose={() => setShowCoatings(false)} />
      </Modal>

      {/* ΚΛΕΙΔΑΡΙΕΣ */}
      <Modal visible={showLocks} animationType="slide" onRequestClose={() => setShowLocks(false)}>
        <LocksScreen locks={locks} setLocks={setLocks} onClose={() => setShowLocks(false)} />
      </Modal>

      {/* ΠΕΛΑΤΕΣ */}
      <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
        <CustomersScreen
          customers={customers}
          setCustomers={setCustomers}
          customOrders={[]}
          allOrders={[...specialOrders, ...soldSpecialOrders]}
          setCustomOrders={() => {}}
          setSoldOrders={() => {}}
          specialOrders={[...specialOrders, ...soldSpecialOrders]}
          onClose={() => { setShowCustomers(false); setPendingCustomer(null); setPendingCustomerCallback(null); }}
          prefillName={pendingCustomer}
          onCustomerAdded={(newCustomer) => {
            setShowCustomers(false);
            setPendingCustomer(null);
            if (pendingCustomerCallback) { pendingCustomerCallback(newCustomer); setPendingCustomerCallback(null); }
          }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#555', fontSize: 14 },
  header: {
    backgroundColor: '#8B0000',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginHorizontal: 8,
    marginTop: (StatusBar.currentHeight || 0) + 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  headerTitle: { color: 'white', fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  headerSubtitle: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  menuBtn: { padding: 4 },
  menuIcon: { color: 'white', fontSize: 22 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuPanel: { backgroundColor: '#fff', width: 220, marginTop: 80, marginRight: 10, borderRadius: 12, padding: 16, elevation: 10 },
  menuTitle: { fontSize: 12, fontWeight: 'bold', color: '#999', marginBottom: 12, letterSpacing: 2 },
  menuItem: { padding: 14, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8 },
  menuItemText: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
});

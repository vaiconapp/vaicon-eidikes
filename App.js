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
import StatsScreen from './StatsScreen';
import { APP_VERSION } from './version';

export const FIREBASE_URL = "https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app";

const VAICON_PASSWORD = "vaicon2024";
const STORAGE_KEY = "vaicon_special_auth_v1";
const STORAGE_USER = "vaicon_special_user_v1";
const FIREBASE_API_KEY = "AIzaSyDTAyLh1-Jrdpz_TRUFbpQhqZHNhfPg47U";
const USER_DOMAIN = "@vaicon.local";

const toEmail = (u) => String(u || '').trim().toLowerCase().replace(/\s+/g, '') + USER_DOMAIN;
const roleForEmail = (e) => e.startsWith('admin') ? 'admin' : e.startsWith('guest') ? 'guest' : 'user';

const APP_USERS = ['USER 10', 'USER 12', 'USER 14', 'USER 16', 'USER 18', 'GUEST', 'ADMIN'];
const lockKey = (u) => String(u || '').toUpperCase().replace(/\s+/g, '');

async function firebaseSignIn(email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'AUTH_FAILED');
  return data;
}

const isRemembered = () => {
  if (Platform.OS !== 'web') return false;
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
};
const loadUser = () => {
  if (Platform.OS !== 'web') return null;
  try { return JSON.parse(localStorage.getItem(STORAGE_USER) || 'null'); } catch { return null; }
};
const rememberLogin = (user) => {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
    if (user) localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  } catch {}
};
const forgetLogin = () => {
  if (Platform.OS !== 'web') return;
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STORAGE_USER); } catch {}
};

function LoginScreen({ onSuccess, locked = false }) {
  const [username, setUsername] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const fail = (msg) => { setError(msg); setPwd(''); setTimeout(() => setError(''), 2500); };

  const handleLogin = async () => {
    if (busy) return;
    const code = pwd.trim();
    if (!code) return;
    if (locked) {
      if (code === VAICON_PASSWORD) { onSuccess(); return; }
      setBusy(true);
      try { await firebaseSignIn('admin' + USER_DOMAIN, code); onSuccess(); }
      catch { fail('Λάθος κωδικός διαχειριστή.'); }
      finally { setBusy(false); }
      return;
    }
    if (code === VAICON_PASSWORD) { onSuccess({ username: 'ADMIN', role: 'admin', email: null }); return; }
    if (!username.trim()) { fail('Δώστε όνομα χρήστη.'); return; }
    const email = toEmail(username);
    setBusy(true);
    try {
      const u = await firebaseSignIn(email, code);
      onSuccess({ username: username.trim().toUpperCase(), role: roleForEmail(email), email, uid: u.localId });
    } catch {
      fail('Λάθος όνομα ή κωδικός.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[loginStyles.bg, locked && { backgroundColor: '#E65100' }]}>
      <View style={loginStyles.card}>
        <View style={loginStyles.logoBox}>
          <Text style={[loginStyles.logoText, locked && { color: '#E65100' }]}>VAICON</Text>
          <Text style={loginStyles.logoSub}>{locked ? '🔒 ΚΛΕΙΔΩΜΕΝΟ' : 'Ειδικές Παραγγελίες'}</Text>
        </View>
        {!locked && (<>
          <Text style={loginStyles.label}>Όνομα Χρήστη</Text>
          <TextInput
            style={[loginStyles.input, { marginBottom: 12 }]}
            value={username}
            onChangeText={setUsername}
            placeholder="π.χ. USER 10"
            autoCapitalize="characters"
            autoFocus
          />
        </>)}
        <Text style={loginStyles.label}>{locked ? 'Owner Code' : 'Κωδικός Πρόσβασης'}</Text>
        <View style={loginStyles.inputRow}>
          <TextInput
            style={[loginStyles.input, error && loginStyles.inputError]}
            secureTextEntry={!showPwd}
            value={pwd}
            onChangeText={setPwd}
            placeholder="Κωδικός..."
            autoFocus={locked}
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity style={loginStyles.eyeBtn} onPress={() => setShowPwd(v => !v)}>
            <Text style={{ fontSize: 20 }}>{showPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text style={loginStyles.errorTxt}>❌ {error}</Text> : null}
        <TouchableOpacity style={[loginStyles.btn, locked && { backgroundColor: '#E65100' }, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
          <Text style={loginStyles.btnTxt}>{busy ? '...' : (locked ? '🔓 ΞΕΚΛΕΙΔΩΜΑ' : '🔓 ΕΙΣΟΔΟΣ')}</Text>
        </TouchableOpacity>
        <Text style={loginStyles.hint}>
          {locked ? 'Η συσκευή κλειδώθηκε από τον διαχειριστή.' : 'Αυτή η συσκευή θα απομνημονεύσει την είσοδό σας.'}
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

function PwdInput({ value, onChangeText, error, onSubmit, autoFocus = true }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        style={[statsAuthStyles.input, error && statsAuthStyles.inputError, { flex: 1 }]}
        secureTextEntry={!show}
        value={value}
        onChangeText={onChangeText}
        placeholder="Κωδικός..."
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
      />
      <TouchableOpacity onPress={() => setShow(v => !v)} style={{ padding: 10, marginLeft: 4 }}>
        <Text style={{ fontSize: 22 }}>{show ? '🙈' : '👁️'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(isRemembered());
  const [currentUser, setCurrentUser] = useState(loadUser());
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const [specialOrders, setSpecialOrders] = useState([]);
  const [soldSpecialOrders, setSoldSpecialOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [coatings, setCoatings] = useState([]);
  const [locks, setLocks] = useState([]);

  const [showCustomers, setShowCustomers] = useState(false);
  const [showCoatings, setShowCoatings] = useState(false);
  const [showLocks, setShowLocks] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsAuthOpen, setStatsAuthOpen] = useState(false);
  const [statsAuthPwd, setStatsAuthPwd] = useState('');
  const [statsAuthError, setStatsAuthError] = useState(false);
  const [backupAuthOpen, setBackupAuthOpen] = useState(false);
  const [restoreAuthOpen, setRestoreAuthOpen] = useState(false);
  const [brAuthPwd, setBrAuthPwd] = useState('');
  const [brAuthError, setBrAuthError] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(null);
  const [restorePayload, setRestorePayload] = useState(null);
  const [restoreFileError, setRestoreFileError] = useState(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState(null);
  const [pendingCustomerCallback, setPendingCustomerCallback] = useState(null);

  const [lockedUsers, setLockedUsers] = useState({});
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthPwd, setAdminAuthPwd] = useState('');
  const [adminAuthError, setAdminAuthError] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  useEffect(() => {
    if (isLoggedIn) fetchData();
    else setLoading(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    if (Platform.OS !== 'web' || typeof EventSource === 'undefined') {
      const interval = setInterval(() => { fetchData(true); }, 5000);
      return () => clearInterval(interval);
    }

    let debounce = null;
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => fetchData(true), 300);
    };

    const sources = ['special_orders', 'customers', 'coatings', 'locks'].map(p => {
      const es = new EventSource(`${FIREBASE_URL}/${p}.json`);
      es.addEventListener('put', scheduleRefresh);
      es.addEventListener('patch', scheduleRefresh);
      return es;
    });
    const safety = setInterval(() => fetchData(true), 30000);

    return () => {
      clearTimeout(debounce);
      clearInterval(safety);
      sources.forEach(es => es.close());
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      try { const r = await fetch(`${FIREBASE_URL}/app_lock.json`); setLockedUsers((await r.json()) || {}); } catch {}
    };
    load();
    if (Platform.OS === 'web' && typeof EventSource !== 'undefined') {
      const es = new EventSource(`${FIREBASE_URL}/app_lock.json`);
      es.addEventListener('put', load);
      es.addEventListener('patch', load);
      const safety = setInterval(load, 15000);
      return () => { es.close(); clearInterval(safety); };
    }
    const safety = setInterval(load, 5000);
    return () => clearInterval(safety);
  }, [isLoggedIn]);

  const myLockKey = currentUser ? lockKey(currentUser.username) : null;
  const amLocked = !!(myLockKey && lockedUsers && lockedUsers[myLockKey] && !ownerOverride);

  const writeLock = async (key, val) => {
    try {
      await fetch(`${FIREBASE_URL}/app_lock/${key}.json`, val
        ? { method: 'PUT', body: 'true' }
        : { method: 'DELETE' });
    } catch {}
  };
  const lockAll = async () => {
    const obj = {}; APP_USERS.forEach(u => { obj[lockKey(u)] = true; });
    try { await fetch(`${FIREBASE_URL}/app_lock.json`, { method: 'PUT', body: JSON.stringify(obj) }); } catch {}
  };
  const unlockAll = async () => {
    try { await fetch(`${FIREBASE_URL}/app_lock.json`, { method: 'DELETE' }); } catch {}
  };
  const lockSelf = async () => {
    if (myLockKey) { await writeLock(myLockKey, true); setLockedUsers(prev => ({ ...prev, [myLockKey]: true })); }
    setAdminPanelOpen(false);
    setOwnerOverride(false);
  };
  const tryOpenAdmin = async () => {
    if (await verifyAdminCode(adminAuthPwd)) {
      setAdminAuthOpen(false); setAdminAuthPwd(''); setAdminAuthError(false);
      setOwnerOverride(true); setAdminPanelOpen(true);
    } else { setAdminAuthError(true); setAdminAuthPwd(''); setTimeout(() => setAdminAuthError(false), 2000); }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) { setMenuOpen(false); return true; }
      if (statsAuthOpen) { setStatsAuthOpen(false); return true; }
      if (backupAuthOpen) { setBackupAuthOpen(false); return true; }
      if (restoreAuthOpen) { setRestoreAuthOpen(false); return true; }
      if (backupSuccess) { setBackupSuccess(null); return true; }
      if (restorePayload || restoreFileError) { setRestorePayload(null); setRestoreFileError(null); setRestoreConfirmText(''); return true; }
      if (showStats) { setShowStats(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      return false;
    });
    return () => handler.remove();
  }, [menuOpen, showActivity, showCoatings, showLocks, showCustomers, showStats, statsAuthOpen, backupAuthOpen, restoreAuthOpen, backupSuccess, restorePayload, restoreFileError]);

  const downloadBlob = (text, filename) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doBackup = async () => {
    setBackupRunning(true);
    try {
      const res = await fetch(`${FIREBASE_URL}/.json`);
      if (!res.ok) throw new Error('Σφάλμα ανάγνωσης βάσης');
      const fullData = (await res.json()) || {};
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const createdAtStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const payload = { createdAt: now.getTime(), createdAtStr, version: APP_VERSION, data: fullData };
      const json = JSON.stringify(payload, null, 2);
      const filename = 'vaicon-eidikes-backup.json';

      if (Platform.OS !== 'web') {
        Alert.alert('Μη διαθέσιμο', 'Το backup είναι διαθέσιμο μόνο από browser.');
        setBackupRunning(false);
        return;
      }
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(json);
          await writable.close();
        } catch (e) {
          if (e.name === 'AbortError') { setBackupRunning(false); return; }
          downloadBlob(json, filename);
        }
      } else {
        downloadBlob(json, filename);
      }
      setBackupSuccess(createdAtStr);
    } catch (e) {
      Alert.alert('Σφάλμα', 'Το backup απέτυχε: ' + (e.message || String(e)));
    } finally {
      setBackupRunning(false);
    }
  };

  const validateBackup = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return 'Το αρχείο δεν είναι έγκυρο.';
    if (typeof parsed.createdAt !== 'number' || !parsed.data || typeof parsed.data !== 'object') {
      return 'Το αρχείο δεν είναι έγκυρο backup του VAICON.';
    }
    const expected = ['special_orders', 'customers', 'coatings', 'locks'];
    const present = expected.filter(k => k in parsed.data);
    if (present.length === 0) return 'Το backup δεν περιέχει δεδομένα της εφαρμογής.';
    return null;
  };

  const openRestoreFilePicker = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Μη διαθέσιμο', 'Η επαναφορά είναι διαθέσιμη μόνο από browser.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const err = validateBackup(parsed);
        if (err) { setRestoreFileError(err); return; }
        setRestorePayload(parsed);
        setRestoreConfirmText('');
      } catch {
        setRestoreFileError('Το αρχείο δεν διαβάζεται ως JSON.');
      }
    };
    input.click();
  };

  const doRestore = async () => {
    if (!restorePayload?.data) return;
    setRestoreRunning(true);
    try {
      const knownPaths = ['special_orders', 'customers', 'coatings', 'locks', 'activity_log'];
      for (const p of knownPaths) {
        if (!(p in restorePayload.data)) continue;
        await fetch(`${FIREBASE_URL}/${p}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(restorePayload.data[p]),
        });
      }
      if (Platform.OS === 'web') window.location.reload();
      else Alert.alert('Επαναφορά', 'Ολοκληρώθηκε. Επανεκκινήστε την εφαρμογή.');
    } catch (e) {
      setRestoreRunning(false);
      Alert.alert('Σφάλμα', 'Η επαναφορά απέτυχε: ' + (e.message || String(e)));
    }
  };

  const fetchData = async (silent=false) => {
    if (!silent) setLoading(true);
    try {
      const resS = await fetch(`${FIREBASE_URL}/special_orders.json`);
      const dataS = await resS.json();
      if (dataS) {
        const fixOrder = (o) => ({
          ...o,
          stavera: o.stavera
            ? (Array.isArray(o.stavera)
                ? o.stavera
                : Object.values(o.stavera))
            : [],
          coatings: o.coatings
            ? (Array.isArray(o.coatings)
                ? o.coatings
                : Object.values(o.coatings))
            : [],
        });
        const loadedS = Object.keys(dataS).map(key => fixOrder({ id: key, ...dataS[key] }));
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

  const verifyAdminCode = async (code) => {
    if (code === VAICON_PASSWORD) return true;
    try { await firebaseSignIn('admin' + USER_DOMAIN, code); return true; } catch { return false; }
  };
  const tryOpenStats = async () => {
    if (await verifyAdminCode(statsAuthPwd)) { setStatsAuthOpen(false); setStatsAuthPwd(''); setStatsAuthError(false); setShowStats(true); }
    else { setStatsAuthError(true); setStatsAuthPwd(''); setTimeout(() => setStatsAuthError(false), 2000); }
  };
  const tryBackup = async () => {
    if (await verifyAdminCode(brAuthPwd)) { setBackupAuthOpen(false); setBrAuthPwd(''); doBackup(); }
    else { setBrAuthError(true); setBrAuthPwd(''); setTimeout(() => setBrAuthError(false), 2000); }
  };
  const tryRestore = async () => {
    if (await verifyAdminCode(brAuthPwd)) { setRestoreAuthOpen(false); setBrAuthPwd(''); openRestoreFilePicker(); }
    else { setBrAuthError(true); setBrAuthPwd(''); setTimeout(() => setBrAuthError(false), 2000); }
  };

  if (!isLoggedIn) return <LoginScreen onSuccess={(u) => { rememberLogin(u); setCurrentUser(u); setIsLoggedIn(true); }} />;
  if (amLocked) return <LoginScreen locked onSuccess={() => { const u = { username: 'ADMIN', role: 'admin', email: null }; rememberLogin(u); setCurrentUser(u); setOwnerOverride(true); }} />;
  if (loading) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#8B0000" />
      <Text style={styles.loadingText}>Φόρτωση δεδομένων...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#8B0000" barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>VAICON</Text>
        <Text style={styles.headerSubtitle}>ΕΙΔΙΚΕΣ ΠΑΡΑΓΓΕΛΙΕΣ</Text>
        <Text style={styles.headerVersion}>{APP_VERSION}</Text>
        {currentUser?.username ? <Text style={styles.headerUser}>👤 {currentUser.username}</Text> : null}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

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
          readOnly={currentUser?.role === 'guest'}
        />
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>ΜΕΝΟΥ</Text>
            {currentUser?.role !== 'guest' && (<>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCustomers(true); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.menuItemText}>👥 ΠΕΛΑΤΕΣ</Text>
                <View style={{ backgroundColor: '#8B0000', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, minWidth: 28, alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>
                    {customers.length}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCoatings(true); }}>
              <Text style={styles.menuItemText}>🎨 ΕΠΕΝΔΥΣΕΙΣ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowLocks(true); }}>
              <Text style={styles.menuItemText}>🔒 ΚΛΕΙΔΑΡΙΕΣ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setStatsAuthPwd(''); setStatsAuthError(false); setStatsAuthOpen(true); }}>
              <Text style={styles.menuItemText}>📊 ΣΤΑΤΙΣΤΙΚΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
              <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setBrAuthPwd(''); setBrAuthError(false); setBackupAuthOpen(true); }}>
              <Text style={styles.menuItemText}>💾 BACKUP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setBrAuthPwd(''); setBrAuthError(false); setRestoreAuthOpen(true); }}>
              <Text style={styles.menuItemText}>♻️ ΕΠΑΝΑΦΟΡΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff7ec' }]} onPress={() => { setMenuOpen(false); setAdminAuthPwd(''); setAdminAuthError(false); setAdminAuthOpen(true); }}>
              <Text style={[styles.menuItemText, { color: '#E65100' }]}>🛡️ ΔΙΑΧΕΙΡΙΣΤΗΣ</Text>
            </TouchableOpacity>
            </>)}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); fetchData(); Alert.alert("VAICON", "Ανανέωση δεδομένων..."); }}>
              <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff0f0', marginTop: 12 }]} onPress={() => {
              const doLogout = () => { forgetLogin(); setCurrentUser(null); setIsLoggedIn(false); setMenuOpen(false); };
              if (Platform.OS === 'web') { if (window.confirm("Θέλεις να αποσυνδεθείς;")) doLogout(); }
              else Alert.alert("🔐 Αποσύνδεση", "Θέλεις να αποσυνδεθείς;", [
                { text: "ΑΚΥΡΟ", style: "cancel" },
                { text: "ΑΠΟΣΥΝΔΕΣΗ", style: "destructive", onPress: doLogout }
              ]);
            }}>
              <Text style={[styles.menuItemText, { color: '#8B0000' }]}>🔐 ΑΠΟΣΥΝΔΕΣΗ</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showActivity} animationType="slide" onRequestClose={() => setShowActivity(false)}>
        <ActivityScreen onClose={() => setShowActivity(false)} />
      </Modal>

      <Modal visible={statsAuthOpen} transparent animationType="fade" onRequestClose={() => setStatsAuthOpen(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={statsAuthStyles.box}>
            <Text style={statsAuthStyles.title}>🔐 Πρόσβαση Στατιστικών</Text>
            <Text style={statsAuthStyles.subtitle}>Δώστε τον κωδικό διαχειριστή</Text>
            <PwdInput
              value={statsAuthPwd}
              onChangeText={setStatsAuthPwd}
              error={statsAuthError}
              onSubmit={tryOpenStats}
            />
            {statsAuthError && <Text style={statsAuthStyles.errorTxt}>❌ Λάθος κωδικός</Text>}
            <View style={statsAuthStyles.btnRow}>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666' }]} onPress={() => { setStatsAuthOpen(false); setStatsAuthPwd(''); }}>
                <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000' }]} onPress={tryOpenStats}>
                <Text style={statsAuthStyles.btnTxt}>ΕΙΣΟΔΟΣ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showStats} animationType="slide" onRequestClose={() => setShowStats(false)}>
        <StatsScreen
          specialOrders={specialOrders}
          soldSpecialOrders={soldSpecialOrders}
          setSoldSpecialOrders={setSoldSpecialOrders}
          FIREBASE_URL={FIREBASE_URL}
          onClose={() => setShowStats(false)}
        />
      </Modal>

      <Modal visible={backupAuthOpen} transparent animationType="fade" onRequestClose={() => setBackupAuthOpen(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={statsAuthStyles.box}>
            <Text style={statsAuthStyles.title}>💾 Δημιουργία Backup</Text>
            <Text style={statsAuthStyles.subtitle}>Δώστε τον κωδικό διαχειριστή</Text>
            <PwdInput
              value={brAuthPwd} onChangeText={setBrAuthPwd} error={brAuthError}
              onSubmit={tryBackup}
            />
            {brAuthError && <Text style={statsAuthStyles.errorTxt}>❌ Λάθος κωδικός</Text>}
            <View style={statsAuthStyles.btnRow}>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666' }]} onPress={() => { setBackupAuthOpen(false); setBrAuthPwd(''); }}>
                <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32' }]} onPress={tryBackup}>
                <Text style={statsAuthStyles.btnTxt}>ΣΥΝΕΧΕΙΑ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={backupRunning} transparent animationType="fade">
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { alignItems: 'center' }]}>
            <ActivityIndicator size="large" color="#2e7d32" />
            <Text style={{ marginTop: 14, fontWeight: 'bold', color: '#2e7d32', fontSize: 15 }}>Δημιουργία αντιγράφου...</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!backupSuccess} transparent animationType="fade" onRequestClose={() => setBackupSuccess(null)}>
        <View style={statsAuthStyles.overlay}>
          <View style={statsAuthStyles.box}>
            <Text style={[statsAuthStyles.title, { color: '#2e7d32' }]}>✅ Backup Ολοκληρώθηκε</Text>
            <Text style={statsAuthStyles.subtitle}>
              Αποθηκεύτηκε στον υπολογιστή σου.{"\n"}Ημερομηνία: {backupSuccess}
            </Text>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32', marginTop: 8 }]} onPress={() => setBackupSuccess(null)}>
              <Text style={statsAuthStyles.btnTxt}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={restoreAuthOpen} transparent animationType="fade" onRequestClose={() => setRestoreAuthOpen(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={statsAuthStyles.box}>
            <Text style={statsAuthStyles.title}>♻️ Επαναφορά από Backup</Text>
            <Text style={statsAuthStyles.subtitle}>Δώστε τον κωδικό διαχειριστή</Text>
            <PwdInput
              value={brAuthPwd} onChangeText={setBrAuthPwd} error={brAuthError}
              onSubmit={tryRestore}
            />
            {brAuthError && <Text style={statsAuthStyles.errorTxt}>❌ Λάθος κωδικός</Text>}
            <View style={statsAuthStyles.btnRow}>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666' }]} onPress={() => { setRestoreAuthOpen(false); setBrAuthPwd(''); }}>
                <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000' }]} onPress={tryRestore}>
                <Text style={statsAuthStyles.btnTxt}>ΣΥΝΕΧΕΙΑ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!restoreFileError} transparent animationType="fade" onRequestClose={() => setRestoreFileError(null)}>
        <View style={statsAuthStyles.overlay}>
          <View style={statsAuthStyles.box}>
            <Text style={[statsAuthStyles.title, { color: '#8B0000' }]}>⚠️ Μη έγκυρο αρχείο</Text>
            <Text style={statsAuthStyles.subtitle}>{restoreFileError}</Text>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000', marginTop: 8 }]} onPress={() => setRestoreFileError(null)}>
              <Text style={statsAuthStyles.btnTxt}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!restorePayload} transparent animationType="fade" onRequestClose={() => { if (!restoreRunning) { setRestorePayload(null); setRestoreConfirmText(''); } }}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 460 }]}>
            <Text style={[statsAuthStyles.title, { color: '#8B0000', fontSize: 20 }]}>⚠️ ΠΡΟΣΟΧΗ</Text>
            <View style={{ backgroundColor: '#fff0f0', borderLeftWidth: 4, borderLeftColor: '#8B0000', padding: 12, borderRadius: 6, marginBottom: 12 }}>
              <Text style={{ color: '#8B0000', fontWeight: 'bold', fontSize: 14, lineHeight: 20 }}>
                Θα αντικατασταθούν ΟΛΑ τα τρέχοντα δεδομένα από το backup της:{"\n"}
                <Text style={{ fontSize: 16 }}>{restorePayload?.createdAtStr || '—'}</Text>{"\n\n"}
                Όλες οι αλλαγές μετά από αυτή την ημερομηνία θα χαθούν οριστικά.
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Πληκτρολογήστε <Text style={{ fontWeight: 'bold', color: '#8B0000' }}>ΕΠΑΝΑΦΟΡΑ</Text> για επιβεβαίωση:</Text>
            <TextInput
              style={[statsAuthStyles.input, { textAlign: 'left' }]}
              value={restoreConfirmText} onChangeText={setRestoreConfirmText}
              placeholder="ΕΠΑΝΑΦΟΡΑ" autoCapitalize="characters" editable={!restoreRunning}
            />
            <View style={statsAuthStyles.btnRow}>
              <TouchableOpacity disabled={restoreRunning} style={[statsAuthStyles.btn, { backgroundColor: '#666', opacity: restoreRunning ? 0.5 : 1 }]} onPress={() => { setRestorePayload(null); setRestoreConfirmText(''); }}>
                <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={restoreRunning || restoreConfirmText.trim().toUpperCase() !== 'ΕΠΑΝΑΦΟΡΑ'}
                style={[statsAuthStyles.btn, { backgroundColor: '#8B0000', opacity: (restoreRunning || restoreConfirmText.trim().toUpperCase() !== 'ΕΠΑΝΑΦΟΡΑ') ? 0.4 : 1 }]}
                onPress={doRestore}
              >
                <Text style={statsAuthStyles.btnTxt}>{restoreRunning ? 'ΕΠΑΝΑΦΟΡΑ...' : 'ΕΠΑΝΑΦΟΡΑ'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCoatings} animationType="slide" onRequestClose={() => setShowCoatings(false)}>
        <CoatingsScreen coatings={coatings} setCoatings={setCoatings} onClose={() => setShowCoatings(false)} />
      </Modal>

      <Modal visible={showLocks} animationType="slide" onRequestClose={() => setShowLocks(false)}>
        <LocksScreen locks={locks} setLocks={setLocks} onClose={() => setShowLocks(false)} />
      </Modal>

      <Modal visible={adminAuthOpen} transparent animationType="fade" onRequestClose={() => setAdminAuthOpen(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={statsAuthStyles.box}>
            <Text style={[statsAuthStyles.title, { color: '#E65100' }]}>🛡️ Διαχειριστής</Text>
            <Text style={statsAuthStyles.subtitle}>Δώστε τον Owner Code</Text>
            <PwdInput value={adminAuthPwd} onChangeText={setAdminAuthPwd} error={adminAuthError} onSubmit={tryOpenAdmin} />
            {adminAuthError && <Text style={statsAuthStyles.errorTxt}>❌ Λάθος κωδικός</Text>}
            <View style={statsAuthStyles.btnRow}>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666' }]} onPress={() => { setAdminAuthOpen(false); setAdminAuthPwd(''); }}>
                <Text style={statsAuthStyles.btnTxt}>ΑΚΥΡΟ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100' }]} onPress={tryOpenAdmin}>
                <Text style={statsAuthStyles.btnTxt}>ΕΙΣΟΔΟΣ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={adminPanelOpen} transparent animationType="fade" onRequestClose={() => setAdminPanelOpen(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 440 }]}>
            <Text style={[statsAuthStyles.title, { color: '#E65100' }]}>🛡️ Κλείδωμα Χρηστών</Text>
            <Text style={statsAuthStyles.subtitle}>Πάτησε για να κλειδώσεις/ξεκλειδώσεις. Ισχύει αμέσως.</Text>
            {APP_USERS.map((u) => {
              const k = lockKey(u);
              const isLocked = !!(lockedUsers && lockedUsers[k]);
              return (
                <View key={k} style={adminStyles.row}>
                  <Text style={adminStyles.name}>{u}{currentUser && lockKey(currentUser.username) === k ? '  (εσύ)' : ''}</Text>
                  <Text style={[adminStyles.badge, isLocked ? adminStyles.badgeLocked : adminStyles.badgeOpen]}>{isLocked ? '🔒 Κλειδωμένος' : '🔓 Ανοιχτός'}</Text>
                  <TouchableOpacity style={[adminStyles.toggle, { backgroundColor: isLocked ? '#2e7d32' : '#E65100' }]} onPress={() => writeLock(k, !isLocked)}>
                    <Text style={adminStyles.toggleTxt}>{isLocked ? 'Ξεκλείδωσε' : 'Κλείδωσε'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={[statsAuthStyles.btnRow, { marginTop: 14 }]}>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100' }]} onPress={lockAll}>
                <Text style={statsAuthStyles.btnTxt}>🔒 ΚΛΕΙΔΩΜΑ ΟΛΩΝ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32' }]} onPress={unlockAll}>
                <Text style={statsAuthStyles.btnTxt}>🔓 ΞΕΚΛΕΙΔΩΜΑ ΟΛΩΝ</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000', marginTop: 10 }]} onPress={lockSelf}>
              <Text style={statsAuthStyles.btnTxt}>🔒 ΚΛΕΙΔΩΣΕ ΚΙ ΑΥΤΟ ΤΟ PC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666', marginTop: 10 }]} onPress={() => setAdminPanelOpen(false)}>
              <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
        <CustomersScreen
          customers={customers}
          setCustomers={setCustomers}
          customOrders={[]}
          allOrders={[...specialOrders, ...soldSpecialOrders]}
          setSpecialOrders={setSpecialOrders}
          setSoldSpecialOrders={setSoldSpecialOrders}
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
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerVersion: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.5 },
  headerUser: { color: 'white', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.5 },
  menuBtn: { padding: 4 },
  menuIcon: { color: 'white', fontSize: 22 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuPanel: { backgroundColor: '#fff', width: 220, marginTop: 80, marginRight: 10, borderRadius: 12, padding: 16, elevation: 10 },
  menuTitle: { fontSize: 12, fontWeight: 'bold', color: '#999', marginBottom: 12, letterSpacing: 2 },
  menuItem: { padding: 14, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8 },
  menuItemText: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a' },
});

const statsAuthStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, elevation: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#8B0000', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 2, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 18, letterSpacing: 2, textAlign: 'center' },
  inputError: { borderColor: '#ff4444' },
  errorTxt: { color: '#ff4444', fontSize: 13, marginTop: 8, textAlign: 'center', fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});

const adminStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  badge: { fontSize: 11, fontWeight: 'bold' },
  badgeLocked: { color: '#E65100' },
  badgeOpen: { color: '#2e7d32' },
  toggle: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  toggleTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 },
});

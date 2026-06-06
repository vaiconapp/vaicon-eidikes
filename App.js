import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, Platform,
  StatusBar, TouchableOpacity, Modal, TextInput, Alert, BackHandler, ScrollView
} from 'react-native';
import SpecialScreen from './SpecialScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import LocksScreen from './LocksScreen';
import ActivityScreen from './ActivityScreen';
import MessagesScreen from './MessagesScreen';
import StatsScreen from './StatsScreen';
import { APP_VERSION } from './version';

export const FIREBASE_URL = "https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app";

const STORAGE_KEY = "vaicon_special_auth_v1";
const STORAGE_USER = "vaicon_special_user_v1";
const STORAGE_TOKEN = "vaicon_special_token_v1";
const FIREBASE_API_KEY = "AIzaSyDTAyLh1-Jrdpz_TRUFbpQhqZHNhfPg47U";
const USER_DOMAIN = "@vaicon.local";

const toEmail = (u) => String(u || '').trim().toLowerCase().replace(/\s+/g, '') + USER_DOMAIN;
const roleForEmail = (e) => e.startsWith('admin') ? 'admin' : e.startsWith('guest') ? 'guest' : 'user';

const APP_USERS = ['USER 10', 'USER 12', 'USER 14', 'USER 16', 'USER 18', 'GUEST', 'ADMIN'];
const lockKey = (u) => String(u || '').toUpperCase().replace(/\s+/g, '');

const rawFetch = globalThis.fetch.bind(globalThis);

let fbToken = null, fbRefresh = null, fbTokenExp = 0, fbRefreshing = null;

const saveTokens = (idToken, refreshToken, expiresIn) => {
  if (idToken) fbToken = idToken;
  if (refreshToken) fbRefresh = refreshToken;
  if (expiresIn) fbTokenExp = Date.now() + Number(expiresIn) * 1000;
  try { localStorage.setItem(STORAGE_TOKEN, JSON.stringify({ t: fbToken, r: fbRefresh, e: fbTokenExp })); } catch {}
};
const loadTokens = () => {
  try { const o = JSON.parse(localStorage.getItem(STORAGE_TOKEN) || 'null'); if (o) { fbToken = o.t; fbRefresh = o.r; fbTokenExp = o.e || 0; } } catch {}
};
const clearTokens = () => { fbToken = fbRefresh = null; fbTokenExp = 0; try { localStorage.removeItem(STORAGE_TOKEN); } catch {} };

const refreshIdToken = async () => {
  if (!fbRefresh) return false;
  if (fbRefreshing) return fbRefreshing;
  fbRefreshing = (async () => {
    try {
      const res = await rawFetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(fbRefresh)}`,
      });
      const data = await res.json();
      if (!res.ok || !data.id_token) return false;
      saveTokens(data.id_token, data.refresh_token, data.expires_in);
      return true;
    } catch { return false; }
  })();
  const r = await fbRefreshing; fbRefreshing = null; return r;
};
const ensureFreshToken = async () => {
  if (fbToken && Date.now() < fbTokenExp - 5 * 60 * 1000) return fbToken;
  if (fbRefresh) await refreshIdToken();
  return fbToken;
};

// Οι κανόνες ασφαλείας της βάσης απαιτούν ταυτότητα· προσθέτουμε ?auth=<idToken>
// αυτόματα σε κάθε κλήση προς το FIREBASE_URL, αντί σε ~20 ξεχωριστά σημεία.
if (globalThis.fetch && !globalThis.__fbAuthPatched) {
  globalThis.__fbAuthPatched = true;
  globalThis.fetch = async (input, init) => {
    let url = typeof input === 'string' ? input : (input && input.url);
    if (url && url.indexOf(FIREBASE_URL) === 0 && url.indexOf('auth=') === -1) {
      await ensureFreshToken();
      if (fbToken) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'auth=' + fbToken;
        input = typeof input === 'string' ? url : new Request(url, input);
      }
    }
    return rawFetch(input, init);
  };
}

loadTokens();

async function firebaseSignIn(email, password) {
  const res = await rawFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
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
  clearTokens();
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
      setBusy(true);
      try { const u = await firebaseSignIn('admin' + USER_DOMAIN, code); saveTokens(u.idToken, u.refreshToken, u.expiresIn); onSuccess(); }
      catch { fail('Λάθος κωδικός διαχειριστή.'); }
      finally { setBusy(false); }
      return;
    }
    if (!username.trim()) { fail('Δώστε όνομα χρήστη.'); return; }
    const email = toEmail(username);
    setBusy(true);
    try {
      const u = await firebaseSignIn(email, code);
      saveTokens(u.idToken, u.refreshToken, u.expiresIn);
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
        autoComplete="off"
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
  const [showMessages, setShowMessages] = useState(false);
  const [incomingMsg, setIncomingMsg] = useState(null);
  const [showInbox, setShowInbox] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [unreadPrompt, setUnreadPrompt] = useState(0);
  const promptAckRef = useRef(false);
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

  const [tokenVersion, setTokenVersion] = useState(0);
  const [lockedUsers, setLockedUsers] = useState({});
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthPwd, setAdminAuthPwd] = useState('');
  const [adminAuthError, setAdminAuthError] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [userLabels, setUserLabels] = useState({});
  const [labelDrafts, setLabelDrafts] = useState({});

  useEffect(() => {
    if (isLoggedIn) fetchData();
    else setLoading(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    const tick = async () => { if (await refreshIdToken() && alive) setTokenVersion(v => v + 1); };
    if (!fbToken || Date.now() > fbTokenExp - 5 * 60 * 1000) tick();
    const iv = setInterval(tick, 50 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    if (Platform.OS !== 'web' || typeof EventSource === 'undefined') {
      const interval = setInterval(() => { fetchData(true); }, 20000);
      return () => clearInterval(interval);
    }

    const timers = [];
    const sources = ['special_orders', 'customers', 'coatings', 'locks'].map((p, i) => {
      const es = new EventSource(`${FIREBASE_URL}/${p}.json` + (fbToken ? `?auth=${fbToken}` : ''));
      const refresh = () => {
        clearTimeout(timers[i]);
        timers[i] = setTimeout(() => fetchData(true, [p]), 300);
      };
      es.addEventListener('put', refresh);
      es.addEventListener('patch', refresh);
      return es;
    });
    const safety = setInterval(() => fetchData(true), 3 * 60 * 1000);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(safety);
      sources.forEach(es => es.close());
    };
  }, [isLoggedIn, tokenVersion]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      try { const r = await fetch(`${FIREBASE_URL}/app_lock.json`); setLockedUsers((await r.json()) || {}); } catch {}
    };
    load();
    if (Platform.OS === 'web' && typeof EventSource !== 'undefined') {
      const es = new EventSource(`${FIREBASE_URL}/app_lock.json` + (fbToken ? `?auth=${fbToken}` : ''));
      es.addEventListener('put', load);
      es.addEventListener('patch', load);
      const safety = setInterval(load, 15000);
      return () => { es.close(); clearInterval(safety); };
    }
    const safety = setInterval(load, 5000);
    return () => clearInterval(safety);
  }, [isLoggedIn, tokenVersion]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser?.username || currentUser.role === 'guest' || currentUser.role === 'admin') return;
    const myKey = lockKey(currentUser.username);
    const pickUnread = (data) => {
      const unread = Object.values(data || {}).filter(m => m && m.read === false);
      if (!unread.length) { promptAckRef.current = false; setUnreadPrompt(0); return; }
      if (!promptAckRef.current) setUnreadPrompt(unread.length);
    };
    const load = async () => { try { const r = await fetch(`${FIREBASE_URL}/messages/${myKey}.json`); pickUnread(await r.json()); } catch {} };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [isLoggedIn, currentUser, tokenVersion]);

  const dismissMsg = async () => {
    const m = incomingMsg; setIncomingMsg(null);
    if (!m || !currentUser?.username) return;
    setInbox(prev => prev.map(x => x.id === m.id ? { ...x, read: true, readAt: m.readAt || Date.now() } : x));
    if (m.read) return;
    try { await fetch(`${FIREBASE_URL}/messages/${lockKey(currentUser.username)}/${m.id}.json`, { method: 'PATCH', body: JSON.stringify({ read: true, readAt: Date.now() }) }); } catch {}
  };

  const loadInbox = async () => {
    if (!currentUser?.username) return;
    try {
      const r = await fetch(`${FIREBASE_URL}/messages/${lockKey(currentUser.username)}.json`);
      const d = (await r.json()) || {};
      const arr = Object.keys(d).map(id => ({ id, ...d[id] }));
      [...arr].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((m, i) => { m._num = i + 1; });
      setInbox(arr.sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    } catch { setInbox([]); }
  };

  const openInbox = () => { setMenuOpen(false); setShowInbox(true); loadInbox(); };

  useEffect(() => {
    if (!showInbox) return;
    const iv = setInterval(loadInbox, 12000);
    return () => clearInterval(iv);
  }, [showInbox]);

  useEffect(() => {
    if (!adminPanelOpen && !showMessages) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/user_labels.json`);
        const data = (await r.json()) || {};
        if (alive) { setUserLabels(data); setLabelDrafts(data); }
      } catch {}
    })();
    return () => { alive = false; };
  }, [adminPanelOpen, showMessages]);

  const saveLabel = async (k, val) => {
    const trimmed = (val || '').trim();
    if ((userLabels[k] || '') === trimmed) return;
    try {
      await fetch(`${FIREBASE_URL}/user_labels/${k}.json`, trimmed
        ? { method: 'PUT', body: JSON.stringify(trimmed) }
        : { method: 'DELETE' });
    } catch {}
  };

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
      if (incomingMsg) { dismissMsg(); return true; }
      if (unreadPrompt > 0) { setUnreadPrompt(0); return true; }
      if (showInbox) { setShowInbox(false); return true; }
      if (showMessages) { setShowMessages(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      return false;
    });
    return () => handler.remove();
  }, [menuOpen, showActivity, showMessages, showInbox, incomingMsg, unreadPrompt, showCoatings, showLocks, showCustomers, showStats, statsAuthOpen, backupAuthOpen, restoreAuthOpen, backupSuccess, restorePayload, restoreFileError]);

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

  const fetchData = async (silent=false, only=null) => {
    const want = (p) => !only || only.includes(p);
    if (!silent) setLoading(true);
    try {
      if (want('special_orders')) {
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
      }
      if (want('customers')) {
        const res4 = await fetch(`${FIREBASE_URL}/customers.json`);
        const data4 = await res4.json();
        if (data4) setCustomers(Object.keys(data4).map(key => ({ id: key, ...data4[key] })));
      }
      if (want('coatings')) {
        const res5 = await fetch(`${FIREBASE_URL}/coatings.json`);
        const data5 = await res5.json();
        if (data5) setCoatings(Object.keys(data5).map(key => ({ id: key, ...data5[key] })));
      }
      if (want('locks')) {
        const res7 = await fetch(`${FIREBASE_URL}/locks.json`);
        const data7 = await res7.json();
        if (data7) setLocks(Object.keys(data7).map(key => ({ id: key, ...data7[key] })));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const verifyAdminCode = async (code) => {
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
        {currentUser?.role !== 'guest' && currentUser?.role !== 'admin' && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 }}
            onPress={openInbox}>
            <Text style={{ fontSize: 18 }}>✉️</Text>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 }}>ΜΗΝΥΜΑΤΑ</Text>
          </TouchableOpacity>
        )}
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
          isAdmin={currentUser?.role === 'admin'}
          codeModalOpen={adminAuthOpen || adminPanelOpen || statsAuthOpen || backupAuthOpen || restoreAuthOpen}
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
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
              <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
            </TouchableOpacity>
            {currentUser?.role === 'admin' && (<>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowMessages(true); }}>
              <Text style={[styles.menuItemText, { color: '#1565C0' }]}>✉️ ΜΗΝΥΜΑΤΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff7ec' }]} onPress={() => { setMenuOpen(false); setAdminAuthPwd(''); setAdminAuthError(false); setAdminAuthOpen(true); }}>
              <Text style={[styles.menuItemText, { color: '#E65100' }]}>🛡️ ΔΙΑΧΕΙΡΙΣΤΗΣ</Text>
            </TouchableOpacity>
            </>)}
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

      <Modal visible={showMessages} animationType="slide" onRequestClose={() => setShowMessages(false)}>
        <MessagesScreen
          users={APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN')}
          userLabels={userLabels}
          lockKey={lockKey}
          onClose={() => setShowMessages(false)}
        />
      </Modal>

      <Modal visible={showInbox} transparent animationType="slide" onRequestClose={() => setShowInbox(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 560, maxHeight: '85%', borderTopWidth: 10, borderTopColor: '#1565C0' }]}>
            <Text style={[statsAuthStyles.title, { color: '#1565C0', fontSize: 20 }]}>📬 Τα μηνύματά μου</Text>
            {inbox.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#aaa', marginVertical: 30, fontSize: 15 }}>Δεν υπάρχουν μηνύματα.</Text>
            ) : (
              <ScrollView style={{ marginVertical: 12 }}>
                {inbox.map(m => (
                  <TouchableOpacity key={m.id} onPress={() => setIncomingMsg(m)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: m.read ? '#f5f5f5' : '#bcd4ff', borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 6, borderLeftColor: m.read ? '#bbb' : '#0d47a1' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: m.read ? '#bbb' : '#0d47a1', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: 'white' }}>{m._num}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ fontSize: 16, color: m.read ? '#222' : '#0d2c66', fontWeight: m.read ? '400' : '700', marginBottom: 6 }}>{m.text}</Text>
                      <Text style={{ fontSize: 13, color: m.read ? '#444' : '#0d47a1', fontWeight: '700' }}>
                        {m.ts ? new Date(m.ts).toLocaleString('el-GR') : ''}{m.read ? '  ·  ✓ διαβασμένο' : '  ·  ● νέο'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1565C0' }]} onPress={() => setShowInbox(false)}>
              <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!incomingMsg} transparent animationType="fade" onRequestClose={dismissMsg}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 560, padding: 26, borderTopWidth: 10, borderTopColor: '#1565C0' }, showInbox && { marginBottom: 70, marginLeft: 40 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {incomingMsg?._num ? (
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#0d47a1', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: 'white' }}>{incomingMsg._num}</Text>
                </View>
              ) : null}
              <Text style={[statsAuthStyles.title, { color: '#1565C0', fontSize: 19, marginBottom: 0 }]}>Μήνυμα από τον Διαχειριστή</Text>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#1565C0', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } }}>
                <Text style={{ fontSize: 24 }}>✉️</Text>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 380, marginVertical: 22 }}>
              <Text style={{ fontSize: 27, color: '#222', textAlign: 'center', lineHeight: 38 }}>{incomingMsg?.text}</Text>
            </ScrollView>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1565C0', padding: 18 }]} onPress={dismissMsg}>
              <Text style={[statsAuthStyles.btnTxt, { fontSize: 18 }]}>ΟΚ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={unreadPrompt > 0} transparent animationType="fade" onRequestClose={() => setUnreadPrompt(0)}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 420, padding: 28, borderTopWidth: 10, borderTopColor: '#1565C0', alignItems: 'center' }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', marginBottom: 12, elevation: 4, shadowColor: '#1565C0', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
              <Text style={{ fontSize: 30 }}>✉️</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1565C0', textAlign: 'center' }}>
              {unreadPrompt === 1 ? 'Έχεις 1 νέο μήνυμα' : `Έχεις ${unreadPrompt} νέα μηνύματα`}
            </Text>
            <TouchableOpacity
              style={[statsAuthStyles.btn, { backgroundColor: '#1565C0', padding: 16, alignSelf: 'stretch', marginTop: 20 }]}
              onPress={() => { promptAckRef.current = true; setUnreadPrompt(0); openInbox(); }}>
              <Text style={[statsAuthStyles.btnTxt, { fontSize: 17 }]}>ΔΙΑΒΑΣΕ</Text>
            </TouchableOpacity>
          </View>
        </View>
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
                  <TextInput
                    style={adminStyles.labelInput}
                    placeholder="Όνομα..."
                    placeholderTextColor="#aaa"
                    value={labelDrafts[k] || ''}
                    onChangeText={(t) => setLabelDrafts(d => ({ ...d, [k]: t }))}
                    onBlur={() => saveLabel(k, labelDrafts[k])}
                    onSubmitEditing={() => saveLabel(k, labelDrafts[k])}
                    maxLength={20}
                  />
                  <Text style={[adminStyles.badge, isLocked ? adminStyles.badgeLocked : adminStyles.badgeOpen]}>{isLocked ? '🔒' : '🔓'}</Text>
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
            <View style={{ height: 1, backgroundColor: '#eee', marginTop: 14, marginBottom: 10 }} />
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1976d2' }]} onPress={() => { setAdminPanelOpen(false); setShowStats(true); }}>
              <Text style={statsAuthStyles.btnTxt}>📊 ΣΤΑΤΙΣΤΙΚΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); doBackup(); }}>
              <Text style={statsAuthStyles.btnTxt}>💾 BACKUP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); openRestoreFilePicker(); }}>
              <Text style={statsAuthStyles.btnTxt}>♻️ ΕΠΑΝΑΦΟΡΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666', marginTop: 14 }]} onPress={() => setAdminPanelOpen(false)}>
              <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
        <CustomersScreen
          isAdmin={currentUser?.role === 'admin'}
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
  name: { width: 90, fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  labelInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, backgroundColor: '#fafafa' },
  badge: { fontSize: 14, fontWeight: 'bold' },
  badgeLocked: { color: '#E65100' },
  badgeOpen: { color: '#2e7d32' },
  toggle: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  toggleTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 },
});

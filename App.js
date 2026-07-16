import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, Platform,
  StatusBar, TouchableOpacity, Modal, TextInput, Alert, BackHandler, ScrollView
} from 'react-native';
import SpecialScreen from './SpecialScreen';
import CustomersScreen from './CustomersScreen';
import CoatingsScreen from './CoatingsScreen';
import LocksScreen from './LocksScreen';
import PricedListScreen from './PricedListScreen';
import PriceCatalogScreen from './PriceCatalogScreen';
import ActivityScreen from './ActivityScreen';
import SellerLogScreen from './SellerLogScreen';
import ApprovalScreen from './ApprovalScreen';
import ApprovalHistoryScreen from './ApprovalHistoryScreen';
import SellerSubmissionsScreen from './SellerSubmissionsScreen';
import MessagesScreen from './MessagesScreen';
import StatsScreen from './StatsScreen';
import { APP_VERSION } from './version';
import { IS_DEV as IS_DEV_TF, start2FA, verify2FA, loginDirect, verifyPasswordOnly } from './twoFactor';

// DEV (expo start / localhost) → δοκιμαστική βάση vaicon-test
// PROD (deployed build)         → κανονική βάση vaicon-eidikes
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

export const FIREBASE_URL = IS_DEV
  ? "https://vaicon-test-default-rtdb.europe-west1.firebasedatabase.app"
  : "https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app";

// Στο dev χρησιμοποιούμε ξεχωριστά κλειδιά ώστε παλιά tokens (παραγωγής) να μην μπερδεύουν
const STORAGE_KEY = IS_DEV ? "vaicon_special_auth_test" : "vaicon_special_auth_v1";
const STORAGE_USER = IS_DEV ? "vaicon_special_user_test" : "vaicon_special_user_v1";
const STORAGE_TOKEN = IS_DEV ? "vaicon_special_token_test" : "vaicon_special_token_v1";
const FIREBASE_API_KEY = IS_DEV
  ? "AIzaSyC2p46fX-FD5sszWHnkJB2hEJBN1bTkHWI"
  : "AIzaSyDTAyLh1-Jrdpz_TRUFbpQhqZHNhfPg47U";
const USER_DOMAIN = "@vaicon.local";

const toEmail = (u) => String(u || '').trim().toLowerCase().replace(/\s+/g, '') + USER_DOMAIN;
const roleForEmail = (e) => e.startsWith('admin') ? 'admin' : e.startsWith('guest') ? 'guest' : 'user';
const isSellerEmail = (e) => String(e || '').toLowerCase().startsWith('seller');

const APP_USERS = ['USER 10', 'USER 12', 'USER 14', 'USER 16', 'USER 18', 'SELLER 1', 'SELLER 2', 'SELLER 3', 'SELLER 4', 'SELLER 5', 'GUEST', 'ADMIN'];
const SELLERS = ['SELLER 1', 'SELLER 2', 'SELLER 3', 'SELLER 4', 'SELLER 5'];
const lockKey = (u) => String(u || '').toUpperCase().replace(/\s+/g, '');

// 2FA: όλοι πλην διαχειριστή/guest χρειάζονται κωδικό μιας χρήσης σε φρέσκο login.
const TWOFA_SS = 'vaicon_2fa_ok';
const needsTwoFactor = (u) => !!u && u.role !== 'admin' && u.role !== 'guest';
const twofaSessionOk = (u) => { try { return sessionStorage.getItem(TWOFA_SS) === lockKey(u.username); } catch { return false; } };
const markTwofa = (u) => { try { sessionStorage.setItem(TWOFA_SS, lockKey(u.username)); } catch {} };
const clearTwofa = () => { try { sessionStorage.removeItem(TWOFA_SS); } catch {} };

// Καρτέλες με ελεγχόμενα δικαιώματα ανά χρήστη (view = hide, edit = readonly) — Τυποποιημένες
const RIGHT_TABS = [
  { key: 'customNew', label: 'Καταχώρηση', edit: false },
  { key: 'customMoni', label: 'Μονή θωράκιση', edit: true },
  { key: 'customDipli', label: 'Διπλή θωράκιση', edit: true },
  { key: 'sasi', label: 'Stock Σασί', edit: true },
  { key: 'cases', label: 'Stock Κάσα', edit: true },
  { key: 'deliveries', label: 'Παραδόσεις', edit: false },
];

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

// Φύλακας ετικετών Firebase: η βάση απορρίπτει . / # $ [ ] σε ΟΝΟΜΑΤΑ πεδίων/διαδρομής
// (όχι σε τιμές). Εντοπίζουμε το πρόβλημα πριν φύγει, ώστε να μη χάνεται η εγγραφή με κρυπτικό 400.
const FB_BAD_KEY = /[.#$/\[\]]/;
const firstBadFbKey = (val) => {
  if (Array.isArray(val)) { for (const v of val) { const b = firstBadFbKey(v); if (b) return b; } return null; }
  if (val && typeof val === 'object') {
    for (const k of Object.keys(val)) { if (FB_BAD_KEY.test(k)) return k; const b = firstBadFbKey(val[k]); if (b) return b; }
  }
  return null;
};
const badKeyInWrite = (url, body) => {
  const path = String(url).split('?')[0].replace(FIREBASE_URL, '').replace(/\.json$/, '').replace(/^\//, '');
  for (const seg of path.split('/')) { if (seg && FB_BAD_KEY.test(decodeURIComponent(seg))) return decodeURIComponent(seg); }
  if (typeof body === 'string' && body) { try { return firstBadFbKey(JSON.parse(body)); } catch {} }
  return null;
};

// Οι κανόνες ασφαλείας της βάσης απαιτούν ταυτότητα· προσθέτουμε ?auth=<idToken>
// αυτόματα σε κάθε κλήση προς το FIREBASE_URL, αντί σε ~20 ξεχωριστά σημεία.
if (globalThis.fetch && !globalThis.__fbAuthPatched) {
  globalThis.__fbAuthPatched = true;
  globalThis.fetch = async (input, init) => {
    let url = typeof input === 'string' ? input : (input && input.url);
    if (url && url.indexOf(FIREBASE_URL) === 0 && url.indexOf('auth=') === -1) {
      const method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'DELETE') {
        const bad = badKeyInWrite(url, init && init.body);
        if (bad) {
          if (typeof window !== 'undefined' && window.alert) window.alert(`⚠️ Δεν αποθηκεύτηκε.\nΤο πεδίο «${bad}» έχει χαρακτήρα που δεν επιτρέπεται ( . / # $ [ ] ).\nΔιόρθωσέ το (π.χ. «PVC. ΕΞΩ» → «PVC ΕΞΩ»).`);
          return new Response(JSON.stringify({ error: 'invalid key' }), { status: 400 });
        }
      }
      await ensureFreshToken();
      if (fbToken) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'auth=' + fbToken;
        input = typeof input === 'string' ? url : new Request(url, input);
      }
    }
    let res = await rawFetch(input, init);
    // Αν η βάση απορρίψει με 401/403 (έληξε η ταυτότητα), ανανέωσε το token και ξαναδοκίμασε ΜΙΑ φορά.
    const fbUrl = typeof input === 'string' ? input : (input && input.url);
    if (fbUrl && fbUrl.indexOf(FIREBASE_URL) === 0 && (res.status === 401 || res.status === 403) && await refreshIdToken() && fbToken) {
      const u2 = fbUrl.indexOf('auth=') === -1
        ? fbUrl + (fbUrl.indexOf('?') === -1 ? '?' : '&') + 'auth=' + fbToken
        : fbUrl.replace(/([?&])auth=[^&]*/, '$1auth=' + fbToken);
      try { res = await rawFetch(typeof input === 'string' ? u2 : new Request(u2, init || input), init); } catch {}
    }
    return res;
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

async function exchangeCustomToken(customToken) {
  const res = await rawFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok || !data.idToken) throw new Error(data?.error?.message || 'TOKEN_EXCHANGE_FAILED');
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
      try {
        if (IS_DEV_TF) {
          const u = await firebaseSignIn('admin' + USER_DOMAIN, code);
          saveTokens(u.idToken, u.refreshToken, u.expiresIn);
        } else {
          const res = await loginDirect('ADMIN', code);
          if (!res.ok) { fail(res.error || 'Λάθος κωδικός.'); return; }
          const tok = await exchangeCustomToken(res.customToken);
          saveTokens(tok.idToken, tok.refreshToken, tok.expiresIn);
        }
        onSuccess();
      } catch { fail('Λάθος κωδικός διαχειριστή.'); }
      finally { setBusy(false); }
      return;
    }
    if (!username.trim()) { fail('Δώστε όνομα χρήστη.'); return; }
    const email = toEmail(username);
    const ukey = username.trim().toUpperCase();
    setBusy(true);
    try {
      if (IS_DEV_TF) {
        const u = await firebaseSignIn(email, code);
        saveTokens(u.idToken, u.refreshToken, u.expiresIn);
        onSuccess({ username: ukey, role: roleForEmail(email), email, uid: u.localId });
      } else {
        const isAdminOrGuest = ukey.startsWith('ADMIN') || ukey.startsWith('GUEST');
        if (isAdminOrGuest) {
          const res = await loginDirect(ukey, code);
          if (!res.ok) { fail(res.error || 'Λάθος κωδικός.'); return; }
          const tok = await exchangeCustomToken(res.customToken);
          saveTokens(tok.idToken, tok.refreshToken, tok.expiresIn);
          onSuccess({ username: ukey, role: res.role, email: res.email });
        } else {
          const r = await verifyPasswordOnly(ukey, code);
          if (!r.ok) { fail(r.error || 'Λάθος κωδικός.'); return; }
          onSuccess({ username: ukey, role: roleForEmail(email), email, _password: code });
        }
      }
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

function TwoFactorScreen({ user, onSuccess, onLogout }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300);

  const send = async () => {
    setError(''); setBusy(true); setDevCode(null); setTimeLeft(300);
    const r = await start2FA(user.username, user._password || '');
    setBusy(false);
    if (r.ok) setDevCode(r.devCode || null);
    else setError(r.error || 'Αποτυχία αποστολής κωδικού.');
  };
  useEffect(() => { send(); }, []);
  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  const submit = async () => {
    if (busy || code.trim().length < 6) return;
    setError(''); setBusy(true);
    const r = await verify2FA(user.username, code, user._password || '');
    setBusy(false);
    if (r.ok) onSuccess(r);
    else { setError(r.error || 'Λάθος κωδικός.'); setCode(''); }
  };

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');
  const expired = timeLeft <= 0;

  return (
    <View style={loginStyles.bg}>
      <View style={loginStyles.card}>
        <View style={loginStyles.logoBox}>
          <Text style={loginStyles.logoText}>VAICON</Text>
          <Text style={loginStyles.logoSub}>Κωδικός επιβεβαίωσης</Text>
        </View>
        <Text style={{ fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 8, lineHeight: 20 }}>
          Καλέστε τον διαχειριστή συστήματος.{'\n'}Ζητήστε τον εξαψήφιο κωδικό και γράψτε τον εδώ.
        </Text>
        <Text style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 14, color: expired ? '#c62828' : timeLeft < 60 ? '#e65100' : '#2e7d32' }}>
          ⏱ {expired ? 'Έληξε — ζητήστε νέο' : `${mm}:${ss}`}
        </Text>
        {devCode ? (
          <View style={{ backgroundColor: '#fff8e1', borderColor: '#ffb300', borderWidth: 2, borderRadius: 10, padding: 12, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: '#a67c00' }}>ΔΟΚΙΜΗ (τοπικά) — κωδικός:</Text>
            <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#a67c00', letterSpacing: 6 }}>{devCode}</Text>
          </View>
        ) : null}
        <View style={loginStyles.inputRow}>
          <TextInput
            style={[loginStyles.input, { textAlign: 'center' }, error && loginStyles.inputError]}
            placeholder="______"
            placeholderTextColor="#ccc"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={v => { setCode(v.replace(/\D/g, '')); setError(''); }}
            onSubmitEditing={submit}
            autoFocus
          />
        </View>
        {error ? <Text style={loginStyles.errorTxt}>❌ {error}</Text> : null}
        <TouchableOpacity style={[loginStyles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          <Text style={loginStyles.btnTxt}>{busy ? '⏳ ΕΛΕΓΧΟΣ...' : '✓ ΕΠΙΒΕΒΑΙΩΣΗ'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
          <TouchableOpacity onPress={send} disabled={busy}><Text style={{ color: '#1565C0', fontWeight: 'bold', fontSize: 13 }}>↻ Νέος κωδικός</Text></TouchableOpacity>
          <TouchableOpacity onPress={onLogout}><Text style={{ color: '#999', fontSize: 13 }}>Ακύρωση</Text></TouchableOpacity>
        </View>
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
  const [pendingLogin, setPendingLogin] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(isRemembered());
  const [currentUser, setCurrentUser] = useState(loadUser());
  const [twofaPassed, setTwofaPassed] = useState(() => { const u = loadUser(); return u ? (!needsTwoFactor(u) || twofaSessionOk(u)) : false; });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const [specialOrders, setSpecialOrders] = useState([]);
  const [soldSpecialOrders, setSoldSpecialOrders] = useState([]);
  const [specialQuotes, setSpecialQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [coatings, setCoatings] = useState([]);
  const [locks, setLocks] = useState([]);
  const [misc, setMisc] = useState([]);
  const [cylinders, setCylinders] = useState([]);

  const [showCustomers, setShowCustomers] = useState(false);
  const [showCoatings, setShowCoatings] = useState(false);
  const [showLocks, setShowLocks] = useState(false);
  const [showMisc, setShowMisc] = useState(false);
  const [showCylinders, setShowCylinders] = useState(false);
  const [showPriceCatalog, setShowPriceCatalog] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showSellerLog, setShowSellerLog] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showApprovalHistory, setShowApprovalHistory] = useState(false);
  const [showApprovalRights, setShowApprovalRights] = useState(false);
  const [tabRights, setTabRights] = useState({});
  const [showTabRights, setShowTabRights] = useState(false);
  const [tabRightsUser, setTabRightsUser] = useState(null);
  const [tabRightsProg, setTabRightsProg] = useState('std');
  const tabRightsDirty = useRef(0);
  const [showSellerSubs, setShowSellerSubs] = useState(false);
  const [approvalRights, setApprovalRights] = useState({});
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [editSubmission, setEditSubmission] = useState(null);
  const [showMessages, setShowMessages] = useState(false);
  const [incomingMsg, setIncomingMsg] = useState(null);
  const [showInbox, setShowInbox] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [unreadPrompt, setUnreadPrompt] = useState(0);
  const nextPromptAtRef = useRef(0);
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
  const [twofaPending, setTwofaPending] = useState({});
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthPwd, setAdminAuthPwd] = useState('');
  const [adminAuthError, setAdminAuthError] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
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
    // Browser: ~6 connections/host. Permanent EventSource streams block fetchData (spinner).
    const interval = setInterval(() => { fetchData(true); }, IS_DEV ? 8000 : 20000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      try { const r = await fetch(`${FIREBASE_URL}/app_lock.json`); setLockedUsers((await r.json()) || {}); } catch {}
    };
    load();
    const safety = setInterval(load, IS_DEV ? 10000 : 5000);
    return () => clearInterval(safety);
  }, [isLoggedIn, tokenVersion]);

  // Δικαιώματα καρτελών ανά χρήστη (tab_rights) — κοινά με τις Τυποποιημένες.
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => { if (Date.now() < tabRightsDirty.current) return; try { const r = await fetch(`${FIREBASE_URL}/tab_rights.json`); setTabRights((await r.json()) || {}); } catch {} };
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser?.username || currentUser.role === 'guest' || currentUser.role === 'admin') return;
    const myKey = lockKey(currentUser.username);
    const pickUnread = (data) => {
      const unread = Object.values(data || {}).filter(m => m && m.read === false);
      if (!unread.length) { nextPromptAtRef.current = 0; setUnreadPrompt(0); return; }
      // Επαναλαμβανόμενη υπενθύμιση: ξαναδείχνει το popup κάθε 5' μέχρι να διαβαστούν όλα.
      if (Date.now() >= (nextPromptAtRef.current || 0)) setUnreadPrompt(unread.length);
    };
    const load = async () => { try { const r = await fetch(`${FIREBASE_URL}/messages/${myKey}.json`); pickUnread(await r.json()); } catch {} };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [isLoggedIn, currentUser, tokenVersion]);

  const dismissMsg = async () => {
    const m = incomingMsg;
    if (!m || !currentUser?.username) { setIncomingMsg(null); return; }
    const wasUnread = m.read === false;
    if (wasUnread) {
      setInbox(prev => prev.map(x => x.id === m.id ? { ...x, read: true, readAt: Date.now() } : x));
      try { await fetch(`${FIREBASE_URL}/messages/${lockKey(currentUser.username)}/${m.id}.json`, { method: 'PATCH', body: JSON.stringify({ read: true, readAt: Date.now() }) }); } catch {}
    }
    // Αναγκαστική ουρά: μόλις διαβαστεί, αναδύεται αυτόματα το επόμενο (παλαιότερο) αδιάβαστο.
    const next = wasUnread
      ? inbox.filter(x => x.id !== m.id && x.read === false).sort((a, b) => (a.ts || 0) - (b.ts || 0))[0]
      : null;
    setIncomingMsg(next || null);
    if (!next) setUnreadPrompt(0);
  };

  const loadInbox = async () => {
    if (!currentUser?.username) return [];
    try {
      const r = await fetch(`${FIREBASE_URL}/messages/${lockKey(currentUser.username)}.json`);
      const d = (await r.json()) || {};
      const arr = Object.keys(d).map(id => ({ id, ...d[id] }));
      [...arr].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((m, i) => { m._num = i + 1; });
      const sorted = arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setInbox(sorted);
      return sorted;
    } catch { setInbox([]); return []; }
  };

  // Ανοίγει το inbox και αναδύει αυτόματα το παλαιότερο αδιάβαστο (αναγκαστική ανάγνωση).
  const openInbox = async () => {
    setMenuOpen(false);
    setUnreadPrompt(0);
    setShowInbox(true);
    const arr = await loadInbox();
    const oldestUnread = arr.filter(m => m.read === false).sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
    if (oldestUnread) setIncomingMsg(oldestUnread);
  };

  useEffect(() => {
    if (!showInbox) return;
    const iv = setInterval(loadInbox, 12000);
    return () => clearInterval(iv);
  }, [showInbox]);

  // Φόρτωση ονομάτων χρηστών στο login (admin), ώστε να εμφανίζονται αμέσως δίπλα στις
  // παραγγελίες χωρίς να χρειάζεται πρώτα να ανοίξει το panel Διαχειριστή ή τα Μηνύματα.
  useEffect(() => {
    if (!isLoggedIn || isSellerEmail(currentUser?.email) || currentUser?.role === 'guest') return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/user_labels.json`);
        const data = (await r.json()) || {};
        if (alive) { setUserLabels(data); setLabelDrafts(data); }
      } catch {}
    })();
    return () => { alive = false; };
  }, [isLoggedIn, currentUser]);

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

  // Δικαιώματα έγκρισης + αριθμός παραγγελιών προς έγκριση (Ειδικές).
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      try { const r = await fetch(`${FIREBASE_URL}/approval_rights.json`); setApprovalRights((await r.json()) || {}); } catch {}
      if (isSellerEmail(currentUser?.email)) { setPendingApprovalCount(0); return; }
      try {
        const r = await fetch(`${FIREBASE_URL}/seller_submissions.json`); const d = await r.json();
        setPendingApprovalCount(d ? Object.values(d).filter(s => s.status === 'PENDING' && s.orderType === 'ΕΙΔΙΚΗ').length : 0);
      } catch {}
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [isLoggedIn]);

  const saveLabel = async (k, val) => {
    const trimmed = (val || '').trim();
    if ((userLabels[k] || '') === trimmed) return;
    try {
      await fetch(`${FIREBASE_URL}/user_labels/${k}.json`, trimmed
        ? { method: 'PUT', body: JSON.stringify(trimmed) }
        : { method: 'DELETE' });
      setUserLabels(prev => { const n = { ...prev }; if (trimmed) n[k] = trimmed; else delete n[k]; return n; });
    } catch {}
  };

  const myLockKey = currentUser ? lockKey(currentUser.username) : null;
  const isSeller = isSellerEmail(currentUser?.email);
  const sellerKey = isSeller && currentUser?.username ? lockKey(currentUser.username) : null;
  const canApprove = !isSeller && currentUser?.role !== 'guest' && (currentUser?.role === 'admin' || (!!myLockKey && !!approvalRights[myLockKey]));
  const amLocked = !!(myLockKey && lockedUsers && lockedUsers[myLockKey] && !ownerOverride);

  const writeLock = async (key, val) => {
    try {
      await fetch(`${FIREBASE_URL}/app_lock/${key}.json`, val
        ? { method: 'PUT', body: 'true' }
        : { method: 'DELETE' });
    } catch {}
  };
  const writeTabRight = async (userKey, dim, tab, restricted) => {
    tabRightsDirty.current = Date.now() + 8000;
    const n = { ...tabRights }; const u = { ...(n[userKey] || {}) }; const d = { ...(u[dim] || {}) };
    if (restricted) d[tab] = true; else delete d[tab];
    if (Object.keys(d).length) u[dim] = d; else delete u[dim];
    const nextUser = Object.keys(u).length ? u : null;
    if (nextUser) n[userKey] = u; else delete n[userKey];
    setTabRights(n);
    try {
      const res = await fetch(`${FIREBASE_URL}/tab_rights/${userKey}.json`,
        nextUser ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextUser) }
                 : { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { if (Platform.OS === 'web') window.alert('Η αλλαγή δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
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
      setAdminUnlocked(true); setOwnerOverride(true); setAdminPanelOpen(true);
    } else { setAdminAuthError(true); setAdminAuthPwd(''); setTimeout(() => setAdminAuthError(false), 2000); }
  };

  // Άνοιγμα Διαχειριστή: ζητάει κωδικό μόνο την πρώτη φορά ανά session. Αφού ξεκλειδωθεί,
  // ανοίγει κατευθείαν μέχρι να κλειδωθεί χειροκίνητα ή να κλείσει το πρόγραμμα.
  const openAdmin = () => {
    setMenuOpen(false);
    if (adminUnlocked) { setOwnerOverride(true); setAdminPanelOpen(true); }
    else { setAdminAuthPwd(''); setAdminAuthError(false); setAdminAuthOpen(true); }
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
      if (incomingMsg) { return true; }
      if (unreadPrompt > 0) { setUnreadPrompt(0); nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; return true; }
      if (showInbox) { setShowInbox(false); return true; }
      if (showMessages) { setShowMessages(false); return true; }
      if (showActivity) { setShowActivity(false); return true; }
      if (showCoatings) { setShowCoatings(false); return true; }
      if (showLocks) { setShowLocks(false); return true; }
      if (showMisc) { setShowMisc(false); return true; }
      if (showCylinders) { setShowCylinders(false); return true; }
      if (showPriceCatalog) { setShowPriceCatalog(false); return true; }
      if (showCustomers) { setShowCustomers(false); return true; }
      return false;
    });
    return () => handler.remove();
  }, [menuOpen, showActivity, showMessages, showInbox, incomingMsg, unreadPrompt, showCoatings, showLocks, showMisc, showCylinders, showPriceCatalog, showCustomers, showStats, statsAuthOpen, backupAuthOpen, restoreAuthOpen, backupSuccess, restorePayload, restoreFileError]);

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
      const NODES = ['special_orders', 'special_quotes', 'customers', 'coatings', 'locks', 'user_labels', 'activity_log', 'msg_map', 'messages', 'app_lock', 'installers', 'installations', 'activity_log_install', 'order_files', 'upload_tokens', 'tab_rights'];
      const fullData = {};
      for (const p of NODES) {
        const r = await fetch(`${FIREBASE_URL}/${p}.json`);
        if (!r.ok) continue;
        const d = await r.json();
        if (d !== null && d !== undefined) fullData[p] = d;
      }
      if (Object.keys(fullData).length === 0) throw new Error('Σφάλμα ανάγνωσης βάσης');
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const createdAtStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const payload = { createdAt: now.getTime(), createdAtStr, version: APP_VERSION, data: fullData };
      const json = JSON.stringify(payload, null, 2);
      const filename = `vaicon-eidikes-backup-${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;

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
      const knownPaths = ['special_orders', 'special_quotes', 'customers', 'coatings', 'locks', 'activity_log'];
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
    let finished = false;
    const endLoad = () => { if (!finished) { finished = true; setLoading(false); } };
    const guard = silent ? null : setTimeout(endLoad, 20000);
    // Πωλητής: φέρνει από τη βάση ΜΟΝΟ τα δικά του (seller == sellerKey).
    const sellerQ = (isSeller && sellerKey) ? `?orderBy=${encodeURIComponent('"seller"')}&equalTo=${encodeURIComponent(`"${sellerKey}"`)}` : '';
    try {
      if (want('special_orders')) {
        const resS = await fetch(`${FIREBASE_URL}/special_orders.json${sellerQ}`);
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
      if (want('special_quotes')) {
        const resQ = await fetch(`${FIREBASE_URL}/special_quotes.json${sellerQ}`);
        const dataQ = await resQ.json();
        const fixQ = (o) => ({ ...o, stavera: o.stavera ? (Array.isArray(o.stavera) ? o.stavera : Object.values(o.stavera)) : [], coatings: o.coatings ? (Array.isArray(o.coatings) ? o.coatings : Object.values(o.coatings)) : [] });
        setSpecialQuotes(dataQ ? Object.keys(dataQ).map(key => fixQ({ id: key, ...dataQ[key] })) : []);
      }
      if (want('customers')) {
        const res4 = await fetch(`${FIREBASE_URL}/customers.json${sellerQ}`);
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
      if (want('misc')) {
        const res8 = await fetch(`${FIREBASE_URL}/misc.json`);
        const data8 = await res8.json();
        if (data8) setMisc(Object.keys(data8).map(key => ({ id: key, ...data8[key] })));
      }
      if (want('cylinders')) {
        const res9 = await fetch(`${FIREBASE_URL}/cylinders.json`);
        const data9 = await res9.json();
        if (data9) setCylinders(Object.keys(data9).map(key => ({ id: key, ...data9[key] })));
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (guard) clearTimeout(guard);
      endLoad();
    }
  };

  // ΕΡΓΑΛΕΙΟ ΜΙΑΣ ΧΡΗΣΗΣ: σφραγίδα πωλητή στις παλιές ειδικές παραγγελίες/προσφορές (από τον πελάτη τους). Αφαιρείται μετά.
  const stampSellersOnOldOrders = async () => {
    if (Platform.OS === 'web' && !window.confirm('Να μπει η σφραγίδα πωλητή σε όλες τις παλιές ειδικές παραγγελίες & προσφορές;')) return;
    const [ordRaw, qRaw, custRaw] = await Promise.all([
      fetch(`${FIREBASE_URL}/special_orders.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/special_quotes.json`).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_URL}/customers.json`).then(r => r.json()).catch(() => null),
    ]);
    const custs = custRaw ? Object.keys(custRaw).map(k => ({ id: k, ...custRaw[k] })) : [];
    const sellerOf = (o) => {
      const c = o.customerId ? custs.find(x => x.id === o.customerId) : custs.find(x => String(x.name) === String(o.customer));
      return c?.seller || '';
    };
    let total = 0, updated = 0;
    const run = async (node, raw) => {
      for (const key of Object.keys(raw || {})) {
        total++;
        const seller = sellerOf(raw[key]);
        if ((raw[key].seller || '') !== seller) {
          try { await fetch(`${FIREBASE_URL}/${node}/${key}.json`, { method: 'PATCH', body: JSON.stringify({ seller }) }); updated++; } catch {}
        }
      }
    };
    await run('special_orders', ordRaw);
    await run('special_quotes', qRaw);
    const msg = `Ελέγχθηκαν ${total}, ενημερώθηκαν ${updated}.`;
    if (Platform.OS === 'web') window.alert(`Σφραγίδα πωλητή\n${msg}`); else Alert.alert('Σφραγίδα πωλητή', msg);
    await fetchData();
  };

  const verifyAdminCode = async (code) => {
    if (IS_DEV_TF) {
      try { await firebaseSignIn('admin' + USER_DOMAIN, code); return true; } catch { return false; }
    }
    const res = await verifyPasswordOnly('ADMIN', code);
    return res.ok;
  };

  useEffect(() => {
    if (!isLoggedIn || currentUser?.role !== 'admin') return;
    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/twofa_pending.json`);
        const d = await r.json();
        setTwofaPending(d && typeof d === 'object' ? d : {});
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [isLoggedIn, currentUser]);
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

  if (!isLoggedIn && !pendingLogin)
    return <LoginScreen onSuccess={(u) => {
      clearTwofa();
      if (u && u._password) {
        setPendingLogin(u);
      } else {
        rememberLogin(u); setCurrentUser(u); setTwofaPassed(!needsTwoFactor(u)); setIsLoggedIn(true);
      }
    }} />;

  if (pendingLogin)
    return <TwoFactorScreen user={pendingLogin}
      onSuccess={async (r) => {
        if (r && r.customToken) {
          const tok = await exchangeCustomToken(r.customToken);
          saveTokens(tok.idToken, tok.refreshToken, tok.expiresIn);
          const u = { username: pendingLogin.username, role: r.role || pendingLogin.role, email: r.email || pendingLogin.email };
          rememberLogin(u); markTwofa(u); setCurrentUser(u); setTwofaPassed(true); setIsLoggedIn(true);
        } else {
          markTwofa(pendingLogin); setTwofaPassed(true);
        }
        setPendingLogin(null);
      }}
      onLogout={() => { setPendingLogin(null); }} />;

  if (IS_DEV && isLoggedIn && currentUser && needsTwoFactor(currentUser) && !twofaPassed)
    return <TwoFactorScreen user={currentUser}
      onSuccess={(r) => { markTwofa(currentUser); setTwofaPassed(true); }}
      onLogout={() => { clearTwofa(); setTwofaPassed(false); forgetLogin(); setCurrentUser(null); setIsLoggedIn(false); }} />;
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
        {currentUser?.role !== 'guest' && currentUser?.role !== 'admin' && !isSeller && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 }}
            onPress={openInbox}>
            <Text style={{ fontSize: 18 }}>✉️</Text>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 }}>ΜΗΝΥΜΑΤΑ</Text>
          </TouchableOpacity>
        )}
        {canApprove && pendingApprovalCount > 0 && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ff9800', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 }}
            onPress={() => setShowApprovals(true)}>
            <Text style={{ fontSize: 16 }}>🔔</Text>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>ΠΡΟΣ ΕΓΚΡΙΣΗ ({pendingApprovalCount})</Text>
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
          specialQuotes={specialQuotes}
          setSpecialQuotes={setSpecialQuotes}
          customers={customers}
          onRequestAddCustomer={(name, cb) => {
            setPendingCustomer(name);
            setPendingCustomerCallback(() => cb);
            setShowCustomers(true);
          }}
          coatings={coatings}
          locks={locks}
          misc={misc}
          cylinders={cylinders}
          readOnly={currentUser?.role === 'guest'}
          isForeman={myLockKey === 'USER14'}
          isAdmin={currentUser?.role === 'admin'}
          isSeller={isSeller}
          sellerKey={sellerKey}
          sellers={SELLERS}
          onOpenSubmissions={() => setShowSellerSubs(true)}
          editSubmission={editSubmission}
          onEditSubmissionDone={() => setEditSubmission(null)}
          currentUserName={currentUser?.username || ''}
          resolveName={(u) => userLabels[lockKey(u)] || u}
          codeModalOpen={adminAuthOpen || adminPanelOpen || statsAuthOpen || backupAuthOpen || restoreAuthOpen}
        />
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>ΜΕΝΟΥ</Text>
            {currentUser?.role !== 'guest' && !isSeller && myLockKey !== 'USER14' && (<>
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
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowCylinders(true); }}>
              <Text style={styles.menuItemText}>🗝️ ΑΦΑΛΟΙ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowMisc(true); }}>
              <Text style={styles.menuItemText}>📦 ΔΙΑΦΟΡΑ</Text>
            </TouchableOpacity>
            {currentUser?.role === 'admin' && (
              <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowPriceCatalog(true); }}>
                <Text style={[styles.menuItemText, { color: '#1565C0' }]}>💶 ΤΙΜΟΚΑΤΑΛΟΓΟΣ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
              <Text style={styles.menuItemText}>📜 ΙΣΤΟΡΙΚΟ ΚΙΝΗΣΕΩΝ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowApprovalHistory(true); }}>
              <Text style={styles.menuItemText}>📋 ΙΣΤΟΡΙΚΟ ΕΓΚΡΙΣΕΩΝ</Text>
            </TouchableOpacity>
            {currentUser?.role === 'admin' && (<>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowSellerLog(true); }}>
              <Text style={[styles.menuItemText, { color: '#1565C0' }]}>📒 ΑΝΑΘΕΣΕΙΣ ΠΩΛΗΤΩΝ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowApprovalRights(true); }}>
              <Text style={[styles.menuItemText, { color: '#1565C0' }]}>✅ ΕΓΚΡΙΣΕΙΣ ΠΑΡΑΓΓΕΛΙΩΝ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff4e6' }]} onPress={() => { setMenuOpen(false); stampSellersOnOldOrders(); }}>
              <Text style={[styles.menuItemText, { color: '#E65100' }]}>🏷 ΣΦΡΑΓΙΔΑ ΠΩΛΗΤΗ (μία φορά)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#eef4ff' }]} onPress={() => { setMenuOpen(false); setShowMessages(true); }}>
              <Text style={[styles.menuItemText, { color: '#1565C0' }]}>✉️ ΜΗΝΥΜΑΤΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff7ec' }]} onPress={openAdmin}>
              <Text style={[styles.menuItemText, { color: '#E65100' }]}>🛡️ ΔΙΑΧΕΙΡΙΣΤΗΣ{adminUnlocked ? ' 🔓' : ''}</Text>
            </TouchableOpacity>
            </>)}
            </>)}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); fetchData(); Alert.alert("VAICON", "Ανανέωση δεδομένων..."); }}>
              <Text style={styles.menuItemText}>🔄 ΑΝΑΝΕΩΣΗ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#fff0f0', marginTop: 12 }]} onPress={() => {
              const doLogout = () => { clearTwofa(); setTwofaPassed(false); forgetLogin(); setCurrentUser(null); setIsLoggedIn(false); setMenuOpen(false); setAdminUnlocked(false); };
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

      <Modal visible={showSellerLog} animationType="slide" onRequestClose={() => setShowSellerLog(false)}>
        <SellerLogScreen onClose={() => setShowSellerLog(false)} resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)} />
      </Modal>

      <Modal visible={showApprovals} animationType="slide" onRequestClose={() => setShowApprovals(false)}>
        <ApprovalScreen onClose={() => setShowApprovals(false)} currentUserName={currentUser?.username ? (userLabels[lockKey(currentUser.username)] || currentUser.username) : ''} resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)} coatings={coatings} locks={locks} customers={customers} onOpenSubmission={(sub) => { setShowApprovals(false); setEditSubmission({ ...sub, _approve: true }); }} />
      </Modal>

      <Modal visible={showApprovalHistory} animationType="slide" onRequestClose={() => setShowApprovalHistory(false)}>
        <ApprovalHistoryScreen onClose={() => setShowApprovalHistory(false)} resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)} />
      </Modal>

      <Modal visible={showSellerSubs} animationType="slide" onRequestClose={() => setShowSellerSubs(false)}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#8B0000', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>📤 ΟΙ ΥΠΟΒΟΛΕΣ ΜΟΥ</Text>
            <TouchableOpacity onPress={() => setShowSellerSubs(false)}><Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>✕</Text></TouchableOpacity>
          </View>
          <SellerSubmissionsScreen sellerKey={sellerKey} coatings={coatings} locks={locks} onEditSubmission={(sub) => { setShowSellerSubs(false); setEditSubmission(sub); }} />
        </View>
      </Modal>

      <Modal visible={showApprovalRights} transparent animationType="fade" onRequestClose={() => setShowApprovalRights(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 460 }]}>
            <Text style={[statsAuthStyles.title, { color: '#1565C0' }]}>✅ Δικαιώματα Έγκρισης</Text>
            <Text style={statsAuthStyles.subtitle}>Τσέκαρε ποιοι χρήστες μπορούν να εγκρίνουν παραγγελίες πωλητών. (Ο διαχειριστής εγκρίνει πάντα.)</Text>
            {APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN' && !SELLERS.includes(u)).map((u) => {
              const k = lockKey(u);
              const on = !!approvalRights[k];
              return (
                <TouchableOpacity key={k} style={adminStyles.row} onPress={async () => {
                  const next = !on;
                  setApprovalRights(prev => ({ ...prev, [k]: next }));
                  try { await fetch(`${FIREBASE_URL}/approval_rights/${k}.json`, next ? { method: 'PUT', body: 'true' } : { method: 'DELETE' }); } catch {}
                }}>
                  <Text style={[adminStyles.name, { width: 120 }]}>{userLabels[k] || u}</Text>
                  <View style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: on ? '#1565C0' : '#bbb', backgroundColor: on ? '#1565C0' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1565C0', marginTop: 14 }]} onPress={() => setShowApprovalRights(false)}>
              <Text style={statsAuthStyles.btnTxt}>ΕΝΤΑΞΕΙ</Text>
            </TouchableOpacity>
          </View>
        </View>
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

      <Modal visible={!!incomingMsg} transparent animationType="fade" onRequestClose={() => {}}>
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
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32', padding: 18 }]} onPress={dismissMsg}>
              <Text style={[statsAuthStyles.btnTxt, { fontSize: 18 }]}>✓ ΔΙΑΒΑΣΤΗΚΕ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={unreadPrompt > 0 && !incomingMsg} transparent animationType="fade" onRequestClose={() => { setUnreadPrompt(0); nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; }}>
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
              onPress={() => { nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; openInbox(); }}>
              <Text style={[statsAuthStyles.btnTxt, { fontSize: 17 }]}>ΔΙΑΒΑΣΕ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[statsAuthStyles.btn, { backgroundColor: '#999', padding: 12, alignSelf: 'stretch', marginTop: 10 }]}
              onPress={() => { setUnreadPrompt(0); nextPromptAtRef.current = Date.now() + 5 * 60 * 1000; }}>
              <Text style={[statsAuthStyles.btnTxt, { fontSize: 14 }]}>ΑΡΓΟΤΕΡΑ</Text>
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

      <Modal visible={showCylinders} animationType="slide" onRequestClose={() => setShowCylinders(false)}>
        <PricedListScreen title="ΑΦΑΛΟΙ" icon="🗝️" items={cylinders} setItems={setCylinders} fbNode="cylinders" placeholder="π.χ. ISEO R-50 με 5 κλειδιά..." showFlags={false} onClose={() => setShowCylinders(false)} />
      </Modal>

      <Modal visible={showMisc} animationType="slide" onRequestClose={() => setShowMisc(false)}>
        <PricedListScreen title="ΔΙΑΦΟΡΑ" icon="📦" items={misc} setItems={setMisc} fbNode="misc" onClose={() => setShowMisc(false)} />
      </Modal>

      <Modal visible={showPriceCatalog} animationType="slide" onRequestClose={() => setShowPriceCatalog(false)}>
        <PriceCatalogScreen coatings={coatings} onClose={() => setShowPriceCatalog(false)} />
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

      {/* 2FA PENDING — popup για τον admin */}
      {currentUser?.role === 'admin' && Object.keys(twofaPending).length > 0 && (
        <View style={{ position: 'absolute', bottom: 80, right: 16, zIndex: 9999, maxWidth: 300 }}>
          {Object.entries(twofaPending).map(([ukey, rec]) => {
            if (!rec) return null;
            const secs = Math.max(0, Math.floor(((rec.exp || 0) - Date.now()) / 1000));
            if (secs <= 0) return null;
            const tm = String(Math.floor(secs / 60)).padStart(2, '0');
            const ts = String(secs % 60).padStart(2, '0');
            return (
              <View key={ukey} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 2, borderColor: '#ffb300', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 10 }}>
                <Text style={{ color: '#ffb300', fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>🔐 ΑΙΤΗΜΑ ΕΙΣΟΔΟΥ</Text>
                <Text style={{ color: '#fff', fontSize: 13, marginBottom: 6 }}>{decodeURIComponent(ukey)} ζητά είσοδο</Text>
                <Text style={{ color: '#ffb300', fontSize: 30, fontWeight: 'bold', letterSpacing: 8, textAlign: 'center' }}>{rec.code}</Text>
                <Text style={{ color: secs < 60 ? '#ff7043' : '#81c784', fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginTop: 6 }}>⏱ {tm}:{ts}</Text>
                <Text style={{ color: '#aaa', fontSize: 10, textAlign: 'center', marginTop: 2 }}>Πείτε τον κωδικό στον χρήστη</Text>
              </View>
            );
          })}
        </View>
      )}

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
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#6a1b9a' }]} onPress={() => { setAdminPanelOpen(false); setTabRightsProg('std'); setTabRightsUser(null); setShowTabRights(true); }}>
              <Text style={statsAuthStyles.btnTxt}>🔑 ΔΙΚΑΙΩΜΑΤΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#1976d2', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); setShowStats(true); }}>
              <Text style={statsAuthStyles.btnTxt}>📊 ΣΤΑΤΙΣΤΙΚΑ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#2e7d32', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); doBackup(); }}>
              <Text style={statsAuthStyles.btnTxt}>💾 BACKUP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#E65100', marginTop: 8 }]} onPress={() => { setAdminPanelOpen(false); openRestoreFilePicker(); }}>
              <Text style={statsAuthStyles.btnTxt}>♻️ ΕΠΑΝΑΦΟΡΑ</Text>
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: '#eee', marginTop: 14, marginBottom: 10 }} />
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#8B0000' }]} onPress={() => { setAdminUnlocked(false); setAdminPanelOpen(false); }}>
              <Text style={statsAuthStyles.btnTxt}>🔐 ΚΛΕΙΔΩΜΑ ΠΡΟΣΒΑΣΗΣ (απαιτεί κωδικό ξανά)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666', marginTop: 10 }]} onPress={() => setAdminPanelOpen(false)}>
              <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTabRights} transparent animationType="fade" onRequestClose={() => setShowTabRights(false)}>
        <View style={statsAuthStyles.overlay}>
          <View style={[statsAuthStyles.box, { maxWidth: 540 }]}>
            <Text style={[statsAuthStyles.title, { color: '#6a1b9a' }]}>🔑 Δικαιώματα Χρηστών</Text>
            <Text style={statsAuthStyles.subtitle}>👁 Βλέπει = εμφανίζεται η καρτέλα · ✏️ Επεξεργάζεται = μπορεί να την αλλάξει.</Text>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 6 }}>
              {[{ key: 'std', label: 'Τυποποιημένες' }, { key: 'eid', label: 'Ειδικές' }, { key: 'inst', label: 'Τοποθετήσεις' }].map(prog => {
                const open = tabRightsProg === prog.key;
                return (
                  <View key={prog.key} style={{ marginBottom: 8, borderWidth: 1, borderColor: '#e0d4ee', borderRadius: 10, overflow: 'hidden' }}>
                    <TouchableOpacity onPress={() => { setTabRightsProg(open ? null : prog.key); setTabRightsUser(null); }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: open ? '#6a1b9a' : '#f3e9fb', paddingHorizontal: 14, paddingVertical: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: open ? '#fff' : '#4a148c' }}>{prog.label}</Text>
                      <Text style={{ fontSize: 16, color: open ? '#fff' : '#4a148c' }}>{open ? '▾' : '▸'}</Text>
                    </TouchableOpacity>
                    {open && prog.key !== 'std' && (
                      <Text style={{ textAlign: 'center', color: '#999', padding: 16, fontStyle: 'italic' }}>Σύντομα</Text>
                    )}
                    {open && prog.key === 'std' && (
                      <View style={{ padding: 8 }}>
                        {APP_USERS.filter(u => u !== 'GUEST' && u !== 'ADMIN' && !SELLERS.includes(u)).map(u => {
                          const k = lockKey(u);
                          const uOpen = tabRightsUser === k;
                          const r = tabRights[k] || {};
                          const restricted = !!((r.hide && Object.keys(r.hide).length) || (r.readonly && Object.keys(r.readonly).length));
                          return (
                            <View key={k} style={{ marginBottom: 6, borderWidth: 1, borderColor: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                              <TouchableOpacity onPress={() => setTabRightsUser(uOpen ? null : k)}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: uOpen ? '#ede7f6' : '#fafafa', paddingHorizontal: 12, paddingVertical: 10 }}>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>{userLabels[k] ? `${userLabels[k]} (${u})` : u}</Text>
                                <Text style={{ fontSize: 12, color: restricted ? '#c62828' : '#2e7d32', fontWeight: 'bold' }}>{restricted ? 'Περιορισμένος' : 'Πλήρης'}</Text>
                              </TouchableOpacity>
                              {uOpen && (
                                <View style={{ padding: 8 }}>
                                  <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6 }}>
                                    <View style={{ flex: 1 }} />
                                    <Text style={{ width: 70, textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#666' }}>👁</Text>
                                    <Text style={{ width: 70, textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#666' }}>✏️</Text>
                                  </View>
                                  {RIGHT_TABS.map(t => {
                                    const hidden = !!(r.hide && r.hide[t.key]);
                                    const readonly = !!(r.readonly && r.readonly[t.key]);
                                    return (
                                      <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#f3f3f3' }}>
                                        <Text style={{ flex: 1, fontSize: 13, color: '#333' }}>{t.label}</Text>
                                        <TouchableOpacity onPress={() => writeTabRight(k, 'hide', t.key, !hidden)} style={{ width: 70, alignItems: 'center' }}>
                                          <Text style={{ fontSize: 20 }}>{hidden ? '⬜' : '✅'}</Text>
                                        </TouchableOpacity>
                                        <View style={{ width: 70, alignItems: 'center' }}>
                                          {t.edit ? (
                                            <TouchableOpacity disabled={hidden} onPress={() => writeTabRight(k, 'readonly', t.key, !readonly)}>
                                              <Text style={{ fontSize: 20, opacity: hidden ? 0.25 : 1 }}>{(readonly || hidden) ? '⬜' : '✅'}</Text>
                                            </TouchableOpacity>
                                          ) : (
                                            <Text style={{ fontSize: 15, color: '#bbb' }}>—</Text>
                                          )}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[statsAuthStyles.btn, { backgroundColor: '#666', marginTop: 12 }]} onPress={() => { if (tabRightsUser) setTabRightsUser(null); else setShowTabRights(false); }}>
              <Text style={statsAuthStyles.btnTxt}>ΚΛΕΙΣΙΜΟ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCustomers} animationType="slide" onRequestClose={() => setShowCustomers(false)}>
        <CustomersScreen
          isAdmin={currentUser?.role === 'admin'}
          currentUserName={currentUser?.username || ''}
          resolveName={(u) => userLabels[lockKey(u)] || u}
          sellers={SELLERS}
          resolveLabel={(k) => userLabels[k] || (SELLERS.find(s => lockKey(s) === k) || k)}
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

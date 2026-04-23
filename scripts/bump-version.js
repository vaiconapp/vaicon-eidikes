// Αυξάνει αυτόματα την έκδοση της εφαρμογής πριν από κάθε push.
// Μορφή: v.DDMMYY.N.TOTAL
//   - DDMMYY : ημερομηνία
//   - N      : μετρητής ημέρας (1 το πρώτο push της ημέρας, αυξάνει για κάθε επόμενο της ίδιας μέρας)
//   - TOTAL  : συνολικός μετρητής deploys (μόνιμα αυξάνεται, δεν μηδενίζεται ποτέ)
// Παράδειγμα: v.240426.1.73  -> 24/4/26, 1ο deploy της ημέρας, 73ο συνολικά

const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '..', 'version.js');

const now = new Date();
const dd = String(now.getDate()).padStart(2, '0');
const mm = String(now.getMonth() + 1).padStart(2, '0');
const yy = String(now.getFullYear()).slice(-2);
const todayKey = `${dd}${mm}${yy}`;
const todayFull = `${dd}/${mm}/20${yy}`;

let currentVersion = 'v.000000.0.0';
if (fs.existsSync(VERSION_FILE)) {
  const content = fs.readFileSync(VERSION_FILE, 'utf8');
  const m = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (m) currentVersion = m[1];
}

// Split σε: ['v', 'DDMMYY', 'N', 'TOTAL']
const parts = currentVersion.split('.');
const currentDate    = parts[1] || '';
const currentDayN    = parseInt(parts[2] || '0', 10);
const currentTotal   = parseInt(parts[3] || '0', 10);

const newDayN  = (currentDate === todayKey) ? (currentDayN + 1) : 1;
const newTotal = currentTotal + 1;
const newVersion = `v.${todayKey}.${newDayN}.${newTotal}`;

const content = `// Αυτό το αρχείο ενημερώνεται αυτόματα από το scripts/bump-version.js
// πριν κάθε push. ΜΗΝ το επεξεργάζεσαι χειροκίνητα.
export const APP_VERSION = '${newVersion}';
export const APP_BUILD_DATE = '${todayFull}';
`;

fs.writeFileSync(VERSION_FILE, content, 'utf8');
console.log(`[bump-version] ${currentVersion}  ->  ${newVersion}`);

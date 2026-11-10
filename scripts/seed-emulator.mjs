#!/usr/bin/env node
/**
 * Seeds the LOCAL Firebase emulators with an HR administrator for development and manual testing.
 *
 *   npm run emulators            (terminal 1)
 *   npm run seed:emulator        (terminal 2)
 *     add `-- --with-test-users`       for denied-access fixtures
 *     add `-- --with-sample-employees` for 60 sample employees (57 active, 3 archived) — enough to
 *                                      exercise search, filters and pagination
 *
 * SAFETY: this script can only ever reach the emulators. It refuses to run unless both emulator
 * hosts are loopback addresses, it hardcodes the `demo-` project, and it uses the emulator's
 * built-in "owner" bypass (which does not exist on real Firebase). It uses no credentials.
 *
 * This is NOT the production provisioning path. Production accounts are created by hand in the
 * Firebase console (planning/FIREBASE_SECURITY_PLAN.md §2.1).
 */
const PROJECT_ID = 'demo-hr-leave';
const API_KEY = 'demo-api-key';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const withTestUsers = process.argv.includes('--with-test-users');
const withSampleEmployees = process.argv.includes('--with-sample-employees');

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
for (const [name, host] of [
  ['FIREBASE_AUTH_EMULATOR_HOST', authHost],
  ['FIRESTORE_EMULATOR_HOST', firestoreHost],
]) {
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  if (!LOCAL_HOSTS.has(hostname)) {
    console.error(`Refusing to run: ${name}=${host} is not a local emulator address.`);
    process.exit(1);
  }
}

const PASSWORD = 'Password123!';

/** Email, profile (null = deliberately no profile document), and what the fixture is for. */
const USERS = [
  {
    email: 'hr.admin@example.test',
    purpose: 'active HR administrator — can use the app',
    profile: { fullName: 'Maria Santos', role: 'hr_admin', isActive: true },
  },
  ...(withTestUsers
    ? [
        {
          email: 'inactive@example.test',
          purpose: 'deactivated HR admin — sees "Your account has been deactivated."',
          profile: { fullName: 'Inactive Admin', role: 'hr_admin', isActive: false },
        },
        {
          email: 'noprofile@example.test',
          purpose: 'Auth account without a profile — sees "hasn\'t been set up"',
          profile: null,
        },
        {
          email: 'employee@example.test',
          purpose: 'profile with a non-admin role — sees "don\'t have permission"',
          profile: { fullName: 'Plain Employee', role: 'employee', isActive: true },
        },
      ]
    : []),
];

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body };
}

async function ensureAuthUser(email) {
  const base = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts`;
  const headers = { 'Content-Type': 'application/json' };
  const payload = JSON.stringify({ email, password: PASSWORD, returnSecureToken: false });

  const created = await json(`${base}:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers,
    body: payload,
  });
  if (created.ok) return created.body.localId;

  if (created.body?.error?.message === 'EMAIL_EXISTS') {
    const existing = await json(`${base}:signInWithPassword?key=${API_KEY}`, {
      method: 'POST',
      headers,
      body: payload,
    });
    if (existing.ok) return existing.body.localId;
  }
  throw new Error(`Could not create ${email}: ${JSON.stringify(created.body)}`);
}

async function writeProfile(uid, email, profile) {
  const now = new Date().toISOString();
  const fields = {
    uid: { stringValue: uid },
    fullName: { stringValue: profile.fullName },
    email: { stringValue: email },
    role: { stringValue: profile.role },
    isActive: { booleanValue: profile.isActive },
    createdAt: { timestampValue: now },
    updatedAt: { timestampValue: now },
  };
  // "Bearer owner" is the emulator-only rules bypass: this is the console-equivalent write.
  const result = await json(
    `http://${firestoreHost}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields }),
    },
  );
  if (!result.ok)
    throw new Error(`Could not write profile for ${email}: ${JSON.stringify(result.body)}`);
}

const STATUSES = ['Regular', 'Probationary', 'Contractual', 'Project-Based', 'Part-Time'];
const FIRST = [
  'Juan',
  'Maria',
  'Ana',
  'Mario',
  'Liza',
  'Pedro',
  'Carla',
  'Jose',
  'Rosa',
  'Miguel',
  'Elena',
  'Ramon',
];
const LAST = [
  'Dela Cruz',
  'Santos',
  'Reyes',
  'Garcia',
  'Bautista',
  'Ocampo',
  'Mendoza',
  'Villanueva',
  'Aquino',
  'Castillo',
];
const DEPARTMENTS = ['Finance', 'Human Resources', 'Operations', 'Sales', null];
const POSITIONS = [
  'Accounting Staff',
  'HR Officer',
  'Driver',
  'Sales Associate',
  'Operations Lead',
];

/** Deterministic sample data: EMP-0001 … EMP-0060; every 20th employee is archived. */
function sampleEmployees(count = 60) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const number = `EMP-${String(n).padStart(4, '0')}`;
    return {
      id: `sample${String(n).padStart(3, '0')}`,
      number,
      fullName: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`,
      position: POSITIONS[i % POSITIONS.length],
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      status: STATUSES[i % STATUSES.length],
      archived: n % 20 === 0,
    };
  });
}

async function writeDocument(path, fields) {
  const result = await json(
    `http://${firestoreHost}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields }),
    },
  );
  if (!result.ok) throw new Error(`Could not write ${path}: ${JSON.stringify(result.body)}`);
}

async function seedEmployees(actorUid) {
  const now = new Date().toISOString();
  const str = (value) => (value === null ? { nullValue: null } : { stringValue: value });
  for (const e of sampleEmployees()) {
    await writeDocument(`employees/${e.id}`, {
      employeeNumber: str(e.number),
      employeeNumberKey: str(e.number),
      fullName: str(e.fullName),
      position: str(e.position),
      department: str(e.department),
      employmentStatus: str(e.status),
      isArchived: { booleanValue: e.archived },
      archivedAt: e.archived ? { timestampValue: now } : { nullValue: null },
      archivedBy: e.archived ? str(actorUid) : { nullValue: null },
      createdAt: { timestampValue: now },
      createdBy: str(actorUid),
      updatedAt: { timestampValue: now },
      updatedBy: str(actorUid),
    });
    // The Employee-ID reservation that goes with it (uniqueness, D-08).
    await writeDocument(`employeeNumbers/${e.number}`, {
      employeeId: str(e.id),
      createdAt: { timestampValue: now },
    });
  }
  return sampleEmployees().length;
}

try {
  await fetch(`http://${authHost}/`);
  await fetch(`http://${firestoreHost}/`);
} catch {
  console.error('The emulators are not reachable. Start them first with `npm run emulators`.');
  process.exit(1);
}

console.log(`Seeding the LOCAL emulators (project ${PROJECT_ID}) …\n`);
let adminUid = '';
for (const user of USERS) {
  const uid = await ensureAuthUser(user.email);
  if (user.profile) await writeProfile(uid, user.email, user.profile);
  if (user.email === 'hr.admin@example.test') adminUid = uid;
  console.log(`  ${user.email.padEnd(26)} ${PASSWORD}   ${user.purpose}`);
}
if (withSampleEmployees) {
  const created = await seedEmployees(adminUid);
  console.log(
    `\n  ${String(created)} sample employees (EMP-0001 … EMP-${String(created).padStart(4, '0')}), every 20th archived`,
  );
}
console.log(
  '\nEmulator-only demo credentials — they exist nowhere else. Data is lost when the emulators stop.',
);

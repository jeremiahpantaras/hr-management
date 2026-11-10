// Reconciliation utility (DB design §5.3, Roadmap Phase 12): recompute every balance from the ledger
// and report any difference. EMULATOR ONLY — it refuses any host that is not local, exactly like
// seed-emulator.mjs, and uses the emulator's owner bypass, so it needs no credentials.
//
//   npm run reconcile:emulator
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(HOST)) {
  console.error(`Refusing to run: ${HOST} is not a local emulator.`);
  process.exit(1);
}
const BASE = `http://${HOST}/v1/projects/demo-hr-leave/databases/(default)/documents`;
const num = (v) =>
  v && 'integerValue' in v ? Number(v.integerValue) : v && 'doubleValue' in v ? v.doubleValue : NaN;
const str = (v) => v?.stringValue ?? null;

async function list(collection) {
  const out = [];
  let token = '';
  do {
    const response = await fetch(`${BASE}/${collection}?pageSize=300${token}`, {
      headers: { Authorization: 'Bearer owner' },
    });
    if (!response.ok)
      throw new Error(
        `${collection}: HTTP ${String(response.status)} (are the emulators running?)`,
      );
    const body = await response.json();
    for (const document of body.documents ?? [])
      out.push({ id: document.name.split('/').pop(), f: document.fields ?? {} });
    token = body.nextPageToken ? `&pageToken=${body.nextPageToken}` : '';
  } while (token);
  return out;
}

const [ledger, balances] = await Promise.all([list('leaveTransactions'), list('leaveBalances')]);
const sums = new Map();
for (const entry of ledger) {
  const id = str(entry.f.balanceId);
  const s = sums.get(id) ?? { credits: 0, used: 0 };
  sums.set(id, {
    credits: s.credits + num(entry.f.creditsDelta),
    used: s.used + num(entry.f.usedDelta),
  });
}
const problems = [];
for (const balance of balances) {
  const s = sums.get(balance.id);
  const credits = num(balance.f.totalCredits),
    used = num(balance.f.totalUsed),
    available = num(balance.f.availableCredits);
  if (!s) problems.push(`${balance.id}: balance has no ledger entries`);
  else if (s.credits !== credits || s.used !== used)
    problems.push(
      `${balance.id}: ledger ${String(s.credits)}/${String(s.used)} ≠ balance ${String(credits)}/${String(used)}`,
    );
  if (available !== credits - used)
    problems.push(
      `${balance.id}: available ${String(available)} ≠ ${String(credits)} − ${String(used)}`,
    );
  if (credits < 0 || used < 0 || available < 0) problems.push(`${balance.id}: negative figure`);
}
for (const id of sums.keys())
  if (!balances.some((b) => b.id === id))
    problems.push(`${id}: ledger entries but no balance document`);

console.log(`${String(ledger.length)} ledger entries, ${String(balances.length)} balances.`);
if (problems.length === 0) console.log('OK — every balance equals the sum of its ledger entries.');
else {
  console.log(`${String(problems.length)} problem(s):`);
  for (const p of problems) console.log(' - ' + p);
  process.exit(1);
}

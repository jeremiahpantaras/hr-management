import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createRulesEnv,
  PROJECT_ID,
  requireFirestoreEmulator,
  seedUserProfile,
} from '../setup/emulator';
import {
  addPair,
  allocationPair,
  commitPair,
  reversalPair,
  seedMasterData,
  txnId,
  usagePair,
} from '../setup/ledgerFixtures';

/**
 * Security Plan §6.7 — V-1…V-10. Each construct the ledger rules depend on is proved in isolation
 * with a tiny throw-away rules file, so a failure points at the Firestore feature rather than at
 * the big rules. V-4 / V-5 (the core cross-document semantics) are also proved in
 * `ledger.rules.test.ts` and `employees.rules.test.ts`.
 */
beforeAll(() => {
  requireFirestoreEmulator();
});

let current: RulesTestEnvironment | null = null;
afterEach(async () => {
  await current?.cleanup();
  current = null;
});

async function envWith(rules: string): Promise<RulesTestEnvironment> {
  current = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });
  return current;
}

/** Rules with one `probe` collection whose writes are allowed iff `condition` holds. */
const probeRules = (condition: string, extra = '') => `
rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  match /probe/{id} { allow read: if true; allow write: if ${condition}; }
  ${extra}
} }`;

const anon = (env: RulesTestEnvironment) => env.unauthenticatedContext().firestore();

describe('V-1 string(int year)', () => {
  it('yields "2026" for an integer, and keeps fractions visible', async () => {
    const env = await envWith(
      probeRules('string(request.resource.data.year) == request.resource.data.expect'),
    );
    const db = anon(env);
    await assertSucceeds(setDoc(doc(db, 'probe/a'), { year: 2026, expect: '2026' }));
    await assertFails(setDoc(doc(db, 'probe/b'), { year: 2026, expect: '2026.0' }));
    await assertSucceeds(setDoc(doc(db, 'probe/c'), { year: 2026.5, expect: '2026.5' }));
  });
  it('the JS SDK stores a whole number as an integer (`is int`)', async () => {
    const env = await envWith(probeRules('request.resource.data.year is int'));
    await assertSucceeds(setDoc(doc(anon(env), 'probe/a'), { year: 2026 }));
    await assertFails(setDoc(doc(anon(env), 'probe/b'), { year: 2026.5 }));
  });
});

describe('V-2 half-step check', () => {
  it('int(v * 2) == v * 2 accepts multiples of 0.5 only, for ints and floats', async () => {
    const env = await envWith(
      probeRules(
        'request.resource.data.v is number && int(request.resource.data.v * 2) == request.resource.data.v * 2',
      ),
    );
    const db = anon(env);
    for (const [index, v] of [0.5, 1, 2.5, 10, 364.5, 365].entries()) {
      await assertSucceeds(setDoc(doc(db, `probe/ok${String(index)}`), { v }));
    }
    for (const [index, v] of [2.3, 0.25, 1.3, 0.05, 365.1].entries()) {
      await assertFails(setDoc(doc(db, `probe/no${String(index)}`), { v }));
    }
  });
});

describe('V-3 diff().affectedKeys().hasOnly()', () => {
  it('allows a change to the listed keys only', async () => {
    const rules = `
rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  match /probe/{id} { allow read, create: if true;
    allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['a']); }
} }`;
    const env = await envWith(rules);
    const db = anon(env);
    await setDoc(doc(db, 'probe/x'), { a: 1, b: 1 });
    await assertSucceeds(setDoc(doc(db, 'probe/x'), { a: 2, b: 1 }));
    await assertFails(setDoc(doc(db, 'probe/x'), { a: 2, b: 2 }));
    await assertFails(setDoc(doc(db, 'probe/x'), { a: 2, b: 1, c: 1 }));
  });
});

describe('V-4 / V-5 getAfter / existsAfter / exists in one commit', () => {
  const rules = `
rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  match /a/{id} { allow read: if true;
    allow create: if !exists(/databases/$(database)/documents/b/$(id))
                  && existsAfter(/databases/$(database)/documents/b/$(id))
                  && getAfter(/databases/$(database)/documents/b/$(id)).data.v == request.resource.data.v; }
  match /b/{id} { allow read, create: if true; }
} }`;
  it('V-4: getAfter / existsAfter see the other write of the same commit', async () => {
    const env = await envWith(rules);
    const db = anon(env);
    const together = writeBatch(db);
    together.set(doc(db, 'a/1'), { v: 7 });
    together.set(doc(db, 'b/1'), { v: 7 });
    await assertSucceeds(together.commit());
    const mismatch = writeBatch(db);
    mismatch.set(doc(db, 'a/2'), { v: 7 });
    mismatch.set(doc(db, 'b/2'), { v: 8 });
    await assertFails(mismatch.commit());
    await assertFails(setDoc(doc(db, 'a/3'), { v: 7 })); // b/3 is not written in this commit
  });
  it('V-5: !exists() looks at the state BEFORE the commit', async () => {
    const env = await envWith(rules);
    const db = anon(env);
    await setDoc(doc(db, 'b/9'), { v: 1 }); // already exists
    const batch = writeBatch(db);
    batch.set(doc(db, 'a/9'), { v: 1 });
    batch.set(doc(db, 'b/9'), { v: 1 });
    await assertFails(batch.commit());
  });
});

describe('V-6 ternary, helper functions and regex built with string()', () => {
  it('compiles and evaluates as the ledger rules use them', async () => {
    const rules = `
rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  function ok(d) { return (d.kind == 'R' ? d.id.matches('^rev_.*') : !d.id.matches('^rev_.*'))
    && d.date.matches('^' + string(d.year) + '-.*'); }
  match /probe/{id} { allow read: if true; allow write: if ok(request.resource.data); }
} }`;
    const env = await envWith(rules);
    const db = anon(env);
    await assertSucceeds(
      setDoc(doc(db, 'probe/a'), { kind: 'R', id: 'rev_x', year: 2026, date: '2026-02-10' }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'probe/b'), { kind: 'A', id: 'x', year: 2026, date: '2026-12-31' }),
    );
    await assertFails(
      setDoc(doc(db, 'probe/c'), { kind: 'A', id: 'rev_x', year: 2026, date: '2026-02-10' }),
    );
    await assertFails(
      setDoc(doc(db, 'probe/d'), { kind: 'R', id: 'x', year: 2026, date: '2026-02-10' }),
    );
    await assertFails(
      setDoc(doc(db, 'probe/e'), { kind: 'A', id: 'x', year: 2026, date: '2025-12-31' }),
    );
  });
});

describe('V-7 unary minus on fields', () => {
  it('a == -b works for ints and halves', async () => {
    const env = await envWith(probeRules('request.resource.data.a == -request.resource.data.b'));
    const db = anon(env);
    await assertSucceeds(setDoc(doc(db, 'probe/a'), { a: -2, b: 2 }));
    await assertSucceeds(setDoc(doc(db, 'probe/b'), { a: 0, b: 0 }));
    await assertSucceeds(setDoc(doc(db, 'probe/c'), { a: -0.5, b: 0.5 }));
    await assertFails(setDoc(doc(db, 'probe/d'), { a: 2, b: 2 }));
  });
});

describe('V-9 null comparisons on explicit null fields', () => {
  it('== null is true for an explicit null and false for a value', async () => {
    const env = await envWith(probeRules('request.resource.data.dateFrom == null'));
    const db = anon(env);
    await assertSucceeds(setDoc(doc(db, 'probe/a'), { dateFrom: null }));
    await assertFails(setDoc(doc(db, 'probe/b'), { dateFrom: '2026-01-01' }));
  });
});

describe('V-10 string ordering for ISO dates', () => {
  it('"YYYY-MM-DD" strings compare chronologically', async () => {
    const env = await envWith(probeRules('request.resource.data.from <= request.resource.data.to'));
    const db = anon(env);
    await assertSucceeds(setDoc(doc(db, 'probe/a'), { from: '2026-02-10', to: '2026-02-10' }));
    await assertSucceeds(setDoc(doc(db, 'probe/b'), { from: '2026-02-10', to: '2026-12-01' }));
    await assertSucceeds(setDoc(doc(db, 'probe/c'), { from: '2026-09-30', to: '2026-10-01' }));
    await assertFails(setDoc(doc(db, 'probe/d'), { from: '2026-10-01', to: '2026-09-30' }));
    await assertFails(setDoc(doc(db, 'probe/e'), { from: '2027-01-01', to: '2026-12-31' }));
  });
});

/**
 * V-8 — access-call headroom. Firestore allows 10 get/exists/getAfter/existsAfter calls per
 * document write and 20 per multi-document commit, but the emulator does not report how many a
 * rule uses. So we measure the HEADROOM instead: inject N extra, distinct `exists()` calls into the
 * ledger-create rule and find the largest N for which each real commit type still succeeds. A
 * commit that passes with headroom H uses at most (limit − H) calls.
 */
describe('V-8 access-call headroom of the real commits', () => {
  const RULES_PATH = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
  const original = readFileSync(RULES_PATH, 'utf8');
  const MARK = '        && d.reversedByTransactionId == null\n';

  function withExtraCalls(n: number): string {
    const extras = Array.from(
      { length: n },
      (_, i) =>
        `        && (exists(/databases/$(database)/documents/probe/p${String(i)}) || true)\n`,
    ).join('');
    expect(original.split(MARK)).toHaveLength(2);
    return original.replace(MARK, MARK + extras);
  }

  type Kind = 'allocation' | 'usage' | 'reversal';

  async function succeedsWith(kind: Kind, extra: number): Promise<boolean> {
    const env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: withExtraCalls(extra) },
    });
    try {
      await env.clearFirestore(); // every attempt starts from the same state
      await seedUserProfile(env, 'hr1');
      await seedMasterData(env);
      const db = env.authenticatedContext('hr1').firestore();
      const first = allocationPair({ id: txnId(1), days: 10 });
      await env.withSecurityRulesDisabled(async (context) => {
        // Establish prior state without going through the (probe-laden) rules.
        const admin = context.firestore();
        const batch = writeBatch(admin);
        batch.set(doc(admin, 'leaveTransactions', first.id), first.ledger);
        batch.set(doc(admin, 'leaveBalances', first.balanceId), first.balance);
        await batch.commit();
      });
      try {
        if (kind === 'allocation') {
          await commitPair(
            db,
            allocationPair({ id: txnId(2), days: 1, balance: { totalCredits: 10, totalUsed: 0 } }),
          );
        } else if (kind === 'usage') {
          await commitPair(
            db,
            usagePair({
              id: txnId(2),
              days: 1,
              dateFrom: '2026-02-10',
              dateTo: '2026-02-10',
              balance: { totalCredits: 10, totalUsed: 0 },
            }),
          );
        } else {
          const batch = writeBatch(db);
          addPair(
            db,
            batch,
            reversalPair({
              original: { ...first.domain },
              balance: { totalCredits: 10, totalUsed: 0 },
            }),
          );
          await batch.commit();
        }
        return true;
      } catch {
        return false;
      }
    } finally {
      await env.cleanup();
    }
  }

  async function headroom(kind: Kind): Promise<number> {
    if (!(await succeedsWith(kind, 0))) return -1;
    let n = 0;
    while (n < 25 && (await succeedsWith(kind, n + 1))) n += 1;
    return n;
  }

  it.each(['allocation', 'usage', 'reversal'] as const)(
    'the %s commit succeeds, and its headroom is recorded',
    async (kind) => {
      const room = await headroom(kind);
      console.info(
        `V-8 headroom (${kind}): extra access calls tolerated on the ledger write = ${String(room)}`,
      );
      expect(room).toBeGreaterThanOrEqual(0);
    },
    120_000,
  );
});

// Keep the shared helper referenced so a future refactor of the environment helper is noticed.
void createRulesEnv;

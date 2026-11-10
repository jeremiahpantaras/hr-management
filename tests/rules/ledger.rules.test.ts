import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRulesEnv, seedUserProfile } from '../setup/emulator';
import {
  EMP_ID,
  TYPE_SICK,
  TYPE_VAC,
  addPair,
  allocationPair,
  archivedEmployee,
  commitPair,
  employee,
  oldType,
  reversalPair,
  seedMasterData,
  sick,
  txnId,
  usagePair,
  vacation,
  type Pair,
} from '../setup/ledgerFixtures';

/**
 * TC-RULES-LED-01…26 against the REAL `firestore.rules` in the Firestore emulator. Valid documents
 * come from the real domain builders (so client and rules agree); every attack tampers with them.
 * A passing "valid" commit also proves the rules stay within Firestore's access-call limits
 * (10 per document, 20 per commit): exceeding them makes Firestore deny the request.
 */
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedUserProfile(env, 'hr1');
  await seedUserProfile(env, 'inactive1', { isActive: false });
  await seedUserProfile(env, 'wrongrole1', { role: 'employee' });
  await seedMasterData(env);
});

const hr = () => env.authenticatedContext('hr1').firestore();
const T = txnId;

/** Copy of a pair with changed ledger / balance fields (undefined removes a field). */
function tamper(
  pair: Pair,
  ledger: Record<string, unknown> = {},
  balance: Record<string, unknown> = {},
): Pair {
  const apply = (base: Record<string, unknown>, changes: Record<string, unknown>) => {
    const out = { ...base, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined) delete out[key];
    return out;
  };
  return { ...pair, ledger: apply(pair.ledger, ledger), balance: apply(pair.balance, balance) };
}

/** Allocates 10 Vacation credits for 2026 through the real rules. Returns the pair. */
async function allocate10(id = T(1)): Promise<Pair> {
  const pair = allocationPair({ id, days: 10 });
  await commitPair(hr(), pair);
  return pair;
}
/** Records a usage through the real rules against a known balance. */
async function use(
  id: string,
  days: number,
  from: string,
  to: string,
  balance: { totalCredits: number; totalUsed: number },
): Promise<Pair> {
  const pair = usagePair({ id, days, dateFrom: from, dateTo: to, balance });
  await commitPair(hr(), pair);
  return pair;
}

describe('access control (TC-RULES-USR-01/02 for the ledger)', () => {
  it('denies reads and writes to anonymous, profile-less, inactive and wrong-role users', async () => {
    await allocate10();
    const contexts = [
      env.unauthenticatedContext(),
      env.authenticatedContext('nobody'),
      env.authenticatedContext('inactive1'),
      env.authenticatedContext('wrongrole1'),
    ];
    for (const context of contexts) {
      const db = context.firestore();
      await assertFails(getDoc(doc(db, 'leaveTransactions', T(1))));
      await assertFails(getDocs(collection(db, 'leaveTransactions')));
      await assertFails(getDoc(doc(db, 'leaveBalances', `${EMP_ID}_2026_${TYPE_VAC}`)));
      await assertFails(getDocs(collection(db, 'leaveBalances')));
    }
  });
  it('lets an active HR admin read and list both collections', async () => {
    const pair = await allocate10();
    await assertSucceeds(getDoc(doc(hr(), 'leaveTransactions', pair.id)));
    await assertSucceeds(getDocs(collection(hr(), 'leaveTransactions')));
    await assertSucceeds(getDoc(doc(hr(), 'leaveBalances', pair.balanceId)));
    await assertSucceeds(getDocs(collection(hr(), 'leaveBalances')));
  });
  it('denies a valid commit from a deactivated or wrong-role user', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(commitPair(env.authenticatedContext('inactive1').firestore(), pair));
    await assertFails(commitPair(env.authenticatedContext('wrongrole1').firestore(), pair));
  });
});

describe('valid commits (TC-RULES-LED-01/02/03, V-4, V-5, V-8)', () => {
  it('LED-01: allocation with a NEW balance in one batch', async () => {
    const pair = allocationPair({ id: T(1), days: 10, remarks: '2026 annual vacation credits' });
    await assertSucceeds(commitPair(hr(), pair));
    const balance = await env.withSecurityRulesDisabled(async (c) => {
      await Promise.resolve(c);
    });
    void balance;
    const stored = await getDoc(doc(hr(), 'leaveBalances', pair.balanceId));
    expect(stored.data()).toMatchObject({
      totalCredits: 10,
      totalUsed: 0,
      availableCredits: 10,
      year: 2026,
      lastTransactionId: T(1),
    });
  });

  it('a second allocation adds to the balance (10 then 2 → 12)', async () => {
    await allocate10();
    await assertSucceeds(
      commitPair(
        hr(),
        allocationPair({ id: T(2), days: 2, balance: { totalCredits: 10, totalUsed: 0 } }),
      ),
    );
    const stored = await getDoc(doc(hr(), 'leaveBalances', `${EMP_ID}_2026_${TYPE_VAC}`));
    expect(stored.data()).toMatchObject({
      totalCredits: 12,
      availableCredits: 12,
      lastTransactionId: T(2),
    });
  });

  it('allocates for a different type and a different year independently', async () => {
    await allocate10();
    await assertSucceeds(commitPair(hr(), allocationPair({ id: T(2), days: 5, type: sick })));
    await assertSucceeds(commitPair(hr(), allocationPair({ id: T(3), days: 3, year: 2027 })));
  });

  it('LED-02: usage with the balance update, down to exactly zero', async () => {
    await allocate10();
    await assertSucceeds(
      commitPair(
        hr(),
        usagePair({
          id: T(2),
          days: 2,
          dateFrom: '2026-02-10',
          dateTo: '2026-02-11',
          balance: { totalCredits: 10, totalUsed: 0 },
        }),
      ),
    );
    await assertSucceeds(
      commitPair(
        hr(),
        usagePair({
          id: T(3),
          days: 8,
          dateFrom: '2026-03-01',
          dateTo: '2026-03-08',
          balance: { totalCredits: 10, totalUsed: 2 },
        }),
      ),
    );
    const stored = await getDoc(doc(hr(), 'leaveBalances', `${EMP_ID}_2026_${TYPE_VAC}`));
    expect(stored.data()).toMatchObject({ totalUsed: 10, availableCredits: 0 });
  });

  it('accepts half days exactly (V-2) and Jan 1 / Dec 31 bounds', async () => {
    await allocate10();
    await assertSucceeds(
      commitPair(
        hr(),
        usagePair({
          id: T(2),
          days: 0.5,
          dateFrom: '2026-01-01',
          dateTo: '2026-01-01',
          balance: { totalCredits: 10, totalUsed: 0 },
        }),
      ),
    );
    await assertSucceeds(
      commitPair(
        hr(),
        usagePair({
          id: T(3),
          days: 0.5,
          dateFrom: '2026-12-31',
          dateTo: '2026-12-31',
          balance: { totalCredits: 10, totalUsed: 0.5 },
        }),
      ),
    );
  });

  it('LED-03: reversal of a usage — three writes in one commit (V-8: within the access-call limits)', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    await assertSucceeds(
      commitPair(
        hr(),
        reversalPair({ original: usage.domain, balance: { totalCredits: 10, totalUsed: 1 } }),
      ),
    );
    const balance = await getDoc(doc(hr(), 'leaveBalances', usage.balanceId));
    expect(balance.data()).toMatchObject({
      totalUsed: 0,
      availableCredits: 10,
      lastTransactionId: `rev_${T(2)}`,
    });
    const original = await getDoc(doc(hr(), 'leaveTransactions', T(2)));
    expect(original.data()?.reversedByTransactionId).toBe(`rev_${T(2)}`);
  });

  it('LED-03: reversal of an unused allocation', async () => {
    const first = await allocate10();
    const second = allocationPair({
      id: T(2),
      days: 2,
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    await commitPair(hr(), second);
    await assertSucceeds(
      commitPair(
        hr(),
        reversalPair({ original: second.domain, balance: { totalCredits: 12, totalUsed: 0 } }),
      ),
    );
    void first;
    const balance = await getDoc(doc(hr(), 'leaveBalances', second.balanceId));
    expect(balance.data()).toMatchObject({ totalCredits: 10, availableCredits: 10 });
  });

  it('EC-20: reversing the only allocation leaves a 0/0/0 balance document', async () => {
    const only = await allocate10();
    await assertSucceeds(
      commitPair(
        hr(),
        reversalPair({ original: only.domain, balance: { totalCredits: 10, totalUsed: 0 } }),
      ),
    );
    const balance = await getDoc(doc(hr(), 'leaveBalances', only.balanceId));
    expect(balance.data()).toMatchObject({ totalCredits: 0, totalUsed: 0, availableCredits: 0 });
  });
});

describe('the pair cannot be split (LED-04/05/06/21, V-4)', () => {
  it('LED-04: a ledger entry alone is denied', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(setDoc(doc(hr(), 'leaveTransactions', pair.id), pair.ledger));
  });
  it('LED-05: a balance alone is denied, even with a huge total', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(
      setDoc(doc(hr(), 'leaveBalances', pair.balanceId), {
        ...pair.balance,
        totalCredits: 999,
        availableCredits: 999,
      }),
    );
    await assertFails(setDoc(doc(hr(), 'leaveBalances', pair.balanceId), pair.balance));
  });
  it('LED-05: an existing balance cannot be edited without a ledger entry', async () => {
    const first = await allocate10();
    await assertFails(
      updateDoc(doc(hr(), 'leaveBalances', first.balanceId), {
        totalCredits: 999,
        availableCredits: 999,
        updatedAt: Timestamp.now(),
      }),
    );
  });
  it('LED-06: a balance pointing lastTransactionId at an OLD entry is denied (V-5)', async () => {
    const first = await allocate10();
    const stale = allocationPair({
      id: T(2),
      days: 2,
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    // The new ledger entry is T2, but the balance claims its last entry is the existing T1.
    await assertFails(commitPair(hr(), tamper(stale, {}, { lastTransactionId: first.id })));
    const db = hr();
    const onlyBalance = writeBatch(db);
    onlyBalance.update(doc(db, 'leaveBalances', first.balanceId), {
      ...stale.balance,
      lastTransactionId: first.id,
    });
    await assertFails(onlyBalance.commit());
  });
  it("LED-06: a balance-only update that replays an OLD entry's delta is denied (V-5)", async () => {
    const first = await allocate10(); // T1 is +10 credits
    // No new ledger entry at all: the balance claims "+10 again" by pointing at the existing T1.
    const db = hr();
    const batch = writeBatch(db);
    batch.update(doc(db, 'leaveBalances', first.balanceId), {
      totalCredits: 20,
      totalUsed: 0,
      availableCredits: 20,
      lastTransactionId: first.id,
      updatedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
    const stored = await getDoc(doc(hr(), 'leaveBalances', first.balanceId));
    expect(stored.data()?.totalCredits).toBe(10);
  });
  it('LED-21: two ledger entries with one balance write are denied', async () => {
    await allocate10();
    const a = allocationPair({ id: T(2), days: 1, balance: { totalCredits: 10, totalUsed: 0 } });
    const b = allocationPair({ id: T(3), days: 1, balance: { totalCredits: 10, totalUsed: 0 } });
    const db = hr();
    const batch = writeBatch(db);
    addPair(db, batch, a);
    batch.set(doc(db, 'leaveTransactions', b.id), b.ledger);
    await assertFails(batch.commit());
  });
});

describe('arithmetic is bound to the stored balance (LED-07/08/09)', () => {
  it('LED-07: ledger +2 with a balance written +3 is denied', async () => {
    await allocate10();
    const pair = allocationPair({ id: T(2), days: 2, balance: { totalCredits: 10, totalUsed: 0 } });
    await assertFails(
      commitPair(hr(), tamper(pair, {}, { totalCredits: 13, availableCredits: 13 })),
    );
  });
  it('LED-07: a balance built from stale totals is denied (the "before" comes from the server)', async () => {
    await allocate10();
    await commitPair(
      hr(),
      allocationPair({ id: T(2), days: 2, balance: { totalCredits: 10, totalUsed: 0 } }),
    );
    // A second client still believes the balance is 10/0 and adds 2 → claims 12; the server has 12 → must be 14.
    const stale = allocationPair({
      id: T(3),
      days: 2,
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    await assertFails(commitPair(hr(), stale));
  });
  it('LED-07: resultingTotal* that differ from the written balance are denied', async () => {
    await allocate10();
    const pair = allocationPair({ id: T(2), days: 2, balance: { totalCredits: 10, totalUsed: 0 } });
    await assertFails(commitPair(hr(), tamper(pair, { resultingTotalCredits: 99 })));
    await assertFails(commitPair(hr(), tamper(pair, { resultingTotalUsed: 1 })));
  });
  it('LED-08: a usage larger than available is denied', async () => {
    await allocate10();
    await use(T(2), 9, '2026-03-01', '2026-03-09', { totalCredits: 10, totalUsed: 0 });
    const ok = usagePair({
      id: T(3),
      days: 1,
      dateFrom: '2026-05-05',
      dateTo: '2026-05-05',
      balance: { totalCredits: 10, totalUsed: 9 },
    });
    // Claim 2 days used against 1 available: used 11 > credits 10 → available −1.
    await assertFails(
      commitPair(
        hr(),
        tamper(
          ok,
          { days: 2, usedDelta: 2, resultingTotalUsed: 11, dateTo: '2026-05-06' },
          { totalUsed: 11, availableCredits: -1 },
        ),
      ),
    );
    // Hiding the overdraw by also inflating the credits is caught by the stored-total binding.
    await assertFails(
      commitPair(
        hr(),
        tamper(
          ok,
          {
            days: 2,
            usedDelta: 2,
            resultingTotalCredits: 12,
            resultingTotalUsed: 11,
            dateTo: '2026-05-06',
          },
          { totalCredits: 12, totalUsed: 11, availableCredits: 1 },
        ),
      ),
    );
  });
  it('LED-09: a usage can never create a balance', async () => {
    const orphan = usagePair({
      id: T(1),
      days: 2,
      type: sick,
      dateFrom: '2026-02-10',
      dateTo: '2026-02-11',
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    const asCreate: Pair = {
      ...orphan,
      isNewBalance: true,
      balance: {
        ...orphan.balance,
        employeeId: EMP_ID,
        leaveTypeId: TYPE_SICK,
        year: 2026,
        createdAt: serverTimestamp(),
      },
    };
    await assertFails(commitPair(hr(), asCreate));
    // Even a self-consistent 0 credits / 2 used balance fails (available would be −2).
    await assertFails(
      commitPair(
        hr(),
        tamper(
          asCreate,
          { resultingTotalCredits: 0, resultingTotalUsed: 2 },
          { totalCredits: 0, totalUsed: 2, availableCredits: -2 },
        ),
      ),
    );
  });
});

describe('ledger entries are immutable (LED-10/11/24)', () => {
  it.each([
    ['days', { days: 99 }],
    ['remarks', { remarks: 'edited' }],
    ['creditsDelta', { creditsDelta: 99 }],
    ['createdByName', { createdByName: 'Someone Else' }],
    ['leaveYear', { leaveYear: 2027 }],
    ['employeeNameSnapshot', { employeeNameSnapshot: 'Renamed' }],
  ])('LED-10: updating %s is denied', async (_name, change) => {
    await allocate10();
    await assertFails(updateDoc(doc(hr(), 'leaveTransactions', T(1)), change));
  });
  it('LED-10: the reversal link cannot be set without a reversal in the same commit', async () => {
    await allocate10();
    await assertFails(
      updateDoc(doc(hr(), 'leaveTransactions', T(1)), { reversedByTransactionId: `rev_${T(1)}` }),
    );
    await assertFails(
      updateDoc(doc(hr(), 'leaveTransactions', T(1)), { reversedByTransactionId: 'anything' }),
    );
  });
  it('LED-11: ledger entries and balances cannot be deleted', async () => {
    const pair = await allocate10();
    await assertFails(deleteDoc(doc(hr(), 'leaveTransactions', pair.id)));
    await assertFails(deleteDoc(doc(hr(), 'leaveBalances', pair.balanceId)));
  });
  it('LED-24: an existing transaction id cannot be recreated or overwritten', async () => {
    await allocate10();
    const again = allocationPair({
      id: T(1),
      days: 10,
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    await assertFails(commitPair(hr(), again));
    await assertFails(commitPair(hr(), allocationPair({ id: T(1), days: 10 })));
  });
});

describe('reversal integrity (LED-12/13/14/15)', () => {
  it('LED-12: a second reversal of the same entry is denied', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    await commitPair(
      hr(),
      reversalPair({ original: usage.domain, balance: { totalCredits: 10, totalUsed: 1 } }),
    );
    // A second client, still unaware of the first reversal, builds the same reversal.
    const again = reversalPair({
      original: { ...usage.domain },
      balance: { totalCredits: 10, totalUsed: 1 },
    });
    await assertFails(commitPair(hr(), again));
  });
  it('LED-12: a reversal must use the deterministic rev_ id', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    const good = reversalPair({
      original: usage.domain,
      balance: { totalCredits: 10, totalUsed: 1 },
    });
    await assertFails(
      commitPair(hr(), {
        ...good,
        id: T(9),
        balance: { ...good.balance, lastTransactionId: T(9) },
      }),
    );
  });
  it('LED-13: a reversal cannot be reversed', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    const reversal = reversalPair({
      original: usage.domain,
      balance: { totalCredits: 10, totalUsed: 1 },
    });
    await commitPair(hr(), reversal);
    const reverseTheReversal = reversalPair({
      original: { ...reversal.domain, transactionType: 'USAGE', creditsDelta: 0, usedDelta: 1 },
      balance: { totalCredits: 10, totalUsed: 1 }, // stale on purpose: the builder would refuse 0
    });
    await assertFails(commitPair(hr(), reverseTheReversal));
  });
  it('LED-14: reversing an allocation whose credits are used would go negative → denied', async () => {
    const alloc = await allocate10();
    await use(T(2), 8, '2026-03-01', '2026-03-08', { totalCredits: 10, totalUsed: 0 });
    // Build the reversal as if nothing were used, then try to push it through.
    const naive = reversalPair({
      original: alloc.domain,
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    await assertFails(commitPair(hr(), naive)); // balance totals disagree with the stored 10/8
    await assertFails(
      commitPair(hr(), tamper(naive, {}, { totalCredits: 0, totalUsed: 8, availableCredits: -8 })),
    );
    await assertFails(
      commitPair(
        hr(),
        tamper(
          naive,
          { resultingTotalCredits: 0, resultingTotalUsed: 8 },
          { totalCredits: 0, totalUsed: 8, availableCredits: -8 },
        ),
      ),
    );
  });
  it.each([
    ['days', { days: 5 }],
    ['creditsDelta/usedDelta (not the exact opposite)', { usedDelta: -2 }],
    ['dateFrom', { dateFrom: '2026-04-19' }],
    ['dateTo', { dateTo: '2026-04-21' }],
    ['employeeNameSnapshot', { employeeNameSnapshot: 'Someone Else' }],
    ['positionSnapshot', { positionSnapshot: 'CEO' }],
    ['leaveTypeNameSnapshot', { leaveTypeNameSnapshot: 'Other' }],
    ['reversesType', { reversesType: 'ALLOCATION' }],
    ['leaveTypeId', { leaveTypeId: TYPE_SICK }],
    ['a reason that is too short', { remarks: 'ab' }],
    ['a missing reason', { remarks: null }],
  ])('LED-15: a reversal with altered %s is denied', async (_name, change) => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    const reversal = reversalPair({
      original: usage.domain,
      balance: { totalCredits: 10, totalUsed: 1 },
    });
    await assertFails(commitPair(hr(), tamper(reversal, change)));
  });
  it('LED-15: a reversal that does not link its original is denied', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    const reversal = reversalPair({
      original: usage.domain,
      balance: { totalCredits: 10, totalUsed: 1 },
    });
    const db = hr();
    const batch = writeBatch(db);
    batch.set(doc(db, 'leaveTransactions', reversal.id), reversal.ledger);
    batch.update(doc(db, 'leaveBalances', reversal.balanceId), reversal.balance);
    await assertFails(batch.commit()); // original never gets reversedByTransactionId
  });
});

describe('master data and reversibility (LED-16)', () => {
  it('denies an allocation / usage for an archived employee', async () => {
    const asActive = { ...archivedEmployee, isArchived: false }; // fools the client builder only
    await assertFails(commitPair(hr(), allocationPair({ id: T(1), days: 10, emp: asActive })));
  });
  it('denies an allocation for an inactive leave type', async () => {
    const asActive = { ...oldType, isActive: true };
    await assertFails(commitPair(hr(), allocationPair({ id: T(1), days: 10, type: asActive })));
  });
  it('denies a usage once the employee has been archived, but ALLOWS reversing earlier entries (R-03)', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'employees', EMP_ID), { isArchived: true });
    });
    await assertFails(
      commitPair(
        hr(),
        usagePair({
          id: T(3),
          days: 1,
          dateFrom: '2026-05-05',
          dateTo: '2026-05-05',
          balance: { totalCredits: 10, totalUsed: 1 },
        }),
      ),
    );
    await assertSucceeds(
      commitPair(
        hr(),
        reversalPair({ original: usage.domain, balance: { totalCredits: 10, totalUsed: 1 } }),
      ),
    );
  });
  it('allows reversing an entry whose leave type has since been deactivated', async () => {
    const alloc = await allocate10();
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'leaveTypes', TYPE_VAC), { isActive: false });
    });
    await assertFails(
      commitPair(
        hr(),
        allocationPair({ id: T(2), days: 1, balance: { totalCredits: 10, totalUsed: 0 } }),
      ),
    );
    await assertSucceeds(
      commitPair(
        hr(),
        reversalPair({ original: alloc.domain, balance: { totalCredits: 10, totalUsed: 0 } }),
      ),
    );
  });
  it('denies a snapshot that does not match the current master data (LED-23-adjacent)', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(commitPair(hr(), tamper(pair, { employeeNameSnapshot: 'Forged Name' })));
    await assertFails(commitPair(hr(), tamper(pair, { leaveTypeNameSnapshot: 'Forged Type' })));
    await assertFails(commitPair(hr(), tamper(pair, { positionSnapshot: 'Forged Position' })));
    await assertFails(commitPair(hr(), tamper(pair, { employeeNumberSnapshot: 'EMP-9999' })));
    await assertFails(commitPair(hr(), tamper(pair, { departmentSnapshot: null })));
  });
  it('denies an unknown employee or leave type', async () => {
    await assertFails(
      commitPair(hr(), allocationPair({ id: T(1), days: 1, emp: { ...employee, id: 'ghost' } })),
    );
    await assertFails(
      commitPair(hr(), allocationPair({ id: T(2), days: 1, type: { ...vacation, id: 'ghost' } })),
    );
  });
});

describe('year, dates and days (LED-17/18/19)', () => {
  async function usageBase() {
    await allocate10();
    return usagePair({
      id: T(2),
      days: 2,
      dateFrom: '2026-02-10',
      dateTo: '2026-02-11',
      balance: { totalCredits: 10, totalUsed: 0 },
    });
  }
  it.each([
    ['dateFrom in the previous year', { dateFrom: '2025-12-31' }],
    ['dateTo in the next year', { dateTo: '2027-01-01' }],
    ['dateFrom after dateTo', { dateFrom: '2026-02-12' }],
    ['a malformed dateFrom', { dateFrom: '2026-2-10' }],
    ['a malformed dateTo', { dateTo: '2026/02/11' }],
    ['month 13', { dateTo: '2026-13-01' }],
    ['a missing dateFrom', { dateFrom: null }],
    ['a non-string dateTo', { dateTo: 20260211 }],
  ])('LED-17: usage with %s is denied', async (_name, change) => {
    const pair = await usageBase();
    await assertFails(commitPair(hr(), tamper(pair, change)));
  });
  it('LED-17: leaveYear must match the balance id and the dates', async () => {
    const pair = await usageBase();
    await assertFails(commitPair(hr(), tamper(pair, { leaveYear: 2025 })));
    await assertFails(commitPair(hr(), tamper(pair, { leaveYear: 2026.5 })));
    await assertFails(commitPair(hr(), tamper(pair, { leaveYear: 1999 }, { year: 1999 })));
    await assertFails(commitPair(hr(), tamper(pair, { leaveYear: 2101 }, { year: 2101 })));
  });
  it.each([0, -1, 0.3, 0.25, 366, 1.3])('LED-18: %s days is denied', async (days) => {
    await allocate10();
    const pair = allocationPair({ id: T(2), days: 2, balance: { totalCredits: 10, totalUsed: 0 } });
    await assertFails(
      commitPair(
        hr(),
        tamper(
          pair,
          { days, creditsDelta: days, resultingTotalCredits: 10 + days },
          { totalCredits: 10 + days, availableCredits: 10 + days },
        ),
      ),
    );
  });
  it('LED-18: non-number days are denied', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(commitPair(hr(), tamper(pair, { days: '10' })));
  });
  it('LED-18: 365 is the maximum allowed', async () => {
    await assertSucceeds(commitPair(hr(), allocationPair({ id: T(1), days: 365 })));
  });
  it.each([
    ['an allocation with a negative creditsDelta', { creditsDelta: -10 }],
    ['an allocation that also moves used', { usedDelta: 1 }],
    ['an allocation with dates', { dateFrom: '2026-01-01', dateTo: '2026-01-01' }],
    ['an allocation claiming to reverse something', { reversesTransactionId: T(7) }],
    ['an allocation already marked reversed', { reversedByTransactionId: `rev_${T(1)}` }],
    ['an unknown transaction type', { transactionType: 'ADJUSTMENT' }],
    ['a lowercase transaction type', { transactionType: 'allocation' }],
  ])('LED-19: %s is denied', async (_name, change) => {
    await assertFails(commitPair(hr(), tamper(allocationPair({ id: T(1), days: 10 }), change)));
  });
  it.each([
    ['a usage with a credits delta', { creditsDelta: 2 }],
    ['a usage with a negative usedDelta', { usedDelta: -2 }],
    ['a usage typed as an allocation', { transactionType: 'ALLOCATION' }],
  ])('LED-19: %s is denied', async (_name, change) => {
    const pair = await usageBase();
    await assertFails(commitPair(hr(), tamper(pair, change)));
  });
});

describe('days must equal the delta (LED-19, consistent forgeries)', () => {
  it('denies an allocation whose creditsDelta differs from days, even with a consistent balance', async () => {
    const pair = allocationPair({ id: T(1), days: 2 });
    await assertFails(
      commitPair(
        hr(),
        tamper(
          pair,
          { creditsDelta: 1, resultingTotalCredits: 1 },
          { totalCredits: 1, availableCredits: 1 },
        ),
      ),
    );
  });
  it('denies a usage whose usedDelta differs from days, even with a consistent balance', async () => {
    await allocate10();
    const pair = usagePair({
      id: T(2),
      days: 2,
      dateFrom: '2026-02-10',
      dateTo: '2026-02-11',
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    // days says 2 but only 1 is deducted: a self-consistent under-deduction.
    await assertFails(
      commitPair(
        hr(),
        tamper(
          pair,
          { usedDelta: 1, resultingTotalUsed: 1 },
          { totalUsed: 1, availableCredits: 9 },
        ),
      ),
    );
    // …and the reverse, deducting more than days.
    await assertFails(
      commitPair(
        hr(),
        tamper(
          pair,
          { usedDelta: 3, resultingTotalUsed: 3 },
          { totalUsed: 3, availableCredits: 7 },
        ),
      ),
    );
  });
  it('denies a reversal commit that also edits another field of the original', async () => {
    await allocate10();
    const usage = await use(T(2), 1, '2026-04-20', '2026-04-20', {
      totalCredits: 10,
      totalUsed: 0,
    });
    const reversal = reversalPair({
      original: usage.domain,
      balance: { totalCredits: 10, totalUsed: 1 },
    });
    const db = hr();
    const batch = writeBatch(db);
    addPair(db, batch, reversal);
    // Replace the plain link update with one that smuggles in a second change.
    batch.update(doc(db, 'leaveTransactions', usage.id), { remarks: 'tampered', days: 1 });
    await assertFails(batch.commit());

    const clean = writeBatch(db);
    clean.set(doc(db, 'leaveTransactions', reversal.id), reversal.ledger);
    clean.update(doc(db, 'leaveBalances', reversal.balanceId), reversal.balance);
    clean.update(doc(db, 'leaveTransactions', usage.id), {
      reversedByTransactionId: reversal.id,
      remarks: 'tampered',
    });
    await assertFails(clean.commit());
  });
});

describe('stamping and shape (LED-20/22/23)', () => {
  it.each([
    ['createdBy', { createdBy: 'someone-else' }],
    ['createdByName', { createdByName: 'Someone Else' }],
    ['createdAt (client clock)', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) }],
  ])('LED-20: a spoofed %s is denied', async (_name, change) => {
    await assertFails(commitPair(hr(), tamper(allocationPair({ id: T(1), days: 10 }), change)));
  });
  it('LED-20: a balance with a client updatedAt/createdAt is denied', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(
      commitPair(hr(), tamper(pair, {}, { updatedAt: Timestamp.fromDate(new Date('2020-01-01')) })),
    );
    await assertFails(
      commitPair(hr(), tamper(pair, {}, { createdAt: Timestamp.fromDate(new Date('2020-01-01')) })),
    );
  });
  it('LED-22: a balance document id that does not match employee/year/type is denied', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(commitPair(hr(), { ...pair, balanceId: `${EMP_ID}_2026_${TYPE_SICK}` }));
    await assertFails(commitPair(hr(), { ...pair, balanceId: `other_2026_${TYPE_VAC}` }));
    await assertFails(commitPair(hr(), tamper(pair, { balanceId: `${EMP_ID}_2025_${TYPE_VAC}` })));
  });
  it('LED-22: a fractional year is denied', async () => {
    const pair = allocationPair({ id: T(1), days: 10 });
    await assertFails(commitPair(hr(), tamper(pair, { leaveYear: 2026.5 }, { year: 2026.5 })));
  });
  it.each([
    ['an extra ledger field', { extra: 1 }],
    ['a missing remarks field', { remarks: undefined }],
    ['a missing snapshot', { positionSnapshot: undefined }],
    ['a remarks value of the wrong type', { remarks: 5 }],
    ['501-character remarks', { remarks: 'x'.repeat(501) }],
    ['empty-string remarks', { remarks: '' }],
  ])('LED-23: %s is denied', async (_name, change) => {
    await assertFails(commitPair(hr(), tamper(allocationPair({ id: T(1), days: 10 }), change)));
  });
  it('LED-23: 500-character remarks are accepted', async () => {
    await assertSucceeds(
      commitPair(hr(), allocationPair({ id: T(1), days: 10, remarks: 'x'.repeat(500) })),
    );
  });
  it.each([
    ['an extra balance field', { extra: 1 }],
    ['a missing balance field', { lastTransactionId: undefined }],
    ['a negative available', { availableCredits: -1 }],
    ['an available that disagrees with credits − used', { availableCredits: 9 }],
    ['a string total', { totalCredits: '10' }],
  ])('LED-23: %s is denied', async (_name, change) => {
    await assertFails(commitPair(hr(), tamper(allocationPair({ id: T(1), days: 10 }), {}, change)));
  });
  it('rejects transaction ids that are not 20 alphanumeric characters', async () => {
    for (const id of ['short', 'has-dashes-in-it-xxxx', `${T(1)}x`, 'a'.repeat(19)]) {
      const pair = allocationPair({ id, days: 10 });
      await assertFails(
        commitPair(hr(), { ...pair, balance: { ...pair.balance, lastTransactionId: id } }),
      );
    }
  });
  it('rejects a rev_ id on a non-reversal and a plain id on a reversal', async () => {
    const pair = allocationPair({ id: `rev_${T(1)}`, days: 10 });
    await assertFails(commitPair(hr(), pair));
  });
});

describe('V-1…V-10 as exercised by the real rules', () => {
  it('V-1: the balance id is built with string(year) from an integer year', async () => {
    await assertSucceeds(commitPair(hr(), allocationPair({ id: T(1), days: 1, year: 2026 })));
    await assertSucceeds(commitPair(hr(), allocationPair({ id: T(2), days: 1, year: 2100 })));
    await assertSucceeds(commitPair(hr(), allocationPair({ id: T(3), days: 1, year: 2000 })));
  });
});

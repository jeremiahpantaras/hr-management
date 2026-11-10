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

/**
 * TC-RULES-EMP-01…10 (+ adversarial extras) against the REAL `firestore.rules` in the Firestore
 * emulator. These also exercise the cross-document constructs the ledger design depends on
 * (`exists`, `getAfter`, `existsAfter` evaluated against a multi-document commit): V-4 / V-5.
 */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});

const SEED_TIME = Timestamp.fromDate(new Date('2026-01-05T01:30:00Z'));

/** A stored employee exactly as the app writes it (server-side seed, rules disabled). */
function storedEmployee(overrides: Record<string, unknown> = {}) {
  return {
    employeeNumber: 'EMP-0001',
    employeeNumberKey: 'EMP-0001',
    fullName: 'Juan Dela Cruz',
    position: 'Accounting Staff',
    department: 'Finance',
    employmentStatus: 'Regular',
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: SEED_TIME,
    createdBy: 'hr1',
    updatedAt: SEED_TIME,
    updatedBy: 'hr1',
    ...overrides,
  };
}

async function seedEmployee(id: string, number: string, overrides: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(db, 'employees', id),
      storedEmployee({
        employeeNumber: number,
        employeeNumberKey: number.toUpperCase(),
        ...overrides,
      }),
    );
    await setDoc(doc(db, 'employeeNumbers', number.toUpperCase()), {
      employeeId: id,
      createdAt: SEED_TIME,
    });
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedUserProfile(env, 'hr1');
  await seedUserProfile(env, 'inactive1', { isActive: false });
  await seedUserProfile(env, 'wrongrole1', { role: 'employee' });
  await seedEmployee('empA', 'EMP-0001');
  await seedEmployee('empB', 'EMP-0002', { fullName: 'Ana Reyes' });
});

const hr = () => env.authenticatedContext('hr1').firestore();
type Db = ReturnType<typeof hr>;

/** What the client sends when creating an employee. */
function newEmployee(overrides: Record<string, unknown> = {}) {
  return {
    employeeNumber: 'EMP-0042',
    employeeNumberKey: 'EMP-0042',
    fullName: 'Maria Santos',
    position: 'HR Officer',
    department: null,
    employmentStatus: 'Probationary',
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: serverTimestamp(),
    createdBy: 'hr1',
    updatedAt: serverTimestamp(),
    updatedBy: 'hr1',
    ...overrides,
  };
}

/** Atomically create an employee together with its Employee-ID reservation. */
function createCommit(
  db: Db,
  id: string,
  employee: Record<string, unknown>,
  reservationKey?: string,
) {
  const key = reservationKey ?? String(employee.employeeNumberKey);
  const batch = writeBatch(db);
  batch.set(doc(db, 'employees', id), employee);
  batch.set(doc(db, 'employeeNumbers', key), { employeeId: id, createdAt: serverTimestamp() });
  return batch.commit();
}

const edit = (overrides: Record<string, unknown>) => ({
  ...overrides,
  updatedAt: serverTimestamp(),
  updatedBy: 'hr1',
});

describe('TC-RULES-EMP-01: create employee + reservation', () => {
  it('is allowed in ONE commit, with department null or set', async () => {
    await assertSucceeds(createCommit(hr(), 'empNew', newEmployee()));
    await assertSucceeds(
      createCommit(
        hr(),
        'empNew2',
        newEmployee({
          employeeNumber: 'EMP-0043',
          employeeNumberKey: 'EMP-0043',
          department: 'Finance',
        }),
      ),
    );
    await env.withSecurityRulesDisabled(async (c) => {
      const stored = await getDoc(doc(c.firestore(), 'employees', 'empNew'));
      expect(stored.get('isArchived')).toBe(false);
      expect(stored.get('employeeNumberKey')).toBe('EMP-0042');
    });
  });

  it('accepts a lower-case ID as long as the key is its upper-case form', async () => {
    await assertSucceeds(
      createCommit(
        hr(),
        'empLower',
        newEmployee({ employeeNumber: 'emp-0077', employeeNumberKey: 'EMP-0077' }),
      ),
    );
  });

  it('is denied without the reservation, and the reservation alone is denied', async () => {
    await assertFails(setDoc(doc(hr(), 'employees', 'empNew'), newEmployee()));
    await assertFails(
      setDoc(doc(hr(), 'employeeNumbers', 'EMP-0042'), {
        employeeId: 'empNew',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('TC-RULES-EMP-02: duplicate Employee IDs (any case)', () => {
  it('is denied when the ID is already reserved', async () => {
    await assertFails(
      createCommit(
        hr(),
        'empDup',
        newEmployee({ employeeNumber: 'EMP-0001', employeeNumberKey: 'EMP-0001' }),
      ),
    );
  });

  it('is denied when only the CASE differs', async () => {
    await assertFails(
      createCommit(
        hr(),
        'empDup',
        newEmployee({ employeeNumber: 'emp-0001', employeeNumberKey: 'EMP-0001' }),
      ),
    );
  });

  it('leaves no partial write behind (neither the employee nor a second reservation)', async () => {
    await assertFails(
      createCommit(
        hr(),
        'empDup',
        newEmployee({ employeeNumber: 'emp-0001', employeeNumberKey: 'EMP-0001' }),
      ),
    );
    await env.withSecurityRulesDisabled(async (c) => {
      expect((await getDoc(doc(c.firestore(), 'employees', 'empDup'))).exists()).toBe(false);
      expect(
        (await getDoc(doc(c.firestore(), 'employeeNumbers', 'EMP-0001'))).get('employeeId'),
      ).toBe('empA');
    });
  });
});

describe('TC-RULES-EMP-03 / 04: reservation integrity', () => {
  it('denies a reservation for a key the employee does not use', async () => {
    await assertFails(createCommit(hr(), 'empNew', newEmployee(), 'EMP-0099'));
  });

  it("denies a reservation pointing at someone else's employee document", async () => {
    const db = hr();
    const batch = writeBatch(db);
    batch.set(doc(db, 'employeeNumbers', 'EMP-0500'), {
      employeeId: 'empA',
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('denies deleting a reservation that is still in use', async () => {
    await assertFails(deleteDoc(doc(hr(), 'employeeNumbers', 'EMP-0001')));
  });

  it('denies updating a reservation (they are immutable)', async () => {
    await assertFails(updateDoc(doc(hr(), 'employeeNumbers', 'EMP-0001'), { employeeId: 'empB' }));
  });

  it('allows reading one reservation but never listing them', async () => {
    await assertSucceeds(getDoc(doc(hr(), 'employeeNumbers', 'EMP-0001')));
    await assertFails(getDocs(collection(hr(), 'employeeNumbers')));
  });
});

describe('TC-RULES-EMP-05: Employee-ID swap (R-04)', () => {
  function swap(db: Db, toNumber: string, opts: { deleteOld?: boolean; createNew?: boolean } = {}) {
    const { deleteOld = true, createNew = true } = opts;
    const key = toNumber.toUpperCase();
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'employees', 'empA'),
      edit({ employeeNumber: toNumber, employeeNumberKey: key }),
    );
    if (createNew)
      batch.set(doc(db, 'employeeNumbers', key), {
        employeeId: 'empA',
        createdAt: serverTimestamp(),
      });
    if (deleteOld) batch.delete(doc(db, 'employeeNumbers', 'EMP-0001'));
    return batch.commit();
  }

  it('is allowed: employee updated, new key reserved, old key released — in one commit', async () => {
    await assertSucceeds(swap(hr(), 'EMP-0100'));
    await env.withSecurityRulesDisabled(async (c) => {
      expect(
        (await getDoc(doc(c.firestore(), 'employeeNumbers', 'EMP-0100'))).get('employeeId'),
      ).toBe('empA');
      expect((await getDoc(doc(c.firestore(), 'employeeNumbers', 'EMP-0001'))).exists()).toBe(
        false,
      );
    });
  });

  it('is denied if the new ID is already held by another employee', async () => {
    await assertFails(swap(hr(), 'EMP-0002'));
  });

  it('is denied without creating the new reservation', async () => {
    await assertFails(swap(hr(), 'EMP-0100', { createNew: false }));
  });

  it('is denied if the old reservation is left behind (it would leak the ID)', async () => {
    await assertFails(swap(hr(), 'EMP-0100', { deleteOld: false }));
  });

  it('denies releasing the old reservation without moving the employee', async () => {
    await assertFails(deleteDoc(doc(hr(), 'employeeNumbers', 'EMP-0001')));
  });
});

describe('TC-RULES-EMP-06: document shape, types, enums, patterns', () => {
  const create = (overrides: Record<string, unknown>, key = 'EMP-0042') =>
    createCommit(hr(), 'empNew', newEmployee(overrides), key);

  it('denies an extra field', async () => {
    await assertFails(create({ salary: 100000 }));
  });

  it('denies a missing field', async () => {
    const { department: _omitted, ...withoutDepartment } = newEmployee();
    await assertFails(createCommit(hr(), 'empNew', withoutDepartment));
  });

  it.each([
    ['isArchived as a string', { isArchived: 'no' }],
    ['fullName as a number', { fullName: 42 }],
    ['empty fullName', { fullName: '' }],
    ['untrimmed fullName', { fullName: ' Maria ' }],
    ['fullName over 120 chars', { fullName: 'x'.repeat(121) }],
    ['empty position', { position: '' }],
    ['position over 80 chars', { position: 'x'.repeat(81) }],
    ['empty-string department (must be null)', { department: '' }],
    ['department over 80 chars', { department: 'x'.repeat(81) }],
    ['unknown employment status', { employmentStatus: 'Intern' }],
    ['status in the wrong case', { employmentStatus: 'regular' }],
  ])('denies %s', async (_label, overrides) => {
    await assertFails(create(overrides));
  });

  it.each([
    ['a leading dot', '.hidden'],
    ['a leading dash', '-EMP'],
    ['an embedded space', 'EMP 42'],
    ['a trailing space', 'EMP42 '],
    ['31 characters', 'E'.repeat(31)],
    ['a slash', 'EMP/42'],
    ['an empty ID', ''],
  ])('denies an Employee ID with %s', async (_label, number) => {
    // Document IDs cannot contain "/" or be empty, so reserve under a safe key to isolate the field check.
    await assertFails(
      createCommit(
        hr(),
        'empNew',
        newEmployee({ employeeNumber: number, employeeNumberKey: number.toUpperCase() }),
        'EMP-SAFE',
      ),
    );
  });

  it('accepts the boundary: exactly 30 characters, with . _ - allowed', async () => {
    const id = 'A' + 'b.c_d-e'.repeat(4) + '12'; // 1 + 28 + 2 = 31? built below to be exactly 30
    const thirty = id.slice(0, 30);
    expect(thirty).toHaveLength(30);
    await assertSucceeds(
      createCommit(
        hr(),
        'empLong',
        newEmployee({ employeeNumber: thirty, employeeNumberKey: thirty.toUpperCase() }),
      ),
    );
  });

  it('denies a key that is not the upper-cased ID (TC-RULES-EMP-10)', async () => {
    await assertFails(
      createCommit(
        hr(),
        'empNew',
        newEmployee({ employeeNumber: 'emp-0042', employeeNumberKey: 'emp-0042' }),
        'emp-0042',
      ),
    );
    await assertFails(
      createCommit(
        hr(),
        'empNew',
        newEmployee({ employeeNumber: 'EMP-0042', employeeNumberKey: 'EMP-0043' }),
        'EMP-0043',
      ),
    );
  });
});

describe('create: server-controlled metadata cannot be spoofed', () => {
  it.each([
    ['createdBy someone else', { createdBy: 'someoneElse' }],
    ['updatedBy someone else', { updatedBy: 'someoneElse' }],
    ['a client createdAt', { createdAt: new Date('2000-01-01') }],
    ['a client updatedAt', { updatedAt: new Date('2000-01-01') }],
    ['born archived', { isArchived: true, archivedAt: serverTimestamp(), archivedBy: 'hr1' }],
    ['a non-null archivedAt on an active employee', { archivedAt: serverTimestamp() }],
  ])('denies %s', async (_label, overrides) => {
    await assertFails(createCommit(hr(), 'empNew', newEmployee(overrides)));
  });
});

describe('TC-RULES-EMP-07: employees are never deleted', () => {
  it('denies deleting an employee, even together with its reservation', async () => {
    await assertFails(deleteDoc(doc(hr(), 'employees', 'empA')));
    const db = hr();
    const batch = writeBatch(db);
    batch.delete(doc(db, 'employees', 'empA'));
    batch.delete(doc(db, 'employeeNumbers', 'EMP-0001'));
    await assertFails(batch.commit());
    await env.withSecurityRulesDisabled(async (c) => {
      expect((await getDoc(doc(c.firestore(), 'employees', 'empA'))).exists()).toBe(true);
    });
  });
});

describe('TC-RULES-EMP-08: edits and archive / restore transitions', () => {
  const ref = () => doc(hr(), 'employees', 'empA');

  it('allows editing name, position, department and status', async () => {
    await assertSucceeds(
      updateDoc(
        ref(),
        edit({
          fullName: 'Juan D. Cruz',
          position: 'Senior Accountant',
          department: null,
          employmentStatus: 'Contractual',
        }),
      ),
    );
  });

  it('allows archiving with archivedAt = request.time and archivedBy = the caller', async () => {
    await assertSucceeds(
      updateDoc(
        ref(),
        edit({ isArchived: true, archivedAt: serverTimestamp(), archivedBy: 'hr1' }),
      ),
    );
  });

  it.each([
    [
      'archivedBy someone else',
      { isArchived: true, archivedAt: serverTimestamp(), archivedBy: 'other' },
    ],
    [
      'a client archivedAt',
      { isArchived: true, archivedAt: new Date('2000-01-01'), archivedBy: 'hr1' },
    ],
    ['archived without archivedAt', { isArchived: true, archivedAt: null, archivedBy: 'hr1' }],
  ])('denies archiving with %s', async (_label, overrides) => {
    await assertFails(updateDoc(ref(), edit(overrides)));
  });

  it('denies changing the archive timestamp while NOT changing the flag', async () => {
    await assertFails(updateDoc(ref(), edit({ archivedAt: serverTimestamp() })));
  });

  it('allows restoring, which must clear archivedAt and archivedBy', async () => {
    await seedEmployee('empArchived', 'EMP-0003', {
      isArchived: true,
      archivedAt: SEED_TIME,
      archivedBy: 'hr1',
    });
    const archived = doc(hr(), 'employees', 'empArchived');
    await assertFails(updateDoc(archived, edit({ isArchived: false }))); // leaves archivedAt/By set
    await assertFails(
      updateDoc(archived, edit({ isArchived: false, archivedAt: null, archivedBy: 'hr1' })),
    );
    await assertSucceeds(
      updateDoc(archived, edit({ isArchived: false, archivedAt: null, archivedBy: null })),
    );
  });

  it('allows editing an archived employee without changing its archive state', async () => {
    await seedEmployee('empArchived', 'EMP-0003', {
      isArchived: true,
      archivedAt: SEED_TIME,
      archivedBy: 'hr1',
    });
    await assertSucceeds(
      updateDoc(doc(hr(), 'employees', 'empArchived'), edit({ position: 'Retired' })),
    );
  });

  it('denies an edit that does not stamp updatedAt/updatedBy correctly', async () => {
    await assertFails(updateDoc(ref(), { position: 'X' }));
    await assertFails(
      updateDoc(ref(), { position: 'X', updatedAt: serverTimestamp(), updatedBy: 'other' }),
    );
    await assertFails(
      updateDoc(ref(), { position: 'X', updatedAt: new Date('2000-01-01'), updatedBy: 'hr1' }),
    );
  });
});

describe('TC-RULES-EMP-09: creation metadata is immutable', () => {
  it('denies changing createdAt or createdBy', async () => {
    const ref = doc(hr(), 'employees', 'empA');
    await assertFails(updateDoc(ref, edit({ createdAt: serverTimestamp() })));
    await assertFails(updateDoc(ref, edit({ createdBy: 'other' })));
  });
});

describe('access: only an active HR admin', () => {
  it('lets the admin get and list employees', async () => {
    expect((await assertSucceeds(getDoc(doc(hr(), 'employees', 'empA')))).get('fullName')).toBe(
      'Juan Dela Cruz',
    );
    expect((await assertSucceeds(getDocs(collection(hr(), 'employees')))).size).toBe(2);
  });

  it.each([
    ['anonymous', () => env.unauthenticatedContext().firestore()],
    ['signed in, no profile', () => env.authenticatedContext('noProfile1').firestore()],
    ['inactive admin', () => env.authenticatedContext('inactive1').firestore()],
    ['wrong role', () => env.authenticatedContext('wrongrole1').firestore()],
  ])('%s cannot read, create, edit or archive anything', async (_label, ctx) => {
    const db = ctx();
    await assertFails(getDoc(doc(db, 'employees', 'empA')));
    await assertFails(getDocs(collection(db, 'employees')));
    await assertFails(createCommit(db, 'empNew', newEmployee()));
    await assertFails(updateDoc(doc(db, 'employees', 'empA'), edit({ position: 'Hacked' })));
    await assertFails(
      updateDoc(
        doc(db, 'employees', 'empA'),
        edit({ isArchived: true, archivedAt: serverTimestamp(), archivedBy: 'hr1' }),
      ),
    );
    await assertFails(getDoc(doc(db, 'employeeNumbers', 'EMP-0001')));
  });

  it('a user deactivated mid-session loses employee access on the next request', async () => {
    const db = hr();
    await assertSucceeds(getDoc(doc(db, 'employees', 'empA')));
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), 'users', 'hr1'), { isActive: false });
    });
    await assertFails(getDoc(doc(db, 'employees', 'empA')));
    await assertFails(updateDoc(doc(db, 'employees', 'empA'), edit({ position: 'X' })));
  });
});

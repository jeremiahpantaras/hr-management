import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ErrorsModule from '@/domain/errors';
import type { EmployeeInput } from '@/domain/schemas/employee';
import type * as FirebaseLibModule from '@/lib/firebase';
import type * as AuthServiceModule from '@/services/auth.service';
import type * as EmployeesServiceModule from '@/services/employees.service';

import {
  PROJECT_ID,
  clearAuthUsers,
  createAuthUser,
  createRulesEnv,
  requireAuthEmulator,
  seedUserProfile,
} from '../setup/emulator';

/**
 * Integration (TC-EMP-01/02/04/05/06/07/14 + concurrency + authorization): the REAL employees
 * service — real transactions — against the Firestore + Auth emulators and the repository's real
 * `firestore.rules`, signed in as a real emulator user. Run with `npm run test:integration`.
 */
const PASSWORD = 'Password123!';

let rulesEnv: RulesTestEnvironment;
let employees: typeof EmployeesServiceModule;
let auth: typeof AuthServiceModule;
let firebase: typeof FirebaseLibModule;
let errors: typeof ErrorsModule;
let hrUid: string;

beforeAll(async () => {
  requireAuthEmulator();
  rulesEnv = await createRulesEnv();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:000000000000:web:demo');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.resetModules();
  [employees, auth, firebase, errors] = await Promise.all([
    import('@/services/employees.service'),
    import('@/services/auth.service'),
    import('@/lib/firebase'),
    import('@/domain/errors'),
  ]);
});

afterAll(async () => {
  await auth.signOutUser();
  await rulesEnv.cleanup();
  vi.unstubAllEnvs();
});

async function signInAs(email: string, profile: { role?: string; isActive?: boolean } | null) {
  const uid = await createAuthUser(email, PASSWORD);
  if (profile !== null) await seedUserProfile(rulesEnv, uid, { email, ...profile });
  await auth.signIn(email, PASSWORD);
  return uid;
}

beforeEach(async () => {
  await rulesEnv.clearFirestore();
  await clearAuthUsers();
  hrUid = await signInAs('hr@example.test', {});
});
afterEach(async () => {
  await auth.signOutUser();
});

const juan: EmployeeInput = {
  employeeNumber: 'EMP-0042',
  fullName: 'Juan Dela Cruz',
  position: 'Accounting Staff',
  department: 'Finance',
  employmentStatus: 'Regular',
};

/** Reads straight from the database, bypassing rules and the service under test. */
async function raw(path: string, id: string) {
  return rulesEnv
    .withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDoc(doc(context.firestore(), path, id));
      capture = snapshot.exists() ? snapshot.data() : null;
    })
    .then(() => capture);
}
let capture: Record<string, unknown> | null = null;

async function count(path: string): Promise<number> {
  let size = 0;
  await rulesEnv.withSecurityRulesDisabled(async (context) => {
    size = (await getDocs(collection(context.firestore(), path))).size;
  });
  return size;
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('TC-EMP-01: create', () => {
  it('stores the employee with server metadata and reserves the ID — atomically', async () => {
    const id = await employees.createEmployee(juan, hrUid);

    const stored = await raw('employees', id);
    expect(stored).toMatchObject({
      employeeNumber: 'EMP-0042',
      employeeNumberKey: 'EMP-0042',
      fullName: 'Juan Dela Cruz',
      position: 'Accounting Staff',
      department: 'Finance',
      employmentStatus: 'Regular',
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: hrUid,
      updatedBy: hrUid,
    });
    expect(stored?.createdAt).toBeTruthy();
    expect(stored?.updatedAt).toBeTruthy();
    expect(await raw('employeeNumbers', 'EMP-0042')).toMatchObject({ employeeId: id });
  });

  it('TC-EMP-14: a blank department is stored as null', async () => {
    const id = await employees.createEmployee({ ...juan, department: null }, hrUid);
    expect((await raw('employees', id))?.department).toBeNull();
  });

  it('keeps the ID as typed but reserves its upper-case key', async () => {
    const id = await employees.createEmployee({ ...juan, employeeNumber: 'emp-0042' }, hrUid);
    expect(await raw('employees', id)).toMatchObject({
      employeeNumber: 'emp-0042',
      employeeNumberKey: 'EMP-0042',
    });
    expect(await raw('employeeNumbers', 'EMP-0042')).toMatchObject({ employeeId: id });
  });
});

describe('list and get (FR-EMP-02, 06)', () => {
  it('lists every employee, converted to domain models with Date fields', async () => {
    const a = await employees.createEmployee(juan, hrUid);
    const b = await employees.createEmployee(
      {
        ...juan,
        employeeNumber: 'EMP-0043',
        fullName: 'Ana Reyes',
        employmentStatus: 'Probationary',
      },
      hrUid,
    );

    const list = await employees.listEmployees();
    expect(list.map((e) => e.id).sort()).toEqual([a, b].sort());
    const ana = list.find((e) => e.id === b);
    expect(ana).toMatchObject({
      fullName: 'Ana Reyes',
      employmentStatus: 'Probationary',
      isArchived: false,
    });
    expect(ana?.createdAt).toBeInstanceOf(Date);
  });

  it('gets one employee, or null when it does not exist', async () => {
    const id = await employees.createEmployee(juan, hrUid);
    expect(await employees.getEmployee(id)).toMatchObject({ id, employeeNumber: 'EMP-0042' });
    expect(await employees.getEmployee('doesNotExist')).toBeNull();
  });

  it('skips a corrupt record instead of failing the whole directory', async () => {
    await employees.createEmployee(juan, hrUid);
    await rulesEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'employees', 'corrupt'), {
        fullName: 'No other fields',
      });
    });
    expect((await employees.listEmployees()).map((e) => e.fullName)).toEqual(['Juan Dela Cruz']);
  });
});

describe('TC-EMP-02: duplicate Employee IDs', () => {
  it.each(['EMP-0042', 'emp-0042', 'Emp-0042'])(
    'rejects %s when EMP-0042 exists, writing nothing',
    async (duplicate) => {
      const first = await employees.createEmployee(juan, hrUid);

      const error = await errorOf(
        employees.createEmployee(
          { ...juan, employeeNumber: duplicate, fullName: 'Someone Else' },
          hrUid,
        ),
      );
      expect(error).toBeInstanceOf(errors.AppError);
      expect((error as InstanceType<typeof errors.AppError>).code).toBe(
        'DUPLICATE_EMPLOYEE_NUMBER',
      );

      expect(await count('employees')).toBe(1);
      expect(await count('employeeNumbers')).toBe(1);
      expect(await raw('employeeNumbers', 'EMP-0042')).toMatchObject({ employeeId: first });
    },
  );

  it('five simultaneous creates of the same ID: exactly one wins, no partial writes', async () => {
    const attempts = Array.from({ length: 5 }, (_, i) =>
      errorOf(employees.createEmployee({ ...juan, fullName: `Attempt ${String(i)}` }, hrUid)),
    );
    const results = await Promise.all(attempts);

    const winners = results.filter((r) => r === null);
    const losers = results.filter(
      (r): r is InstanceType<typeof errors.AppError> => r instanceof errors.AppError,
    );
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(4);
    // Losers are told the ID is taken — never "permission denied" (see explainDenial).
    expect(losers.map((e) => e.code)).toEqual(Array(4).fill('DUPLICATE_EMPLOYEE_NUMBER'));
    expect(await count('employees')).toBe(1);
    expect(await count('employeeNumbers')).toBe(1);
  });
});

describe('TC-EMP-04 / 05 / 06: edit', () => {
  it('edits fields, bumps updatedAt/updatedBy, keeps createdAt/createdBy', async () => {
    const id = await employees.createEmployee(juan, hrUid);
    const before = await raw('employees', id);

    await employees.updateEmployee(
      id,
      { ...juan, position: 'Senior Accountant', department: null, employmentStatus: 'Contractual' },
      hrUid,
    );

    const after = await raw('employees', id);
    expect(after).toMatchObject({
      position: 'Senior Accountant',
      department: null,
      employmentStatus: 'Contractual',
      createdBy: hrUid,
      updatedBy: hrUid,
    });
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.updatedAt).not.toEqual(before?.updatedAt);
    expect(await count('employeeNumbers')).toBe(1); // reservation untouched
  });

  it('TC-EMP-05: changing the Employee ID reserves the new one and releases the old, atomically', async () => {
    const id = await employees.createEmployee(juan, hrUid);

    await employees.updateEmployee(id, { ...juan, employeeNumber: 'EMP-0100' }, hrUid);

    expect(await raw('employees', id)).toMatchObject({
      employeeNumber: 'EMP-0100',
      employeeNumberKey: 'EMP-0100',
    });
    expect(await raw('employeeNumbers', 'EMP-0100')).toMatchObject({ employeeId: id });
    expect(await raw('employeeNumbers', 'EMP-0042')).toBeNull();
    expect(await count('employeeNumbers')).toBe(1);

    // The freed ID can be used again.
    await expect(
      employees.createEmployee({ ...juan, fullName: 'New Person' }, hrUid),
    ).resolves.toBeTruthy();
  });

  it('TC-EMP-06: changing to an ID already in use is rejected and nothing changes', async () => {
    const a = await employees.createEmployee(juan, hrUid);
    await employees.createEmployee(
      { ...juan, employeeNumber: 'EMP-0043', fullName: 'Ana Reyes' },
      hrUid,
    );

    const error = await errorOf(
      employees.updateEmployee(
        a,
        { ...juan, employeeNumber: 'emp-0043', position: 'CHANGED' },
        hrUid,
      ),
    );
    expect((error as InstanceType<typeof errors.AppError>).code).toBe('DUPLICATE_EMPLOYEE_NUMBER');

    expect(await raw('employees', a)).toMatchObject({
      employeeNumber: 'EMP-0042',
      position: 'Accounting Staff',
    });
    expect(await raw('employeeNumbers', 'EMP-0042')).toMatchObject({ employeeId: a });
    expect(await count('employeeNumbers')).toBe(2);
  });

  it('a case-only change of the ID keeps the same reservation', async () => {
    const id = await employees.createEmployee(juan, hrUid);
    await employees.updateEmployee(id, { ...juan, employeeNumber: 'emp-0042' }, hrUid);
    expect(await raw('employees', id)).toMatchObject({
      employeeNumber: 'emp-0042',
      employeeNumberKey: 'EMP-0042',
    });
    expect(await count('employeeNumbers')).toBe(1);
  });

  it('editing a missing employee is NOT_FOUND', async () => {
    const error = await errorOf(employees.updateEmployee('ghost', juan, hrUid));
    expect((error as InstanceType<typeof errors.AppError>).code).toBe('NOT_FOUND');
  });
});

describe('TC-EMP-07: archive and restore', () => {
  it('archives, then restores, without touching the reservation or other fields', async () => {
    const id = await employees.createEmployee(juan, hrUid);

    await employees.archiveEmployee(id, hrUid);
    const archived = await raw('employees', id);
    expect(archived).toMatchObject({
      isArchived: true,
      archivedBy: hrUid,
      fullName: 'Juan Dela Cruz',
    });
    expect(archived?.archivedAt).toBeTruthy();
    expect(await raw('employeeNumbers', 'EMP-0042')).toMatchObject({ employeeId: id });

    await employees.restoreEmployee(id, hrUid);
    expect(await raw('employees', id)).toMatchObject({
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    });
  });

  it('is idempotent: archiving an archived employee changes nothing', async () => {
    const id = await employees.createEmployee(juan, hrUid);
    await employees.archiveEmployee(id, hrUid);
    const first = await raw('employees', id);
    await employees.archiveEmployee(id, hrUid);
    expect(await raw('employees', id)).toEqual(first);
  });

  it('an archived employee can still be edited and keeps its archived state', async () => {
    const id = await employees.createEmployee(juan, hrUid);
    await employees.archiveEmployee(id, hrUid);
    await employees.updateEmployee(id, { ...juan, position: 'Retired' }, hrUid);
    expect(await raw('employees', id)).toMatchObject({ position: 'Retired', isArchived: true });
  });

  it('archiving a missing employee is NOT_FOUND', async () => {
    const error = await errorOf(employees.archiveEmployee('ghost', hrUid));
    expect((error as InstanceType<typeof errors.AppError>).code).toBe('NOT_FOUND');
  });
});

describe('no deletion anywhere (FR-EMP-09)', () => {
  it('the service exposes no delete operation', () => {
    expect(Object.keys(employees).filter((name) => /delete|remove|destroy/i.test(name))).toEqual(
      [],
    );
  });
});

describe('authorization is enforced by the server, not the UI', () => {
  it('a deactivated admin: reads and writes are PERMISSION_DENIED and nothing is written', async () => {
    await auth.signOutUser();
    const uid = await signInAs('inactive@example.test', { isActive: false });

    for (const attempt of [
      employees.listEmployees(),
      employees.getEmployee('x'),
      employees.createEmployee(juan, uid),
    ]) {
      expect(((await errorOf(attempt)) as InstanceType<typeof errors.AppError>).code).toBe(
        'PERMISSION_DENIED',
      );
    }
    expect(await count('employees')).toBe(0);
    expect(await count('employeeNumbers')).toBe(0);
  });

  it('a non-admin role is PERMISSION_DENIED', async () => {
    await auth.signOutUser();
    const uid = await signInAs('employee@example.test', { role: 'employee' });
    expect(
      ((await errorOf(employees.createEmployee(juan, uid))) as InstanceType<typeof errors.AppError>)
        .code,
    ).toBe('PERMISSION_DENIED');
  });

  it('a signed-out client is PERMISSION_DENIED', async () => {
    await auth.signOutUser();
    expect(
      ((await errorOf(employees.listEmployees())) as InstanceType<typeof errors.AppError>).code,
    ).toBe('PERMISSION_DENIED');
    expect(
      (
        (await errorOf(employees.createEmployee(juan, 'anyone'))) as InstanceType<
          typeof errors.AppError
        >
      ).code,
    ).toBe('PERMISSION_DENIED');
  });

  it('an admin cannot forge another user as the creator (rules stamp createdBy = caller)', async () => {
    const error = await errorOf(employees.createEmployee(juan, 'someone-else'));
    expect((error as InstanceType<typeof errors.AppError>).code).toBe('PERMISSION_DENIED');
    expect(await count('employees')).toBe(0);
  });

  it('bulk import: creates every valid employee with its reservation, reports progress, and stamps the actor', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      rowNumber: i + 2,
      input: {
        ...juan,
        employeeNumber: `BULK-${String(i).padStart(3, '0')}`,
        fullName: `Person ${String(i)}`,
      },
    }));
    const progress: number[] = [];
    const results = await employees.createEmployeesBulk(items, hrUid, {
      concurrency: 4,
      onProgress: (done) => progress.push(done),
    });
    expect(results.every((r) => r.ok && r.code === null)).toBe(true);
    expect(results.map((r) => r.rowNumber)).toEqual(items.map((i) => i.rowNumber)); // input order
    expect(progress).toHaveLength(25);
    expect(Math.max(...progress)).toBe(25);
    expect(await count('employees')).toBe(25);
    expect(await count('employeeNumbers')).toBe(25);
    const stored = await raw('employeeNumbers', 'BULK-007');
    expect(stored?.employeeId).toBeTruthy();
    expect(await raw('employees', String(stored?.employeeId))).toMatchObject({
      employeeNumber: 'BULK-007',
      createdBy: hrUid,
      isArchived: false,
    });
  });

  it('bulk import: an ID that already exists is reported as a duplicate and the existing employee is untouched', async () => {
    const existing = await employees.createEmployee(juan, hrUid);
    const before = await raw('employees', existing);
    const results = await employees.createEmployeesBulk(
      [
        { rowNumber: 2, input: { ...juan, fullName: 'Overwrite attempt' } },
        { rowNumber: 3, input: { ...juan, employeeNumber: 'emp-0042', fullName: 'Case variant' } },
        { rowNumber: 4, input: { ...juan, employeeNumber: 'NEW-1', fullName: 'Fine' } },
      ],
      hrUid,
    );
    expect(results.map((r) => [r.rowNumber, r.ok, r.code])).toEqual([
      [2, false, 'DUPLICATE_EMPLOYEE_NUMBER'],
      [3, false, 'DUPLICATE_EMPLOYEE_NUMBER'],
      [4, true, null],
    ]);
    expect(await raw('employees', existing)).toEqual(before);
    expect(await count('employees')).toBe(2);
  });

  it('bulk import: the same ID twice in one concurrent batch yields exactly one employee', async () => {
    const results = await employees.createEmployeesBulk(
      Array.from({ length: 6 }, (_, i) => ({
        rowNumber: i + 2,
        input: { ...juan, employeeNumber: 'RACE-1', fullName: `Racer ${String(i)}` },
      })),
      hrUid,
      { concurrency: 6 },
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => r.code === 'DUPLICATE_EMPLOYEE_NUMBER')).toHaveLength(5);
    expect(await count('employees')).toBe(1);
    expect(await count('employeeNumbers')).toBe(1);
  });

  it('bulk import: a deactivated user creates nothing, and every row reports PERMISSION_DENIED', async () => {
    await seedUserProfile(rulesEnv, hrUid, { email: 'hr@example.test', isActive: false });
    const results = await employees.createEmployeesBulk(
      [
        { rowNumber: 2, input: juan },
        { rowNumber: 3, input: { ...juan, employeeNumber: 'X-2' } },
      ],
      hrUid,
    );
    expect(results.map((r) => r.code)).toEqual(['PERMISSION_DENIED', 'PERMISSION_DENIED']);
    expect(await count('employees')).toBe(0);
  });

  it('bulk import: an empty list is a no-op', async () => {
    expect(await employees.createEmployeesBulk([], hrUid)).toEqual([]);
  });

  it('uses the demo project and emulators only', () => {
    expect(firebase.getFirebase().app.options.projectId).toBe(PROJECT_ID);
  });
});

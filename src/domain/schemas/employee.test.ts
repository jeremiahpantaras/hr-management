import { describe, expect, it } from 'vitest';

import { normalizeEmployeeNumber } from '@/domain/employee';
import { employeeSchema } from '@/domain/schemas/employee';

const valid = {
  employeeNumber: 'EMP-0042',
  fullName: 'Juan Dela Cruz',
  position: 'Accounting Staff',
  department: 'Finance',
  employmentStatus: 'Regular',
};

const issues = (input: unknown) => {
  const result = employeeSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`);
};

describe('employeeSchema — valid input', () => {
  it('accepts a complete record', () => {
    expect(employeeSchema.safeParse(valid).success).toBe(true);
  });

  it('TC-EMP-15: trims every text field and keeps unicode', () => {
    const parsed = employeeSchema.parse({
      ...valid,
      fullName: '  José  Rizal ',
      position: '  Docente  ',
      employeeNumber: ' EMP-1 ',
      department: '  Finanzas  ',
    });
    expect(parsed).toMatchObject({
      fullName: 'José  Rizal',
      position: 'Docente',
      employeeNumber: 'EMP-1',
      department: 'Finanzas',
    });
  });

  it.each(['', '   '])('TC-EMP-14: a blank department (%j) becomes null', (department) => {
    expect(employeeSchema.parse({ ...valid, department }).department).toBeNull();
  });

  it.each(['Regular', 'Probationary', 'Contractual', 'Project-Based', 'Part-Time'])(
    'accepts the status %s',
    (employmentStatus) => {
      expect(employeeSchema.safeParse({ ...valid, employmentStatus }).success).toBe(true);
    },
  );
});

describe('employeeSchema — Employee ID (TC-EMP-03, UI spec §12)', () => {
  it.each(['', '   '])('rejects a blank ID %j with "Enter the employee ID."', (employeeNumber) => {
    expect(issues({ ...valid, employeeNumber })[0]).toBe('employeeNumber: Enter the employee ID.');
  });

  it.each(['a/b', '.hidden', '-EMP', 'EMP 42', 'E'.repeat(31), 'EMP#1', 'ÉMP-1', 'EMP\\1'])(
    'rejects %j with the pattern message',
    (employeeNumber) => {
      expect(issues({ ...valid, employeeNumber })).toContain(
        'employeeNumber: Use letters, numbers, dots, dashes or underscores (max 30).',
      );
    },
  );

  it.each(['A', '1', 'emp-0042', 'EMP_42', 'a.b-c_d', 'E'.repeat(30)])(
    'accepts %j',
    (employeeNumber) => {
      expect(employeeSchema.safeParse({ ...valid, employeeNumber }).success).toBe(true);
    },
  );
});

describe('employeeSchema — other fields and limits', () => {
  it('requires name, position and status with the exact messages', () => {
    expect(issues({ ...valid, fullName: '', position: '  ', employmentStatus: undefined })).toEqual(
      [
        "fullName: Enter the employee's complete name.",
        'position: Enter a position.',
        'employmentStatus: Select an employment status.',
      ],
    );
  });

  it('enforces maximum lengths (120 / 80 / 80) but allows the limit itself', () => {
    expect(issues({ ...valid, fullName: 'x'.repeat(121) })).toEqual([
      'fullName: Name is too long (120 characters max).',
    ]);
    expect(issues({ ...valid, position: 'x'.repeat(81) })).toEqual([
      'position: Position is too long (80 characters max).',
    ]);
    expect(issues({ ...valid, department: 'x'.repeat(81) })).toEqual([
      'department: Location is too long (80 characters max).',
    ]);
    expect(
      employeeSchema.safeParse({
        ...valid,
        fullName: 'x'.repeat(120),
        position: 'y'.repeat(80),
        department: 'z'.repeat(80),
      }).success,
    ).toBe(true);
  });

  it.each(['regular', 'Intern', 'REGULAR', ''])('rejects the status %j', (employmentStatus) => {
    expect(issues({ ...valid, employmentStatus })).toEqual([
      'employmentStatus: Select an employment status.',
    ]);
  });
});

describe('normalizeEmployeeNumber (uniqueness key, D-08)', () => {
  it('trims and upper-cases so IDs collide case-insensitively', () => {
    expect(normalizeEmployeeNumber('emp-0042')).toBe('EMP-0042');
    expect(normalizeEmployeeNumber('  Emp-0042 ')).toBe('EMP-0042');
    expect(normalizeEmployeeNumber('EMP-0042')).toBe(normalizeEmployeeNumber('emp-0042'));
  });
});

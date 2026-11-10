/** Firestore collection names (DB design §2) — the only place they are spelled. */
export const COLLECTIONS = {
  users: 'users',
  employees: 'employees',
  employeeNumbers: 'employeeNumbers',
  leaveTypes: 'leaveTypes',
  leaveBalances: 'leaveBalances',
  leaveTransactions: 'leaveTransactions',
} as const;

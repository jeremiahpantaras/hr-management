# HR Leave Monitoring System — Planning Index

**Status:** Planning complete, awaiting implementation (Phase 0 not started).
**Planned by:** Claude Opus 5.5 (architecture). **Implemented by:** Claude Sonnet 5.5 High (see [SONNET_EXECUTION_HANDOFF.md](SONNET_EXECUTION_HANDOFF.md)).
**Project state when planned:** `/Users/jeremiahpantaras/Downloads/hr-management` was completely empty (no code, no `package.json`, not a git repository). This is a greenfield build; nothing existing needs to be preserved or migrated.
**Local toolchain observed:** Node 24.18, npm 11.16, Java 17 (sufficient for the Firestore emulator), git 2.54, no global Firebase CLI (use `firebase-tools` as a dev dependency).

---

## 1. Document index and reading order

| # | Document | Purpose |
|---|---|---|
| — | **README.md** (this file) | Index, decision register, canonical constants, assumptions, open questions, risks |
| 1 | [SYSTEM_REQUIREMENTS.md](SYSTEM_REQUIREMENTS.md) | What the system must do; requirement IDs; traceability matrix |
| 2 | [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Layers, routing, state, data flow, dependencies, diagrams |
| 3 | [FIRESTORE_DATABASE_DESIGN.md](FIRESTORE_DATABASE_DESIGN.md) | Collections, types, sample docs, queries, indexes, ledger/balance mechanics |
| 4 | [FIREBASE_SECURITY_PLAN.md](FIREBASE_SECURITY_PLAN.md) | Auth, provisioning, authorization, full Security Rules outline, attack analysis |
| 5 | [UI_UX_DESIGN_SPECIFICATION.md](UI_UX_DESIGN_SPECIFICATION.md) | Pink/white design system, layout, page specs, components, accessibility |
| 6 | [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Phases 0–12 with files, dependencies, acceptance criteria, tests |
| 7 | [BUSINESS_RULES_AND_TEST_CASES.md](BUSINESS_RULES_AND_TEST_CASES.md) | Numbered business rules (BR-*) and test cases (TC-*) |
| 8 | [SONNET_EXECUTION_HANDOFF.md](SONNET_EXECUTION_HANDOFF.md) | The implementation prompt and resume protocol for Sonnet |
| — | [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) | Phase tracker and deviation log, updated during implementation |

**Reading order for the implementer:** README → 1 → 3 → 4 → 2 → 7 → 5 → 6 → 8.
If two documents appear to disagree, **FIRESTORE_DATABASE_DESIGN.md wins for data shapes, FIREBASE_SECURITY_PLAN.md wins for rules, BUSINESS_RULES_AND_TEST_CASES.md wins for behaviour, UI_UX_DESIGN_SPECIFICATION.md wins for visuals.** Report the conflict in the Deviation Log; do not silently pick.

## 2. Status legend (used in every document)

| Tag | Meaning |
|---|---|
| **[Confirmed]** | Stated by the user in the original brief. Do not change. |
| **[D-xx]** | Recommended technical decision, approved by the user as part of the plan. Change only via the Deviation Log with justification. |
| **[R-xx]** | Refinement discovered during detailed design. Listed below with justification. |
| **[A-xx]** | Assumption. Not a confirmed business rule. |
| **[Q-xx]** | Open question needing user approval. A recommended default is given; implement the default unless told otherwise. |

---

## 3. Decision register

### 3.1 Approved decisions

| ID | Decision | Detail lives in |
|---|---|---|
| **D-01** | **Client-only Firebase.** No Express server, no Cloud Functions for the MVP. Integrity is enforced by Firestore transactions plus Security Rules. Works on the free Spark plan. Cloud Functions are the documented future path for user management, scheduled backups, and atomic multi-ledger corrections. | Arch §3, Security §9 |
| **D-02** | **Authorization = `users/{uid}` document** (`role: 'hr_admin'`, `isActive`), checked by Security Rules on every request. Users may edit only their own `fullName`. HR accounts are provisioned manually in the Firebase console. Public sign-up disabled. Web config in `VITE_*` variables (public by nature); service-account credentials never in the repo or frontend. | Security §2–§4 |
| **D-03** | **Append-only ledger + materialized balances.** `leaveTransactions` is the immutable ledger (`ALLOCATION`, `USAGE`, `REVERSAL`). `leaveBalances/{employeeId}_{year}_{leaveTypeId}` holds current totals. Every write is one `runTransaction` that creates the ledger entry and updates the balance. Security Rules bind the two with `getAfter()` so neither can be written alone and the arithmetic is verified server-side. | DB §5–§6, Security §6 |
| **D-04** | **Corrections = REVERSAL entries.** Entries are never edited or deleted. The original gets a one-time `reversedByTransactionId` link (the only permitted ledger update). Correcting = reverse, then re-record (two commits). Allocations cannot be reversed if available credits would go negative. | DB §7, Rules BR-COR-* |
| **D-05** | **Duplicate prevention:** client-generated transaction document ID per dialog session (idempotency key, checked inside the transaction) + submit button disabled while pending + soft warning for overlapping leave dates. | DB §6.4, BR-DUP-* |
| **D-06** | **Dates:** leave dates are `'YYYY-MM-DD'` strings (no timezone drift). Metadata timestamps use `serverTimestamp()` (rules: `== request.time`). Leave year = calendar year; a usage record must sit entirely inside its `leaveYear`. HR enters the days to deduct explicitly. | DB §3, BR-YR-* |
| **D-07** | **Fractional days:** multiples of **0.5** (binary-exact, so no float drift). One constant, enforced in Zod, domain code, and rules. | BR-FR-* |
| **D-08** | **Employees:** auto-ID documents; Employee ID uniqueness via `employeeNumbers/{employeeNumberKey}` reservation documents written in the same transaction; `employmentStatus` (enum) is separate from `isArchived`; no deletes (rules deny). Archived employees cannot receive new allocations/usage until restored. | DB §3.2, §3.3 |
| **D-09** | **Data loading:** TanStack Query as the server-state cache; no global store. Employees and leave types are loaded once and filtered/searched client-side. Ledger lists are server-filtered, year-scoped, cursor-paginated. Dashboard uses aggregation queries and indexed queries. Composite indexes are listed in DB §9. | Arch §6, DB §8–§9 |
| **D-10** | **Excel:** SheetJS CE (installed from the SheetJS CDN tarball), lazy-loaded, client-side. **One workbook, four sheets:** Report Info, Employee Summary, Leave Breakdown, Transactions. Same builder serves the individual-employee export. Column widths, number/date formats, and autofilter only (CE cannot style cells). Reports join current master data by ID; snapshots are the fallback. | UI §14, Req FR-RPT-* |
| **D-11** | **Stack:** React 19, Vite, TypeScript strict, Tailwind v4 (CSS-first `@theme`), React Router, TanStack Query, React Hook Form + Zod, date-fns, lucide-react, sonner, shadcn/ui-generated Radix primitives (+ cmdk), Inter via `@fontsource-variable/inter`. Dev: Vitest, React Testing Library, jsdom, `@firebase/rules-unit-testing`, `firebase-tools`, ESLint (flat), Prettier. | Arch §9 |
| **D-12** | **Folder structure:** `src/{app,components,features,services,domain,lib,hooks,types,utils,styles}`, `tests/{rules,integration}`, root `firestore.rules`, `firestore.indexes.json`, `firebase.json`. | Arch §5 |
| **D-13** | **UI:** white-dominant, pink accents; brand `#E85D9E` for accents, darker `#C7357A` for solid buttons; zinc neutrals. Sidebar 256 px (drawer below 1024 px), 64 px header, per-page year selector bound to `?year=`. Pages consolidated (employee add/edit and allocation/usage forms are dialogs). | UI spec |

### 3.2 Refinements discovered during detailed design

None of these overturns an approved decision except **R-01**, which corrects one detail of D-13 for an accessibility reason.

| ID | Refinement | Justification |
|---|---|---|
| **R-01** | **Input borders use `#8B8B94` (≈3.4:1 on white), not zinc-300.** *(Amends a D-13 detail.)* | WCAG 1.4.11 requires 3:1 contrast for form-control boundaries. Zinc-300 is ≈1.5:1. Card/table borders stay light (`#F3E8EF`) because they are decorative. |
| **R-02** | **Reversal entries use a deterministic document ID `rev_{originalTransactionId}`.** Original IDs are 20-character alphanumeric Firestore auto-IDs with no underscore; reversal IDs always contain one. | Strengthens D-04/D-05. Create-only semantics make a second reversal of the same entry impossible at the database level, and reversals are naturally idempotent. Rules also bind the original's `reversedByTransactionId` to exactly this ID. |
| **R-03** | **"Archived employees are read-only" (D-08) applies to `ALLOCATION` and `USAGE` only.** `REVERSAL` is still allowed for archived employees and for deactivated leave types. | A mistake found after archiving must still be correctable. Reversal never grants new entitlement; it only undoes an earlier entry. |
| **R-04** | **Employee ID is editable** through a transaction that swaps the reservation document (delete old key, create new key, update employee). | The brief says "edit employee information". Rules for the swap are in Security §6.2. |
| **R-05** | **No TanStack Table and no chart library.** `DataTable` is a small custom component; "usage by type" and "balance overview" use CSS progress bars. | Stays within the approved dependency list (D-11) and the brief's "accuracy over decorative visualization". |
| **R-06** | **Report and export queries have no `orderBy`; results are sorted in memory.** | Avoids index-direction ambiguity and lets the reports run on single-field indexes. |
| **R-07** | **Employee ID format is restricted** to `^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$`. | The normalized ID is a Firestore document ID: it cannot contain `/`, cannot be `.`/`..`, and cannot match `__.*__`. See Q-09. |
| **R-08** | **Phase 6 starts with a rules call-budget check** (≤10 access calls per operation, ≤20 per commit). Fallback designs are documented in Security §6.6. | Firestore enforces these limits; the reversal commit (3 writes) is the heaviest and must be proven in the emulator before UI work depends on it. |

---

## 4. Canonical constants (single source of truth)

These live in code at `src/domain/constants.ts` (the file Sonnet creates in Phase 3), and in `firestore.rules` (Phase 2/6). Every other document references this table instead of repeating values.

| Constant | Value | Where enforced |
|---|---|---|
| `DAY_STEP` | `0.5` | Zod, domain, rules |
| `MAX_DAYS_PER_ENTRY` | `365` | Zod, domain, rules |
| `REMARKS_MAX_LENGTH` | `500` | Zod, rules |
| `LOW_BALANCE_THRESHOLD` | `2` days available (inclusive) — **[Q-04]** | UI/domain only |
| `LEAVE_YEAR_RULES_MIN` / `MAX` | `2000` / `2100` | Rules, Zod |
| `LEAVE_YEAR_UI_MIN` | `2020`; UI list runs from `currentYear + 1` down to this | UI only |
| `EMPLOYMENT_STATUSES` | `Regular`, `Probationary`, `Contractual`, `Project-Based`, `Part-Time` — **[Q-01]** | Zod, rules |
| `EMPLOYEE_NUMBER_PATTERN` | `^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$` — **[R-07]** | Zod, rules |
| `TRANSACTION_TYPES` | `ALLOCATION`, `USAGE`, `REVERSAL` | Zod, rules |
| `ROLES` | `hr_admin` | Rules, auth guard |
| Page sizes | Employees table 25 (10/25/50 selectable, client-side); ledger lists 25 per page (cursor); credits matrix 25 employees per page (must be ≤ 30 for Firestore `in`) | UI/services |
| Query `staleTime` | employees & leave types 5 min; balances 60 s; ledger 30 s; dashboard 60 s | TanStack Query |
| Transaction ID format | non-reversal: `^[A-Za-z0-9]{20}$` (Firestore auto-ID); reversal: `rev_` + original ID | Rules, services |
| Balance ID format | `{employeeId}_{year}_{leaveTypeId}` | Rules, services |
| Emulator ports | Auth `9099`, Firestore `8080`, Emulator UI `4000` | `firebase.json` |
| Emulator project ID | `demo-hr-leave` (the `demo-` prefix makes accidental production access impossible) | `.firebaserc`, `.env.development`, tests |

---

## 5. Assumptions (not confirmed business rules)

| ID | Assumption |
|---|---|
| **A-01** | One HR administrator at first; the model supports several `hr_admin` users with identical privileges. |
| **A-02** | Scale: ≤ ~300 employees, ≤ ~10 leave types, ≤ ~10,000 ledger entries per year. Client-side employee search and in-memory report joins are sized for this. Beyond ~2,000 employees the employee list must move to server-side search. |
| **A-03** | HR works in one time zone. Leave dates are plain calendar dates; display of `createdAt` uses the browser's local time zone. |
| **A-04** | Leave year = calendar year (January 1 – December 31). Fiscal years are out of scope. |
| **A-05** | Leave type names are unique case-insensitively. This is checked in the client against the cached list only (single-admin risk is low); it is not rules-enforced, unlike Employee ID. |
| **A-06** | The app is used online. Firestore transactions require connectivity; offline persistence is deliberately not enabled. |
| **A-07** | Deployment target is Firebase Hosting on the Spark plan; deployment is *not* part of the implementation phases (Phase 12 produces a readiness checklist only). |
| **A-08** | Scheduled Firestore backups / point-in-time recovery are believed to require the Blaze plan **(verify in the console)**. The MVP's backup story is the Excel export. |
| **A-09** | Browser support: current and previous major versions of Chrome, Edge, Firefox, Safari (desktop and mobile). |
| **A-10** | No personal data beyond name, employee ID, position, department is stored. Leave remarks are free text and may contain sensitive notes; HR is told not to enter medical details (UI helper text). |

## 6. Open questions (recommended default is implemented unless the user says otherwise)

| ID | Question | Default used in this plan |
|---|---|---|
| **Q-01** | Which employment status values does the organization use? | `Regular, Probationary, Contractual, Project-Based, Part-Time` (constant; changing it requires a rules redeploy) |
| **Q-02** | Smallest leave increment? | 0.5 day |
| **Q-03** | Single `fullName` or split first/middle/last? | Single `fullName` |
| **Q-04** | "Low balance" threshold? | Available ≤ 2 days; "Depleted" = 0 |
| **Q-05** | Bulk allocation (same credits to many employees)? | Out of MVP; top post-MVP enhancement |
| **Q-06** | Which Firebase project? | Phase 0 uses emulators with `demo-hr-leave`. The user supplies the real project ID and web config before Phase 2's first real-project test. **This is the only blocker for connecting to production.** |
| **Q-07** | Fiscal year instead of calendar year? | Calendar year |
| **Q-08** | Earliest year selectable in the UI? | 2020 |
| **Q-09** | Employee ID format? | Letters, digits, `.`, `_`, `-` (max 30), starting with a letter or digit |
| **Q-10** | Is an "overlapping leave dates" warning acceptable as a soft warning rather than a block? | Soft warning with explicit "Record anyway" confirmation (HR may legitimately record a half-day pair on one date) |
| **Q-11** | Should the Excel report include a signature/approval block? | No |

## 7. Top risks (full treatment in the linked documents)

| ID | Risk | Mitigation | Detail |
|---|---|---|---|
| **RK-01** | Security Rules are complex (cross-document `getAfter` bindings) and **unproven until run in the emulator**. | Phase 2 and Phase 6 gate on a full rules test suite, including the call-budget check (R-08). | Security §6–§7 |
| **RK-02** | Client-only architecture: a compromised HR account or modified client can write *valid-looking but wrong* data. Rules guarantee arithmetic and traceability, not intent. | Immutable ledger, `createdBy` stamping, reconciliation check in reports, future Cloud Functions path. | Security §9 |
| **RK-03** | Firebase web API key is public; anyone can call Auth endpoints. | Sign-up disabled; rules require an active `users` doc; optional App Check noted as hardening. | Security §3 |
| **RK-04** | Emulator does not enforce composite indexes. | Index file maintained from DB §9; Phase 12 requires a smoke test against a real project. | DB §9 |
| **RK-05** | No scheduled backup on Spark. | Excel export; recommend Blaze + budget alert if backups are required. | Security §9 |
| **RK-06** | SheetJS is installed from a CDN tarball, not the npm registry. | Pin the exact tarball URL; record resolved version and integrity hash in the lockfile; fall back to ExcelJS if the CDN becomes a concern. | Arch §9 |
| **RK-07** | Correcting an entry takes two commits; a failure between them leaves the original reversed and the replacement unsaved. | UI shows a persistent "replacement not yet saved" banner with the form pre-filled. | DB §7 |
| **RK-08** | Dependency majors drift between this plan and install time. | Record resolved versions in IMPLEMENTATION_PROGRESS.md; do not downgrade silently; log any API differences as deviations. | Roadmap Phase 0 |

---

## 8. Change control

- The planning documents are the approved reference. **Sonnet may edit only `IMPLEMENTATION_PROGRESS.md`** (tracker, version table, deviation log). Any proposed change to a document goes in the Deviation Log with status `PROPOSED`, and the user decides.
- If a genuine architectural issue appears, stop at that point, explain it, and propose a solution (see the handoff).
- This planning phase created Markdown files only. **No application code, dependencies, Firebase resources, or configuration were created or modified.**

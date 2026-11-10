# Document 1 — System Requirements

See [README.md](README.md) for the status legend (**[Confirmed]**, **[D-xx]**, **[A-xx]**, **[Q-xx]**) and canonical constants.

---

## 1. Project overview

**[Confirmed]** A web-based **HR Leave Monitoring System** used by HR personnel to manage employee records, manually assign annual leave credits, record leave usage, monitor remaining balances, and export Excel reports. It replaces spreadsheet-based leave monitoring with a centralized, reliable, easy-to-operate application.

It is an **MVP**: essential functionality, reliable database operations, data integrity, security, and usability take priority over enterprise features.

## 2. Objectives

| # | Objective | Measure of success |
|---|---|---|
| O1 | Replace manual spreadsheets with one source of truth | All employee, credit, and usage data lives in the app; Excel is an export, not the master |
| O2 | Accurate balances that can never silently drift | Every balance equals the sum of its ledger entries (verified by reconciliation, BR-INV-01) |
| O3 | Full audit trail | Every allocation, usage, and correction is a permanent, attributable entry |
| O4 | Fast daily operation for one HR administrator | Record a leave usage in ≤ 30 seconds from the Leave Usage page |
| O5 | Secure by default | No data readable or writable without an authorized, active HR account, enforced by Firestore Security Rules and not only by the UI |

## 3. User roles

| Role | Status | Description |
|---|---|---|
| **HR Administrator** (`hr_admin`) | **[Confirmed]** | Full access to every management feature. The only role in the MVP. May be held by more than one person **[A-01]**. |
| Employee / manager / approver | Out of scope | No employee accounts, self-service, leave-request submission, or approval workflow. |

## 4. Functional requirements

Requirement IDs are used in the traceability matrix (§10) and the test cases (Document 7).

### Module A — Authentication (FR-AUTH)

| ID | Requirement | Source |
|---|---|---|
| FR-AUTH-01 | Sign in with email and password (Firebase Authentication). | [Confirmed] |
| FR-AUTH-02 | Unauthenticated users are redirected to the login page; authenticated users can reach the protected app. | [Confirmed] |
| FR-AUTH-03 | A logout action is available at all times in the shell. Logout clears all cached application data. | [Confirmed] + [D-09] |
| FR-AUTH-04 | The session persists across page refresh and browser restart. | [Confirmed] |
| FR-AUTH-05 | Password reset by email from the login page. The response never reveals whether an account exists. | [Confirmed] |
| FR-AUTH-06 | There is no public registration page or route; Firebase self sign-up is disabled. | [Confirmed] |
| FR-AUTH-07 | HR accounts are provisioned through the Firebase console (Auth user + `users/{uid}` profile document). | [Confirmed] |
| FR-AUTH-08 | After sign-in, the app verifies the profile: document exists, `role == 'hr_admin'`, `isActive == true`. Otherwise show an Access Denied screen and offer sign-out. | [Confirmed] |
| FR-AUTH-09 | Security Rules enforce the same authorization independently of frontend route protection. | [Confirmed] |
| FR-AUTH-10 | Account settings: view email, edit own display name, change password (requires re-authentication). | [D-02] |
| FR-AUTH-11 | Auth errors are mapped to friendly messages; wrong email and wrong password produce the same message. | [D-02] |
| FR-AUTH-12 | If the server rejects a request with `permission-denied` (e.g., the account was deactivated mid-session), the app re-checks the profile and signs the user out. | [D-02] |

### Module B — Employee management (FR-EMP)

| ID | Requirement | Source |
|---|---|---|
| FR-EMP-01 | Add an employee: Employee ID, Complete Name, Position, Employment Status, Department (optional). Created/Updated timestamps are automatic. | [Confirmed] |
| FR-EMP-02 | Employee list table: Employee ID, Complete Name, Position, Department, Employment Status, Actions. | [Confirmed] |
| FR-EMP-03 | Search by name or Employee ID (case-insensitive, substring). | [Confirmed] |
| FR-EMP-04 | Filter by employment status, and by archive state (Active / Archived / All; default Active). | [Confirmed] + [D-08] |
| FR-EMP-05 | Pagination (client-side, 25 per page default). | [Confirmed] + [D-09] |
| FR-EMP-06 | View an individual employee details page (Module F). | [Confirmed] |
| FR-EMP-07 | Edit employee information, including Employee ID (uniqueness re-checked). | [Confirmed] + [R-04] |
| FR-EMP-08 | Archive an employee no longer active; restore an archived employee. | [Confirmed] + [D-08] |
| FR-EMP-09 | Employees are never deleted. Rules deny deletes. | [Confirmed] |
| FR-EMP-10 | Archived employees keep all leave history, appear in historical reports for years in which they have records, and are excluded from pickers used to create new allocations/usage. | [Confirmed] + [D-08] |
| FR-EMP-11 | Employee ID is unique, compared case-insensitively after trimming, enforced by a reservation document. | [D-08] |

### Module C — Leave types (FR-LT)

| ID | Requirement | Source |
|---|---|---|
| FR-LT-01 | Add, edit (name, description), and activate/deactivate leave types. | [Confirmed] |
| FR-LT-02 | View all leave types, including inactive ones. | [Confirmed] |
| FR-LT-03 | Leave types are Firestore data and are never hardcoded in application logic. | [Confirmed] |
| FR-LT-04 | A deactivated type disappears from pickers for new entries but remains visible in historical transactions, balances, and reports. | [Confirmed] |
| FR-LT-05 | No built-in statutory entitlements or Philippine-labor-law assumptions. | [Confirmed] |
| FR-LT-06 | Leave types cannot be deleted (deactivate instead). | [D-03] |
| FR-LT-07 | Convenience: when no leave types exist, Settings offers a one-click "Add starter types" action creating *Vacation Leave*, *Sick Leave*, *Emergency Leave* as ordinary data. | [Decision, this plan] |

### Module D — Leave credits (FR-CR)

| ID | Requirement | Source |
|---|---|---|
| FR-CR-01 | Allocate credits: select employee, leave type, leave year, number of credits, optional remarks; save. | [Confirmed] |
| FR-CR-02 | Saving atomically creates a ledger entry and updates the matching balance. | [Confirmed] |
| FR-CR-03 | Allocation is additive: a second allocation never overwrites the first; each stays a separate ledger entry. | [Confirmed] |
| FR-CR-04 | Separate balance per employee × leave type × year. Different employees may hold different amounts. | [Confirmed] |
| FR-CR-05 | HR can review when credits were assigned and how many (allocation history). | [Confirmed] |
| FR-CR-06 | No automatic yearly generation, carryover, expiry, accrual, or proration. | [Confirmed] |
| FR-CR-07 | Credits page shows, per employee for the selected year: total credits, used, available, with per-type breakdown. | [Confirmed] |
| FR-CR-08 | A mistaken allocation is corrected by reversal (Module E correction workflow). | [D-04] |
| FR-CR-09 | Credits may be fractional in 0.5 steps, up to 365 per entry. | [D-07] |

### Module E — Leave usage (FR-LU)

| ID | Requirement | Source |
|---|---|---|
| FR-LU-01 | Record usage: Employee, Leave Type, Date From, Date To, Days Used, optional Remarks; Date Recorded and Recorded By are captured automatically. | [Confirmed] |
| FR-LU-02 | Days used is entered explicitly by HR; the system never auto-deducts calendar days between the dates. | [Confirmed] |
| FR-LU-03 | Days > 0, in 0.5 steps, ≤ available credits for that employee/type/year (checked in the transaction and again by Security Rules). | [Confirmed] + [D-07] |
| FR-LU-04 | Date From ≤ Date To, and both fall inside the selected leave year (no cross-year records). | [Confirmed] + [D-06] |
| FR-LU-05 | Days used may not exceed the inclusive calendar days in the date range (sanity check). | [D-06] |
| FR-LU-06 | Saving atomically creates the ledger entry and decrements the balance. | [Confirmed] |
| FR-LU-07 | Duplicate/accidental submissions are prevented (idempotency key, disabled button, overlap warning). | [Confirmed] + [D-05] |
| FR-LU-08 | List all leave transactions with search; filter by employee, leave type, transaction type, year, and leave-date range. | [Confirmed] |
| FR-LU-09 | View an employee's complete leave usage history (Module F). | [Confirmed] |
| FR-LU-10 | Incorrect usage is corrected by reversal; the trail is preserved. Entries are never edited or deleted. | [Confirmed] + [D-04] |
| FR-LU-11 | Insufficient balance is rejected with a message stating available vs requested days. | [Confirmed] |

### Module F — Employee leave summary (FR-SUM)

| ID | Requirement | Source |
|---|---|---|
| FR-SUM-01 | Shows Complete Name, Employee ID, Position, Department, Employment Status. | [Confirmed] |
| FR-SUM-02 | Year selector (default current year); shows Total Credits, Total Used, Total Unused for that year. | [Confirmed] |
| FR-SUM-03 | Per-leave-type breakdown (Total Credits, Used, Unused) and a totals row. | [Confirmed] |
| FR-SUM-04 | Chronological transaction history: Transaction Date, Leave Date/Range, Type, Leave Type, Days, Remarks. Newest first. | [Confirmed] |
| FR-SUM-05 | Unused = Total Credits − Total Used, calculated by one shared domain function. | [Confirmed] |
| FR-SUM-06 | Quick actions on the page: Allocate credits, Record usage, Export this employee. | [Decision, this plan] |

### Module G — Dashboard (FR-DASH)

| ID | Requirement | Source |
|---|---|---|
| FR-DASH-01 | Stat cards: Total Employees, Active Employees, Total Leave Credits, Total Leave Used, Total Unused Leave Credits. | [Confirmed] |
| FR-DASH-02 | Leave statistics are for one clearly labelled year; years are never mixed. | [Confirmed] |
| FR-DASH-03 | Recent leave transactions (latest 8 for the selected year). | [Confirmed] |
| FR-DASH-04 | Recent credit allocations (latest 8 for the selected year). | [Confirmed] |
| FR-DASH-05 | Employee leave balance overview (paged mini-table of employees with totals). | [Confirmed] |
| FR-DASH-06 | Leave usage summary by type (credits, used, available per type). | [Confirmed] |
| FR-DASH-07 | Employees with low or depleted balances (available ≤ `LOW_BALANCE_THRESHOLD`), active employees only. | [Confirmed] + [Q-04] |
| FR-DASH-08 | Totals include archived employees' records for the year (labelled); Total vs Active employee cards make the distinction visible. | [A, this plan] |

### Module H — Excel export and reports (FR-RPT)

| ID | Requirement | Source |
|---|---|---|
| FR-RPT-01 | Export an overall `.xlsx` workbook containing Employee Summary, Leave Breakdown, and Transactions data, plus a Report Info sheet. One workbook, multiple sheets. | [Confirmed] + [D-10] |
| FR-RPT-02 | Export an individual employee report using the same builder. | [Confirmed] |
| FR-RPT-03 | Filters: year (required), employee (optional), leave type (optional), include archived. | [Confirmed] |
| FR-RPT-04 | Descriptive worksheet names, clear headers, real Excel dates and numbers, sensible column widths, autofilter. | [Confirmed] |
| FR-RPT-05 | Exported figures match the application: a reconciliation check compares balances to ledger sums before download and surfaces any mismatch. | [Confirmed] |
| FR-RPT-06 | Generated entirely client-side; SheetJS lazy-loaded only on the Reports page. | [Confirmed] + [D-10] |
| FR-RPT-07 | Text cells are always written as strings (a remark such as `=1+1` is not treated as a formula). | [Decision, this plan] |

### Module I — Shell and cross-cutting (FR-UX)

| ID | Requirement |
|---|---|
| FR-UX-01 | Responsive admin layout: sidebar (Dashboard, Employees, Leave Credits, Leave Usage, Leave History, Reports, Settings), top header with title/breadcrumbs/user, main content. |
| FR-UX-02 | Every data view has loading, empty, error (with retry), and success/toast states. |
| FR-UX-03 | Destructive or irreversible actions (archive, reverse, deactivate) use a confirmation dialog. |
| FR-UX-04 | Pink-and-white design system defined in Document 5; reusable components only. |

## 5. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-PERF-01 | Performance | No unnecessary real-time listeners; the only listener is the Auth state observer. |
| NFR-PERF-02 | Performance | Employees and leave types are fetched once and cached (5 min). Never refetch the same data on every navigation. |
| NFR-PERF-03 | Performance | Ledger tables are cursor-paginated (25 per page); the whole ledger is never loaded for a table view. Year-wide reads happen only for reports/exports. |
| NFR-PERF-04 | Performance | Initial JS bundle excludes SheetJS (lazy chunk). Target: Dashboard interactive in ≤ 2 s on a typical broadband connection with warm cache. |
| NFR-REL-01 | Reliability | Ledger entry + balance update are one atomic transaction; concurrent submissions cannot corrupt balances. |
| NFR-REL-02 | Reliability | Every mutation has form validation, duplicate-submit prevention, and mapped error messages. |
| NFR-REL-03 | Reliability | No history is ever destroyed; corrections are additive. |
| NFR-SEC-01 | Security | Auth-protected routes **and** Firestore Security Rules; rules are the real boundary. |
| NFR-SEC-02 | Security | Only public Firebase web config in `VITE_*`; no service-account material anywhere in the repo or frontend. |
| NFR-SEC-03 | Security | No public registration; inactive users denied; users cannot change their own role. |
| NFR-MNT-01 | Maintainability | Feature-based modules; Firestore access only in `src/services` (lint-enforced); pure business logic in `src/domain`; TypeScript strict, no `any`. |
| NFR-RSP-01 | Responsiveness | Desktop-first; usable on tablets; functional on phones (≥ 360 px) with a drawer sidebar and horizontally scrollable tables with sticky first column. |
| NFR-A11Y-01 | Accessibility | WCAG 2.2 AA targets: contrast, keyboard operability, visible focus, labelled controls, dialogs trap focus, status not conveyed by colour alone. |
| NFR-TEST-01 | Testing | Unit (domain), component, service-integration (emulator), Security Rules (emulator), and export tests per Document 7. |
| NFR-DATA-01 | Retention | Employees, leave types, balances, and ledger entries are never deleted by the application. |

## 6. Module descriptions (summary)

| Module | One-line description | Pages |
|---|---|---|
| A Authentication | Login, reset, session, profile check, account settings | Login, Forgot Password, Access Denied, Settings → Account |
| B Employees | Directory with search/filter, add/edit/archive | Employees (dialogs for add/edit) |
| C Leave types | Configurable catalogue | Settings → Leave Types |
| D Leave credits | Allocation matrix, allocation form, allocation history | Leave Credits |
| E Leave usage | Usage form, usage list, reversal | Leave Usage, Leave History |
| F Employee summary | Per-employee yearly balances and history | Employee Detail |
| G Dashboard | Year overview | Dashboard |
| H Reports | Excel export | Reports |

## 7. Business rules (summary)

The authoritative numbered rules (BR-*) are in [BUSINESS_RULES_AND_TEST_CASES.md](BUSINESS_RULES_AND_TEST_CASES.md). The headline rules:

1. HR manually assigns credits; nothing is generated automatically **[Confirmed]**.
2. Balance = Σ allocations − Σ usage, per employee × leave type × calendar year **[Confirmed]**.
3. Unused = Total − Used; Totals = sums of per-type figures **[Confirmed]**.
4. Usage cannot exceed available credits **[Confirmed]**.
5. Entries are immutable; corrections are reversals **[D-04]**.
6. Usage must lie within a single calendar year **[D-06]**.
7. Days are positive multiples of 0.5, max 365 per entry **[D-07]**.
8. Archived employees cannot receive new allocations/usage; history remains **[D-08, R-03]**.

## 8. Data validation rules (summary)

| Field | Rule |
|---|---|
| Email | Valid email format (Firebase also validates) |
| Password (change) | ≥ 8 characters (Firebase minimum is 6; the app asks for more) |
| Employee ID | `EMPLOYEE_NUMBER_PATTERN`; unique case-insensitively |
| Full name | 1–120 characters, trimmed |
| Position | 1–80 characters, trimmed |
| Department | empty (stored as `null`) or 1–80 characters |
| Employment status | one of `EMPLOYMENT_STATUSES` |
| Leave type name | 1–60 characters, unique case-insensitively (client-checked) |
| Leave type description | empty (`null`) or ≤ 200 characters |
| Leave year | integer `LEAVE_YEAR_RULES_MIN`–`MAX` |
| Days / credits | number, > 0, multiple of `DAY_STEP`, ≤ `MAX_DAYS_PER_ENTRY` |
| Date From / To | valid `YYYY-MM-DD`; From ≤ To; both in the leave year; days ≤ inclusive range length |
| Remarks | optional, ≤ `REMARKS_MAX_LENGTH`; required (≥ 3 chars) when reversing |

Full per-form rules (Zod schemas, error copy) are in Document 5 §12 and Document 7.

## 9. MVP scope and out-of-scope

**In scope:** Modules A–H, the shell, the design system, rules, tests, and the implementation phases in Document 6.

**Out of scope (future enhancements, not to be built):** employee self-service accounts · employee leave requests · manager approval workflows · automated accrual · government-mandated leave calculations · automatic carryover/expiry/proration · payroll, attendance, biometric integration · mobile app · SMS/email notifications · multi-company/multi-tenant · complex permission hierarchies · bulk allocation **[Q-05]** · holiday/weekend calendars · fiscal years **[Q-07]** · server-side full-text search · scheduled backups · audit log viewer beyond the ledger · idle-session timeout.

**Documented limitations of the MVP** (surfaced in-app where relevant):
1. Credits and usage are year-specific; unused credits do not carry over; HR re-allocates manually each year.
2. Correcting an entry takes two commits (reverse, then re-record); an atomic "replace" needs a Cloud Function (D-01).
3. Employee search is client-side over a cached list (sized for ≲ 2,000 employees).
4. Rules guarantee arithmetic and traceability, not that a valid entry was the *right* entry.
5. Overlap detection for leave dates is advisory only.

## 10. Traceability matrix

Each requirement group maps to architecture (A), database (D), security (S), UI (U), roadmap phase (P), and tests (T). Section numbers refer to the named documents.

| Module | Requirements | Data / queries (Doc 3) | Rules (Doc 4) | Pages / components (Doc 5) | Phase (Doc 6) | Tests (Doc 7) |
|---|---|---|---|---|---|---|
| A Auth | FR-AUTH-01…12 | `users` §3.1 | §5 `users`, §4 authorization | Login, Forgot, Access Denied, Account (§6.1–6.3, 6.14) | 2 (+4 for Account) | TC-AUTH-*, TC-RULES-USR-* |
| B Employees | FR-EMP-01…11 | `employees`, `employeeNumbers` §3.2–3.3; list query §8.1 | §6.2 | Employees (§6.5) | 5 | TC-EMP-*, TC-RULES-EMP-* |
| C Leave types | FR-LT-01…07 | `leaveTypes` §3.4; §8.2 | §6.3 | Settings → Leave Types (§6.13) | 4 | TC-LT-*, TC-RULES-LT-* |
| D Credits | FR-CR-01…09 | `leaveBalances` §3.5, `leaveTransactions` §3.6; write flow §6.1; §8.3–8.4 | §6.4–6.5 | Leave Credits, Allocation dialog (§6.7–6.8) | 6, 7 | TC-CR-*, TC-RULES-LED-*, TC-CONC-* |
| E Usage | FR-LU-01…11 | write flows §6.2–6.3; §8.5 | §6.5 | Leave Usage, Record dialog, Leave History (§6.9–6.11) | 6, 8 | TC-LU-*, TC-REV-*, TC-DUP-* |
| F Summary | FR-SUM-01…06 | §8.3, §8.6 | (read rules) | Employee Detail (§6.6) | 9 | TC-SUM-* |
| G Dashboard | FR-DASH-01…08 | aggregations §8.7; indexes §9 | (read rules) | Dashboard (§6.4) | 10 | TC-DASH-* |
| H Reports | FR-RPT-01…07 | year reads §8.8; reconcile BR-INV-01 | (read rules) | Reports (§6.12), workbook spec (§14) | 11 | TC-RPT-* |
| Shell/UX | FR-UX-01…04, NFR-RSP, NFR-A11Y | — | — | Layout, tokens, components (§3–§11) | 1, 12 | TC-A11Y-*, TC-UX-* |
| Non-functional | NFR-PERF/REL/SEC/MNT/TEST | §8–§9 | §7 | — | 0, 6, 12 | all suites |

## 11. Acceptance criteria (module level)

Detailed Given/When/Then cases are in Document 7. A module is accepted when:

| Module | Acceptance |
|---|---|
| A | An unauthenticated visit to any app URL lands on `/login`; valid credentials for an active `hr_admin` reach the dashboard; a user without a profile / inactive / wrong role sees Access Denied; refresh keeps the session; logout returns to login and the back button cannot reveal data; password reset shows the generic confirmation; there is no registration route; rules tests prove an unauthenticated and an inactive user cannot read or write any collection. |
| B | HR can add, edit, search, filter, archive, restore; duplicate Employee IDs (any case) are rejected; no delete control or API exists; archived employees' history is intact and visible. |
| C | HR can add, rename, deactivate, reactivate; inactive types are absent from entry pickers but present in history and reports. |
| D | Allocating 10 then 2 Vacation credits for 2026 yields total 12 with two ledger rows; other years and types are unaffected; allocation to an archived employee or inactive type is rejected. |
| E | A usage larger than available is rejected in the UI, in the transaction, and (by direct write attempt) by rules; a valid usage reduces the balance exactly once even on double-click; reversal restores the balance and links both entries; entries cannot be edited or deleted. |
| F | For the example data (10/5/3 credits; 3/2/0 used) the page shows totals 18 / 5 / 13 and the correct per-type rows; switching year changes all figures. |
| G | Cards, lists, and the by-type summary all state the selected year and agree with the Employee Summary and the Excel export. |
| H | A downloaded `.xlsx` opens in Excel/LibreOffice with four named sheets, typed numbers/dates, and totals that equal the on-screen figures; an `=1+1` remark stays text. |

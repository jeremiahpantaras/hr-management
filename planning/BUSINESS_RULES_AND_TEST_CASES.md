# Document 7 — Business Rules and Test Cases

Constants: [README.md §4](README.md). Schema: [FIRESTORE_DATABASE_DESIGN.md](FIRESTORE_DATABASE_DESIGN.md). Rules attack list: [FIREBASE_SECURITY_PLAN.md §7](FIREBASE_SECURITY_PLAN.md).

Rule IDs (`BR-*`) are normative: code comments and tests cite them. Source tags: **[Confirmed]** from the brief; other tags as in README §2.

---

## Part A — Business rules

### A.1 Calculation rules (formulas)

| ID | Rule |
|---|---|
| BR-CALC-01 | For one balance (employee × leave type × year): `totalCredits = Σ creditsDelta`, `totalUsed = Σ usedDelta`, `available = totalCredits − totalUsed`. **[Confirmed]** |
| BR-CALC-02 | Employee-year **Total Credits** = Σ `totalCredits` over the employee's balances for that year. **Total Used** = Σ `totalUsed`. **Total Unused** = Total Credits − Total Used. **[Confirmed]** |
| BR-CALC-03 | Dashboard totals are Σ over all balances of the selected year (including archived employees' records) and are never mixed across years. **[Confirmed]** |
| BR-CALC-04 | All figures come from the single domain function `summarizeBalances()`; no component recomputes totals independently. |
| BR-CALC-05 | Display: whole values without decimals (`10`), halves with one decimal (`2.5`); never `2.50` or `2.0` on screen. Excel uses numeric cells formatted `#,##0.0`. |

### A.2 Credit allocation rules

| ID | Rule |
|---|---|
| BR-CR-01 | Credits are assigned manually by HR; the system never generates, accrues, prorates, or applies statutory entitlements. **[Confirmed]** |
| BR-CR-02 | An allocation always creates a **new** `ALLOCATION` ledger entry; it never overwrites or edits earlier credits. Allocating 2 more to 10 yields 12 with two entries. **[Confirmed]** |
| BR-CR-03 | One balance exists per employee × leave type × year; employees may hold different amounts. **[Confirmed]** |
| BR-CR-04 | Allocation requires: employee exists and is **not archived** **[R-03]**; leave type exists and is **active**; year in 2000–2100 (UI offers `currentYear+1` down to 2020). |
| BR-CR-05 | Credits are > 0, a multiple of 0.5, ≤ 365 per entry. **[D-07]** |
| BR-CR-06 | The ledger entry and the balance update are one atomic commit; either both happen or neither. **[Confirmed]** |
| BR-CR-07 | Remarks are optional (≤ 500). |
| BR-CR-08 | Allocations for a future year (e.g., 2027 entered in 2026) are allowed. **[A]** |
| BR-CR-09 | There is no negative allocation. To reduce credits, reverse the allocation (BR-COR). |

### A.3 Leave usage rules

| ID | Rule |
|---|---|
| BR-LU-01 | Every usage belongs to one employee, one leave type, and one leave year. **[Confirmed]** |
| BR-LU-02 | Days used are entered explicitly by HR; the system never counts weekdays/holidays or deducts calendar days automatically. **[Confirmed]** |
| BR-LU-03 | Days > 0, multiple of 0.5, ≤ 365. **[Confirmed + D-07]** |
| BR-LU-04 | `dateFrom ≤ dateTo`; both lie within `leaveYear` (a record may not span two calendar years). **[D-06]** |
| BR-LU-05 | Days ≤ inclusive calendar days of the range (`dateTo − dateFrom + 1`) — a sanity check; for a single date the maximum is 1. **[D-06]** |
| BR-LU-06 | Usage requires an existing balance for the employee × type × year with `available ≥ days`; otherwise rejected (BR-INS). **[Confirmed]** |
| BR-LU-07 | The ledger entry and the balance decrement are one atomic commit. **[Confirmed]** |
| BR-LU-08 | Usage requires an **active** leave type and a **non-archived** employee. |
| BR-LU-09 | Overlap with an existing, **non-reversed** USAGE entry for the same employee in the same year produces a soft warning requiring "Record anyway". It is not a block. **[Q-10]** |
| BR-LU-10 | *Recorded by* and *Date recorded* are captured automatically from the signed-in user and server time. **[Confirmed]** |
| BR-LU-11 | Actual leave dates are stored as entered and are never altered. **[Confirmed]** |

### A.4 Annual (year-specific) balance rules

| ID | Rule |
|---|---|
| BR-YR-01 | Leave year = calendar year (Jan 1–Dec 31). **[A-04]** |
| BR-YR-02 | Balances of different years are independent; entries in one year never affect another. **[Confirmed]** |
| BR-YR-03 | No automatic yearly credit generation and no automatic carryover or expiry. HR allocates each year manually. **[Confirmed]** |
| BR-YR-04 | A usage record may not cross a year boundary (e.g., Dec 30 – Jan 2 is rejected; record two entries). **[D-06]** |
| BR-YR-05 | The page year selector defaults to the current year; pages state the year next to every figure. **[Confirmed]** |

### A.5 Fractional leave

| ID | Rule |
|---|---|
| BR-FR-01 | The smallest increment is 0.5 day (half-day). Values such as 0.25, 1.3, or 0.05 are rejected in the UI, domain, and rules. **[D-07, Q-02]** |
| BR-FR-02 | All sums and comparisons use exact equality; no epsilon, because multiples of 0.5 are exact in binary floating point. |
| BR-FR-03 | A half-day on a single date is recorded as `days = 0.5` with `dateFrom = dateTo`. |
| BR-FR-04 | Changing `DAY_STEP` to a non-dyadic value requires migrating to integer units (not in MVP). |

### A.6 Insufficient balance

| ID | Rule |
|---|---|
| BR-INS-01 | A usage with `days > available` is rejected at three layers: UI (disabled submit + message), transaction code (`INSUFFICIENT_BALANCE`), and Security Rules (`availableCredits ≥ 0`). **[Confirmed]** |
| BR-INS-02 | A usage with `days == available` succeeds and leaves 0 (the balance is then "Depleted"). |
| BR-INS-03 | The message states both figures: "Not enough credits: {available} available, {requested} requested." If no balance exists: "No {type} credits have been allocated…". |
| BR-INS-04 | Under concurrent submissions that together exceed the balance, exactly the entries that fit succeed; none produces a negative balance. |
| BR-INS-05 | Reversing an allocation is rejected if it would make `available < 0`. |

### A.7 Duplicate and accidental submissions

| ID | Rule |
|---|---|
| BR-DUP-01 | Each dialog session generates one `transactionId`; resubmitting the same ID is a no-op that reports success (`duplicate`). **[D-05]** |
| BR-DUP-02 | The submit button is disabled while pending; double-click or Enter-spam produces one entry. |
| BR-DUP-03 | An intentional identical entry is a new dialog session and is allowed (with the BR-LU-09 warning for usage). |
| BR-DUP-04 | A reversal ID is deterministic (`rev_{id}`), so an entry can be reversed at most once. **[R-02]** |
| BR-DUP-05 | After an uncertain outcome (timeout, network drop mid-commit), the retry reuses the same `transactionId`; the first attempt's success is detected, not duplicated. |

### A.8 Correction and adjustment workflow

| ID | Rule |
|---|---|
| BR-COR-01 | Ledger entries are never edited or deleted. The only permitted modification is the one-way `reversedByTransactionId` link. **[Confirmed + D-04]** |
| BR-COR-02 | A correction is a `REVERSAL` entry that mirrors the original with opposite deltas (same employee, type, year, days, dates, snapshots) plus a mandatory reason (≥ 3 chars). |
| BR-COR-03 | Only `ALLOCATION` and `USAGE` entries can be reversed; each at most once. Reversals cannot be reversed — re-record the original instead. |
| BR-COR-04 | Reversal is allowed for archived employees and inactive leave types. **[R-03]** |
| BR-COR-05 | Both the original and the reversal remain visible forever, linked in both directions, and both are exported. |
| BR-COR-06 | "Reverse & re-enter" is two commits (reverse, then a normal record). Failure between them leaves a visible banner (RK-07). |
| BR-COR-07 | Balances reflect the net effect: reversing a 2-day usage returns 2 days to `available`; reversing a 10-credit allocation removes 10 from `totalCredits` (only if `available ≥ 10`). |

### A.9 Employee rules

| ID | Rule |
|---|---|
| BR-EMP-01 | Employee ID is unique, trimmed, compared case-insensitively (`EMP-1` = `emp-1`), format per `EMPLOYEE_NUMBER_PATTERN`. **[D-08, R-07]** |
| BR-EMP-02 | Employees are archived, never deleted. **[Confirmed]** |
| BR-EMP-03 | Archiving does not touch balances or ledger entries; history remains and appears in reports for the years in which it exists. **[Confirmed]** |
| BR-EMP-04 | Archived employees are excluded from pickers for new allocations/usage and cannot receive them until restored. **[D-08]** |
| BR-EMP-05 | Archived employees are hidden from the default list (Active); visible with the Archived/All filter. |
| BR-EMP-06 | Restoring an archived employee re-enables new entries; nothing else changes. |
| BR-EMP-07 | Changing the Employee ID or name does not alter history; views/reports show current values, ledger snapshots preserve the originals. **[R-04, D-10]** |
| BR-EMP-08 | "Active Employees" on the dashboard = not archived; "Total Employees" = all records. |

### A.10 Leave types

| ID | Rule |
|---|---|
| BR-LT-01 | Leave types are data; no type is hardcoded in logic. **[Confirmed]** |
| BR-LT-02 | Deactivating a type hides it from new-entry pickers only; balances, history, and reports are unaffected; reversal still works. **[Confirmed]** |
| BR-LT-03 | Names are unique case-insensitively (client-checked, A-05). |
| BR-LT-04 | Renaming does not rewrite history snapshots; views/reports show the current name. |
| BR-LT-05 | Types are never deleted. |

### A.11 Reports

| ID | Rule |
|---|---|
| BR-RPT-01 | Exported figures equal the on-screen figures for the same filters. **[Confirmed]** |
| BR-RPT-02 | Within a workbook: Employee Summary totals = Σ Leave Breakdown rows = Σ ledger deltas of the included entries. |
| BR-RPT-03 | Year is required; employee and leave type filters are optional; archived employees are included when they have records in that year. |
| BR-RPT-04 | Reversal entries and the originals they reverse are both listed in *Transactions*. |
| BR-RPT-05 | Text cells are always strings (no formula interpretation). |
| BR-RPT-06 | If reconciliation finds balances that disagree with their ledger, the export proceeds with a visible warning and a list in *Report Info*. |
| BR-RPT-07 | Dates are real dates, numbers are real numbers. |

### A.12 Invariants

| ID | Invariant |
|---|---|
| BR-INV-01 | INV-1…INV-6 of DB §5.3 hold at all times; the reconcile function reports any violation. |
| BR-INV-02 | No balance has negative `totalCredits`, `totalUsed`, or `availableCredits`. |

### A.13 Authentication and authorization

| ID | Rule |
|---|---|
| BR-AUTH-01 | Only an authenticated user with a `users/{uid}` document where `role == 'hr_admin'` and `isActive == true` can read or write any application data. **[Confirmed]** |
| BR-AUTH-02 | There is no public registration. **[Confirmed]** |
| BR-AUTH-03 | A user cannot change their own role or active flag; only `fullName` is self-editable. |
| BR-AUTH-04 | Password-reset responses never reveal whether an email has an account. |

---

## Part B — Test cases

**Levels:** **U** unit (Vitest, no Firebase) · **C** component (Vitest + RTL) · **I** integration (service functions against the Firestore emulator) · **R** Security Rules (`@firebase/rules-unit-testing`) · **M** manual/E2E checklist.
**Reference dataset "Juan-2026"** (used throughout): employee Juan Dela Cruz (EMP-0042), year 2026. Allocations: Vacation 10, Sick 5, Emergency 3. Usage: Vacation 2 (2026-02-10→02-11) and 1 (2026-04-20); Sick 1 (2026-03-15) and 1 (2026-05-05). Expected: Vacation 10/3/7 · Sick 5/2/3 · Emergency 3/0/3 · **Totals 18/5/13**.
System time in tests is pinned (fake timers) to 2026-11-09 unless stated.

### B.1 Authentication (TC-AUTH)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-AUTH-01 | C | Unauthenticated visit to `/employees` | Redirect to `/login`; `from` retained | FR-AUTH-02 |
| TC-AUTH-02 | C | Valid credentials, active `hr_admin` | Lands on `/` (or `from`) | FR-AUTH-01 |
| TC-AUTH-03 | C | Wrong password and unknown email | Identical "Incorrect email or password." | FR-AUTH-11 |
| TC-AUTH-04 | C | Signed in but no profile / `isActive:false` / `role:'x'` | `/access-denied` with matching message; Sign out works | BR-AUTH-01 |
| TC-AUTH-05 | C | Reload while signed in | Session restored without login | FR-AUTH-04 |
| TC-AUTH-06 | C | Logout | Returns to `/login`; query cache cleared; Back cannot reveal data | FR-AUTH-03 |
| TC-AUTH-07 | C | Password reset for existing and non-existing email | Same generic confirmation | BR-AUTH-04 |
| TC-AUTH-08 | M | Navigate to `/register`, `/signup` | NotFound; no registration UI anywhere | BR-AUTH-02 |
| TC-AUTH-09 | C | Server returns `permission-denied` mid-session (deactivated) | Profile re-checked; user moved to Access Denied | FR-AUTH-12 |
| TC-AUTH-10 | C | Change password with wrong current password / weak new / mismatch | Correct messages; success toast on valid | FR-AUTH-10 |
| TC-AUTH-11 | C | Signed-in user opens `/login` | Redirected to `/` | |
| TC-AUTH-12 | C | Missing env variable at startup | "Configuration error" screen naming the variable | NFR-SEC-02 |

### B.2 Employees (TC-EMP)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-EMP-01 | I | Create employee with all fields | Employee + reservation exist; timestamps set; `isArchived:false` | FR-EMP-01 |
| TC-EMP-02 | I | Create duplicate Employee ID `emp-0042` when `EMP-0042` exists | `DUPLICATE_EMPLOYEE_NUMBER`; nothing written | BR-EMP-01 |
| TC-EMP-03 | U | Employee ID `a/b`, `.hidden`, 31 chars, empty, spaces only | Rejected with pattern message | R-07 |
| TC-EMP-04 | I | Edit position/department/status | Updated; `updatedAt/By` change; `createdAt` unchanged | FR-EMP-07 |
| TC-EMP-05 | I | Change Employee ID to an unused value | Old reservation deleted, new created; ledger snapshots unchanged | R-04 |
| TC-EMP-06 | I | Change Employee ID to one in use | Rejected; no partial write | R-04 |
| TC-EMP-07 | I | Archive then restore | Flags/timestamps correct; balances and ledger untouched | BR-EMP-03/06 |
| TC-EMP-08 | C | List shows only Active by default; Archived/All filters work | | BR-EMP-05 |
| TC-EMP-09 | C | Search "juan", "0042", "DELA" (case-insensitive substring) | Matches name and ID | FR-EMP-03 |
| TC-EMP-10 | C | Status filter + search + pagination (87 rows, size 25) | Counts/pages correct; filter state in URL | FR-EMP-04/05 |
| TC-EMP-11 | C | No delete control exists anywhere | | FR-EMP-09 |
| TC-EMP-12 | C | Archived employee absent from `EmployeeCombobox`; Allocate/Record disabled on detail | | BR-EMP-04 |
| TC-EMP-13 | C | Archived employee's history visible on detail page | | BR-EMP-03 |
| TC-EMP-14 | C | Department left blank | Stored `null`; displays "—" | |
| TC-EMP-15 | U | Names with unicode/extra spaces ("  José  Rizal ") | Trimmed; stored as typed otherwise | |
| TC-EMP-16 | C | Empty states (no employees; no matches) | Correct copy and CTA | UI §11 |

### B.3 Leave types (TC-LT)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-LT-01 | I | Add "Vacation Leave" | Active; appears in pickers | FR-LT-01 |
| TC-LT-02 | C | Add "vacation leave" when "Vacation Leave" exists | Duplicate message | BR-LT-03 |
| TC-LT-03 | I | Rename a type used in history | New name in views/reports; ledger snapshots unchanged | BR-LT-04 |
| TC-LT-04 | C | Deactivate | Gone from allocation/usage pickers; still in history, breakdown, reports | BR-LT-02 |
| TC-LT-05 | I | Reactivate | Available again | |
| TC-LT-06 | C | Empty list → "Add starter types" | Creates 3 ordinary documents | FR-LT-07 |
| TC-LT-07 | C | No delete control | | BR-LT-05 |
| TC-LT-08 | I | Deactivated type: reversal of an old entry still works | | BR-COR-04 |

### B.4 Credit allocation (TC-CR)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-CR-01 | I | Allocate Vacation 10 for 2026 (new balance) | Ledger `ALLOCATION` (+10), balance 10/0/10, `lastTransactionId` = entry | BR-CR-06 |
| TC-CR-02 | I | Allocate +2 to the same balance | Two entries; balance 12; first entry unchanged | BR-CR-02 |
| TC-CR-03 | I | Same employee, different type / different year | Separate balances; others unchanged | BR-CR-03, BR-YR-02 |
| TC-CR-04 | U | Credits 0, −1, 0.3, 1.25, 366, "", "abc" | Rejected with matching messages | BR-CR-05 |
| TC-CR-05 | U | Credits 0.5, 1, 2.5, 365 | Accepted | BR-CR-05 |
| TC-CR-06 | I | Allocate to archived employee | `EMPLOYEE_ARCHIVED` | BR-CR-04 |
| TC-CR-07 | I | Allocate with inactive type | `LEAVE_TYPE_INACTIVE` | BR-CR-04 |
| TC-CR-08 | I | Allocate for 2027 while now is 2026 | Allowed | BR-CR-08 |
| TC-CR-09 | C | Preview strip "Current 10 → After 12" | Matches balance | UI §6.8 |
| TC-CR-10 | C | Allocation history lists entries with who/when/how many | | FR-CR-05 |
| TC-CR-11 | I | `resultingTotalCredits/Used` on entries | Equal balance after commit | INV-4 |
| TC-CR-12 | I | Remarks 501 chars | Rejected | BR-CR-07 |
| TC-CR-13 | M | Allocate from the employee row (prefilled) | Employee/year prefilled; new idempotency key per open | D-05 |
| TC-CR-14 | I | Allocation does not alter any other year's totals | | BR-YR-02 |

### B.5 Leave usage (TC-LU)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-LU-01 | I | Usage 2 days Vacation (balance 10) | Ledger `USAGE`, balance 10/2/8 | BR-LU-07 |
| TC-LU-02 | I | Usage exactly equal to available | Succeeds; available 0 | BR-INS-02 |
| TC-LU-03 | I | Usage 1 more than available | `INSUFFICIENT_BALANCE` with both figures; nothing written | BR-INS-01/03 |
| TC-LU-04 | I | Usage when no balance exists | `INSUFFICIENT_BALANCE` (no credits allocated); no balance created | BR-LU-06 |
| TC-LU-05 | U | `dateTo < dateFrom` | Rejected | BR-LU-04 |
| TC-LU-06 | U | Range inside 2026 vs 2026-12-30→2027-01-02 | First accepted; second rejected | BR-YR-04 |
| TC-LU-07 | U | Dates outside selected leave year (2025-12-31 for year 2026) | Rejected | BR-LU-04 |
| TC-LU-08 | U | Days 3 for a 2-day range; days 0.5 for a single date | First rejected; second accepted | BR-LU-05, BR-FR-03 |
| TC-LU-09 | U | Days 0, −1, 0.3, 366 | Rejected | BR-LU-03 |
| TC-LU-10 | U | Feb 29 2028 valid; Feb 29 2026 and Feb 31 invalid | Real-calendar validation | EC |
| TC-LU-11 | I | Usage for archived employee / inactive type | Respective error | BR-LU-08 |
| TC-LU-12 | I | Dates stored exactly as entered, independent of the machine time zone (run under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`) | Same strings | D-06, BR-LU-11 |
| TC-LU-13 | I | `createdBy`, `createdByName`, `createdAt` | Set from auth/profile/server time | BR-LU-10 |
| TC-LU-14 | C | Balance strip: sufficient → "After: 5"; insufficient → red + submit disabled; none → link to Allocate | | UI §6.10 |
| TC-LU-15 | C | Overlap warning lists conflicting entries; "Record anyway" required | | BR-LU-09 |
| TC-LU-16 | U | Overlap ignores **reversed** entries and other years/employees | | BR-LU-09 |
| TC-LU-17 | C | Leave Usage list filters: employee, type, remarks search, date range | | FR-LU-08 |
| TC-LU-18 | C | Date-range / text filter triggers "Load all" notice | | UI §6.9 |
| TC-LU-19 | I | Fractional usage 0.5 then 0.5 | Used 1.0; exact | BR-FR-02 |
| TC-LU-20 | I | Employee history query returns only that employee/year, newest first | | FR-LU-09 |

### B.6 Duplicate submission (TC-DUP)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-DUP-01 | I | `recordUsage` called twice with the same `transactionId` (sequential) | One entry; second returns `duplicate`; balance decremented once | BR-DUP-01 |
| TC-DUP-02 | I | Same, called concurrently | One entry; balance decremented once | BR-DUP-01 |
| TC-DUP-03 | C | Double-click / Enter twice on Submit | One service call | BR-DUP-02 |
| TC-DUP-04 | C | Close and reopen dialog, submit identical data | New ID → second entry (+ overlap warning for usage) | BR-DUP-03 |
| TC-DUP-05 | I | Simulated timeout after commit, then retry with same ID | Detected as duplicate; UI shows success | BR-DUP-05 |
| TC-DUP-06 | I | Reverse the same entry twice | Second: duplicate/`ALREADY_REVERSED`; balance changed once | BR-DUP-04 |

### B.7 Reversal and corrections (TC-REV)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-REV-01 | I | Reverse a 1-day usage (balance 10/3/7) | Reversal entry `rev_…`; original gets `reversedByTransactionId`; balance 10/2/8 | BR-COR-02 |
| TC-REV-02 | I | Reverse an unused allocation of 2 (balance 12/3/9) | Balance 10/3/7 | BR-COR-07 |
| TC-REV-03 | I | Reverse an allocation whose credits are partly used (alloc 10, used 8, reverse 10) | `CANNOT_REVERSE`; nothing written | BR-INS-05 |
| TC-REV-04 | I | Reverse a reversal | Rejected | BR-COR-03 |
| TC-REV-05 | I | Reverse with reason of 2 chars / empty | Rejected | BR-COR-02 |
| TC-REV-06 | I | Reverse for archived employee / inactive type | Allowed | BR-COR-04 |
| TC-REV-07 | I | Original and reversal both returned by history and report queries | Linked both ways | BR-COR-05 |
| TC-REV-08 | C | Reverse dialog preview ("7 → 8") and blocked-case message | | UI §6.11 |
| TC-REV-09 | C | "Then enter corrected record" opens prefilled form after success | | BR-COR-06 |
| TC-REV-10 | C | Second commit fails → banner "original reversed, replacement not saved" with form retained | | RK-07 |
| TC-REV-11 | U | `buildReversalEntry` mirrors every field with opposite deltas | | BR-COR-02 |
| TC-REV-12 | I | After reverse-then-rerecord, reconcile passes | | BR-INV-01 |
| TC-REV-13 | C | Reverse action absent on reversal rows and already-reversed rows | | BR-COR-03 |
| TC-REV-14 | I | Direct `update` of a ledger entry's `days` or `remarks` | Denied (see TC-RULES-LED-10) | BR-COR-01 |

### B.8 Employee leave summary (TC-SUM)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-SUM-01 | U | `summarizeBalances` on Juan-2026 | Totals 18 / 5 / 13; per-type rows as the dataset | BR-CALC-02 |
| TC-SUM-02 | C | Employee page for Juan-2026 | Tiles and breakdown table match; totals row 18/5/13 | FR-SUM-02/03 |
| TC-SUM-03 | C | Switch year to 2025 (no data) | Zeros / empty state; 2026 figures not shown | BR-YR-02 |
| TC-SUM-04 | C | Active type with no balance | Row 0/0/0 "No credits assigned" | UI §6.6 |
| TC-SUM-05 | C | Inactive type with a balance | Row shown, marked inactive | BR-LT-02 |
| TC-SUM-06 | C | History is newest first; Days column shows effect (+10 credits, −2 days) | | FR-SUM-04 |
| TC-SUM-07 | C | Reversed/reversal rows labelled and linked | | BR-COR-05 |
| TC-SUM-08 | C | Archived employee banner; actions disabled; reversal available | | R-03 |

### B.9 Dashboard (TC-DASH)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-DASH-01 | I | Aggregates for the year equal `summarizeBalances` over the same balances | | BR-CALC-03 |
| TC-DASH-02 | C | Year selector changes every widget; year shown in caption | | BR-YR-05 |
| TC-DASH-03 | C | Total vs Active employee counts (archived excluded from Active) | | BR-EMP-08 |
| TC-DASH-04 | C | Low-balance list: available ≤ 2 → "Low"; 0 → "Depleted"; archived employees excluded; `totalCredits = 0` excluded | | FR-DASH-07 |
| TC-DASH-05 | C | Usage by type rows with progress bars; inactive types marked | | FR-DASH-06 |
| TC-DASH-06 | C | Recent transactions/allocations show 8 newest for the year | | FR-DASH-03/04 |
| TC-DASH-07 | C | Empty year → "No leave credits allocated" with CTA | | UI §6.4 |
| TC-DASH-08 | C | One widget errors → others render; Retry works | | UI §6.4 |

### B.10 Reports / Excel (TC-RPT)

| ID | Level | Scenario | Expected | Rules |
|---|---|---|---|---|
| TC-RPT-01 | U | Build workbook for Juan-2026 | 4 sheets with exact names; headers exactly per UI §14 | FR-RPT-01/04 |
| TC-RPT-02 | U | Employee Summary row 18 / 5 / 13; Breakdown rows 10/3/7, 5/2/3, 3/0/3 | Totals equal | BR-RPT-02 |
| TC-RPT-03 | U | Transactions: dates are date cells; numbers are numeric; days positive; effect signed | | BR-RPT-07 |
| TC-RPT-04 | U | Remark `=1+1` | Cell type string; value literal | BR-RPT-05 |
| TC-RPT-05 | U | Filter by employee / leave type | Rows and totals narrowed; Report Info states filters | FR-RPT-03 |
| TC-RPT-06 | U | Reversal pair appears as two rows with Status/Reference filled | | BR-RPT-04 |
| TC-RPT-07 | U | Archived employee with 2026 records included; archived without records excluded | | BR-RPT-03 |
| TC-RPT-08 | U | `reconcile()` detects a tampered balance | Mismatch listed in Report Info; UI warning | BR-RPT-06 |
| TC-RPT-09 | U | File names (overall and individual), sanitized | | UI §14 |
| TC-RPT-10 | U | Sheet names ≤ 31 chars, no forbidden characters | | UI §14 |
| TC-RPT-11 | C | Preview counts/totals equal workbook content; Download disabled until preview ok | | UI §6.12 |
| TC-RPT-12 | C | `xlsx` is not in the initial bundle; loads only on export | | NFR-PERF-04 |
| TC-RPT-13 | M | Open the downloaded file in Excel and LibreOffice | Opens; dates/numbers typed; autofilter works | FR-RPT-04 |
| TC-RPT-14 | U | Round-trip: read the generated buffer with SheetJS and compare against source data | Equal | BR-RPT-01 |

### B.11 Concurrency and atomicity (TC-CONC) — emulator

| ID | Scenario | Expected |
|---|---|---|
| TC-CONC-01 | Two clients each record usage of 6 days against available 10, started simultaneously | Exactly one succeeds; the other gets `INSUFFICIENT_BALANCE` (after SDK retry); final available 4; ledger has one entry |
| TC-CONC-02 | Ten concurrent allocations of 1 against one balance | Balance +10; ten ledger entries; `lastTransactionId` is the last committed |
| TC-CONC-03 | Force the ledger write to succeed and the balance write to fail inside a transaction | Neither persists |
| TC-CONC-04 | After each concurrency test, `reconcile()` over the ledger equals the balance | INV-1 |

### B.12 Security Rules (TC-RULES)

Contexts: `anonymous`, `noProfile`, `inactiveHr`, `wrongRole`, `hr`. "Source" refers to FIREBASE_SECURITY_PLAN §7 row numbers.

| ID | Source | Scenario | Expected |
|---|---|---|---|
| TC-RULES-USR-01 | 1 | `anonymous` get/list/create/update/delete on every collection | All denied |
| TC-RULES-USR-02 | 2 | `noProfile`, `inactiveHr`, `wrongRole` on every collection | All denied (except own `users` doc get) |
| TC-RULES-USR-03 | 3 | `hr` updates own `role`/`isActive`/`email` | Denied |
| TC-RULES-USR-04 | 3 | `hr` updates own `fullName` + `updatedAt = request.time` | Allowed |
| TC-RULES-USR-05 | 3 | `hr` creates/deletes any `users` doc; reads another user's doc; lists users | Denied |
| TC-RULES-USR-06 | 28 | Same user after `isActive` flips to false | Next request denied |
| TC-RULES-EMP-01 | 23 | Create employee + reservation, valid | Allowed |
| TC-RULES-EMP-02 | 23 | Create with existing key (any case) | Denied |
| TC-RULES-EMP-03 | 24 | Reservation create for a key the employee doesn't use | Denied |
| TC-RULES-EMP-04 | 24 | Reservation delete while still in use | Denied |
| TC-RULES-EMP-05 | R-04 | Employee ID swap (delete old, create new, update) | Allowed |
| TC-RULES-EMP-06 | 25 | Extra field / missing field / wrong type / bad enum / bad pattern | Denied |
| TC-RULES-EMP-07 | 11 | Delete employee | Denied |
| TC-RULES-EMP-08 | — | Archive/restore transitions with correct `archivedAt/By`; wrong values denied | Allowed / Denied |
| TC-RULES-EMP-09 | — | Change `createdAt`/`createdBy` on update | Denied |
| TC-RULES-EMP-10 | — | `employeeNumberKey != upper(employeeNumber)` | Denied |
| TC-RULES-LT-01 | — | Create/update valid type | Allowed |
| TC-RULES-LT-02 | 11 | Delete type | Denied |
| TC-RULES-LT-03 | 25 | Extra/missing fields, bad lengths | Denied |
| TC-RULES-LT-04 | — | Toggle `isActive` | Allowed |
| TC-RULES-LT-05 | — | Change `createdAt`/`createdBy` | Denied |
| TC-RULES-LED-01 | — | Valid ALLOCATION with new balance (create) in one batch | Allowed |
| TC-RULES-LED-02 | — | Valid USAGE with balance update | Allowed |
| TC-RULES-LED-03 | — | Valid REVERSAL (3 writes) | Allowed |
| TC-RULES-LED-04 | 4 | Ledger entry alone | Denied |
| TC-RULES-LED-05 | 5 | Balance alone (e.g., `totalCredits: 999`) | Denied |
| TC-RULES-LED-06 | 6 | Balance pointing `lastTransactionId` at an old entry | Denied |
| TC-RULES-LED-07 | 7 | Ledger +10, balance +11 | Denied |
| TC-RULES-LED-08 | 8 | Usage larger than available | Denied |
| TC-RULES-LED-09 | 9 | Usage creating a new balance | Denied |
| TC-RULES-LED-10 | 10 | Update any ledger field other than the one link | Denied |
| TC-RULES-LED-11 | 11 | Delete ledger entry / balance | Denied |
| TC-RULES-LED-12 | 12 | Second reversal of the same entry | Denied |
| TC-RULES-LED-13 | 13 | Reverse a reversal | Denied |
| TC-RULES-LED-14 | 14 | Reverse an allocation that would make available negative | Denied |
| TC-RULES-LED-15 | 15 | Reversal with altered days/deltas/dates/snapshots | Denied |
| TC-RULES-LED-16 | 16 | Allocation/usage for archived employee or inactive type; reversal for same | Denied; Allowed |
| TC-RULES-LED-17 | 17 | Wrong year, dates outside year, `dateFrom > dateTo`, malformed date | Denied |
| TC-RULES-LED-18 | 18 | Days 0, −1, 0.3, 366 | Denied |
| TC-RULES-LED-19 | 19 | Wrong delta sign/type combination | Denied |
| TC-RULES-LED-20 | 20 | Spoofed `createdBy`, `createdByName`, `createdAt` | Denied |
| TC-RULES-LED-21 | 21 | Two ledger entries, one balance write | Denied |
| TC-RULES-LED-22 | 22 | Balance ID not matching employee/year/type; float year | Denied |
| TC-RULES-LED-23 | 25 | Extra/missing fields on ledger/balance | Denied |
| TC-RULES-LED-24 | 27 | Re-create an existing transaction ID | Denied |
| TC-RULES-LED-25 | V-8 | Measure access calls for allocation/usage/reversal commits | Within limits (record counts in Progress) |
| TC-RULES-LED-26 | V-1…V-10 | Dedicated micro-tests of each construct in Security §6.7 | All pass or deviation logged |

### B.13 Accessibility and UX (TC-A11Y / TC-UX)

| ID | Level | Scenario | Expected |
|---|---|---|---|
| TC-A11Y-01 | M | Keyboard-only: login, add employee, allocate, record, reverse, export | Fully operable; focus visible; logical order |
| TC-A11Y-02 | M | Contrast spot checks per UI §2.3 | Meets ratios |
| TC-A11Y-03 | C | Form errors linked by `aria-describedby`; `aria-invalid`; first invalid focused | |
| TC-A11Y-04 | C | Dialogs trap focus and restore it; Esc ignored while pending | |
| TC-A11Y-05 | M | 200 % zoom and 320 px width | No horizontal page scroll; tables scroll internally |
| TC-A11Y-06 | C | Badges carry text/icon, never color alone | |
| TC-UX-01 | C | Every data view implements loading, empty, error (Retry), success | |
| TC-UX-02 | M | Responsive checks at 1440 / 1024 / 768 / 390 px | Per UI §13 |
| TC-UX-03 | C | Document titles update per route | |

### B.14 Edge cases (EC) — covered by the tests above or added as named cases

| ID | Edge case | Expected / covered by |
|---|---|---|
| EC-01 | Allocation of 0.5; usage of 0.5 on a single date | TC-CR-05, TC-LU-08 |
| EC-02 | Usage on Jan 1 and Dec 31 of the year | Accepted (in-year bounds inclusive) |
| EC-03 | Leave year boundary range (Dec 31 → Jan 1) | TC-LU-06 |
| EC-04 | Feb 29 in leap/non-leap years | TC-LU-10 |
| EC-05 | Employee renamed after entries exist | BR-EMP-07; report shows current name; audit shows snapshot |
| EC-06 | Employee ID changed after entries exist | TC-EMP-05 |
| EC-07 | Leave type renamed / deactivated with balances | TC-LT-03/04 |
| EC-08 | Balance reaches 0, then a usage is reversed | Available returns; "Depleted" badge clears |
| EC-09 | Reverse usage on an archived employee | TC-REV-06 |
| EC-10 | Session expires or account deactivated during submit | TC-AUTH-09; no partial writes (TC-CONC-03) |
| EC-11 | Network drop mid-commit | TC-DUP-05 |
| EC-12 | Browser in a different time zone | TC-LU-12 |
| EC-13 | Large year: 10,000 ledger entries | Report loads with progress; history paginates; no full-ledger table load |
| EC-14 | Year with no data | Empty states everywhere (TC-SUM-03, TC-DASH-07) |
| EC-15 | Same employee allocated in two browser tabs | TC-CONC-02 |
| EC-16 | Remarks containing `<script>`, emoji, or `=SUM(A1)` | Rendered as text; Excel string cell (TC-RPT-04) |
| EC-17 | Pagination boundaries (exactly 25 rows; 26 rows; last page empty after filter) | Counts and Load-more behave |
| EC-18 | Two allocations for the same balance in one second | Distinct IDs; both recorded; ordering by `createdAt` then document ID |
| EC-19 | Whitespace-only remarks or names | Trimmed to empty → treated as `null`/rejected per field |
| EC-20 | Reversing the only allocation on a balance that has no usage | Balance becomes 0/0/0 (document remains); excluded from low-balance list |

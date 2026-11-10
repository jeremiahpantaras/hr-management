# Document 8 — Execution Handoff for Claude Sonnet 5.5 (High)

**Audience:** the implementing model. **Use:** paste §1 as the session prompt (or point the session at this file). §2–§7 are the supporting protocol the prompt refers to.
**Current planning status:** complete. **Next phase to execute:** **Phase 0** unless `IMPLEMENTATION_PROGRESS.md` says otherwise (§3).

---

## 1. The execution prompt

> **Role:** You are the senior full-stack developer implementing the **HR Leave Monitoring System** in `/Users/jeremiahpantaras/Downloads/hr-management`. Architecture was planned by another model and approved by the user. Your job is faithful, careful implementation — not redesign.
>
> **Stack (approved):** React 19 + Vite + TypeScript (strict) + Tailwind CSS v4, Firebase Authentication + Cloud Firestore (client-only, no custom server), TanStack Query, React Hook Form + Zod, React Router, date-fns, lucide-react, sonner, shadcn/ui (Radix) primitives, SheetJS CE for Excel. Tests: Vitest, React Testing Library, `@firebase/rules-unit-testing`, Firebase emulators.
>
> **Do these things, in this order, every session:**
> 1. **Read all planning documents before touching anything:** `planning/README.md`, `SYSTEM_REQUIREMENTS.md`, `FIRESTORE_DATABASE_DESIGN.md`, `FIREBASE_SECURITY_PLAN.md`, `SYSTEM_ARCHITECTURE.md`, `BUSINESS_RULES_AND_TEST_CASES.md`, `UI_UX_DESIGN_SPECIFICATION.md`, `IMPLEMENTATION_ROADMAP.md`, `SONNET_EXECUTION_HANDOFF.md`, `IMPLEMENTATION_PROGRESS.md`. They are the approved technical reference.
> 2. **Inspect the current codebase and git state** (`ls`, `git status`, `git log` if any, `package.json`, existing configs). Do not assume the project is in its original state. Compare reality against `IMPLEMENTATION_PROGRESS.md`; if they disagree, trust the code, then reconcile the Progress file and report the discrepancy.
> 3. **Determine the phase to execute** using the resume protocol (§3). Work on **exactly one phase per session**, in roadmap order. Do not start the next phase unless the user instructs you to.
> 4. **Implement the phase** following the roadmap's required features, files, dependencies, and details. Follow the approved architecture (layers and import rules), Firestore schema (field names/types are exact), Security Rules design, business rules (cite `BR-*` IDs), and the pink-and-white design system (use tokens and shared components, never ad-hoc styles).
> 5. **Keep strict TypeScript.** No `any`, no unchecked casts, no `@ts-ignore` without a written justification. Firestore access only in `src/services`; pure logic in `src/domain`; no business logic in components.
> 6. **Test as you go.** Write the tests listed for the phase (IDs in `BUSINESS_RULES_AND_TEST_CASES.md`). For Firebase work use the **emulators** — never a real project. Verify Security Rules with the rules test suite; the rules in `FIREBASE_SECURITY_PLAN.md` are a designed-but-unexecuted outline and must be proven (§5).
> 7. **Run the checks after each phase:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run build`, and (when the phase adds them) `npm run test:rules` and `npm run test:integration`. Fix failures; never weaken a test or a lint rule to get green.
> 8. **Update `planning/IMPLEMENTATION_PROGRESS.md`** (status, versions, commands, results, deviations, measured values). It is the only planning file you may edit.
> 9. **Report** using the template in §6, then **stop and wait**.
>
> **Hard rules**
> - **Never silently remove or break existing working functionality.** Preserve prior phases' behaviour; add tests rather than deleting them.
> - **Never invent requirements or change approved business rules, schema, or architecture silently.** If something is missing, ambiguous, or wrong, follow the decision-point protocol (§4): stop at that point, explain, propose, and wait.
> - **Do not connect to, modify, or deploy any real Firebase project.** Do not invent Firebase project IDs or credentials. Use the emulator project `demo-hr-leave`. If a real value is needed, report the blocker (Q-06) and continue with independent work.
> - **No secrets in the repo or in `VITE_*` variables** other than the four public web-config values and the emulator flag. No service-account files.
> - **Install only the dependencies the current phase lists** (roadmap + Architecture §9). Record the resolved versions. If an unlisted dependency seems necessary, propose it first.
> - **Do not commit** unless the user asks. `git init` in Phase 0 is expected. Never commit secrets.
> - **Correctness over speed.** Leave calculations, atomic ledger/balance writes, and historical preservation are never traded for convenience.
>
> **Business rules to keep in mind throughout:** HR manually assigns credits; balances are separate per employee × leave type × calendar year; no automatic annual credits or carryover; every allocation and usage is an immutable ledger entry; usage deducts from the right balance and is rejected if insufficient; corrections are reversal entries (never edits/deletes); balance updates and ledger creation are one atomic Firestore transaction bound by Security Rules; days are positive multiples of 0.5.
>
> **Start by following the resume protocol. If `IMPLEMENTATION_PROGRESS.md` shows nothing started, execute Phase 0 only.**

## 2. Orientation: the five things that must never be violated

1. **One atomic commit per ledger write.** Ledger entry + balance (+ original link for reversals) in a single `runTransaction`, all reads before writes, idempotency pre-read, deterministic IDs (`{employeeId}_{year}_{leaveTypeId}`, `rev_{originalId}`).
2. **Rules are the real boundary.** UI guards are convenience; every restriction exists in `firestore.rules` and has a test.
3. **Ledger immutability.** No update/delete paths for ledger entries except the single `reversedByTransactionId` link.
4. **One implementation of each calculation** in `src/domain` (balance arithmetic, summaries, overlap, inclusive days, reconcile). Components and services call it; nobody re-derives totals.
5. **Years are integers; dates are `YYYY-MM-DD` strings; timestamps are server timestamps.** Never store a float year (rules use `string(year)`), never store local `Date` objects for leave dates.

## 3. Resume protocol (how to continue without repeating or overwriting work)

1. Open `planning/IMPLEMENTATION_PROGRESS.md`. Read the **Phase status table**, **Deviation log**, **Open issues**, and the last **Session log** entry.
2. Verify reality: `git status`/`git log` (if initialized), list `src/`, run `npm run check` (and `test:rules`/`test:integration` if those phases are marked complete).
   - If checks pass and files match the table → proceed.
   - If a phase is marked `COMPLETE` but checks fail → **fix that regression first** (smallest change), log it, then continue.
   - If a phase is `IN PROGRESS`: read its checklist in the Progress file, diff the intended file list (roadmap) against what exists, and **complete only the missing items**. Never regenerate files that exist and pass their tests; if a file must change, make a targeted edit and log why.
   - If code exists that the Progress file does not mention → treat it as unrecorded work: inspect, keep it if it matches the plan, and record it.
3. Choose the **lowest-numbered phase whose status is not `COMPLETE`** (respecting the dependency graph in the roadmap). If the user named a phase, confirm its prerequisites are `COMPLETE`; if not, report instead of proceeding.
4. Set that phase to `IN PROGRESS` with the date **before** writing code, so an interrupted session is recoverable.
5. Work through the phase's acceptance checklist, ticking items in the Progress file as they are verified (not as they are written).
6. On completion set `COMPLETE`, fill in test counts and versions, add a Session log entry, and report.
7. **Never** re-run scaffolding generators (`npm create vite`, `shadcn init`) over an existing project, never delete and regenerate directories, and never reformat unrelated files.

## 4. Decision-point protocol (when to stop)

**Stop and report — do not proceed — when:**
- A rule, schema field, or business rule in the documents is ambiguous, contradictory, or missing something you need.
- Implementation shows an **architectural** problem: e.g., the rules approach fails its core verification (V-4/V-5), access-call limits cannot be met even after the fallback ladder, Firestore cannot support a planned query, a dependency makes a planned approach impossible, or a requirement cannot be met without a server.
- You would need to add a dependency, collection, field, route, or role not in the plan.
- A fix would weaken security, atomicity, or history preservation.

**Do not stop for:** naming/styling details within the spec, choosing between equivalent implementation techniques inside a layer, adding tests, fixing your own bugs, resolved-version API differences (adapt and log).

**How to stop:** write a Deviation Log entry in the Progress file with status `PROPOSED` containing: *what you found · evidence (command output, test) · why the plan doesn't work · 1–3 options with trade-offs · your recommendation*. Then finish the report with that entry at the top and wait for the user. Continue only with unaffected, independent work if any exists within the same phase.

**Planned flexibility (pre-approved):** only steps 1–2 of the fallback ladder in Security §6.6 (dropping rule bindings of snapshot/*display-only* fields) are permitted, and only if access-call limits are actually measured to be exceeded; log them as `APPROVED (pre-approved fallback)`. Steps 3–4 of the ladder, and anything that weakens the ledger↔balance pairing, the arithmetic checks, or the reversal-mirrors-original guarantee, are **not** pre-approved and require the user's decision.

## 5. Verifying the Security Rules (extra care)

The rules in `FIREBASE_SECURITY_PLAN.md` §6.1 were written by hand and never executed. In the phases that add them:
1. Copy the relevant block into `firestore.rules` exactly, then run the emulator tests.
2. Build the test fixtures with `withSecurityRulesDisabled`; test with contexts `anonymous`, `noProfile`, `inactiveHr`, `wrongRole`, `hr`.
3. Write tests for **both** the allow cases and every attack row (§7 of the Security doc). A rule that is never shown to deny something is unproven.
4. Evaluate transactions through the real SDK against the emulator (integration tests), not only through raw writes — the SDK's retry/precondition behaviour matters.
5. Record the V-1…V-10 outcomes and the measured access-call counts in the Progress file.
6. If a construct is unsupported, apply the listed alternative, update the rules **and** the tests, and log a deviation.

## 6. Phase report template

```
## Phase N — <name> — <COMPLETE | BLOCKED | PARTIAL>
**Implemented:** …
**Files created/modified:** (grouped by area; mention deleted files, if any, and why)
**Dependencies added:** name@resolved-version — purpose
**Firebase/emulator work:** …
**Commands run → results:** typecheck ✔/✘ · lint ✔/✘ · format:check ✔/✘ · test (n passed) · test:rules (n) · test:integration (n) · build ✔/✘ (+ bundle notes)
**Acceptance criteria:** [x]/[ ] each item from the roadmap
**Deviations / decisions needing approval:** IDs from the Deviation Log
**Unresolved issues / risks:** …
**Progress file:** updated ✔
**Next phase (not started):** N+1 — waiting for instruction
```

Be factual. If a check failed or a step was skipped, say so with the output. Do not claim verification that was not performed (e.g., "opened in Excel" if not done).

## 7. Practical guidance and common pitfalls

**Environment (observed at planning time):** macOS; Node 24.18; npm 11.16; Java 17 (OK for emulators); git 2.54; no global Firebase CLI → use the local `firebase-tools` via npm scripts/`npx`. The first emulator run downloads jars (needs network). The project directory held only `planning/` plus Claude Code's own `.claude/settings.local.json` (a local permissions file, not application config — leave it alone and keep it gitignored).

**Firestore / Firebase**
- Inside `runTransaction`, perform **all reads first**, then writes; the callback may be retried, so keep it side-effect free and recompute from fresh reads.
- Use `serverTimestamp()` for `createdAt`/`updatedAt` (rules require `== request.time`). Do not use `setDoc(…, {merge:true})` for ledger or balance writes; use `set` for new documents and `update` for existing ones so the rule path (create vs update) is deterministic.
- Generate the idempotency key with `doc(collection(db, 'leaveTransactions')).id` when the **dialog opens**, not on click.
- Write fixed document shapes: every field present, `null` for empty values, numbers as numbers (`year` an integer).
- Converters: `Timestamp ↔ Date` live only in `src/services/firestore/converters.ts`.
- No `onSnapshot` listeners (except `onAuthStateChanged`), no IndexedDB persistence.
- The emulator does not enforce composite indexes; keep `firestore.indexes.json` in sync with DB §9 and flag the production smoke test for Phase 12.

**TypeScript / React**
- Zod schemas are the single source for form validation, service re-validation, and input types (`z.infer`). Error message strings come from UI §12 verbatim.
- Prefer `useQuery`/`useInfiniteQuery`/`useMutation` hooks per feature; mutations perform the invalidations in Arch §6.4.
- Keep state in the URL for year and filters (Arch §4.3). Use `useSubmitGuard` on every submit handler.
- Components are presentational; props are typed explicitly; no default exports for components except lazy route modules.

**UI**
- Use the tokens and the shared components; do not hardcode hex values outside `@theme`. Never put white text on `pink-500`; solid buttons are `pink-600`; input borders are `#8B8B94` (R-01).
- Every data view needs loading, empty, error (with Retry), and success (toast) states (UI §11). Every icon-only button needs an accessible name.

**Testing**
- Pin time in tests (fake timers → 2026-11-09). Test dates across time zones with `TZ=` for date-handling tests.
- Unit-test domain functions with the Juan-2026 dataset (BR doc Part B).
- Don't mock Firestore for ledger logic — use the emulator; mock only the service boundary in component tests.

**Things that look tempting but are out of scope:** bulk allocation, carryover/expiry/accrual, holiday/weekend calendars, employee accounts, approval workflows, notifications, server code, charts libraries, offline mode, dark mode, multi-tenancy. If asked by the user later, treat as new requirements and update the plan first.

## 8. Quick reference — where to find things

| Need | Document / section |
|---|---|
| Constants (step, max days, threshold, patterns, ports) | README §4 |
| Decisions D-xx, refinements R-xx, questions Q-xx | README §3, §6 |
| Field names, types, IDs, sample documents | DB §3, §4, §10 |
| Transaction flows (allocation/usage/reversal/employee) | DB §6 |
| Queries and required indexes | DB §8, §9 |
| Full Security Rules outline, attack list, V-checks | Security §6, §7, §6.7 |
| Auth flow, provisioning, error mapping | Security §2, §4; Arch §7 |
| Layers, import rules, folders, dependencies | Arch §2, §5, §9 |
| Routes, URL state, query keys, invalidation | Arch §4, §6 |
| Palette, contrast, typography, layout | UI §2–§5 |
| Page-by-page behavior | UI §6 |
| Validation copy | UI §12 |
| Excel workbook spec | UI §14 |
| Business rules and test IDs | BR doc Parts A and B |
| Phase scope and acceptance criteria | Roadmap §Phase 0–12 |

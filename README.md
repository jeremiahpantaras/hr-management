# HR Leave Monitoring System

A web app for HR to track employee leave credits and usage: assign each employee's leave credits for the
year, record leave taken, correct mistakes through reversals, and export reports to Excel. It replaces
spreadsheet tracking. One role — **HR administrator** — and no public sign-up.

React 19 · Vite · TypeScript (strict) · Tailwind v4 · Firebase Authentication + Firestore (no server code).

> **Status:** all twelve implementation phases are built and verified against the **Firebase emulators**.
> Nothing has been deployed and no production Firebase project has been touched. See
> [Going live](#going-live) for what is left for the project owner.

## Quick start (local, emulators only)

Requirements: Node ≥ 22.22, npm, Java 17+ (for the Firestore emulator).

```bash
npm install
npm run emulators            # Auth :9099, Firestore :8080, Emulator UI :4000 (separate terminal)
npm run seed:emulator -- --with-test-users   # demo HR admin: hr.admin@example.test / Password123!
npm run dev                  # http://localhost:5173
```

`.env.development` holds **emulator-only demo values** (project `demo-hr-leave`) and is committed on purpose.
Real Firebase values must never go in it. `npm run verify:env` fails if anything overrides the demo
configuration. Real project values, when the time comes, belong in `.env.development.local` (git-ignored; not `.env.local`, which `.env.development` outranks).

## Scripts

| Script                                  | What it does                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview`     | Vite dev server / production build / preview                                              |
| `npm run check`                         | typecheck + lint + unit/component tests + build                                           |
| `npm test`                              | unit and component tests (Vitest, jsdom)                                                  |
| `npm run test:rules`                    | Security Rules tests (Firestore emulator via `emulators:exec`)                            |
| `npm run test:integration`              | real services against the Auth + Firestore emulators                                      |
| `npm run emulators`                     | start the emulators for manual work                                                       |
| `npm run seed:emulator`                 | create demo accounts (`--with-test-users`) / sample employees (`--with-sample-employees`) |
| `npm run reconcile:emulator`            | recompute every balance from the ledger and report differences (emulator only)            |
| `npm run verify:env`                    | assert the dev environment is demo-only                                                   |
| `npm run format` / `lint` / `typecheck` | tooling                                                                                   |

## How it works

- **Ledger first.** `leaveTransactions` is an append-only ledger; `leaveBalances` are materialised totals written
  in the **same atomic commit** as each entry. Credits are _allocated_ (always as a new entry), leave is _used_,
  and a mistake is fixed with a **reversal** entry — nothing is ever edited or deleted.
- **The Security Rules enforce the arithmetic.** A ledger entry cannot be written without its balance update, and
  vice versa; the new totals must equal the stored totals plus the entry's deltas; usage cannot exceed what is
  available; reversals must mirror the original and can happen only once. A modified client cannot cheat.
- **Idempotent writes.** Each dialog session generates one transaction id, so a retry or double click records once.
  Reversal ids are deterministic (`rev_{id}`).
- **Authorization** is the `users/{uid}` document (`role == 'hr_admin' && isActive`), checked by the rules on every
  request, so deactivating a user takes effect on their next action.
- Half days are supported (0.5 steps, exact in floating point). Leave dates are plain `YYYY-MM-DD` strings, so
  they never shift with time zones.

Full design: [`planning/`](planning/) (requirements, architecture, database, security, UI, roadmap, business rules).
Build history, deviations and verification evidence: [`planning/IMPLEMENTATION_PROGRESS.md`](planning/IMPLEMENTATION_PROGRESS.md).

## Employees: select, archive, restore, delete

Tick employees (or the header box for the whole page, then **Select all N matching**) to get a bar with **Archive**,
**Restore** and **Delete**. Archiving is the normal way to retire someone and is always reversible. **Delete is
permanent** and only works for employees with **no leave records**; anyone with a balance or history is named in the
confirmation and kept. Deleting also frees the Employee ID. If you change `firestore.rules`, re-deploy them
(`firebase deploy --only firestore:rules`) or deleting will be refused by the server.

## Employees: import and export (Excel)

On the Employees page, **Export** downloads the current view (or everyone, archived included) as an `.xlsx`
laid out for printing on **Letter or A4**, landscape or portrait: one page wide, header row repeated on every
page, page numbers in the footer. **Import** takes an `.xlsx` (download the template first), shows a verdict for
every row _before_ saving anything, and then creates only the valid rows — existing employees are never changed and
duplicate Employee IDs (any case, archived included) are skipped. Limits: 500 employees and 5 MB per file. An
exported file can be imported again.

## Leave credits report (Excel)

**Reports** produces the sheet your HR team already uses, one row per employee: **NAME · POSITION · LOCATION · TOTAL
NO. OF UNUSED LEAVE CREDITS · JAN…DEC · TOTAL OF USED LEAVE · TOTAL REMAINING LEAVES**, under a title such as
`BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026` and the blue _EMPLOYEE'S INFORMATION_ / red _USED CREDITS AND DATE_ bands.
An employee who has used every credit gets a dark row with white text. Pick the year, the "as of" month, an optional
single employee and **Letter or A4** (landscape or portrait): it fits one page wide, repeats the three header rows on
every page and numbers the pages. The title is editable and remembered. Each month holds the days whose leave
**starts** in that month (reversed entries cancel out); there are no leave types — every employee has one pool of
credits per year. The same figures are shown on screen under **Preview**, so the screen and the file cannot disagree.

## Project layout

```
src/app          router, providers, guards          src/domain     pure business logic (no Firebase, no React)
src/components   ui · layout · data · form · feedback   src/services   the only code that talks to Firebase
src/features     auth · employees · leave-credits · leave-usage · leave-history ·
                 dashboard · reports · settings      src/utils/excel  workbook builder (SheetJS, lazy-loaded)
tests/rules      Security Rules tests               tests/integration  service tests on the emulators
firestore.rules  firestore.indexes.json  firebase.json (emulators + hosting config, not deployed)
```

## Going live

The implementation phases never deploy. The project owner does these steps (details in
[`planning/FIREBASE_SECURITY_PLAN.md`](planning/FIREBASE_SECURITY_PLAN.md) §2.1):

1. Create the Firebase project; enable **Email/Password** (and **Google** if you want the "Continue with Google" button); **disable self sign-up**; keep **email enumeration
   protection on**; set authorized domains.
2. Create the first HR user in Authentication, then its `users/{uid}` document (`uid`, `fullName`, `email`,
   `role: 'hr_admin'`, `isActive: true`, `createdAt`/`updatedAt` as **timestamps**).
   Google sign-in only proves identity — a Google account still needs its `users/{uid}` profile. With sign-up disabled,
   the Google email must already exist in Authentication (or match an existing email/password user, which Firebase links).
3. Put the web config in `.env.development.local` (`VITE_FIREBASE_*`, and `VITE_USE_FIREBASE_EMULATORS=false`). Optionally
   restrict the API key by HTTP referrer.
4. Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes` — **then run a production
   smoke test** (allocate → record → reverse → dashboard → report). The emulator does not enforce composite
   indexes, so a missing one only shows up against a real project.
5. Verify the `hosting` block in `firebase.json` (SPA rewrite, security headers, `index.html` `no-store`). The
   Content-Security-Policy was written from the Firebase SDK's documented endpoints and has **not** been exercised
   against a real project — check the browser console for blocked requests and adjust.
6. Decide on backups: scheduled Firestore backups need the Blaze plan; until then the Excel export is the backup.
7. Keep `firebase-tools` at 14.27.0 unless you install JDK 21+ first (newer CLI versions require it).

## Deploying to Vercel

The site is static, so Vercel only serves the built files; Firebase still provides login and the database.

1. Push the repo to GitHub (check `git status` first: no `.env*` file other than `.env.example` and
   `.env.development` should be listed) and import it in Vercel. `vercel.json` already sets the build
   (`npm ci` → `npm run build` → `dist`), the SPA rewrite and the security headers.
2. Vercel → Settings → General → **Node.js Version: 22.x** (the project needs ≥ 22.22).
3. Vercel → Settings → **Environment Variables** (Production and Preview): `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and
   `VITE_USE_FIREBASE_EMULATORS=false`. These are the only place the real config lives for the deployed site;
   they are baked into the build, so **redeploy after changing them**.
4. Firebase console → Authentication → Settings → **Authorized domains**: add your Vercel domain(s)
   (e.g. `your-app.vercel.app`), or **Continue with Google** will fail on the deployed site.
5. After the first deploy open the browser console on the site and sign in once: the Content-Security-Policy
   in `vercel.json` has not been exercised against a real project, so look for blocked requests.
6. Recommended: restrict the web API key by HTTP referrer (Google Cloud Console → Credentials) to your
   domain(s) and `localhost`.

`tests/unit/deployConfig.test.ts` guards this setup: credential files and env variants stay git-ignored, no file
Git would commit contains a Firebase API key or a real `*.firebaseapp.com` domain, and Vercel and Firebase Hosting
ship the same headers.

## Known limitations

Client-only by design (no Cloud Functions): a compromised HR account can still write _valid-looking but wrong_
data, which the immutable ledger and reversal trail make visible but cannot prevent. The employee directory is
searched in the browser and is sized for roughly 2,000 employees. Fiscal years, carry-over, accrual, bulk
allocation and multi-role access are out of scope. See `planning/SYSTEM_REQUIREMENTS.md` §9.

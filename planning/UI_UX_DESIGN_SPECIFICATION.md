# Document 5 — UI/UX Design Specification

Decisions D-11/D-13 and refinement R-01 in [README.md](README.md). Data and queries behind each screen: [FIRESTORE_DATABASE_DESIGN.md §8](FIRESTORE_DATABASE_DESIGN.md). Copy and validation rules: §12 here and [BUSINESS_RULES_AND_TEST_CASES.md](BUSINESS_RULES_AND_TEST_CASES.md).

Application name in the UI: **HR Leave Monitor**. Document title pattern: `{Page} · HR Leave Monitor`.

---

## 1. Visual direction

A modern, professional HR administration dashboard: **white-dominant, clean, organized, approachable**. Pink is a deliberate accent, not a flood **[Confirmed]**.

| Pink is used for | Neutral (white/zinc) is used for |
|---|---|
| Primary buttons, active navigation, selected tabs, focus rings, progress fills, key highlights, small accents (logo tile, avatar) | Page canvas, cards, tables, inputs, dialogs, body text, borders |

Rules of thumb: at most one primary (solid pink) button per view region; no pink body text on white except links at pink-600 or darker; no full-pink panels; no gradients except one very soft pink-50 → white wash behind the login card. Dark mode is out of scope (white/pink theme only).

## 2. Color palette and tokens

### 2.1 Brand pink scale

| Token | Hex | Role |
|---|---|---|
| `pink-50` | `#FDF2F8` | Soft background (brief) — table header, active nav bg, banners, hover tint |
| `pink-100` | `#FCE7F3` | Selected rows, avatar bg, badge bg |
| `pink-200` | `#FBCFE8` | Progress track on pink surfaces, subtle pink borders |
| `pink-300` | `#F9A8D4` | Decorative only |
| `pink-400` | `#F472B6` | Secondary pink (brief) — secondary fills, hover accents |
| **`pink-500`** | **`#E85D9E`** | **Primary brand (brief)** — active-nav indicator bar, focus ring, progress fill, icons, logo tile |
| **`pink-600`** | **`#C7357A`** | **Solid button background, text links on white** (≈5.0:1 with white) |
| `pink-700` | `#A82A66` | Button hover; pink text on pink-50 (≈6:1) |
| `pink-800` | `#8A2155` | Button pressed |
| `pink-900` | `#701C47` | Strong pink text on light pink |

### 2.2 Neutrals and semantics

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#FFFFFF` | Page background (brief) |
| `surface` | `#FFFFFF` | Cards, dialogs, sidebar, inputs |
| `surface-muted` | `#FAFAFA` | Subtle section backgrounds, disabled fields |
| `text` | `#18181B` | Main text (brief) |
| `text-muted` | `#52525B` | Secondary text (zinc-600) — **replaces the brief's `#71717A` for text on tinted surfaces** (see contrast table) |
| `text-subtle` | `#71717A` | Placeholders and tertiary text **on pure white only** |
| `border` | `#F3E8EF` | Card/section borders (brief) — decorative |
| `border-strong` | `#E4E4E7` | Table row dividers |
| `input-border` | `#8B8B94` | Form-control boundary (**R-01**, ≥ 3:1) |
| `success` | text `#15803D` on `#F0FDF4` | Active, success |
| `warning` | text `#92400E` on `#FFFBEB` | Low balance, overlap warning |
| `danger` | text `#B91C1C` on `#FEF2F2`; solid `#DC2626` + white text | Errors, depleted, destructive actions |
| `neutral-badge` | text `#3F3F46` on `#F4F4F5` | Employment status, archived |

### 2.3 Contrast verification (WCAG 2.2 AA)

Computed relative-luminance ratios (to be re-verified with a contrast tool in Phase 1):

| Pair | Ratio | Requirement | Use |
|---|---|---|---|
| `text` #18181B on white | ≈ 17.7 : 1 | 4.5 | Body ✔ |
| `text-muted` #52525B on white / on pink-50 | ≈ 7.7 / 7.1 : 1 | 4.5 | Secondary text ✔ |
| `text-subtle` #71717A on white | ≈ 4.8 : 1 | 4.5 | Placeholder ✔ (white only) |
| #71717A on pink-50 | ≈ 4.4 : 1 | 4.5 | ✘ **never** on tinted surfaces |
| White on `pink-600` #C7357A | ≈ 5.0 : 1 | 4.5 | Primary button text ✔ |
| White on `pink-500` #E85D9E | ≈ 3.2 : 1 | 4.5 | ✘ **never for text** |
| `pink-500` on white | ≈ 3.2 : 1 | 3.0 (non-text) | Focus ring, indicator bar, progress fill, icons ✔ |
| `pink-700` on `pink-50` | ≈ 6.0 : 1 | 4.5 | Active nav text ✔ |
| `input-border` #8B8B94 on white | ≈ 3.4 : 1 | 3.0 (1.4.11) | Control boundary ✔ |
| `success` / `warning` / `danger` text on their tints | ≈ 4.8 / 7 / 6 : 1 | 4.5 | Badges ✔ |

### 2.4 Token implementation (Tailwind v4, `src/styles/index.css`)

Tokens are declared once in an `@theme` block (CSS custom properties become utilities). Components use **semantic** utilities (`bg-primary`, `text-muted`, `border-input`) mapped to the values above; raw hex values appear only in the `@theme` block.

```
@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --color-pink-50: #FDF2F8;  … --color-pink-900: #701C47;
  --color-primary: var(--color-pink-600);          --color-primary-hover: var(--color-pink-700);
  --color-accent: var(--color-pink-500);           --color-ring: var(--color-pink-500);
  --color-text: #18181B; --color-text-muted: #52525B; --color-text-subtle: #71717A;
  --color-border: #F3E8EF; --color-border-strong: #E4E4E7; --color-input: #8B8B94;
  --radius-control: 0.5rem; --radius-card: 0.75rem; --radius-dialog: 1rem;
}
```
The shadcn components are generated with the "neutral" base and then re-pointed to these tokens (`--primary` = pink-600, `--ring` = pink-500, `--accent` = pink-50).

## 3. Typography

| Style | Spec |
|---|---|
| Typeface | **Inter Variable**, self-hosted via `@fontsource-variable/inter`; system sans fallback |
| Page title (h1) | 24 / 32 px, 600, tracking −0.01em |
| Section title (h2) | 18 / 28 px, 600 |
| Card/dialog title (h3) | 16 / 24 px, 600 |
| Body, tables, buttons, inputs | 14 / 20 px (inputs 16 px below 640 px to prevent iOS zoom) |
| Small / captions / helper | 12 / 16 px, `text-muted` |
| Stat figure | 28 / 32 px, 600 |
| Numeric columns and figures | `font-variant-numeric: tabular-nums`, right-aligned in tables |

Weights used: 400, 500, 600 only. Sentence case everywhere except proper nouns. No all-caps labels except the table header (12 px, 600, `tracking-wide`, uppercase, `text-muted`).

## 4. Spacing, radius, elevation

- **4 px grid.** Common steps: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
- Page gutter: 16 px (< 640), 24 px (640–1023), 32 px (≥ 1024). Section gap 24 px. Card padding 20 px (16 on mobile). Form field gap 16 px. Table cell padding 12 × 16 px.
- Radius: controls 8 px · cards 12 px · dialogs/sheets 16 px · badges/avatars full.
- Elevation: cards `shadow-sm` (`0 1px 2px rgb(24 24 27 / .04)`) + 1 px `border`; dropdowns `shadow-md`; dialogs `shadow-lg` over a `zinc-900/40` overlay. Shadows are never pink.

## 5. Layout system

### 5.1 Breakpoints and shell

| Width | Sidebar | Header | Content |
|---|---|---|---|
| ≥ 1024 | Fixed, 256 px, always visible | 64 px, sticky | max-width 1280, centered, gutter 32 |
| 768–1023 | Off-canvas drawer (288 px) opened by hamburger | 64 px | gutter 24; stat cards 2–3 per row |
| 640–767 | Drawer | 56 px | gutter 24 |
| < 640 | Drawer | 56 px | gutter 16; dialogs full-screen; tables scroll horizontally |

### 5.2 Sidebar (`AppSidebar`)

- Top: logo tile (32 px rounded-lg, `pink-500` fill, white `CalendarCheck` icon) + wordmark "HR Leave Monitor" (16 px, 600).
- Navigation (single list, `nav aria-label="Primary"`): **Dashboard** `LayoutDashboard` · **Employees** `Users` · **Leave Credits** `CalendarPlus` · **Leave Usage** `CalendarMinus` · **Leave History** `History` · **Reports** `FileSpreadsheet` · **Settings** `Settings`.
- Item: 40 px high, radius 8, 12 px icon-label gap. Default `text-muted`; hover `bg-zinc-50`; **active**: `bg-pink-50`, `text-pink-700`, icon `pink-600`, 3 px `pink-500` bar on the left edge, `aria-current="page"`. Sub-routes keep their parent active (e.g., `/employees/:id` highlights Employees).
- Bottom (pinned): user block — initials avatar (`pink-100` bg, `pink-700` text), name (14/500, truncated), "HR Administrator" caption; **Log out** button (ghost, `LogOut` icon). Logout is one click, no confirmation.
- Mobile drawer: same content in a left `Sheet`; closes on navigation and on Esc.

### 5.3 Header (`AppHeader`) and page header (`PageHeader`)

- **Header bar** (white, bottom `border`): hamburger (< 1024) · breadcrumbs (e.g., `Employees / Juan Dela Cruz`; the last crumb is plain text with `aria-current="page"`; hidden on the Dashboard) · right side: user menu (avatar + name; menu items *Account settings*, *Log out*).
- **PageHeader** (top of content): title (h1) · optional one-line description · right-aligned actions (primary action as the only solid pink button) · optional year selector and Refresh. On mobile actions wrap below the title and the primary button becomes full-width.

## 6. Page specifications

Conventions for every data page: loading skeleton → content / empty / error; filter state in the URL (§Arch 4.3); `Refresh` button where data may change externally; the selected **year is always displayed** next to figures.

### 6.1 Login (`/login`)

Centered 400 px card on white with a very soft `pink-50 → white` wash at the top. Logo + "HR Leave Monitor" · h1 "Sign in" · fields **Email** (`autocomplete="email"`), **Password** (`current-password`, show/hide toggle with `aria-pressed`) · link "Forgot password?" · full-width primary **Sign in** (pending: spinner + "Signing in…") · error alert above the form (`role="alert"`) · footer note "Access is limited to authorized HR personnel." **No sign-up link or text.** Enter submits. Redirects to the `from` location or `/`.

### 6.2 Forgot password (`/forgot-password`)

Email field + **Send reset link**. After submit (always, whatever the account state): success panel "If an account exists for that email, a reset link has been sent." + "Back to sign in". Invalid email and network errors are shown inline.

### 6.3 Access denied (`/access-denied`)

`ShieldAlert` icon, h1 "Access not available". Message by reason: *no profile* → "Your account hasn't been set up for this application."; *inactive* → "Your account has been deactivated."; *wrong role / error* → "You don't have permission to use this application." Both: "Contact your administrator." Primary action **Sign out**.

### 6.4 Dashboard (`/`)

```
┌ PageHeader: Dashboard                     [Year 2026 ▾] [⟳ Refresh] ┐
│ caption: "Leave figures for 2026 · includes archived employees' records"
├ Stat cards (5): Total Employees · Active Employees · Total Credits · Total Used · Total Unused
├──────────────────────────────┬───────────────────────────────────────┤
│ Leave usage by type          │ Low & depleted balances               │
│  Vacation  ▓▓▓░░ 3 / 10      │  Juan D. · Vacation  1.0 left [Low]   │
│  Sick      ▓▓░░░ 2 / 5       │  Ana R.  · Sick      0.0   [Depleted] │
├──────────────────────────────┴───────────────────────────────────────┤
│ Recent leave transactions (8)        │ Recent credit allocations (8)  │
├ Employee leave balances (paged, 10 active employees)  Employee | Total | Used | Unused | →
```
- **Stat cards** (`StatCard`): icon in a `pink-50` circle, label, figure, caption. Cards 3–5 show year totals from the aggregation query; "Total Used" shows "x% of credits" with a thin progress bar (`pink-500` fill on `pink-100`). Employee counts come from the cached list; caption "of N total" on Active.
- **Usage by type**: one row per leave type with credits/used/available and a CSS progress bar (no chart library, R-05). Inactive types with balances are included, marked "Inactive".
- **Low & depleted**: per employee × type, available ≤ `LOW_BALANCE_THRESHOLD`; badge **Low** (warning) or **Depleted** (danger, available = 0); each row links to the employee page for that year; active employees only.
- **Recent lists**: compact tables; "View all" links to Leave History / Leave Credits (allocation history) with the year preselected.
- **Empty (no credits in year)**: card "No leave credits have been allocated for 2026." with **Allocate credits** (primary).
- Queries: DB §8.7. Each widget has its own skeleton/error state so one failure doesn't blank the page.

### 6.5 Employees (`/employees`) — includes Add / Edit dialogs

- **PageHeader**: "Employees" · **Add employee** (primary).
- **Toolbar**: `SearchInput` ("Search by name or employee ID", debounced 250 ms) · status `FilterDropdown` (All statuses + `EMPLOYMENT_STATUSES`) · segmented control **Active | Archived | All** (default Active) · result count ("87 employees").
- **Table** columns: Employee ID · Complete name (link) · Position · Department ("—" if empty) · Employment status (neutral badge; + *Archived* badge when archived) · Actions (kebab menu: *View*, *Edit*, *Allocate credits*, *Record usage*, *Archive*/*Restore*). Allocate/Record items are hidden for archived employees. Sortable: Employee ID, Complete name, Position. Default sort: Complete name A–Z. Row click → detail.
- **Pagination**: client-side, 25 default (10/25/50), "Showing 1–25 of 87".
- **Add/Edit dialog** (md, 520 px): *Employee ID\**, *Complete name\**, *Position\**, *Department*, *Employment status\** (select). Cancel · Save employee. Duplicate Employee ID error appears under that field. Edit shows read-only Created/Updated stamps in the footer.
- **Archive** → `ConfirmDialog`: "Archive {name}? Their leave history is kept and appears in reports, but they won't be available when allocating credits or recording leave. You can restore them at any time." **Restore** is immediate with a toast.
- **Empty states**: no employees → "No employees yet" + Add employee; no matches → "No employees match your search" + Clear filters.

### 6.6 Employee detail / leave summary (`/employees/:employeeId`)

```
Breadcrumbs: Employees / Juan Dela Cruz
┌ Header block: [JD] Juan Dela Cruz            [Edit] [Allocate credits] [Record usage] [Export Excel] [⋯ Archive]
│  EMP-0042 · Accounting Staff · Finance  · [Regular]              Year [2026 ▾]
├ Summary tiles: Total Credits 18 · Total Used 5 · Total Unused 13
├ Leave breakdown (LeaveBreakdownTable)
│  Leave type   | Total credits | Used | Unused | Usage
│  Vacation     |      10       |  3   |   7    | ▓▓▓░░░░░░░
│  Sick         |       5       |  2   |   3    | ▓▓▓▓░░░░░░
│  Emergency    |       3       |  0   |   3    | ░░░░░░░░░░
│  Total        |      18       |  5   |  13    |
├ Transaction history (newest first)          [Type ▾] [Leave type ▾]
│  Date recorded | Leave date(s) | Type | Leave type | Days | Remarks | Recorded by | ⋯
└ [Load more]
```
- Information block shows Complete Name, Employee ID, Position, Department, Employment Status (**[Confirmed]** fields).
- Breakdown rows: every **active** leave type plus any inactive type that has a balance; types without a balance show 0 / 0 / 0 in muted text with "No credits assigned". Totals row = `summarizeBalances()`.
- History row *Days* shows the **effect**: `+10 credits`, `−2 days`, `+1 day (reversal)`; type badge: *Allocation* (pink-50), *Usage* (neutral), *Reversal* (warning). Reversed entries show a **Reversed** badge and muted text; reversal rows link to the original ("Reversal of …"). Row action ⋯ → *View details* (Sheet), *Reverse…* (not on reversal rows or already-reversed rows).
- Archived employees: banner "This employee is archived. History is read-only." Allocate/Record disabled; Restore button replaces Archive. Reversal remains available (R-03).
- Year change reloads balances and history; the year is always visible.

### 6.7 Leave Credits (`/leave-credits`)

- PageHeader "Leave Credits" · year selector · **Allocate credits** (primary).
- Tabs: **Balances** | **Allocation history**.
- **Balances** tab: search, "Include archived" off by default; table of employees (25 per page): Employee · Total credits · Used · Unused · actions (*Allocate*, *View*). Each row expands (chevron, `aria-expanded`) to a compact per-type breakdown. Zero-credit employees show "—" with an *Allocate* shortcut. Data: DB §8.4.
- **Allocation history** tab: ledger list (`transactionType == ALLOCATION`) — Date recorded · Employee · Leave type · Credits added · Remarks · Recorded by · Status (*Reversed* badge) · *Reverse…* action. Filters: employee, leave type. Cursor pagination "Load more".

### 6.8 Credit allocation form (dialog from 6.5/6.6/6.7)

Fields: **Employee\*** (`EmployeeCombobox`, active employees only, searchable by name/ID) · **Leave type\*** (active types) · **Leave year\*** (default: page year) · **Credits to add\*** (`DaysField`, step 0.5) · **Remarks** (≤ 500, counter).
A live **preview strip** (once employee + type + year are chosen): "Current total: 10 → After this allocation: 12 (Vacation Leave, 2026)". Submit **Allocate credits**; on success toast "Added 2 Vacation Leave credits for Juan Dela Cruz (2026). New total: 12." Dialog opened from a row pre-fills employee (and year). A new idempotency key is generated each time the dialog opens.

### 6.9 Leave Usage (`/leave-usage`)

PageHeader "Leave Usage" · year · **Record leave usage** (primary). Filters: employee combobox · leave type · search remarks · leave-date range. Table: Date recorded · Employee · Leave type · Leave dates (`Feb 10 – Feb 11, 2026`; single day shown once) · Days · Remarks · Recorded by · Status · actions. Server-filtered, cursor-paginated (DB §8.5). Text search and date range apply to loaded rows; activating them shows "Searching loaded rows — Load all for 2026" with a button.

### 6.10 Record leave usage form (dialog)

Fields: **Employee\*** · **Leave type\*** · **Leave year\*** (default page year) · **Date from\*** · **Date to\*** (native `<input type="date">` constrained with `min`/`max` to the chosen year; no custom calendar library) · **Days to deduct\*** (`DaysField`, 0.5 steps) · **Remarks**.
- Helper under Days: "Calendar days in range: 3. Weekends and holidays are not excluded automatically — enter the number of days to deduct."
- **Balance strip:** "Vacation Leave · 2026 — Available 7 days. After this entry: 5." Turns `danger` with the text "Not enough credits: 1 available, 2 requested." and disables **Record leave** when insufficient or when no balance exists ("No Vacation Leave credits have been allocated to this employee for 2026" with a link to *Allocate credits*).
- **Overlap warning** (amber, appears on submit if overlaps exist): lists conflicting entries (dates, days, type) and a checkbox "Record anyway"; submit stays disabled until checked **[Q-10]**.
- Submit **Record leave**; success toast "Recorded 2 days of Vacation Leave for Juan Dela Cruz. Remaining: 5."

### 6.11 Leave History (`/leave-history`) and reversal

PageHeader "Leave History" · year. Filters: employee · leave type · transaction type (All / Allocation / Usage / Reversal) · leave-date range · search. Table columns: Date recorded · Employee · Leave type · Type · Leave date(s) · Days · Effect on balance · Remarks · Recorded by · Status/actions. Row click opens a right-side **Sheet** with every field: all IDs, name/position snapshots ("Name at time of entry" if different from current), balance after (`available after`), links between original and reversal.

**Reverse dialog** (`sm`): summary of the entry · effect preview ("Available will change from 7 to 8") · **Reason\*** (≥ 3 chars) · for USAGE entries a checkbox "Then enter a corrected record" · destructive-styled **Reverse entry** button (focus starts on Cancel). Blocked case shows an inline explanation: "Can't reverse this allocation: 3 of its 10 credits have already been used. Reverse the related usage entries first." After a successful reverse-and-correct, the persistent banner of DB §7.1 appears until the replacement is saved.

### 6.12 Reports (`/reports`)

```
┌ Filters ─────────────────────────────────────────────────────────┐
│ Year* [2026 ▾]  Employee [All employees ▾]  Leave type [All ▾]  [✓] Include archived │
│                                                  [Preview] [Download Excel (.xlsx)] │
├ Preview ────────────────────────────────────────────────────────┤
│ 3 employees · 7 balance rows · 14 transactions                     │
│ Totals (2026): Credits 54 · Used 15 · Unused 39      ✔ Reconciled  │
│ Workbook sheets: Report Info · Employee Summary · Leave Breakdown · Transactions │
```
- **Preview** loads the year (DB §8.8), runs reconciliation, and shows counts/totals; **Download** is enabled after a successful preview (or runs preview first). Large-year loads show a progress state "Loading 2026 records…".
- Mismatch banner (warning): "N balances don't match their transaction history. The export still includes both; see Report Info." — non-blocking.
- Individual export = select an employee (or arrive from the Employee page with `?employee=`). Workbook specification: §14.

### 6.13 Settings → Leave Types (`/settings/leave-types`)

`SettingsLayout` with tabs **Leave types** | **Account** (routes). Table: Name · Description · Status (*Active* success badge / *Inactive* neutral) · Actions (*Edit*, *Deactivate*/*Activate*). **Add leave type** (primary) → dialog (*Name\**, *Description*). Deactivate → ConfirmDialog: "Deactivate {name}? It will be hidden when allocating credits or recording leave. Existing balances, history, and reports are not affected." Empty state: "No leave types yet" + **Add leave type** and **Add starter types** (Vacation, Sick, Emergency — FR-LT-07). Footer note: "Credits are assigned manually by HR; this app does not apply any statutory entitlements."

### 6.14 Settings → Account (`/settings/account`)

Cards: **Profile** (email read-only, *Full name* editable, Save) · **Password** (*Current password*, *New password*, *Confirm new password*; Update password) · **Session** (Log out). Role shown as "HR Administrator" (read-only).

### 6.15 Not found / error boundary

Not found: "Page not found" + Back to dashboard. Error boundary: "Something went wrong" + Reload + (dev only) error details. Neither exposes stack traces in production.

## 7. Component inventory

All components live under `src/components` unless noted; presentational, typed props, forwarded refs where relevant, no data fetching.

| Component | Variants / key props | Notes |
|---|---|---|
| `Button` (ui) | `primary` (pink-600), `secondary` (white, border), `ghost`, `destructive` (red-600), `link`; sizes `sm 32 / md 40 / lg 44`; `loading`, `icon` | Pink-600 bg + white text; focus ring pink-500 |
| `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Tooltip`, `DropdownMenu`, `Dialog`, `Sheet`, `Popover`, `Skeleton` (ui) | shadcn/Radix, re-pointed to tokens | |
| `AppShell`, `AppSidebar`, `AppHeader`, `PageHeader`, `Breadcrumbs` (layout) | See §5 | |
| `StatCard` | `label`, `value`, `caption`, `icon`, `progress?`, `loading` | Figures tabular-nums |
| `DataTable<T>` | `columns`, `rows`, `getRowId`, `sort`, `onSortChange`, `onRowClick`, `loading`, `empty`, `stickyFirstColumn`, `caption` | Spec §8; no external table lib (R-05) |
| `Pagination` | client mode (page/size) and cursor mode ("Load more") | |
| `SearchInput` | debounced, clear button, `aria-label` | |
| `FilterDropdown` | single-select with "All" option; shows active filter chip | |
| `YearSelect` | binds `?year=`; `currentYear+1 … LEAVE_YEAR_UI_MIN` | |
| `EmployeeCombobox` | cmdk-based; `activeOnly`; shows name + Employee ID | |
| `StatusBadge` | `tone: success | warning | danger | neutral | pink`; always icon-or-text, never color only | Used for Active/Archived/Low/Depleted/Reversed/Type |
| `LeaveBalanceCard` | tile for Total/Used/Unused with optional progress | Employee page, dashboard |
| `LeaveBreakdownTable` | `rows`, `compact`, totals row via `summarizeBalances()` | Employee page, credits expander |
| `ProgressBar` | `value/max`, `tone`, `aria-valuenow` | Pink-500 fill on pink-100 track |
| `FormField` | label, `required`, helper, error, `id` wiring (`aria-describedby`, `aria-invalid`) | Wraps any control |
| `DaysField` | number, step 0.5, `inputmode="decimal"`, unit suffix "days" | Shared by allocation & usage |
| `DateRangeField` | two native date inputs with year bounds | |
| `FormFooter` | Cancel + Submit, pending state | |
| `ConfirmDialog` | `tone: default | destructive`, title, description, confirm label | Destructive focuses Cancel first |
| `EmptyState`, `LoadingState`, `ErrorState` (feedback) | icon, title, description, action | |
| `Toaster` (sonner) | positioned bottom-right (top-center on mobile) | |
| `ExportButton` | pending/disabled states | Reports, Employee page |

## 8. Table specification

- Container: white, `border`, radius 12, `overflow-x-auto`, `role="region"` with `aria-label` and `tabIndex=0` so it can be scrolled by keyboard.
- Header row: sticky, `pink-50` background, 12 px uppercase `text-muted` labels, bottom border `border-strong`. Sortable headers are buttons with `aria-sort`.
- Rows: min-height 48 px, 14 px text, divider `border-strong`, hover `bg-pink-50/50`, selected/focused `bg-pink-50`. No zebra striping.
- Cells: text left; numbers right-aligned, tabular; long text truncated with a tooltip (`title`) — never wrap names in action columns; dates formatted `MMM d, yyyy` (date-fns), timestamps `MMM d, yyyy h:mm a`.
- A `<caption class="sr-only">` describes the table. `th scope="col"`; first column `th scope="row"` where it identifies the row.
- Actions: a kebab (`MoreHorizontal`) `DropdownMenu` with `aria-label="Actions for {name}"`; destructive items separated.
- Loading: 5 skeleton rows matching the column layout. Empty: `EmptyState` inside the table body. Error: `ErrorState` with Retry.
- Pagination: client-side (page, page size, "Showing x–y of N") or cursor ("Load more" + "Loaded N rows").
- Responsive: columns marked `priority: low` (Department, Recorded by, Remarks) hide below `md`; first column sticky while scrolling horizontally.

## 9. Form specification

- Labels always visible above controls (no placeholder-as-label). Required fields: asterisk with `aria-hidden` plus visually hidden "required"; optional fields say "(optional)" only when most fields in the form are required.
- Control height 40 px (44 px on touch devices), radius 8, 1 px `input-border`, focus: 2 px `pink-500` ring with 2 px offset, no border color shift needed.
- Errors: below the control, 12–14 px `danger` text with an `AlertCircle` icon, linked via `aria-describedby`; the control gets `aria-invalid`. Validation mode `onTouched` (on blur, then on change) and on submit; on a failed submit focus moves to the first invalid field.
- Disabled controls: `surface-muted` bg, `text-subtle` text, `not-allowed` cursor.
- Textareas show a character counter near the limit (e.g., 450/500).
- A form-level alert (`role="alert"`) at the top of the dialog holds non-field errors (insufficient balance, contention, offline).
- Submit: primary button shows spinner + `aria-busy` while pending; all controls disabled during submission; the dialog cannot be dismissed during submission.

## 10. Dialogs, sheets, and confirmations

- Radix `Dialog`: focus trap, `Esc` closes, focus returns to the trigger. While a mutation is pending, `Esc`/backdrop/close are ignored.
- Dirty forms: closing asks "Discard changes?" only if the user has typed something.
- Sizes: `sm` 400 (confirmations, reversal) · `md` 520 (forms) · `lg` 720 (not used by default). Below 640 px forms are full-screen with a sticky footer.
- Detail views use a right-side `Sheet` (480 px; full-width on mobile).
- Titles are verbs/nouns that match the trigger ("Add employee", "Allocate credits"). Primary action label repeats the verb ("Allocate credits", "Record leave", "Reverse entry"). Destructive/irreversible confirmations name the object and consequence (§6).

## 11. Loading, empty, error, and success states

| State | Pattern |
|---|---|
| **Loading** (page) | Skeletons that mirror the final layout (cards, table rows); route-level fallback is a centered spinner with "Loading…" text for screen readers |
| **Loading** (action) | Button spinner + `aria-busy`; table "refetching" shows a thin pink progress line under the header, not a full skeleton |
| **Empty** | `EmptyState`: icon, title, one-line hint, primary CTA (copy table below) |
| **Error** | `ErrorState`: friendly message, **Retry**, small "Error code: …"; never raw Firebase text |
| **Success** | sonner toast (4 s), plain sentence naming the result and the new figure; no success modals |
| **Offline** | Persistent top banner "You're offline. Changes can't be saved until you reconnect." and mutations disabled |

| Where | Empty copy | CTA |
|---|---|---|
| Employees (none) | "No employees yet. Add your first employee to start tracking leave." | Add employee |
| Employees (filtered) | "No employees match your filters." | Clear filters |
| Leave types (none) | "No leave types yet. Add the types your organization uses." | Add leave type / Add starter types |
| Credits balances (year, none) | "No credits have been allocated for {year}." | Allocate credits |
| Allocation history (none) | "No credit allocations recorded for {year}." | Allocate credits |
| Leave usage / history (none) | "No leave recorded for {year}." | Record leave usage |
| Employee history (none) | "No transactions for {year}." | Allocate credits |
| Dashboard low balances (none) | "No low balances. Everyone has more than {threshold} days available." | — |
| Reports preview (no data) | "There are no records for {year} with these filters." | Change filters |

## 12. Validation rules and message copy

(Zod schemas in `src/domain/schemas` use these exact messages; rules in README §4.)

| Form | Field | Rule → message |
|---|---|---|
| Login | Email | required/format → "Enter a valid email address." |
| Login | Password | required → "Enter your password." |
| Change password | New password | ≥ 8 → "Password must be at least 8 characters." · must differ from current → "Choose a different password." |
| Change password | Confirm | equal → "Passwords don't match." |
| Account | Full name | 1–100 → "Enter your name." |
| Employee | Employee ID | required → "Enter the employee ID." · pattern → "Use letters, numbers, dots, dashes or underscores (max 30)." · duplicate → "This employee ID is already in use." |
| Employee | Complete name | required → "Enter the employee's complete name." · ≤ 120 → "Name is too long (120 characters max)." |
| Employee | Position | required → "Enter a position." · ≤ 80 |
| Employee | Department | ≤ 80 → "Department is too long (80 characters max)." |
| Employee | Employment status | required → "Select an employment status." |
| Leave type | Name | required → "Enter a leave type name." · ≤ 60 · duplicate → "A leave type with this name already exists." |
| Leave type | Description | ≤ 200 → "Description is too long (200 characters max)." |
| Allocation | Employee / Leave type / Year | required → "Select an employee." / "Select a leave type." / "Select a leave year." |
| Allocation | Credits | required → "Enter the number of credits." · > 0 → "Credits must be greater than 0." · step → "Use whole or half days (0.5)." · ≤ 365 → "The maximum is 365 per entry." |
| Usage | Date from / to | required → "Enter the start date." / "Enter the end date." · order → "The end date can't be before the start date." · year → "Leave must fall within {year}." |
| Usage | Days | > 0, step, ≤ 365 as above · ≤ calendar days → "Days can't exceed the {n} calendar days in this range." |
| Usage | (server) balance | → "Not enough credits: {available} available, {requested} requested." · no balance → "No {type} credits have been allocated to {employee} for {year}." |
| Allocation/Usage | Remarks | ≤ 500 → "Remarks are too long (500 characters max)." |
| Allocation/Usage | (server) archived/inactive | → "{Employee} is archived. Restore them to continue." / "{Type} is inactive and can't be used for new entries." |
| Reversal | Reason | ≥ 3 chars → "Enter a reason (at least 3 characters)." |
| Reversal | (server) | already reversed → "This entry has already been reversed." · allocation partly used → "Can't reverse this allocation: {used} of its {days} credits are already used. Reverse the related usage entries first." |
| Any write | (server) | permission → "You no longer have permission to do that. Please sign in again." · contention → "Another change was saving at the same time. Please try again." · offline → "You're offline. Reconnect and try again." |

## 13. Responsive behavior

| Concern | ≥ 1280 | 1024–1279 | 768–1023 | < 768 |
|---|---|---|---|---|
| Navigation | Fixed sidebar | Fixed sidebar | Drawer | Drawer |
| Stat cards | 5 in a row | 5 → 3 + 2 | 3 → 2 per row | 1–2 per row |
| Dashboard widgets | 2 columns | 2 columns | 1 column | 1 column |
| Tables | All columns | All columns | Low-priority columns hidden | Horizontal scroll, sticky name column |
| Dialogs | Centered | Centered | Centered | Full-screen with sticky footer |
| Filters | One row | One row | Wrap | Stacked, collapsible "Filters" panel with active-count badge |
| Page actions | Right-aligned | Right-aligned | Right-aligned | Wrap below title; primary full-width |

Layouts must reflow at 320 px without horizontal page scroll (tables scroll inside their container). Touch targets ≥ 44 px for primary controls on touch devices, never below 24 px anywhere.

## 14. Excel workbook specification (D-10)

One workbook per export, four sheets, generated client-side with SheetJS CE (lazy chunk).

**File name:** overall `HR-Leave-Report_{year}_{yyyyMMdd-HHmm}.xlsx`; individual `Leave-Report_{employeeNumber}_{year}_{yyyyMMdd-HHmm}.xlsx` (employee number sanitized to `[A-Za-z0-9._-]`).

**Sheet 1 — `Report Info`** (key/value, two columns): Report title · Leave year · Generated at · Generated by · Employee filter · Leave type filter · Include archived · Employees in report · Leave breakdown rows · Transaction rows · Grand total credits · Grand total used · Grand total unused · Reconciliation (`OK` or `N mismatched balance(s)` with the list) · Notes ("Credits are year-specific; there is no carryover. Reversal entries are included; their effect is netted in balances.").

**Sheet 2 — `Employee Summary`** (one row per employee): Employee ID · Complete Name · Position · Department · Employment Status · Leave Year · Total Leave Credits · Total Leave Used · Total Unused Leave · *Record Status* (Active/Archived — addition).

**Sheet 3 — `Leave Breakdown`** (one row per employee × leave type with a balance): Employee ID · Complete Name · Leave Year · Leave Type · Total Credits · Total Used · Remaining Credits.

**Sheet 4 — `Transactions`** (one row per ledger entry): Employee ID · Employee Name · Position · Leave Type · Transaction Type · Date From · Date To · Number of Days · Remarks · Recorded By · Date Recorded · *Leave Year* · *Effect on Available Credits* · *Status* · *Reference ID* (italic = additions to the brief's suggested columns: audit and filtering aids).

| Aspect | Specification |
|---|---|
| Transaction Type labels | `Credit Allocation`, `Leave Usage`, `Reversal (Credit Allocation)`, `Reversal (Leave Usage)` |
| Status | `Reversed`, `Reversal of {id}`, or blank |
| Dates | Real Excel dates (`cellDates`), format `yyyy-mm-dd`; *Date Recorded* `yyyy-mm-dd hh:mm` (local time) |
| Numbers | Real numbers, format `#,##0.0` (halves show correctly); *Number of Days* is always a positive magnitude; *Effect on Available Credits* is signed |
| Text | Always string cells; a remark such as `=1+1` stays text (FR-RPT-07) |
| Names/IDs | Current master data joined by ID; snapshots used only if the master record is unavailable **[D-10]** |
| Sorting | Summary by Employee ID (natural), Breakdown by employee then leave type name, Transactions by *Date Recorded* ascending (sorted in memory, R-06) |
| Filters | Year (required), employee, leave type, include archived. A leave-type filter narrows Summary and Breakdown figures to that type so totals equal the Breakdown rows; the filter is stated in Report Info |
| Inclusion | Summary: employees with ≥ 1 balance in the year, plus active employees with none (zeros) unless an employee/type filter is set |
| Layout | Header row = row 1 (Report Info excepted); column widths set per column; autofilter on each table sheet; freeze panes only if the installed SheetJS CE supports it (do not hack) |
| Styling | SheetJS CE cannot style cells; no bold/fill promised. If styled headers become a requirement, ExcelJS is the documented fallback |
| Integrity | Before download: `reconcile()` (DB §5.3). Totals on *Employee Summary* = sum of *Leave Breakdown* rows = sums of ledger deltas (BR-RPT-02) |
| Sheet names | ≤ 31 characters, no `[]:*?/\` |

## 15. Accessibility (WCAG 2.2 AA targets)

- **Contrast** per §2.3; pink-500 is never used for text or as a text background.
- **Keyboard:** every interaction reachable and operable; logical tab order; `Esc` closes overlays; visible 2 px focus ring everywhere (never `outline: none` without replacement); a **"Skip to main content"** link is the first focusable element.
- **Semantics:** landmarks (`header`, `nav aria-label="Primary"`, `main`, one `h1` per page); tables as real `<table>` with captions and scopes; sort state via `aria-sort`; expandable rows via `aria-expanded`.
- **Forms:** programmatic labels, `aria-describedby` for help/errors, `aria-invalid`, correct `autocomplete`, error text that says how to fix.
- **Status without color alone:** every badge has text; Low/Depleted also carry an icon; the insufficient-balance strip uses an icon and text.
- **Announcements:** toasts and async result counts use `aria-live="polite"`; form-level errors `role="alert"`.
- **Motion:** 150 ms transitions only; honor `prefers-reduced-motion` (disable skeleton shimmer and dialog scale).
- **Targets and reflow:** ≥ 24 × 24 px minimum; 44 px for primary mobile actions; usable at 200 % zoom and 320 px width.
- **Language and titles:** `<html lang="en">`; unique `<title>` per route, updated on navigation (`useDocumentTitle`).
- **Verification:** `eslint-plugin-jsx-a11y`; a manual checklist per phase (keyboard-only walkthrough, 200 % zoom, screen-reader smoke test of login + one form); optional `vitest-axe` / `@axe-core/playwright` additions in Phase 12 if the user approves the extra dev dependency.

## 16. Iconography and motion

Lucide icons at 16 px (inline) / 20 px (nav, buttons), stroke 1.75, `aria-hidden` unless they carry meaning on their own. Motion is functional only: hover/focus color transitions and dialog/menu fade-scale at 150 ms ease-out. No decorative animation, parallax, or confetti.

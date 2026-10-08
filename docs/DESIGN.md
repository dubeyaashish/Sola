# Sola — UX & Visual Design

Bilingual (English / ไทย), responsive, red · white · gold. Implemented in `apps/web` (tokens in `src/styles.css`, strings in `src/dict.ts`).

## 1. Principles

1. **One screen for the counter.** Selling, exchanging old gold and buying gold happen on the same screen; the cashier never navigates mid-bill.
2. **The server prices, the screen shows.** Totals always come from `/pricing/quote`; the UI never recomputes money.
3. **Few taps for the common case.** A cash sale for the exact amount is: tap item → tap *Confirm*. Payment rows auto-fill to the amount due.
4. **Make mistakes recoverable and visible.** Voids need a reason and a role; destructive actions use a confirm dialog that says exactly what will be reversed.
5. **Thai and English are equals.** Every string, enum, error code and printed document exists in both; the choice is remembered per device.

## 2. Information architecture

| Area | Screen | Who (permission) |
|---|---|---|
| Overview | Dashboard — sales, stock value, pawn/overdue, savings owed, e-Tax queue | Owner, Manager (`report.view`) |
| Counter | **Buy · Sell · Exchange** | Cashier+ (`sale.create`, `buyback.create`) |
| | Bills — history, reprint, full tax invoice, void | Cashier (view), Manager (void) |
| Inventory | Stock — by purity/source, receive, adjust, movement history | Stock clerk+ |
| People | Customers — ID-card fields, points, rewards | Cashier+ |
| Credit | Pawn · Sell-back — open, renew, pay principal, redeem, forfeit | Cashier+ (forfeit: Manager) |
| | Gold savings — plans, deposits, printable ticket | Cashier+ |
| Prices | Gold prices — current, update from announcement, history | Manager+ (`rate.set`) |
| Back office | Reports — P&L, income/expense, e-Tax queue | Manager+ |
| Admin | Settings — company, logo, tax & rules, users, audit log | Owner (audit: Manager) |

Navigation is built from the user's permissions, so each role sees only what it can use.

## 3. Key flows

**Sale / exchange / buy.** Search or scan SKU → *Add* → (optional) enter customer's old gold: weight, purity, deduction → choose customer (required when buying gold) → review live totals → payment (split allowed, savings account usable) → *Confirm* → completion dialog offers *Print bill* and each tax document.

**Pawn.** New contract (customer must have a national ID) → ticket prints automatically → later: pick date → interest and redeem total update live → Renew / Pay principal / Redeem; Forfeit (manager) moves the gold into stock as *Forfeited pawn*.

**Savings.** Open (fixed installments or flexible; money or gold-weight) → deposit → printable ticket with next due date → redeem inside a sale as a payment method.

**Company setup.** Settings → Company: names, tax ID, branch, phone, then address by **province → district → sub-district** dropdowns (7,436 sub-districts); the postcode fills automatically and a live preview shows exactly what prints. Logo: choose an image — large files are resized in the browser — preview, save.

## 4. Layout and responsiveness

| Breakpoint | Layout |
|---|---|
| ≥ 1100 px (desktop) | 248 px sidebar with labels, sticky top bar (date · live gold price · language), two-column work areas. |
| 700–1099 px (tablet) | 76 px icon rail, single-column work areas, sticky *total + Pay* bar on the POS. |
| < 700 px (phone) | No sidebar: bottom tab bar (4 primary screens + *More*), price strip under the header, tables become labelled cards, dialogs become bottom sheets, toasts sit above the tab bar, sticky *total + Pay* bar. |

Touch targets are ≥ 42 px; form text is ≥ 15 px (no iOS zoom). Verified in a real browser at 1440, 820 and 390 px in both languages: no horizontal overflow on any screen.

## 5. Visual system

**Palette** (CSS custom properties on `:root`)

| Token | Hex | Use |
|---|---|---|
| `--red-600 / 700` | `#b3202f / #9b1b30` | Primary actions, active states, key totals |
| `--red-800 / 900` | `#781323 / #5a0c17` | Sidebar, headings |
| `--gold-500 / 400` | `#c9a227 / #dcbc52` | Accents, top-bar rule, secondary action, card top borders |
| `--gold-700` | `#85650f` | Gold used as *text* on white |
| `--gold-50 / 100` | `#fcf8e9 / #f7edc9` | Highlights, ticker, totals background |
| `--bg` / white | `#fffaf3` / `#ffffff` | Warm-white page, white cards |
| `--ink` / `--muted` | `#2b1a1c` / `#73635d` | Text |

Rule of thumb: **red = do / money that matters, gold = decoration and secondary, white = space.** Gold is never used for body text on white (3.5:1); `--gold-700` is.

**Measured contrast (WCAG)**: body text 16.0:1 · muted text 5.5:1 · white on primary red 6.6:1 · headings 11.0:1 · gold-700 on white 5.4:1 · sidebar text on red 8.2:1 · gold button label 4.9:1 · status badges ≥ 4.7:1.

**Type**: *Sarabun* (Latin + Thai in one family, so mixed lines align), fallbacks Noto Sans Thai → system. Numerals are tabular everywhere money appears. Scale: 15 body · 13 secondary · 16 card titles · 22 page titles · 24–30 key figures.

**Components**: Card (gold or red top rule), Stat tile, Badge (ok / warn / bad / gold), Button (primary red, gold, outline, danger, ghost), Field, Modal / bottom sheet, Toast, Empty state, responsive Table, cascading address selects, logo uploader, Print dialog.

**Feedback**: success and errors are toasts (errors stay longer). Server error codes map to translated messages (`err.*`). Disabled *Confirm* shows why (missing customer, amount mismatch) next to it.

## 6. Language

`src/dict.ts` stores `[English, Thai]` pairs, so a string cannot exist in one language only; a test checks Thai text really is Thai, enum labels cover every value the API can return, and placeholders match. Dates follow the language (Thai shows the Buddhist-era year). Money is always `1,234.56`.

## 7. Printed documents (HTML)

Generated by the API (`apps/api/src/services/printing.ts`) as standalone HTML — no external files, safe to save, email or print.

| Document | Endpoint | Default paper |
|---|---|---|
| Bill / receipt | `GET /transactions/:id/receipt` | 80 mm slip |
| Abbreviated / full tax invoice, gold purchase voucher | `GET /documents/:id/html` | A4 |
| Pawn / sell-back contract | `GET /pawn/:id/print` | A4 |
| Savings ticket | `GET /savings/:id/print` | 80 mm slip |

Query: `lang=th|en|both`, `format=a4|slip`, `autoprint=1`. Content: logo, company name, address, tax ID and branch from Settings; line items with weight/purity/gold/making; VAT; **amount in Thai words** (บาทถ้วน); payments; signature blocks (A4); a *CANCELLED* watermark on voided bills. All dynamic text is HTML-escaped and responses carry a restrictive Content-Security-Policy. Bills say they are *not* a tax invoice; the legal documents are the tax-invoice types.

## 8. Accessibility

Visible gold focus ring; dialogs close on Esc and restore context; form controls have labels; icon buttons have `aria-label`; language and paper toggles are groups with names; status is never colour-only (badges carry text); reduced-motion respected.

## 9. Known gaps

ID-card reader hookup, e-Tax submission, automatic association price feed (API ready; needs a source), receipt printer driver profiles (browser print only), dark mode, offline mode.

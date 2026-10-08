# Sola — UX & Visual Design

Bilingual (English / ไทย), responsive, **red · white · gold**. Implemented in `apps/web` with React + Tailwind 3. Built from the "calm business tool" reference spec, with the spec's blue accent replaced by Sola red.

## 1. Character

Quiet and professional: white cards on a very light grey canvas, thin borders, 14 px type, one accent colour. No gradients, no heavy shadows.

| Role | Colour |
|---|---|
| **Primary / accent (the spec's "brand blue")** | Sola red — `brand-600 #b3202f` (buttons, active states, focus), `brand-700 #9b1b30` hover, `brand-50 #fdf3f4` selected fill, `brand-500` focus border, `brand-100` focus ring |
| **Secondary accent** | Gold — `gold-500 #c9a227`, `gold-100/700` pills. Used sparingly: logo mark, gold-related pills (customer gold, savings ticket) |
| **Neutrals (spec's "ink")** | 50 `#f6f7f9` page · 100 `#eceef2` dividers/hover · 200 `#d9dde4` control borders · 300 placeholder · 400 icons · 500 `#636d82` secondary text · 700 `#384154` body · 900 `#161b26` headings |
| **Status** | Soft tint + darker text: emerald (ok), amber (warn), red (bad), gold, ink (neutral). Always with text, never colour alone |

Tokens live in `apps/web/tailwind.config.js`; component classes (`.input .btn .btn-primary .btn-outline .btn-ghost .btn-danger .icon-btn .card .label .tab .tab-active .chip .chip-on .pill .row-item`) in `src/index.css`.

**Type**: IBM Plex Sans Thai → IBM Plex Sans → system-ui, 14 px base, labels 12 px medium, page titles 18–20 px semibold, tabular numerals for money. **Shape**: radius 8 (controls) / 12 (cards, menus) / 16 (modals); card shadow `0 1px 2px / 0 1px 3px`; modal `shadow-2xl`; paper preview `0 2px 12px`.

## 2. Layout

**Desktop (≥ 1024 px)**: icon rail (64 px: logo, icon + tiny label, avatar menu) → list pane (340–360 px) → main pane → optional right panel (≥ 1280 px, collapsible, remembered). A slim strip above the panes shows the live gold price (bar and ornament, buy / sell) and flags a price older than 12 hours.

| Screen | List pane | Main | Right panel |
|---|---|---|---|
| Counter | Items in stock (search/scan) | Bill, customer, customer's old gold | Summary and payment |
| Bills | Search, date and type chips | Items · Payments · Tax documents | Totals, customer |
| Stock | Search, status chips | Details · Movement history (summary when nothing selected) | — |
| Customers | Avatar rows | Overview · Points · Bills | Points, rewards |
| Pawn | Status chips, overdue pills | Summary · Items · History | Interest calculator |
| Gold savings | Account rows | Ticket, history | Plan |
| Dashboard, Gold prices, Reports | — | Full-width cards / tables | — |
| Settings | Grouped menu | Row cards | — |

**Below 1024 px**: one pane at a time. The rail becomes a bottom tab bar (4 screens + *More*); list → detail drills in with a back arrow; the right panel stacks under the detail; secondary actions fold into the "⋯" menu while the primary stays visible; large dialogs go full-screen; inputs are 16 px to stop iOS zoom; the shell respects `env(safe-area-inset-*)`.

## 3. Interaction rules (as implemented)

1. One primary action per screen (red), top-right or bottom-right in dialogs.
2. Every completed action shows a toast (one at a time, top centre; errors stay longer and are translated from server error codes). Buttons show their busy state.
3. Save model: selects and toggles apply instantly; text rules save on blur; multi-field forms (company profile) show a **save bar only when dirty** with *Discard* and *Save changes*; leaving a dirty form asks first.
4. Destructive actions use a confirm dialog with a red button and plain wording; voiding a bill requires a reason (Confirm stays disabled until filled).
5. Empty, loading and error are designed states on every list and page.
6. Search is live and debounced (250 ms); filters are chips; selected rows have a fill and a left bar; selected chips and tabs change colour *and* weight.
7. Keyboard: Esc closes dialogs and menus, Enter submits, a visible focus ring everywhere, dialogs trap focus and restore it.
8. View state is remembered per device (last screen, filters, panel state) in `localStorage`, guarded with try/catch.
9. Motion is only a short colour transition on hover and focus; reduced-motion is respected.
10. Copy: short, sentence case, verbs on buttons, no exclamation marks.

## 4. Key flows

**Sell / exchange / buy**: pick items (tap to add or remove, or scan SKU + Enter) → optionally add the customer's old gold (weight, purity, deduction, bar or ornament) → choose a customer (required when buying gold) → totals update from the server → payment defaults to one exact cash payment, split payments and savings accounts supported → *Confirm bill* → print the bill or any tax document.
**Pawn**: new contract (customer ID required) → ticket prints → pick any date to see interest and the redeem total → Redeem / Renew / pay part of principal; Forfeit (manager) moves the gold into stock.
**Company setup**: Settings → Company: names, tax ID, branch, phone, then province → district → sub-district dropdowns (7,436 sub-districts); the postcode fills in and a preview shows exactly what prints. Logo: choose an image (resized in the browser), preview, *Use this logo*.

## 5. Language

All text goes through `t()` with a dictionary of `[English, Thai]` pairs (`src/dict.ts`), so a string cannot exist in one language only. Tests check Thai really is Thai, every enum value the API can return has a label, and placeholders match. The language switch is in the avatar menu (and the login screen, and *More* on phones). Dates follow the language (Thai uses the Buddhist-era year). Layouts tolerate longer text: no fixed-width buttons, truncation with ellipsis.

## 6. Printed documents (HTML)

Generated by the API as standalone HTML; the app shows them on a grey desk with a white sheet, zoom (− % + / fit width), language (TH / EN / TH + EN), paper (A4 / 80 mm slip), Print and Download.

| Document | Endpoint | Default paper |
|---|---|---|
| Bill | `GET /transactions/:id/receipt` | 80 mm slip |
| Abbreviated / full tax invoice, gold purchase voucher | `GET /documents/:id/html` | A4 |
| Pawn / sell-back contract | `GET /pawn/:id/print` | A4 |
| Savings ticket | `GET /savings/:id/print` | 80 mm slip |

Content: logo, company name, address, tax ID and branch from Settings; line items; VAT; amount in Thai words; payments; signature blocks; a CANCELLED watermark on voided bills. All dynamic text is HTML-escaped and responses carry a restrictive Content-Security-Policy.

## 7. Accessibility

Body text `ink-700` on white (≥ 8:1); secondary text `ink-500` (≈ 5.4:1); white on brand red ≈ 6.6:1. Icon-only buttons have `aria-label`; tabs and the language / paper groups have roles and names; status pills always carry text; touch targets ≥ 40 px on phones.

## 8. Known gaps

ID-card reader hookup, e-Tax submission, automatic association price feed, receipt-printer driver profiles (browser print only), dark mode, offline mode.

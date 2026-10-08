# Sola — Gold Shop POS & Inventory

Buy / sell / exchange gold on one screen, weight-and-purity stock, daily rates, pawn & sell-back,
gold savings, loyalty, tax documents, and back-office reports.

**Quick start (macOS / Linux, Node 22+):**
```bash
npm install
npm run dev      # seeds demo data on first run, then opens API :3000 + web :5173
```
Login: `owner` / `sola-demo-123`.

Manual steps:
```bash
npm install
npm test                      # core + API tests
cd apps/api && npm run seed   # demo users (owner/manager/cashier/stock, password sola-demo-123) + sample stock
JWT_SECRET=change-me-please-16+ npm run dev:api   # http://localhost:3000
```

Web UI (English / ไทย, responsive, red·white·gold): `npm run dev:web` (http://localhost:5173, proxies /api → :3000).

Docs: [UX & visual design](docs/DESIGN.md) · [Schema design](docs/SCHEMA.md) · [Architecture](docs/ARCHITECTURE.md)

Env: `JWT_SECRET` (required), `DB_PATH` (default `./data/sola.db`), `PORT`, `RATE_FEED_URL` (optional auto price feed).
Before issuing tax invoices set `shop_tax_id` etc. via `PUT /settings` (owner).

Printable bills and invoices are generated as HTML by the API (see docs/DESIGN.md §7). Thai address data © kongvut/thai-province-data (MIT).

If port 3000 is taken (e.g. macOS AirPlay Receiver), `npm run dev` picks the next free port automatically. For the manual commands set `PORT=3001` for the API and `API_PORT=3001` for the web app.

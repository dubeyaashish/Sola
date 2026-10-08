# Sola — Gold Shop POS & Inventory

Buy / sell / exchange gold on one screen, weight-and-purity stock, daily rates, pawn & sell-back,
gold savings, loyalty, tax documents, and back-office reports.

```bash
npm install
npm test                      # core + API tests
cd apps/api && npm run seed   # demo users (owner/manager/cashier/stock, password sola-demo-123) + sample stock
JWT_SECRET=change-me-please-16+ npm run dev:api   # http://localhost:3000
```

Docs: [Schema design](docs/SCHEMA.md) · [Architecture](docs/ARCHITECTURE.md)

Env: `JWT_SECRET` (required), `DB_PATH` (default `./data/sola.db`), `PORT`, `RATE_FEED_URL` (optional auto price feed).
Before issuing tax invoices set `shop_tax_id` etc. via `PUT /settings` (owner).

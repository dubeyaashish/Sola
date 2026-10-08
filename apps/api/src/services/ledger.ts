import { DomainError } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { currentRate } from '../repos/rates';

const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString();

export function addEntry(db: DB, actor: Actor, e: { entryDate?: string; kind: 'INCOME' | 'EXPENSE'; category: string; amount: number; memo?: string | null }) {
  const id = db.prepare('INSERT INTO ledger_entries(entry_date,kind,category,amount,memo,user_id) VALUES (?,?,?,?,?,?)')
    .run(e.entryDate ?? new Date().toISOString().slice(0, 10), e.kind, e.category, e.amount, e.memo ?? null, actor.id).lastInsertRowid as number;
  audit(db, actor, 'ledger.add', 'ledger_entry', id, e);
  return id;
}
export const listEntries = (db: DB, from: string, to: string) =>
  db.prepare(`SELECT id, entry_date AS entryDate, kind, category, amount, memo FROM ledger_entries WHERE entry_date >= ? AND entry_date <= ? ORDER BY entry_date DESC, id DESC`).all(from, to);

/**
 * Profit & loss for an inclusive UTC date range.
 *  revenue  = sales net of VAT (SALE + TRADE_IN; voided excluded)
 *  cogs     = cost snapshot of the pieces sold
 *  Trade-in / buyback / forfeited gold is a stock purchase, not an expense; it hits P&L only when resold.
 */
export function profitLoss(db: DB, from: string, to: string) {
  if (from > to) throw new DomainError('INVALID_DATE', 'from is after to');
  const a = `${from}T00:00:00.000Z`; const b = dayAfter(to);
  const sales = db.prepare(`SELECT COALESCE(SUM(sale_total - tax),0) AS revenue, COALESCE(SUM(tax),0) AS outputTax, COALESCE(SUM(discount),0) AS discount, COUNT(*) AS count
    FROM transactions WHERE status='COMPLETED' AND type IN ('SALE','TRADE_IN') AND created_at >= ? AND created_at < ?`).get(a, b) as Record<string, number>;
  const cogs = (db.prepare(`SELECT COALESCE(SUM(l.cost),0) AS n FROM transaction_lines l JOIN transactions t ON t.id = l.transaction_id
    WHERE t.status='COMPLETED' AND l.kind='SALE' AND t.created_at >= ? AND t.created_at < ?`).get(a, b) as { n: number }).n;
  const interest = (db.prepare('SELECT COALESCE(SUM(interest_amount),0) AS n FROM pawn_events WHERE created_at >= ? AND created_at < ?').get(a, b) as { n: number }).n;
  const led = db.prepare(`SELECT kind, category, SUM(amount) AS amount FROM ledger_entries WHERE entry_date >= ? AND entry_date <= ? GROUP BY kind, category`).all(from, to) as { kind: string; category: string; amount: number }[];
  const otherIncome = led.filter((r) => r.kind === 'INCOME').reduce((s, r) => s + r.amount, 0);
  const expenses = led.filter((r) => r.kind === 'EXPENSE').reduce((s, r) => s + r.amount, 0);
  const grossProfit = sales.revenue! - cogs;
  return {
    from, to, salesCount: sales.count, revenue: sales.revenue, discount: sales.discount, outputTax: sales.outputTax, cogs, grossProfit,
    pawnInterestIncome: interest, otherIncome, expenses, expensesByCategory: led.filter((r) => r.kind === 'EXPENSE'),
    netProfit: grossProfit + interest + otherIncome - expenses,
  };
}

/** Owner dashboard: one round-trip with the numbers a manager checks first. */
export function dashboard(db: DB, today: string) {
  const month = `${today.slice(0, 7)}-01`;
  const one = <T>(sql: string, ...args: unknown[]) => db.prepare(sql).get(...args) as T;
  const rate = currentRate(db);
  const stock = db.prepare(`SELECT purity_bp AS purityBp, source, COUNT(*) AS count, SUM(weight_mg) AS weightMg, SUM(cost) AS cost FROM items WHERE status = 'IN_STOCK' GROUP BY purity_bp, source ORDER BY purity_bp DESC`).all() as
    { purityBp: number; source: string; count: number; weightMg: number; cost: number }[];
  const stockMarketValue = rate ? stock.reduce((s, r) => s + Math.round((r.weightMg * r.purityBp * rate.buyPerGram) / 1e7), 0) : null;
  return {
    today: profitLoss(db, today, today),
    monthToDate: profitLoss(db, month, today),
    rate,
    stock, stockMarketValue,
    pawn: {
      active: one<{ n: number; principal: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(principal),0) AS principal FROM pawn_contracts WHERE status='ACTIVE'"),
      overdue: one<{ n: number }>("SELECT COUNT(*) AS n FROM pawn_contracts WHERE status='ACTIVE' AND due_date < ?", today).n,
    },
    savingsLiability: one<{ n: number }>("SELECT COALESCE(SUM(balance),0) AS n FROM savings_accounts WHERE status IN ('ACTIVE','COMPLETED')").n,
    pendingEtax: one<{ n: number }>("SELECT COUNT(*) AS n FROM etax_outbox WHERE status != 'SENT'").n,
    pointsOutstanding: one<{ n: number }>('SELECT COALESCE(SUM(points_balance),0) AS n FROM customers').n,
  };
}

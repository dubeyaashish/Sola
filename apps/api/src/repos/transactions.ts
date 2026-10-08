import type { DB } from '../db/schema';

const TX = `SELECT t.id, t.doc_no AS docNo, t.type, t.status, t.customer_id AS customerId, c.name AS customerName,
  u.username AS cashier, t.rate_id AS rateId, t.rate_sell_per_gram AS rateSellPerGram, t.rate_buy_per_gram AS rateBuyPerGram,
  t.gold_total AS goldTotal, t.making_total AS makingTotal, t.other_total AS otherTotal, t.subtotal, t.discount, t.tax,
  t.sale_total AS saleTotal, t.trade_in_credit AS tradeInCredit, t.net, t.points_earned AS pointsEarned, t.note, t.created_at AS createdAt,
  t.voided_at AS voidedAt, t.void_reason AS voidReason
  FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id JOIN users u ON u.id = t.user_id`;

export function nextDocSeq(db: DB, day: string): number {
  db.prepare('INSERT INTO doc_sequences(day,last) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET last = last + 1').run(day);
  return (db.prepare('SELECT last FROM doc_sequences WHERE day = ?').get(day) as { last: number }).last;
}

export function getTransaction(db: DB, id: number) {
  const tx = db.prepare(`${TX} WHERE t.id = ?`).get(id);
  if (!tx) return undefined;
  const lines = db.prepare(
    `SELECT id, kind, item_id AS itemId, description, weight_mg AS weightMg, purity_bp AS purityBp, gold_value AS goldValue,
            making, other, deduction, line_total AS lineTotal FROM transaction_lines WHERE transaction_id = ? ORDER BY id`,
  ).all(id);
  const payments = db.prepare('SELECT id, method, amount, reference FROM payments WHERE transaction_id = ? ORDER BY id').all(id);
  return { ...(tx as object), lines, payments };
}

export function listTransactions(db: DB, f: { from?: string; to?: string; type?: string; customerId?: number; limit?: number }) {
  const where: string[] = []; const args: unknown[] = [];
  if (f.from) { where.push('t.created_at >= ?'); args.push(f.from); }
  if (f.to) { where.push('t.created_at < ?'); args.push(f.to); }
  if (f.type) { where.push('t.type = ?'); args.push(f.type); }
  if (f.customerId) { where.push('t.customer_id = ?'); args.push(f.customerId); }
  args.push(f.limit ?? 100);
  return db.prepare(`${TX} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.id DESC LIMIT ?`).all(...args);
}

/** Summary for one UTC day (YYYY-MM-DD). Voided transactions are excluded from totals. */
export function dailySummary(db: DB, day: string) {
  const from = `${day}T00:00:00.000Z`;
  const to = new Date(Date.parse(from) + 86_400_000).toISOString();
  const byType = db.prepare(
    `SELECT type, COUNT(*) AS count, SUM(sale_total) AS saleTotal, SUM(trade_in_credit) AS tradeInCredit, SUM(net) AS net,
            SUM(discount) AS discount, SUM(tax) AS tax
     FROM transactions WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ? GROUP BY type`,
  ).all(from, to);
  const byMethod = db.prepare(
    `SELECT p.method, SUM(p.amount) AS amount FROM payments p JOIN transactions t ON t.id = p.transaction_id
     WHERE t.status = 'COMPLETED' AND t.created_at >= ? AND t.created_at < ? GROUP BY p.method`,
  ).all(from, to);
  const weights = db.prepare(
    `SELECT l.kind, SUM(l.weight_mg) AS weightMg FROM transaction_lines l JOIN transactions t ON t.id = l.transaction_id
     WHERE t.status = 'COMPLETED' AND t.created_at >= ? AND t.created_at < ? GROUP BY l.kind`,
  ).all(from, to);
  const voided = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE status='VOIDED' AND created_at >= ? AND created_at < ?").get(from, to) as { n: number }).n;
  return { day, byType, byMethod, weights, voided };
}

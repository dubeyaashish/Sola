import { DomainError, pointsForAmount } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { getSettings } from '../repos/settings';

export function earnPoints(db: DB, actor: Actor, customerId: number, txId: number, saleTotal: number): number {
  const pts = pointsForAmount(saleTotal, Number(getSettings(db).points_minor_per_point ?? 0));
  if (pts > 0) {
    db.prepare("INSERT INTO points_ledger(customer_id,delta,reason,transaction_id,user_id) VALUES (?,?, 'EARN',?,?)").run(customerId, pts, txId, actor.id);
    db.prepare('UPDATE customers SET points_balance = points_balance + ? WHERE id = ?').run(pts, customerId);
  }
  return pts;
}

export function voidPoints(db: DB, actor: Actor, customerId: number, txId: number) {
  const earned = db.prepare("SELECT COALESCE(SUM(delta),0) AS n FROM points_ledger WHERE transaction_id = ? AND reason = 'EARN'").get(txId) as { n: number };
  if (earned.n > 0) {
    db.prepare("INSERT INTO points_ledger(customer_id,delta,reason,transaction_id,user_id) VALUES (?,?, 'VOID',?,?)").run(customerId, -earned.n, txId, actor.id);
    db.prepare('UPDATE customers SET points_balance = points_balance - ? WHERE id = ?').run(earned.n, customerId);
  }
}

export function adjustPoints(db: DB, actor: Actor, customerId: number, delta: number, note: string) {
  if (!delta || !note.trim()) throw new DomainError('INVALID', 'delta and note are required');
  return db.transaction(() => {
    const c = db.prepare('SELECT points_balance AS b FROM customers WHERE id = ?').get(customerId) as { b: number } | undefined;
    if (!c) throw new DomainError('NOT_FOUND', 'customer not found');
    if (c.b + delta < 0) throw new DomainError('INSUFFICIENT_POINTS', 'balance cannot go negative');
    db.prepare("INSERT INTO points_ledger(customer_id,delta,reason,user_id,note) VALUES (?,?, 'ADJUST',?,?)").run(customerId, delta, actor.id, note);
    db.prepare('UPDATE customers SET points_balance = points_balance + ? WHERE id = ?').run(delta, customerId);
    audit(db, actor, 'points.adjust', 'customer', customerId, { delta, note });
    return c.b + delta;
  })();
}

export const listRewards = (db: DB) => db.prepare('SELECT id, name, points_cost AS pointsCost, stock_qty AS stockQty, active FROM rewards ORDER BY points_cost').all();
export function createReward(db: DB, actor: Actor, r: { name: string; pointsCost: number; stockQty: number }) {
  const id = db.prepare('INSERT INTO rewards(name,points_cost,stock_qty) VALUES (?,?,?)').run(r.name, r.pointsCost, r.stockQty).lastInsertRowid as number;
  audit(db, actor, 'reward.create', 'reward', id, r);
  return id;
}

export function redeemReward(db: DB, actor: Actor, customerId: number, rewardId: number) {
  return db.transaction(() => {
    const rw = db.prepare('SELECT id, name, points_cost AS cost, stock_qty AS qty, active FROM rewards WHERE id = ?').get(rewardId) as { id: number; name: string; cost: number; qty: number; active: number } | undefined;
    if (!rw || !rw.active) throw new DomainError('NOT_FOUND', 'reward not found');
    if (rw.qty < 1) throw new DomainError('OUT_OF_STOCK', 'reward is out of stock');
    const c = db.prepare('SELECT points_balance AS b FROM customers WHERE id = ?').get(customerId) as { b: number } | undefined;
    if (!c) throw new DomainError('NOT_FOUND', 'customer not found');
    if (c.b < rw.cost) throw new DomainError('INSUFFICIENT_POINTS', `needs ${rw.cost} points, has ${c.b}`);
    db.prepare('UPDATE rewards SET stock_qty = stock_qty - 1 WHERE id = ?').run(rewardId);
    db.prepare("INSERT INTO points_ledger(customer_id,delta,reason,reward_id,user_id,note) VALUES (?,?, 'REDEEM',?,?,?)").run(customerId, -rw.cost, rewardId, actor.id, rw.name);
    db.prepare('UPDATE customers SET points_balance = points_balance - ? WHERE id = ?').run(rw.cost, customerId);
    audit(db, actor, 'reward.redeem', 'customer', customerId, { rewardId, cost: rw.cost });
    return { balance: c.b - rw.cost, reward: rw.name };
  })();
}

export const pointsHistory = (db: DB, customerId: number) =>
  db.prepare('SELECT id, delta, reason, transaction_id AS transactionId, reward_id AS rewardId, note, created_at AS createdAt FROM points_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 100').all(customerId);

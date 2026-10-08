import type { DB } from '../db/schema';
import type { MakingCharge } from '@sola/core';

export type ItemStatus = 'IN_STOCK' | 'SOLD' | 'RESERVED' | 'MISSING' | 'VOIDED';
export interface Item {
  id: number; sku: string; name: string; category: string; weightMg: number; purityBp: number;
  making: MakingCharge; otherCharge: number; cost: number; status: ItemStatus; source: 'NEW' | 'TRADE_IN' | 'FORFEITED';
  location: string | null; createdAt: string; updatedAt: string;
}
interface Row {
  id: number; sku: string; name: string; category: string; weight_mg: number; purity_bp: number;
  making_type: 'FIXED' | 'PER_GRAM' | 'PERCENT'; making_value: number; other_charge: number; cost: number;
  status: ItemStatus; source: 'NEW' | 'TRADE_IN' | 'FORFEITED'; location: string | null; created_at: string; updated_at: string;
}
const toMaking = (t: Row['making_type'], v: number): MakingCharge =>
  t === 'PERCENT' ? { type: 'PERCENT', bp: v } : { type: t, amount: v };
const fromMaking = (m: MakingCharge) => (m.type === 'PERCENT' ? { t: m.type, v: m.bp } : { t: m.type, v: m.amount });
const map = (r: Row): Item => ({
  id: r.id, sku: r.sku, name: r.name, category: r.category, weightMg: r.weight_mg, purityBp: r.purity_bp,
  making: toMaking(r.making_type, r.making_value), otherCharge: r.other_charge, cost: r.cost, status: r.status,
  source: r.source, location: r.location, createdAt: r.created_at, updatedAt: r.updated_at,
});

export interface NewItem {
  sku?: string; name: string; category?: string; weightMg: number; purityBp: number; making: MakingCharge;
  otherCharge?: number; cost?: number; source?: 'NEW' | 'TRADE_IN' | 'FORFEITED'; location?: string | null;
}

export function insertItem(db: DB, i: NewItem): number {
  const { t, v } = fromMaking(i.making);
  const tmp = i.sku ?? `TMP-${Math.random().toString(36).slice(2)}`;
  const id = db.prepare(
    `INSERT INTO items(sku,name,category,weight_mg,purity_bp,making_type,making_value,other_charge,cost,source,location)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(tmp, i.name, i.category ?? 'ORNAMENT', i.weightMg, i.purityBp, t, v, i.otherCharge ?? 0, i.cost ?? 0, i.source ?? 'NEW', i.location ?? null).lastInsertRowid as number;
  if (!i.sku) db.prepare('UPDATE items SET sku = ? WHERE id = ?').run(`G-${String(id).padStart(6, '0')}`, id);
  return id;
}

export const getItem = (db: DB, id: number) => {
  const r = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Row | undefined;
  return r && map(r);
};
export const getItemBySku = (db: DB, sku: string) => {
  const r = db.prepare('SELECT * FROM items WHERE sku = ?').get(sku) as Row | undefined;
  return r && map(r);
};

export function listItems(db: DB, f: { status?: string; q?: string; category?: string; limit?: number }) {
  const where: string[] = []; const args: unknown[] = [];
  if (f.status) { where.push('status = ?'); args.push(f.status); }
  if (f.category) { where.push('category = ?'); args.push(f.category); }
  if (f.q) { where.push('(sku LIKE ? OR name LIKE ?)'); args.push(`%${f.q}%`, `%${f.q}%`); }
  args.push(f.limit ?? 200);
  const rows = db.prepare(`SELECT * FROM items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).all(...args) as Row[];
  return rows.map(map);
}

export function setItemStatus(db: DB, id: number, status: ItemStatus) {
  db.prepare("UPDATE items SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(status, id);
}

export function stockSummary(db: DB) {
  return db.prepare(
    `SELECT status, purity_bp AS purityBp, COUNT(*) AS count, SUM(weight_mg) AS weightMg, SUM(cost) AS cost
     FROM items WHERE status IN ('IN_STOCK','RESERVED','MISSING') GROUP BY status, purity_bp ORDER BY purity_bp DESC`,
  ).all();
}

export function insertMovement(db: DB, m: { itemId: number; type: string; from: string | null; to: string | null; weightMg: number; transactionId?: number | null; userId: number; note?: string | null }) {
  db.prepare('INSERT INTO stock_movements(item_id,type,from_status,to_status,weight_mg,transaction_id,user_id,note) VALUES (?,?,?,?,?,?,?,?)')
    .run(m.itemId, m.type, m.from, m.to, m.weightMg, m.transactionId ?? null, m.userId, m.note ?? null);
}

export function listMovements(db: DB, itemId?: number, limit = 200) {
  return db.prepare(
    `SELECT m.id, m.item_id AS itemId, i.sku, m.type, m.from_status AS fromStatus, m.to_status AS toStatus, m.weight_mg AS weightMg,
            m.transaction_id AS transactionId, u.username, m.note, m.created_at AS createdAt
     FROM stock_movements m JOIN items i ON i.id = m.item_id JOIN users u ON u.id = m.user_id
     ${itemId ? 'WHERE m.item_id = ?' : ''} ORDER BY m.id DESC LIMIT ?`,
  ).all(...(itemId ? [itemId, limit] : [limit]));
}

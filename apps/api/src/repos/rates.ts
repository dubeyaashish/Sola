import type { DB } from '../db/schema';
import type { GoldRate } from '@sola/core';

const SELECT = `SELECT r.id, r.buy_per_gram AS buyPerGram, r.sell_per_gram AS sellPerGram,
  r.bar_buy_per_gram AS barBuyPerGram, r.bar_sell_per_gram AS barSellPerGram, r.source, r.announcement_no AS announcementNo,
  r.note, r.effective_at AS effectiveAt, u.username AS setBy FROM gold_rates r JOIN users u ON u.id = r.created_by`;
export interface RateRow {
  id: number; buyPerGram: number; sellPerGram: number; barBuyPerGram: number; barSellPerGram: number;
  source: 'MANUAL' | 'ASSOCIATION'; announcementNo: string | null; note: string | null; effectiveAt: string; setBy: string;
}
export interface NewRate {
  ornament: GoldRate; bar: GoldRate; source?: 'MANUAL' | 'ASSOCIATION'; announcementNo?: string | null; note?: string | null; userId: number;
}

export const insertRate = (db: DB, r: NewRate) =>
  db.prepare(`INSERT INTO gold_rates(buy_per_gram,sell_per_gram,bar_buy_per_gram,bar_sell_per_gram,source,announcement_no,note,created_by)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(r.ornament.buyPerGram, r.ornament.sellPerGram, r.bar.buyPerGram, r.bar.sellPerGram, r.source ?? 'MANUAL', r.announcementNo ?? null, r.note ?? null, r.userId).lastInsertRowid as number;
export const currentRate = (db: DB) => db.prepare(`${SELECT} ORDER BY r.id DESC LIMIT 1`).get() as RateRow | undefined;
export const rateHistory = (db: DB, limit = 100) => db.prepare(`${SELECT} ORDER BY r.id DESC LIMIT ?`).all(limit) as RateRow[];
export const rateSet = (r: RateRow) => ({
  ornament: { buyPerGram: r.buyPerGram, sellPerGram: r.sellPerGram } as GoldRate,
  bar: { buyPerGram: r.barBuyPerGram, sellPerGram: r.barSellPerGram } as GoldRate,
});

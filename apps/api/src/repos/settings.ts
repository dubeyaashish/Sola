import type { DB } from '../db/schema';
import type { TaxConfig, TaxMode } from '@sola/core';

export function getSettings(db: DB): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export function setSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
export function getTaxConfig(db: DB): TaxConfig {
  const s = getSettings(db);
  return { rateBp: Number(s.tax_rate_bp ?? 0), mode: (s.tax_mode ?? 'NONE') as TaxMode };
}

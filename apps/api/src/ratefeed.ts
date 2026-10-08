import type { AssociationQuote } from '@sola/core';
import type { DB } from './db/schema';
import { applyAssociationQuote } from './services/rates';

/**
 * Optional poller for automatic intraday price updates.
 * RATE_FEED_URL must return JSON shaped like AssociationQuote (per-baht prices @96.5 %, in minor units):
 *   { "announcementNo": "12", "barBuy": 6000000, "barSell": 6020000, "ornamentBuy": 5900000, "ornamentSell": 6100000 }
 * Point it at a small adapter for whichever source you license/trust; Sola does not scrape third-party sites.
 */
export function startRateFeed(db: DB, opts: { url: string; intervalMs: number; log: (m: string) => void }) {
  const owner = db.prepare("SELECT id, username, role FROM users WHERE role = 'OWNER' AND active = 1 ORDER BY id LIMIT 1").get() as { id: number; username: string; role: 'OWNER' } | undefined;
  if (!owner) { opts.log('rate feed disabled: no active OWNER user'); return () => {}; }
  const tick = async () => {
    try {
      const res = await fetch(opts.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const q = (await res.json()) as AssociationQuote;
      const r = applyAssociationQuote(db, owner, q);
      if (r.changed) opts.log(`gold rate updated from feed (id ${r.id})`);
    } catch (e) { opts.log(`rate feed error: ${(e as Error).message}`); }
  };
  void tick();
  const t = setInterval(tick, opts.intervalMs);
  return () => clearInterval(t);
}

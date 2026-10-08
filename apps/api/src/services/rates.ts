import { DomainError, ratesFromAssociation, type AssociationQuote, type GoldRate } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { currentRate, insertRate } from '../repos/rates';

function check(r: GoldRate, label: string) {
  if (r.buyPerGram <= 0 || r.sellPerGram < r.buyPerGram) throw new DomainError('INVALID_RATE', `${label}: sell rate must be >= buy rate > 0`);
}

/** Manual price change (e.g. intraday). Appends to the immutable rate history. */
export function setRate(db: DB, actor: Actor, input: { ornament: GoldRate; bar: GoldRate; note?: string | null; source?: 'MANUAL' | 'ASSOCIATION'; announcementNo?: string | null }) {
  check(input.ornament, 'ornament'); check(input.bar, 'bar');
  return db.transaction(() => {
    const id = insertRate(db, { ...input, userId: actor.id });
    audit(db, actor, 'rate.set', 'gold_rate', id, input);
    return id;
  })();
}

/** Apply a Gold Traders Association announcement (per-baht quotes @96.5 %). Skips exact duplicates of the current rate. */
export function applyAssociationQuote(db: DB, actor: Actor, q: AssociationQuote) {
  const { ornament, bar } = ratesFromAssociation(q);
  const cur = currentRate(db);
  if (cur && cur.buyPerGram === ornament.buyPerGram && cur.sellPerGram === ornament.sellPerGram && cur.barBuyPerGram === bar.buyPerGram && cur.barSellPerGram === bar.sellPerGram) {
    return { id: cur.id, changed: false };
  }
  return { id: setRate(db, actor, { ornament, bar, source: 'ASSOCIATION', announcementNo: q.announcementNo ?? null }), changed: true };
}

export function requireRate(db: DB) {
  const r = currentRate(db);
  if (!r) throw new DomainError('NO_RATE', "today's gold rate has not been set");
  return r;
}

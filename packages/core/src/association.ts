import { MG_PER_BAHT } from './weight';
import { rateFromQuote, type GoldRate } from './pricing';
import type { Minor } from './money';

/**
 * Gold Traders Association announcements quote prices per baht-weight (15.244 g) of 96.5 % gold,
 * for bars and ornaments, buy and sell. Convert to the per-pure-gram rates Sola stores.
 */
export interface AssociationQuote {
  announcementNo?: string;
  barBuy: Minor; barSell: Minor;
  ornamentBuy: Minor; ornamentSell: Minor;
}
export interface RateSet { ornament: GoldRate; bar: GoldRate }

export function ratesFromAssociation(q: AssociationQuote): RateSet {
  const g = (p: Minor) => rateFromQuote(p, MG_PER_BAHT, 9650);
  return {
    ornament: { buyPerGram: g(q.ornamentBuy), sellPerGram: g(q.ornamentSell) },
    bar: { buyPerGram: g(q.barBuy), sellPerGram: g(q.barSell) },
  };
}

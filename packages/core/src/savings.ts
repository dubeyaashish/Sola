import { DomainError } from './errors';
import { mulDiv, type Minor } from './money';
import { addDays } from './pawn';

/** Weight (mg) of gold of a given purity that `amount` buys at `ratePerGramPure`. */
export function goldMgForAmount(amount: Minor, purityBp: number, ratePerGramPure: Minor): number {
  if (amount <= 0 || purityBp <= 0 || ratePerGramPure <= 0) throw new DomainError('INVALID', 'amount, purity and rate must be > 0');
  return mulDiv([amount, 10_000_000], purityBp * ratePerGramPure);
}

export function nextInstallmentDate(start: string, frequency: 'WEEKLY' | 'MONTHLY', paidCount: number): string {
  if (frequency === 'WEEKLY') return addDays(start, 7 * paidCount);
  const d = new Date(`${start}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + paidCount);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export const pointsForAmount = (amount: Minor, minorPerPoint: number): number =>
  minorPerPoint > 0 && amount > 0 ? Math.floor(amount / minorPerPoint) : 0;

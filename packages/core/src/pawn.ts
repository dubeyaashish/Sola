import { DomainError } from './errors';
import { mulDiv, type Minor } from './money';

/** Dates are plain calendar dates, YYYY-MM-DD, handled in UTC to avoid timezone drift. */
const DAY = 86_400_000;
export const toDay = (d: string): number => {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(t)) throw new DomainError('INVALID_DATE', `invalid date: ${d}`);
  return Math.round(t / DAY);
};
export const addDays = (d: string, n: number): string => new Date((toDay(d) + n) * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => toDay(to) - toDay(from);

/**
 * Simple interest: principal × monthly rate × days / 30. `minDays` lets a shop charge a minimum period.
 */
export function pawnInterest(p: { principal: Minor; rateBpPerMonth: number; from: string; to: string; minDays?: number }): Minor {
  const days = daysBetween(p.from, p.to);
  if (days < 0) throw new DomainError('INVALID_DATE', 'interest end is before start');
  const charged = days === 0 ? 0 : Math.max(days, p.minDays ?? 0);
  return mulDiv([p.principal, p.rateBpPerMonth, charged], 10000 * 30);
}

export interface PawnState { principal: Minor; rateBpPerMonth: number; interestPaidTo: string; dueDate: string; termDays: number }

export function pawnQuote(c: PawnState, asOf: string, minDays = 0) {
  const interestDue = asOf > c.interestPaidTo ? pawnInterest({ principal: c.principal, rateBpPerMonth: c.rateBpPerMonth, from: c.interestPaidTo, to: asOf, minDays }) : 0;
  return {
    interestDue,
    redeemTotal: c.principal + interestDue,
    overdueDays: Math.max(0, daysBetween(c.dueDate, asOf)),
    renewNewDueDate: addDays(asOf > c.dueDate ? asOf : c.dueDate, c.termDays),
  };
}

export function assertPawnRate(rateBpPerMonth: number, maxBp: number) {
  if (rateBpPerMonth < 0 || rateBpPerMonth > maxBp) throw new DomainError('RATE_TOO_HIGH', `interest rate must be between 0 and ${maxBp} bp/month`);
}

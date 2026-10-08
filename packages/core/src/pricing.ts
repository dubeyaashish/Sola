import { DomainError } from './errors';
import { isValidPurityBp } from './purity';
import { mulDiv, type Minor } from './money';

/**
 * Gold rates are stored per gram of PURE (100 %) gold, in minor units.
 * Item value = weight × purity × rate. `rateFromQuote` converts the usual
 * market quote ("X per baht-weight of 96.5 % gold") into that form.
 */
export interface GoldRate { sellPerGram: Minor; buyPerGram: Minor }

export function rateFromQuote(price: Minor, refWeightMg: number, refPurityBp: number): Minor {
  return mulDiv([price, 1000, 10000], refWeightMg * refPurityBp);
}

export type MakingCharge =
  | { type: 'FIXED'; amount: Minor }
  | { type: 'PER_GRAM'; amount: Minor }
  | { type: 'PERCENT'; bp: number }; // % of gold value, in basis points

export function goldValue(weightMg: number, purityBp: number, ratePerGram: Minor): Minor {
  if (!isValidPurityBp(purityBp)) throw new DomainError('INVALID_PURITY', `invalid purity: ${purityBp}`);
  if (!Number.isInteger(weightMg) || weightMg <= 0) throw new DomainError('INVALID_WEIGHT', 'weight must be > 0');
  return mulDiv([weightMg, purityBp, ratePerGram], 1000 * 10000);
}

export function makingCharge(mc: MakingCharge, weightMg: number, gold: Minor): Minor {
  switch (mc.type) {
    case 'FIXED': return mc.amount;
    case 'PER_GRAM': return mulDiv([weightMg, mc.amount], 1000);
    case 'PERCENT': return mulDiv([gold, mc.bp], 10000);
  }
}

export interface SaleLineInput {
  weightMg: number;
  purityBp: number;
  making: MakingCharge;
  otherCharge?: Minor; // stones, certificate, packaging…
  /** rate class for this line (e.g. bar vs ornament); defaults to the transaction rate */
  rate?: GoldRate;
}
export interface SaleLineQuote { goldValue: Minor; making: Minor; other: Minor; total: Minor }

export function quoteSaleLine(l: SaleLineInput, rate: GoldRate): SaleLineQuote {
  const gold = goldValue(l.weightMg, l.purityBp, (l.rate ?? rate).sellPerGram);
  const making = makingCharge(l.making, l.weightMg, gold);
  const other = l.otherCharge ?? 0;
  if (making < 0 || other < 0) throw new DomainError('INVALID_CHARGE', 'charges cannot be negative');
  return { goldValue: gold, making, other, total: gold + making + other };
}

export interface TradeInInput {
  weightMg: number;
  purityBp: number;
  /** melt/refining loss or wear deduction, basis points of gross value */
  deductionBp?: number;
  /** manager-approved agreed value replacing the computed one */
  overrideValue?: Minor;
  /** rate class for this piece (bar vs ornament); defaults to the transaction rate */
  rate?: GoldRate;
}
export interface TradeInQuote { gross: Minor; deduction: Minor; value: Minor }

export function quoteTradeIn(t: TradeInInput, rate: GoldRate): TradeInQuote {
  const gross = goldValue(t.weightMg, t.purityBp, (t.rate ?? rate).buyPerGram);
  const bp = t.deductionBp ?? 0;
  if (bp < 0 || bp > 10000) throw new DomainError('INVALID_DEDUCTION', 'deduction must be 0–10000 bp');
  const deduction = mulDiv([gross, bp], 10000);
  const value = t.overrideValue ?? gross - deduction;
  if (value < 0) throw new DomainError('INVALID_VALUE', 'trade-in value cannot be negative');
  return { gross, deduction, value };
}

export type TaxMode = 'NONE' | 'MAKING_ONLY' | 'FULL';
export interface TaxConfig { rateBp: number; mode: TaxMode }

export interface TransactionInput {
  saleLines: SaleLineInput[];
  tradeIns: TradeInInput[];
  discount?: Minor;
  tax: TaxConfig;
  rate: GoldRate;
}
export interface TransactionQuote {
  saleLines: SaleLineQuote[];
  tradeIns: TradeInQuote[];
  goldTotal: Minor;
  makingTotal: Minor;
  otherTotal: Minor;
  subtotal: Minor;
  discount: Minor;
  tax: Minor;
  saleTotal: Minor;
  tradeInCredit: Minor;
  /** > 0: customer pays the shop. < 0: shop pays the customer. */
  net: Minor;
}

export function quoteTransaction(i: TransactionInput): TransactionQuote {
  if (i.saleLines.length === 0 && i.tradeIns.length === 0) throw new DomainError('EMPTY', 'nothing to price');
  const saleLines = i.saleLines.map((l) => quoteSaleLine(l, i.rate));
  const tradeIns = i.tradeIns.map((t) => quoteTradeIn(t, i.rate));
  const sum = (f: (l: SaleLineQuote) => number) => saleLines.reduce((a, l) => a + f(l), 0);
  const goldTotal = sum((l) => l.goldValue);
  const makingTotal = sum((l) => l.making);
  const otherTotal = sum((l) => l.other);
  const subtotal = goldTotal + makingTotal + otherTotal;
  const discount = i.discount ?? 0;
  if (discount < 0 || discount > subtotal) throw new DomainError('INVALID_DISCOUNT', 'discount must be between 0 and subtotal');
  const base = i.tax.mode === 'NONE' ? 0 : i.tax.mode === 'FULL' ? subtotal : makingTotal + otherTotal;
  const taxable = Math.max(0, base - discount);
  const tax = mulDiv([taxable, i.tax.rateBp], 10000);
  const saleTotal = subtotal - discount + tax;
  const tradeInCredit = tradeIns.reduce((a, t) => a + t.value, 0);
  return { saleLines, tradeIns, goldTotal, makingTotal, otherTotal, subtotal, discount, tax, saleTotal, tradeInCredit, net: saleTotal - tradeInCredit };
}

export type TransactionType = 'SALE' | 'TRADE_IN' | 'BUYBACK';
export function classifyTransaction(saleCount: number, tradeInCount: number): TransactionType {
  if (saleCount > 0 && tradeInCount > 0) return 'TRADE_IN';
  return saleCount > 0 ? 'SALE' : 'BUYBACK';
}

export function formatDocNo(type: TransactionType, date: Date, seq: number): string {
  const p = { SALE: 'S', TRADE_IN: 'T', BUYBACK: 'B' }[type];
  const d = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `${p}-${d}-${String(seq).padStart(4, '0')}`;
}

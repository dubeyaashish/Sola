import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulDiv, parseMoney, formatMoney, gramsToMg, MG_PER_BAHT, karatToBp, goldValue, rateFromQuote,
  quoteTransaction, quoteTradeIn, classifyTransaction, formatDocNo, can, DomainError,
} from './index';

test('mulDiv rounds half away from zero and handles BigInt-size products', () => {
  assert.equal(mulDiv([1, 1], 2), 1);
  assert.equal(mulDiv([-1, 1], 2), -1);
  assert.equal(mulDiv([1, 1], 3), 0);
  assert.equal(mulDiv([100_000_000, 99_990_000, 5_000_000], 1_000_000_000_000), 49_995_000_000);
});

test('money parse/format round-trip', () => {
  assert.equal(parseMoney('1,234.5'), 123450);
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(-5), '-0.05');
  assert.throws(() => parseMoney('1.234'));
});

test('weight and purity helpers', () => {
  assert.equal(gramsToMg('15.244'), MG_PER_BAHT);
  assert.equal(karatToBp(18), 7500);
  assert.equal(karatToBp(24), 10000);
});

const rate = { sellPerGram: 400_000, buyPerGram: 390_000 }; // 4,000.00 / 3,900.00 per pure gram

test('goldValue = weight × purity × rate', () => {
  // 10 g of 96.5% at 4,000/g pure = 38,600.00
  assert.equal(goldValue(10_000, 9650, rate.sellPerGram), 3_860_000);
});

test('rateFromQuote converts a per-baht 96.5% quote to a pure-gram rate', () => {
  const pure = rateFromQuote(6_000_000, MG_PER_BAHT, 9650); // 60,000.00 per baht-weight @96.5%
  assert.ok(Math.abs(pure - 408_000) < 1000); // ≈ 4,080/g pure
});

test('full transaction with trade-in, discount and tax on making only', () => {
  const q = quoteTransaction({
    rate,
    tax: { rateBp: 700, mode: 'MAKING_ONLY' },
    discount: 10_000,
    saleLines: [{ weightMg: 10_000, purityBp: 9650, making: { type: 'FIXED', amount: 150_000 } }],
    tradeIns: [{ weightMg: 5_000, purityBp: 9650, deductionBp: 100 }],
  });
  assert.equal(q.goldTotal, 3_860_000);
  assert.equal(q.subtotal, 4_010_000);
  assert.equal(q.tax, 9_800); // 7% of (150,000 - 10,000)
  assert.equal(q.saleTotal, 4_010_000 - 10_000 + 9_800);
  // trade-in: 5g*0.965*3900 = 18,817.50 less 1% = 18,629.325 -> gross 1,881,750, ded 18,818 (rounded)
  assert.equal(q.tradeIns[0]!.gross, 1_881_750);
  assert.equal(q.tradeInCredit, q.tradeIns[0]!.value);
  assert.equal(q.net, q.saleTotal - q.tradeInCredit);
  assert.ok(q.net > 0);
});

test('buyback produces negative net (shop pays)', () => {
  const q = quoteTransaction({ rate, tax: { rateBp: 0, mode: 'NONE' }, saleLines: [], tradeIns: [{ weightMg: 1000, purityBp: 9999 }] });
  assert.ok(q.net < 0);
  assert.equal(classifyTransaction(0, 1), 'BUYBACK');
  assert.equal(classifyTransaction(1, 1), 'TRADE_IN');
  assert.equal(classifyTransaction(2, 0), 'SALE');
});

test('validation errors', () => {
  assert.throws(() => goldValue(0, 9650, 1), DomainError);
  assert.throws(() => goldValue(1000, 10001, 1), DomainError);
  assert.throws(() => quoteTradeIn({ weightMg: 1000, purityBp: 9650, deductionBp: 20000 }, rate), DomainError);
  assert.throws(() => quoteTransaction({ rate, tax: { rateBp: 0, mode: 'NONE' }, saleLines: [{ weightMg: 1000, purityBp: 9650, making: { type: 'FIXED', amount: 0 } }], tradeIns: [], discount: 99_999_999 }), DomainError);
});

test('doc numbers and permissions', () => {
  assert.equal(formatDocNo('SALE', new Date('2026-10-08T00:00:00Z'), 7), 'S-20261008-0007');
  assert.equal(can('CASHIER', 'sale.void'), false);
  assert.equal(can('MANAGER', 'sale.void'), true);
  assert.equal(can('MANAGER', 'user.manage'), false);
});

import { pawnInterest, pawnQuote, addDays, daysBetween, assertPawnRate, goldMgForAmount, nextInstallmentDate, pointsForAmount, ratesFromAssociation } from './index';

test('pawn interest is simple, pro-rated by day, with optional minimum', () => {
  // 10,000.00 at 1.25 %/month for 30 days = 125.00
  assert.equal(pawnInterest({ principal: 1_000_000, rateBpPerMonth: 125, from: '2026-01-01', to: '2026-01-31' }), 12_500);
  assert.equal(pawnInterest({ principal: 1_000_000, rateBpPerMonth: 125, from: '2026-01-01', to: '2026-01-16' }), 6_250);
  assert.equal(pawnInterest({ principal: 1_000_000, rateBpPerMonth: 125, from: '2026-01-01', to: '2026-01-03', minDays: 30 }), 12_500);
  assert.equal(pawnInterest({ principal: 1_000_000, rateBpPerMonth: 125, from: '2026-01-01', to: '2026-01-01' }), 0);
  assert.throws(() => pawnInterest({ principal: 1, rateBpPerMonth: 1, from: '2026-02-01', to: '2026-01-01' }), DomainError);
  assert.equal(addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(daysBetween('2026-01-01', '2026-03-01'), 59);
});

test('pawn quote: redeem total and renewal date', () => {
  const c = { principal: 1_000_000, rateBpPerMonth: 125, interestPaidTo: '2026-01-01', dueDate: '2026-01-31', termDays: 30 };
  const q = pawnQuote(c, '2026-02-10');
  assert.equal(q.interestDue, 16_667);
  assert.equal(q.redeemTotal, 1_000_000 + q.interestDue);
  assert.equal(q.overdueDays, 10);
  assert.equal(q.renewNewDueDate, '2026-03-12');
  assert.throws(() => assertPawnRate(500, 125), DomainError);
});

test('savings conversion, schedule and points', () => {
  // 1,000.00 at 2,720.00/pure g, 96.5% -> ~0.381 g
  const mg = goldMgForAmount(100_000, 9650, 272_000);
  assert.ok(Math.abs(mg - 381) <= 1);
  assert.equal(nextInstallmentDate('2026-01-31', 'MONTHLY', 1), '2026-02-28');
  assert.equal(nextInstallmentDate('2026-01-01', 'WEEKLY', 2), '2026-01-15');
  assert.equal(pointsForAmount(2_550_000, 10_000), 255);
});

test('association quote per baht@96.5% -> pure-gram rates', () => {
  const r = ratesFromAssociation({ barBuy: 6_000_000, barSell: 6_020_000, ornamentBuy: 5_900_000, ornamentSell: 6_100_000 });
  assert.ok(r.bar.sellPerGram > r.bar.buyPerGram && r.ornament.sellPerGram > r.ornament.buyPerGram);
  assert.ok(Math.abs(r.bar.buyPerGram - 407_900) < 500);
});

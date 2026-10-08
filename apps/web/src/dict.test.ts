import test from 'node:test';
import assert from 'node:assert/strict';
import { DICT } from './dict';

const entries = Object.entries(DICT) as [string, [string, string]][];

test('every key has non-empty English and Thai text', () => {
  for (const [k, [en, th]] of entries) { assert.ok(en.trim(), `${k} EN`); assert.ok(th.trim(), `${k} TH`); }
});

test('Thai text contains Thai characters (not an untranslated copy)', () => {
  for (const [k, [, th]] of entries) assert.match(th, /[฀-๿]/, `${k} looks untranslated`);
});

test('enum labels cover every value the API can return', () => {
  const need: Record<string, string[]> = {
    st: ['IN_STOCK', 'SOLD', 'RESERVED', 'MISSING', 'VOIDED', 'COMPLETED', 'ACTIVE', 'REDEEMED', 'FORFEITED', 'CLOSED', 'ISSUED', 'CANCELLED', 'PENDING', 'SENT', 'FAILED'],
    type: ['SALE', 'TRADE_IN', 'BUYBACK'], src: ['NEW', 'TRADE_IN', 'FORFEITED'], role: ['OWNER', 'MANAGER', 'CASHIER', 'STOCK_CLERK'],
    mv: ['RECEIVE', 'SALE', 'TRADE_IN_RECEIVE', 'FORFEIT_RECEIVE', 'VOID_RETURN', 'VOID_REMOVE', 'ADJUST'], dt: ['TAX_INVOICE_ABBR', 'TAX_INVOICE_FULL', 'PURCHASE_VOUCHER', 'CREDIT_NOTE'],
    pe: ['OPEN', 'RENEW', 'PAY_PRINCIPAL', 'REDEEM', 'FORFEIT'], pt: ['PAWN', 'SELL_BACK'], sk: ['DEPOSIT', 'REDEEM', 'REFUND'], pr: ['EARN', 'REDEEM', 'ADJUST', 'VOID'],
    mth: ['CASH', 'TRANSFER', 'CARD', 'SAVINGS', 'OTHER'], mk: ['FIXED', 'PER_GRAM', 'PERCENT'], plan: ['FIXED', 'FLEXIBLE'], mode: ['CASH', 'GOLD_WEIGHT'], fr: ['MONTHLY', 'WEEKLY'],
    cat: ['RING', 'CHAIN', 'BANGLE', 'PENDANT', 'EARRING', 'BAR', 'ORNAMENT', 'SCRAP', 'FORFEITED'],
  };
  for (const [prefix, values] of Object.entries(need)) for (const v of values) assert.ok(`${prefix}.${v}` in DICT, `missing ${prefix}.${v}`);
});

test('placeholders match between languages', () => {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const [k, [en, th]] of entries) assert.equal(ph(en), ph(th), k);
});

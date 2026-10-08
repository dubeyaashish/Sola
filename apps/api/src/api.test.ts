import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app';
import { insertUser } from './repos/users';

function setup() {
  const { app, db } = buildApp({ jwtSecret: 'test-secret-test-secret' });
  for (const [username, role] of [['owner', 'OWNER'], ['manager', 'MANAGER'], ['cashier', 'CASHIER'], ['stock', 'STOCK_CLERK']] as const)
    insertUser(db, { username, password: 'password123', fullName: username, role });
  const tokens: Record<string, string> = {};
  const call = async (who: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) => {
    if (!tokens[who]) {
      const r = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: who, password: 'password123' } });
      tokens[who] = r.json().token;
    }
    const res = await app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${tokens[who]}` } });
    return { status: res.statusCode, body: res.json() as any };
  };
  return { app, db, call };
}

async function configured() {
  const t = setup();
  const { call } = t;
  assert.equal((await call('owner', 'PUT', '/settings', { shop_tax_id: '0105500000001', shop_address: '1 Yaowarat Rd', tax_rate_bp: 700, tax_mode: 'MAKING_ONLY' })).status, 200);
  assert.equal((await call('manager', 'POST', '/rates', { ornament: { buyPerGram: 270000, sellPerGram: 276000 }, bar: { buyPerGram: 272000, sellPerGram: 274000 } })).status, 201);
  const mk = async (body: object) => (await call('stock', 'POST', '/items', body)).body;
  const ring = await mk({ name: 'Ring', weightMg: 3800, purityBp: 9650, making: { type: 'PER_GRAM', amount: 25000 }, cost: 900000 });
  const bar = await mk({ name: 'Bar 5g', category: 'BAR', weightMg: 5000, purityBp: 9650, making: { type: 'FIXED', amount: 30000 }, cost: 1300000 });
  const cust = (await call('cashier', 'POST', '/customers', { name: 'Somchai', nationalId: '1234567890123', phone: '0812345678', member: true, idSource: 'CARD_READER' })).body;
  return { ...t, ring, bar, cust };
}

test('auth and permissions', async () => {
  const { app, call } = setup();
  assert.equal((await app.inject({ method: 'GET', url: '/items' })).statusCode, 401);
  assert.equal((await call('cashier', 'POST', '/rates', {})).status, 403);
  assert.equal((await call('cashier', 'GET', '/audit')).status, 403);
  assert.equal((await call('stock', 'POST', '/transactions', { itemIds: [1] })).status, 403);
});

test('sale: bar uses bar rate, stock cut, tax invoice + points issued; void restores everything', async () => {
  const { call, ring, bar, cust } = await configured();
  const q = await call('cashier', 'POST', '/pricing/quote', { itemIds: [ring.id, bar.id] });
  assert.equal(q.status, 200);
  // bar: 5g * .965 * 2740 = 13,220.50 ; ring: 3.8g * .965 * 2760 = 10,121.? 
  assert.equal(q.body.quote.saleLines[1].goldValue, Math.round(5000 * 9650 * 274000 / 1e7));
  assert.equal(q.body.quote.saleLines[0].goldValue, Math.round(3800 * 9650 * 276000 / 1e7));
  const due = q.body.quote.net;

  const bad = await call('cashier', 'POST', '/transactions', { itemIds: [ring.id, bar.id], customerId: cust.id, payments: [{ method: 'CASH', amount: due - 1 }] });
  assert.equal(bad.status, 400); assert.equal(bad.body.error, 'PAYMENT_MISMATCH');

  const ok = await call('cashier', 'POST', '/transactions', { itemIds: [ring.id, bar.id], customerId: cust.id, payments: [{ method: 'CASH', amount: due }] });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.type, 'SALE');
  assert.equal(ok.body.documents[0].docNo.startsWith('ABB-'), true);
  assert.ok(ok.body.pointsEarned > 0);
  assert.equal((await call('cashier', 'GET', `/items/${ring.id}`)).body.status, 'SOLD');
  assert.equal((await call('cashier', 'GET', `/customers/${cust.id}`)).body.pointsBalance, ok.body.pointsEarned);

  // sold item cannot be sold twice
  const again = await call('cashier', 'POST', '/transactions', { itemIds: [ring.id], payments: [] });
  assert.equal(again.body.error, 'ITEM_UNAVAILABLE');

  // full tax invoice on request
  const full = await call('cashier', 'POST', `/transactions/${ok.body.id}/documents/full`, { buyerName: 'ACME Co', buyerTaxId: '0105500000099', buyerAddress: 'Bangkok' });
  assert.equal(full.status, 201);
  assert.equal((await call('owner', 'GET', '/etax/outbox')).body.length, 2);

  // profit & loss uses cost snapshots
  const pl = (await call('manager', 'GET', '/reports/profit-loss')).body;
  assert.equal(pl.cogs, 900000 + 1300000);
  assert.equal(pl.revenue, ok.body.saleTotal - ok.body.tax);

  assert.equal((await call('cashier', 'POST', `/transactions/${ok.body.id}/void`, { reason: 'x' })).status, 403);
  const v = await call('manager', 'POST', `/transactions/${ok.body.id}/void`, { reason: 'customer changed mind' });
  assert.equal(v.status, 200); assert.equal(v.body.status, 'VOIDED');
  assert.equal((await call('cashier', 'GET', `/items/${ring.id}`)).body.status, 'IN_STOCK');
  assert.equal((await call('cashier', 'GET', `/customers/${cust.id}`)).body.pointsBalance, 0);
  assert.equal((await call('manager', 'GET', '/reports/profit-loss')).body.revenue, 0);
  assert.equal((await call('manager', 'POST', `/transactions/${ok.body.id}/void`, { reason: 'again' })).body.error, 'ALREADY_VOIDED');
});

test('trade-in (exchange) and buyback', async () => {
  const { call, ring, cust } = await configured();
  const body = { itemIds: [ring.id], customerId: cust.id, tradeIns: [{ weightMg: 3000, purityBp: 9650, deductionBp: 100, description: 'old chain' }] };
  const q = (await call('cashier', 'POST', '/pricing/quote', body)).body.quote;
  assert.equal(q.net, q.saleTotal - q.tradeInCredit);
  const noCust = await call('cashier', 'POST', '/transactions', { ...body, customerId: null, payments: [{ method: 'CASH', amount: q.net }] });
  assert.equal(noCust.body.error, 'CUSTOMER_REQUIRED');
  const tx = await call('cashier', 'POST', '/transactions', { ...body, payments: [{ method: 'CASH', amount: q.net }] });
  assert.equal(tx.body.type, 'TRADE_IN');
  const stock = (await call('stock', 'GET', '/items?status=IN_STOCK')).body;
  assert.ok(stock.some((i: any) => i.source === 'TRADE_IN' && i.weightMg === 3000 && i.cost === q.tradeIns[0].value));

  // buyback pays the customer; override needs permission
  const buy = { customerId: cust.id, tradeIns: [{ weightMg: 2000, purityBp: 9999 }], payments: [] as any[] };
  const bq = (await call('cashier', 'POST', '/pricing/quote', buy)).body.quote;
  assert.ok(bq.net < 0);
  buy.payments = [{ method: 'CASH', amount: -bq.net }];
  const bb = await call('cashier', 'POST', '/transactions', buy);
  assert.equal(bb.body.type, 'BUYBACK');
  assert.equal(bb.body.payments[0].amount, bq.net);
  assert.equal(bb.body.documents[0].docNo.startsWith('PV-'), true);
  assert.equal((await call('cashier', 'POST', '/pricing/quote', { ...buy, tradeIns: [{ weightMg: 2000, purityBp: 9999, overrideValue: 1 }] })).status, 403);

  // trade-in gold that was already resold blocks the void
  const ti = stock.find((i: any) => i.source === 'TRADE_IN' && i.weightMg === 3000);
  const sold = await call('cashier', 'POST', '/transactions', { itemIds: [ti.id], payments: [{ method: 'CASH', amount: (await call('cashier', 'POST', '/pricing/quote', { itemIds: [ti.id] })).body.quote.net }] });
  assert.equal(sold.status, 201);
  assert.equal((await call('manager', 'POST', `/transactions/${tx.body.id}/void`, { reason: 'oops' })).body.error, 'VOID_BLOCKED');
});

test('association rate ingest is idempotent', async () => {
  const { call } = await configured();
  const quote = { announcementNo: '7', barBuy: 6_000_000, barSell: 6_020_000, ornamentBuy: 5_900_000, ornamentSell: 6_100_000 };
  const a = await call('manager', 'POST', '/rates/association', quote);
  const b = await call('manager', 'POST', '/rates/association', quote);
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.body.changed, false);
  assert.equal(a.body.rate.source, 'ASSOCIATION');
});

test('pawn: open → renew → partial pay → redeem; forfeit moves gold to stock', async () => {
  const { call, cust } = await configured();
  const open = (extra = {}) => call('cashier', 'POST', '/pawn', { type: 'PAWN', customerId: cust.id, principal: 1_000_000, rateBpPerMonth: 125, startDate: '2026-01-01', items: [{ description: 'bangle', weightMg: 15244, purityBp: 9650, appraisedValue: 1_500_000 }], ...extra });
  assert.equal((await open({ rateBpPerMonth: 500 })).body.error, 'RATE_TOO_HIGH');
  const c = (await open()).body;
  assert.equal(c.dueDate, '2026-01-31');
  const q = (await call('cashier', 'GET', `/pawn/${c.id}/quote?asOf=2026-01-31`)).body;
  assert.equal(q.interestDue, 12_500);
  const r = (await call('cashier', 'POST', `/pawn/${c.id}/renew`, { asOf: '2026-01-31' })).body;
  assert.equal(r.interestPaid, 12_500); assert.equal(r.dueDate, '2026-03-02'); assert.equal(r.interestPaidTo, '2026-01-31');
  const pp = (await call('cashier', 'POST', `/pawn/${c.id}/pay-principal`, { amount: 400_000, asOf: '2026-02-15' })).body;
  assert.equal(pp.principal, 600_000);
  const red = (await call('cashier', 'POST', `/pawn/${c.id}/redeem`, { asOf: '2026-03-02' })).body;
  assert.equal(red.status, 'REDEEMED');
  assert.equal(red.received, 600_000 + Math.round(600_000 * 125 * 15 / 300_000));
  assert.equal((await call('cashier', 'POST', `/pawn/${c.id}/redeem`, {})).body.error, 'INVALID_STATE');

  // forfeit: only manager, only after due date
  const c2 = (await open()).body;
  assert.equal((await call('cashier', 'POST', `/pawn/${c2.id}/forfeit`, { asOf: '2026-03-01' })).status, 403);
  assert.equal((await call('manager', 'POST', `/pawn/${c2.id}/forfeit`, { asOf: '2026-01-31' })).body.error, 'NOT_OVERDUE');
  const f = (await call('manager', 'POST', `/pawn/${c2.id}/forfeit`, { asOf: '2026-02-01' })).body;
  assert.equal(f.status, 'FORFEITED');
  const ff = (await call('stock', 'GET', '/items?q=FF-')).body;
  assert.equal(ff.length, 1); assert.equal(ff[0].source, 'FORFEITED'); assert.equal(ff[0].cost, 1_000_000);
  assert.equal((await call('manager', 'GET', '/pawn?overdue=true&status=ACTIVE')).body.length, 0);

  // customers without national ID can't pawn
  const anon = (await call('cashier', 'POST', '/customers', { name: 'No ID' })).body;
  assert.equal((await open({ customerId: anon.id })).body.error, 'CUSTOMER_ID_REQUIRED');
  const pl = (await call('manager', 'GET', '/reports/profit-loss?from=2026-01-01&to=2026-12-31')).body;
  assert.equal(pl.pawnInterestIncome, 12_500 + Math.round(1_000_000 * 125 * 15 / 300_000) + red.received - 600_000);
});

test('gold savings (weight mode) paying part of a sale; void refunds; ticket data', async () => {
  const { call, ring, cust } = await configured();
  const acct = (await call('cashier', 'POST', '/savings', { customerId: cust.id, plan: 'FIXED', mode: 'GOLD_WEIGHT', installmentAmount: 100_000, frequency: 'MONTHLY', targetAmount: 1_000_000, startDate: '2026-01-31' })).body;
  assert.equal((await call('cashier', 'POST', `/savings/${acct.id}/deposit`, { amount: 150_000 })).body.error, 'INVALID');
  const d = (await call('cashier', 'POST', `/savings/${acct.id}/deposit`, { amount: 300_000 })).body;
  assert.equal(d.balance, 300_000); assert.ok(d.goldMg > 0);
  const st = (await call('cashier', 'GET', `/savings/${acct.id}`)).body;
  assert.equal(st.nextDueDate, '2026-04-30'); assert.equal(st.entries.length, 1);

  const q = (await call('cashier', 'POST', '/pricing/quote', { itemIds: [ring.id] })).body.quote;
  const pay = [{ method: 'SAVINGS', amount: 300_000, savingsAccountId: acct.id }, { method: 'CASH', amount: q.net - 300_000 }];
  const tx = await call('cashier', 'POST', '/transactions', { itemIds: [ring.id], customerId: cust.id, payments: pay });
  assert.equal(tx.status, 201);
  const after = (await call('cashier', 'GET', `/savings/${acct.id}`)).body.account;
  assert.equal(after.balance, 0); assert.ok(after.goldMg <= 1);
  await call('manager', 'POST', `/transactions/${tx.body.id}/void`, { reason: 'test' });
  const restored = (await call('cashier', 'GET', `/savings/${acct.id}`)).body.account;
  assert.equal(restored.balance, 300_000); assert.equal(restored.goldMg, d.goldMg);

  const other = (await call('cashier', 'POST', '/customers', { name: 'Other', nationalId: '9999999999999' })).body;
  const pay2 = [{ method: 'SAVINGS', amount: 100_000, savingsAccountId: acct.id }, { method: 'CASH', amount: q.net - 100_000 }];
  assert.equal((await call('cashier', 'POST', '/transactions', { itemIds: [ring.id], customerId: other.id, payments: pay2 })).status, 400);
  const closed = (await call('cashier', 'POST', `/savings/${acct.id}/close`, { note: 'customer request' })).body;
  assert.equal(closed.refunded, 300_000);
});

test('loyalty rewards, ledger, dashboard', async () => {
  const { call, cust, ring } = await configured();
  const q = (await call('cashier', 'POST', '/pricing/quote', { itemIds: [ring.id] })).body.quote;
  await call('cashier', 'POST', '/transactions', { itemIds: [ring.id], customerId: cust.id, payments: [{ method: 'CASH', amount: q.net }] });
  const pts = (await call('cashier', 'GET', `/customers/${cust.id}`)).body.pointsBalance;
  assert.equal(pts, Math.floor(q.saleTotal / 10000));
  const rw = (await call('manager', 'POST', '/rewards', { name: 'Gift box', pointsCost: 10, stockQty: 1 })).body;
  assert.equal((await call('cashier', 'POST', `/customers/${cust.id}/redeem-reward`, { rewardId: rw.id })).body.balance, pts - 10);
  assert.equal((await call('cashier', 'POST', `/customers/${cust.id}/redeem-reward`, { rewardId: rw.id })).body.error, 'OUT_OF_STOCK');

  assert.equal((await call('cashier', 'POST', '/ledger', { kind: 'EXPENSE', category: 'Rent', amount: 5000 })).status, 403);
  await call('manager', 'POST', '/ledger', { kind: 'EXPENSE', category: 'Rent', amount: 500_000 });
  const pl = (await call('manager', 'GET', '/reports/profit-loss')).body;
  assert.equal(pl.expenses, 500_000);
  assert.equal(pl.netProfit, pl.grossProfit - 500_000);
  const dash = (await call('manager', 'GET', '/reports/dashboard')).body;
  assert.ok(dash.stock.length > 0 && dash.stockMarketValue > 0);
  assert.equal(dash.today.salesCount, 1);
});

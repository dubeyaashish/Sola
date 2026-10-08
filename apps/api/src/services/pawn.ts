import { DomainError, addDays, assertPawnRate, pawnQuote } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { insertItem, insertMovement } from '../repos/items';
import { getSettings } from '../repos/settings';
import { nextDocSeq } from '../repos/transactions';

type Method = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
const today = () => new Date().toISOString().slice(0, 10);
const SELECT = `SELECT p.id, p.contract_no AS contractNo, p.type, p.customer_id AS customerId, c.name AS customerName, p.principal, p.rate_bp_per_month AS rateBpPerMonth,
  p.term_days AS termDays, p.start_date AS startDate, p.due_date AS dueDate, p.interest_paid_to AS interestPaidTo, p.status, p.appraised_value AS appraisedValue,
  p.note, p.closed_at AS closedAt, p.created_at AS createdAt FROM pawn_contracts p JOIN customers c ON c.id = p.customer_id`;
interface Contract { id: number; contractNo: string; type: 'PAWN' | 'SELL_BACK'; customerId: number; principal: number; rateBpPerMonth: number; termDays: number; startDate: string; dueDate: string; interestPaidTo: string; status: 'ACTIVE' | 'REDEEMED' | 'FORFEITED' }
const must = (db: DB, id: number) => { const c = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as Contract | undefined; if (!c) throw new DomainError('NOT_FOUND', 'contract not found'); return c; };
const active = (db: DB, id: number) => { const c = must(db, id); if (c.status !== 'ACTIVE') throw new DomainError('INVALID_STATE', `contract is ${c.status}`); return c; };
const minDays = (db: DB) => Number(getSettings(db).pawn_min_interest_days ?? 0);

export interface OpenInput {
  type: 'PAWN' | 'SELL_BACK'; customerId: number; principal: number; rateBpPerMonth: number; termDays?: number; startDate?: string; note?: string | null; method?: Method;
  items: Array<{ description: string; weightMg: number; purityBp: number; appraisedValue?: number }>;
}

export function openContract(db: DB, actor: Actor, i: OpenInput) {
  if (!i.items.length) throw new DomainError('INVALID', 'at least one pledged item is required');
  const s = getSettings(db);
  assertPawnRate(i.rateBpPerMonth, Number(s.pawn_max_rate_bp_per_month ?? 125));
  return db.transaction(() => {
    const cust = db.prepare('SELECT national_id AS nid FROM customers WHERE id = ?').get(i.customerId) as { nid: string | null } | undefined;
    if (!cust) throw new DomainError('NOT_FOUND', 'customer not found');
    if (!cust.nid) throw new DomainError('CUSTOMER_ID_REQUIRED', "customer's national ID is required (use the ID-card reader or enter it)");
    const start = i.startDate ?? today();
    const term = i.termDays ?? Number(s.pawn_default_term_days ?? 30);
    const day = start.replaceAll('-', '');
    const no = `${i.type === 'PAWN' ? 'P' : 'F'}-${day}-${String(nextDocSeq(db, `PW-${day}`)).padStart(4, '0')}`;
    const appraised = i.items.reduce((a, x) => a + (x.appraisedValue ?? 0), 0);
    const id = db.prepare(
      `INSERT INTO pawn_contracts(contract_no,type,customer_id,principal,rate_bp_per_month,term_days,start_date,due_date,interest_paid_to,appraised_value,note,user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(no, i.type, i.customerId, i.principal, i.rateBpPerMonth, term, start, addDays(start, term), start, appraised, i.note ?? null, actor.id).lastInsertRowid as number;
    const ins = db.prepare('INSERT INTO pawn_items(contract_id,description,weight_mg,purity_bp,appraised_value) VALUES (?,?,?,?,?)');
    for (const x of i.items) ins.run(id, x.description, x.weightMg, x.purityBp, x.appraisedValue ?? 0);
    db.prepare("INSERT INTO pawn_events(contract_id,kind,principal_amount,method,period_to,new_due_date,user_id) VALUES (?, 'OPEN',?,?,?,?,?)")
      .run(id, -i.principal, i.method ?? 'CASH', start, addDays(start, term), actor.id);
    audit(db, actor, 'pawn.open', 'pawn_contract', id, { no, principal: i.principal, type: i.type });
    return getContract(db, id);
  })();
}

export function quoteContract(db: DB, id: number, asOf = today()) {
  const c = must(db, id);
  return { contract: c, asOf, ...pawnQuote(c, asOf, minDays(db)) };
}

export function renew(db: DB, actor: Actor, id: number, o: { asOf?: string; method?: Method }) {
  return db.transaction(() => {
    const c = active(db, id);
    const asOf = o.asOf ?? today();
    const q = pawnQuote(c, asOf, minDays(db));
    if (asOf <= c.interestPaidTo) throw new DomainError('INVALID', 'interest is already paid up to that date');
    db.prepare("INSERT INTO pawn_events(contract_id,kind,interest_amount,method,period_from,period_to,new_due_date,user_id) VALUES (?, 'RENEW',?,?,?,?,?,?)")
      .run(id, q.interestDue, o.method ?? 'CASH', c.interestPaidTo, asOf, q.renewNewDueDate, actor.id);
    db.prepare('UPDATE pawn_contracts SET interest_paid_to = ?, due_date = ? WHERE id = ?').run(asOf, q.renewNewDueDate, id);
    audit(db, actor, 'pawn.renew', 'pawn_contract', id, { interest: q.interestDue, newDue: q.renewNewDueDate });
    return { ...getContract(db, id), interestPaid: q.interestDue };
  })();
}

/** Pay accrued interest plus part of the principal; the remainder keeps accruing from today. */
export function payPrincipal(db: DB, actor: Actor, id: number, o: { amount: number; asOf?: string; method?: Method }) {
  return db.transaction(() => {
    const c = active(db, id);
    if (!Number.isInteger(o.amount) || o.amount <= 0 || o.amount >= c.principal) throw new DomainError('INVALID', 'partial payment must be > 0 and less than the principal (use redeem to close)');
    const asOf = o.asOf ?? today();
    const q = pawnQuote(c, asOf, minDays(db));
    db.prepare("INSERT INTO pawn_events(contract_id,kind,principal_amount,interest_amount,method,period_from,period_to,user_id) VALUES (?, 'PAY_PRINCIPAL',?,?,?,?,?,?)")
      .run(id, o.amount, q.interestDue, o.method ?? 'CASH', c.interestPaidTo, asOf, actor.id);
    db.prepare('UPDATE pawn_contracts SET principal = principal - ?, interest_paid_to = ? WHERE id = ?').run(o.amount, asOf > c.interestPaidTo ? asOf : c.interestPaidTo, id);
    audit(db, actor, 'pawn.pay_principal', 'pawn_contract', id, { amount: o.amount, interest: q.interestDue });
    return { ...getContract(db, id), received: o.amount + q.interestDue };
  })();
}

export function redeem(db: DB, actor: Actor, id: number, o: { asOf?: string; method?: Method }) {
  return db.transaction(() => {
    const c = active(db, id);
    const asOf = o.asOf ?? today();
    const q = pawnQuote(c, asOf, minDays(db));
    db.prepare("INSERT INTO pawn_events(contract_id,kind,principal_amount,interest_amount,method,period_from,period_to,user_id) VALUES (?, 'REDEEM',?,?,?,?,?,?)")
      .run(id, c.principal, q.interestDue, o.method ?? 'CASH', c.interestPaidTo, asOf, actor.id);
    db.prepare("UPDATE pawn_contracts SET status = 'REDEEMED', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), interest_paid_to = ? WHERE id = ?").run(asOf, id);
    audit(db, actor, 'pawn.redeem', 'pawn_contract', id, { total: q.redeemTotal });
    return { ...getContract(db, id), received: q.redeemTotal };
  })();
}

/** Move the pledged pieces into stock as FORFEITED gold once the (grace-extended) due date has passed. */
export function forfeit(db: DB, actor: Actor, id: number, o: { asOf?: string } = {}) {
  return db.transaction(() => {
    const c = active(db, id);
    const asOf = o.asOf ?? today();
    const grace = Number(getSettings(db).pawn_grace_days ?? 0);
    if (asOf <= addDays(c.dueDate, grace)) throw new DomainError('NOT_OVERDUE', `contract cannot be forfeited before ${addDays(c.dueDate, grace)}`);
    const items = db.prepare('SELECT id, description, weight_mg AS weightMg, purity_bp AS purityBp, appraised_value AS appraised FROM pawn_items WHERE contract_id = ? ORDER BY id').all(id) as
      { id: number; description: string; weightMg: number; purityBp: number; appraised: number }[];
    // Allocate the principal as stock cost, by appraised value (falls back to weight); remainder goes to the last piece.
    const basis = (x: { appraised: number; weightMg: number }) => (items.some((y) => y.appraised > 0) ? x.appraised : x.weightMg);
    const total = items.reduce((a, x) => a + basis(x), 0);
    let left = c.principal;
    items.forEach((x, idx) => {
      const cost = idx === items.length - 1 ? left : Math.floor((c.principal * basis(x)) / total);
      left -= cost;
      const itemId = insertItem(db, {
        sku: `FF-${c.contractNo}-${idx + 1}`, name: x.description, category: 'FORFEITED', weightMg: x.weightMg, purityBp: x.purityBp,
        making: { type: 'FIXED', amount: 0 }, cost, source: 'FORFEITED',
      });
      db.prepare('UPDATE pawn_items SET stock_item_id = ? WHERE id = ?').run(itemId, x.id);
      insertMovement(db, { itemId, type: 'FORFEIT_RECEIVE', from: null, to: 'IN_STOCK', weightMg: x.weightMg, userId: actor.id, note: c.contractNo });
    });
    db.prepare("INSERT INTO pawn_events(contract_id,kind,period_to,user_id) VALUES (?, 'FORFEIT',?,?)").run(id, asOf, actor.id);
    db.prepare("UPDATE pawn_contracts SET status = 'FORFEITED', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(id);
    audit(db, actor, 'pawn.forfeit', 'pawn_contract', id, { items: items.length });
    return getContract(db, id);
  })();
}

export function getContract(db: DB, id: number) {
  const c = must(db, id);
  const items = db.prepare('SELECT id, description, weight_mg AS weightMg, purity_bp AS purityBp, appraised_value AS appraisedValue, stock_item_id AS stockItemId FROM pawn_items WHERE contract_id = ?').all(id);
  const events = db.prepare(`SELECT id, kind, principal_amount AS principalAmount, interest_amount AS interestAmount, method, period_from AS periodFrom, period_to AS periodTo,
    new_due_date AS newDueDate, created_at AS createdAt FROM pawn_events WHERE contract_id = ? ORDER BY id`).all(id);
  return { ...c, items, events };
}

export function listContracts(db: DB, f: { status?: string; overdue?: boolean; customerId?: number; asOf?: string }) {
  const where: string[] = []; const args: unknown[] = [];
  if (f.status) { where.push('p.status = ?'); args.push(f.status); }
  if (f.customerId) { where.push('p.customer_id = ?'); args.push(f.customerId); }
  if (f.overdue) { where.push("p.status = 'ACTIVE' AND p.due_date < ?"); args.push(f.asOf ?? today()); }
  return db.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.due_date LIMIT 300`).all(...args);
}

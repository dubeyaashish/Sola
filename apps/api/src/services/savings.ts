import { DomainError, goldMgForAmount, nextInstallmentDate } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { currentRate } from '../repos/rates';

type Method = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
interface Account {
  id: number; accountNo: string; customerId: number; plan: 'FIXED' | 'FLEXIBLE'; mode: 'CASH' | 'GOLD_WEIGHT'; purityBp: number;
  installmentAmount: number | null; frequency: 'WEEKLY' | 'MONTHLY' | null; targetAmount: number | null; startDate: string;
  balance: number; goldMg: number; status: 'ACTIVE' | 'COMPLETED' | 'CLOSED';
}
const SELECT = `SELECT id, account_no AS accountNo, customer_id AS customerId, plan, mode, purity_bp AS purityBp, installment_amount AS installmentAmount,
  frequency, target_amount AS targetAmount, start_date AS startDate, balance, gold_mg AS goldMg, status FROM savings_accounts`;

export const getAccount = (db: DB, id: number) => db.prepare(`${SELECT} WHERE id = ?`).get(id) as Account | undefined;
const must = (db: DB, id: number) => { const a = getAccount(db, id); if (!a) throw new DomainError('NOT_FOUND', 'savings account not found'); return a; };

export function openAccount(db: DB, actor: Actor, i: {
  customerId: number; plan: 'FIXED' | 'FLEXIBLE'; mode: 'CASH' | 'GOLD_WEIGHT'; purityBp?: number;
  installmentAmount?: number; frequency?: 'WEEKLY' | 'MONTHLY'; targetAmount?: number; startDate?: string;
}) {
  if (i.plan === 'FIXED' && (!i.installmentAmount || !i.frequency)) throw new DomainError('INVALID', 'fixed plans need installmentAmount and frequency');
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(i.customerId)) throw new DomainError('NOT_FOUND', 'customer not found');
    const id = db.prepare(
      `INSERT INTO savings_accounts(account_no,customer_id,plan,mode,purity_bp,installment_amount,frequency,target_amount,start_date)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(`TMP${Math.random()}`, i.customerId, i.plan, i.mode, i.purityBp ?? 9650, i.installmentAmount ?? null, i.frequency ?? null, i.targetAmount ?? null, i.startDate ?? new Date().toISOString().slice(0, 10)).lastInsertRowid as number;
    db.prepare('UPDATE savings_accounts SET account_no = ? WHERE id = ?').run(`SV-${String(id).padStart(6, '0')}`, id);
    audit(db, actor, 'savings.open', 'savings_account', id, i);
    return getAccount(db, id)!;
  })();
}

export function deposit(db: DB, actor: Actor, id: number, amount: number, method: Method) {
  if (!Number.isInteger(amount) || amount <= 0) throw new DomainError('INVALID', 'amount must be a positive integer');
  return db.transaction(() => {
    const a = must(db, id);
    if (a.status !== 'ACTIVE') throw new DomainError('INVALID_STATE', `account is ${a.status}`);
    if (a.plan === 'FIXED' && amount % a.installmentAmount! !== 0) throw new DomainError('INVALID', `fixed plan deposits must be a multiple of ${a.installmentAmount}`);
    let mg = 0; let rate: number | null = null;
    if (a.mode === 'GOLD_WEIGHT') {
      const r = currentRate(db);
      if (!r) throw new DomainError('NO_RATE', 'gold rate not set');
      rate = r.sellPerGram;
      mg = goldMgForAmount(amount, a.purityBp, rate);
    }
    db.prepare("INSERT INTO savings_entries(account_id,kind,amount,gold_mg,rate_per_gram,method,user_id) VALUES (?, 'DEPOSIT',?,?,?,?,?)").run(id, amount, mg, rate, method, actor.id);
    const newBalance = a.balance + amount;
    const done = a.targetAmount != null && newBalance >= a.targetAmount;
    db.prepare('UPDATE savings_accounts SET balance = ?, gold_mg = gold_mg + ?, status = ? WHERE id = ?').run(newBalance, mg, done ? 'COMPLETED' : 'ACTIVE', id);
    audit(db, actor, 'savings.deposit', 'savings_account', id, { amount, mg });
    return getAccount(db, id)!;
  })();
}

/** Use savings as a payment inside a sale. Must be called inside the sale's DB transaction. */
export function redeemToSale(db: DB, actor: Actor, id: number, amount: number, txId: number, saleCustomerId: number | null) {
  const a = must(db, id);
  if (a.status === 'CLOSED') throw new DomainError('INVALID_STATE', 'account is closed');
  if (a.customerId !== saleCustomerId) throw new DomainError('INVALID', 'savings account belongs to a different customer');
  let mg = 0; let rate: number | null = null;
  if (a.mode === 'GOLD_WEIGHT') {
    const r = currentRate(db)!;
    rate = r.sellPerGram;
    mg = goldMgForAmount(amount, a.purityBp, rate);
    if (a.goldMg < mg) throw new DomainError('INSUFFICIENT_SAVINGS', 'not enough saved gold weight for this amount');
  } else if (a.balance < amount) throw new DomainError('INSUFFICIENT_SAVINGS', `savings balance ${a.balance} is below ${amount}`);
  db.prepare("INSERT INTO savings_entries(account_id,kind,amount,gold_mg,rate_per_gram,transaction_id,user_id) VALUES (?, 'REDEEM',?,?,?,?,?)").run(id, -amount, -mg, rate, txId, actor.id);
  const newBal = Math.max(0, a.balance - amount);
  db.prepare("UPDATE savings_accounts SET balance = ?, gold_mg = gold_mg - ?, status = CASE WHEN ? = 0 THEN 'CLOSED' ELSE status END WHERE id = ?").run(newBal, mg, newBal, id);
}

/** Reverse every savings redemption attached to a voided transaction. */
export function refundForVoid(db: DB, actor: Actor, txId: number) {
  const rows = db.prepare("SELECT account_id AS accountId, amount, gold_mg AS mg FROM savings_entries WHERE transaction_id = ? AND kind = 'REDEEM'").all(txId) as { accountId: number; amount: number; mg: number }[];
  for (const r of rows) {
    db.prepare("INSERT INTO savings_entries(account_id,kind,amount,gold_mg,transaction_id,user_id,note) VALUES (?, 'REFUND',?,?,?,?, 'void')").run(r.accountId, -r.amount, -r.mg, txId, actor.id);
    db.prepare("UPDATE savings_accounts SET balance = balance + ?, gold_mg = gold_mg + ?, status = 'ACTIVE' WHERE id = ?").run(-r.amount, -r.mg, r.accountId);
  }
}

/** Pay out the remaining balance in cash and close the account. */
export function closeAccount(db: DB, actor: Actor, id: number, note: string) {
  return db.transaction(() => {
    const a = must(db, id);
    if (a.status === 'CLOSED') throw new DomainError('INVALID_STATE', 'already closed');
    if (a.balance > 0) db.prepare("INSERT INTO savings_entries(account_id,kind,amount,gold_mg,method,user_id,note) VALUES (?, 'REFUND',?,?, 'CASH',?,?)").run(id, -a.balance, -a.goldMg, actor.id, note);
    db.prepare("UPDATE savings_accounts SET balance = 0, gold_mg = 0, status = 'CLOSED' WHERE id = ?").run(id);
    audit(db, actor, 'savings.close', 'savings_account', id, { refund: a.balance, note });
    return { refunded: a.balance };
  })();
}

/** Account + ledger + next due date: everything the printed savings ticket (ตั๋วออมทอง) needs. */
export function statement(db: DB, id: number) {
  const a = must(db, id);
  const entries = db.prepare(`SELECT id, kind, amount, gold_mg AS goldMg, rate_per_gram AS ratePerGram, method, transaction_id AS transactionId, note, created_at AS createdAt
    FROM savings_entries WHERE account_id = ? ORDER BY id DESC`).all(id);
  const customer = db.prepare('SELECT name, member_no AS memberNo, phone FROM customers WHERE id = ?').get(a.customerId);
  let nextDueDate: string | null = null;
  if (a.plan === 'FIXED' && a.status === 'ACTIVE') {
    const paid = Math.floor(a.balance / a.installmentAmount!);
    nextDueDate = nextInstallmentDate(a.startDate, a.frequency!, paid);
  }
  return { account: a, customer, entries, nextDueDate };
}

export const listAccounts = (db: DB, customerId?: number) =>
  db.prepare(`${SELECT} ${customerId ? 'WHERE customer_id = ?' : ''} ORDER BY id DESC LIMIT 200`).all(...(customerId ? [customerId] : []));

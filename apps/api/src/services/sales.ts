import {
  DomainError, classifyTransaction, formatDocNo, quoteTransaction,
  type SaleLineInput, type TradeInInput, type TransactionQuote,
} from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { getCustomer } from '../repos/customers';
import { getItem, insertItem, insertMovement, setItemStatus, type Item } from '../repos/items';
import { getTaxConfig } from '../repos/settings';
import { rateSet } from '../repos/rates';
import { getTransaction, nextDocSeq } from '../repos/transactions';
import { cancelDocuments, issueDefault } from './documents';
import { earnPoints, voidPoints } from './loyalty';
import { requireRate } from './rates';
import { redeemToSale, refundForVoid } from './savings';

export interface TradeInRequest extends TradeInInput { description?: string; isBar?: boolean }
export interface PaymentRequest { method: 'CASH' | 'CARD' | 'TRANSFER' | 'SAVINGS' | 'OTHER'; amount: number; reference?: string | null; savingsAccountId?: number }
export interface TransactionRequest {
  customerId?: number | null;
  itemIds: number[];
  tradeIns: TradeInRequest[];
  discount?: number;
  payments: PaymentRequest[];
  note?: string | null;
}

function loadSellable(db: DB, ids: number[]): Item[] {
  if (new Set(ids).size !== ids.length) throw new DomainError('DUPLICATE_ITEM', 'an item appears twice');
  return ids.map((id) => {
    const item = getItem(db, id);
    if (!item) throw new DomainError('NOT_FOUND', `item ${id} not found`);
    if (item.status !== 'IN_STOCK') throw new DomainError('ITEM_UNAVAILABLE', `${item.sku} is ${item.status}`);
    return item;
  });
}

const isBar = (i: Item) => i.category === 'BAR';

/** Price a basket without persisting anything. */
export function quote(db: DB, req: Pick<TransactionRequest, 'itemIds' | 'tradeIns' | 'discount'>) {
  const rate = requireRate(db);
  const { ornament, bar } = rateSet(rate);
  const items = loadSellable(db, req.itemIds);
  const q = quoteTransaction({
    rate: ornament, tax: getTaxConfig(db), discount: req.discount,
    saleLines: items.map((i): SaleLineInput => ({ weightMg: i.weightMg, purityBp: i.purityBp, making: i.making, otherCharge: i.otherCharge, rate: isBar(i) ? bar : ornament })),
    tradeIns: req.tradeIns.map((t) => ({ weightMg: t.weightMg, purityBp: t.purityBp, deductionBp: t.deductionBp, overrideValue: t.overrideValue, rate: t.isBar ? bar : ornament })),
  });
  return { rate, items, quote: q };
}

export function createTransaction(db: DB, actor: Actor, req: TransactionRequest) {
  return db.transaction(() => {
    const { rate, items, quote: q } = quote(db, req);
    const type = classifyTransaction(items.length, req.tradeIns.length);

    // KYC: the shop only buys gold from identified customers.
    if (req.tradeIns.length > 0) {
      if (!req.customerId) throw new DomainError('CUSTOMER_REQUIRED', 'a customer is required when buying gold');
    }
    if (req.customerId && !getCustomer(db, req.customerId)) throw new DomainError('NOT_FOUND', 'customer not found');

    assertPayments(q, req.payments);

    const now = new Date();
    const docNo = formatDocNo(type, now, nextDocSeq(db, now.toISOString().slice(0, 10)));
    const txId = db.prepare(
      `INSERT INTO transactions(doc_no,type,customer_id,user_id,rate_id,rate_sell_per_gram,rate_buy_per_gram,gold_total,making_total,
         other_total,subtotal,discount,tax,sale_total,trade_in_credit,net,note,created_at,rate_bar_sell_per_gram,rate_bar_buy_per_gram)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(docNo, type, req.customerId ?? null, actor.id, rate.id, rate.sellPerGram, rate.buyPerGram, q.goldTotal, q.makingTotal,
      q.otherTotal, q.subtotal, q.discount, q.tax, q.saleTotal, q.tradeInCredit, q.net, req.note ?? null, now.toISOString(), rate.barSellPerGram, rate.barBuyPerGram).lastInsertRowid as number;

    const insLine = db.prepare(
      `INSERT INTO transaction_lines(transaction_id,kind,item_id,description,weight_mg,purity_bp,gold_value,making,other,deduction,cost,line_total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    items.forEach((item, i) => {
      const l = q.saleLines[i]!;
      insLine.run(txId, 'SALE', item.id, `${item.sku} ${item.name}`, item.weightMg, item.purityBp, l.goldValue, l.making, l.other, 0, item.cost, l.total);
      setItemStatus(db, item.id, 'SOLD');
      insertMovement(db, { itemId: item.id, type: 'SALE', from: 'IN_STOCK', to: 'SOLD', weightMg: item.weightMg, transactionId: txId, userId: actor.id });
    });
    req.tradeIns.forEach((t, i) => {
      const tq = q.tradeIns[i]!;
      const name = t.description?.trim() || 'Customer gold (trade-in)';
      const itemId = insertItem(db, {
        sku: `TI-${docNo}-${i + 1}`, name, category: 'SCRAP', weightMg: t.weightMg, purityBp: t.purityBp,
        making: { type: 'FIXED', amount: 0 }, cost: tq.value, source: 'TRADE_IN',
      });
      insLine.run(txId, 'TRADE_IN', itemId, name, t.weightMg, t.purityBp, tq.gross, 0, 0, tq.deduction, 0, tq.value);
      insertMovement(db, { itemId, type: 'TRADE_IN_RECEIVE', from: null, to: 'IN_STOCK', weightMg: t.weightMg, transactionId: txId, userId: actor.id });
    });

    const sign = q.net >= 0 ? 1 : -1;
    const insPay = db.prepare('INSERT INTO payments(transaction_id,method,amount,reference) VALUES (?,?,?,?)');
    for (const p of req.payments) {
      if (p.method === 'SAVINGS') {
        if (sign < 0 || !p.savingsAccountId) throw new DomainError('INVALID_PAYMENT', 'savings can only pay a sale and needs savingsAccountId');
        redeemToSale(db, actor, p.savingsAccountId, p.amount, txId, req.customerId ?? null);
      }
      insPay.run(txId, p.method, sign * p.amount, p.reference ?? null);
    }
    if (req.customerId && q.saleTotal > 0) {
      const pts = earnPoints(db, actor, req.customerId, txId, q.saleTotal);
      db.prepare('UPDATE transactions SET points_earned = ? WHERE id = ?').run(pts, txId);
    }
    const documents = issueDefault(db, actor, txId, type);

    audit(db, actor, 'transaction.create', 'transaction', txId, { docNo, type, net: q.net, itemIds: req.itemIds, customerId: req.customerId ?? null });
    return { ...getTransaction(db, txId)!, documents };
  })();
}

function assertPayments(q: TransactionQuote, payments: PaymentRequest[]) {
  if (payments.some((p) => !Number.isInteger(p.amount) || p.amount <= 0)) throw new DomainError('INVALID_PAYMENT', 'payment amounts must be positive integers');
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  if (paid !== Math.abs(q.net)) throw new DomainError('PAYMENT_MISMATCH', `payments (${paid}) must equal amount due (${Math.abs(q.net)})`);
}

export function voidTransaction(db: DB, actor: Actor, id: number, reason: string) {
  if (!reason.trim()) throw new DomainError('NOTE_REQUIRED', 'a void reason is required');
  return db.transaction(() => {
    const tx = getTransaction(db, id) as { status: string; lines: Array<{ kind: string; itemId: number; weightMg: number }> } | undefined;
    if (!tx) throw new DomainError('NOT_FOUND', 'transaction not found');
    if (tx.status !== 'COMPLETED') throw new DomainError('ALREADY_VOIDED', 'transaction is already voided');
    // Validate everything before mutating anything.
    for (const l of tx.lines) {
      const item = getItem(db, l.itemId);
      const expected = l.kind === 'SALE' ? 'SOLD' : 'IN_STOCK';
      if (!item || item.status !== expected) throw new DomainError('VOID_BLOCKED', `${item?.sku ?? l.itemId} is ${item?.status}; cannot void`);
    }
    for (const l of tx.lines) {
      if (l.kind === 'SALE') {
        setItemStatus(db, l.itemId, 'IN_STOCK');
        insertMovement(db, { itemId: l.itemId, type: 'VOID_RETURN', from: 'SOLD', to: 'IN_STOCK', weightMg: l.weightMg, transactionId: id, userId: actor.id, note: reason });
      } else {
        setItemStatus(db, l.itemId, 'VOIDED');
        insertMovement(db, { itemId: l.itemId, type: 'VOID_REMOVE', from: 'IN_STOCK', to: 'VOIDED', weightMg: l.weightMg, transactionId: id, userId: actor.id, note: reason });
      }
    }
    const cust = db.prepare('SELECT customer_id AS c FROM transactions WHERE id = ?').get(id) as { c: number | null };
    if (cust.c) voidPoints(db, actor, cust.c, id);
    refundForVoid(db, actor, id);
    cancelDocuments(db, id);
    db.prepare("UPDATE transactions SET status='VOIDED', voided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), voided_by=?, void_reason=? WHERE id=?").run(actor.id, reason, id);
    audit(db, actor, 'transaction.void', 'transaction', id, { reason });
    return getTransaction(db, id)!;
  })();
}

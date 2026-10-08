import { DomainError } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { getSettings } from '../repos/settings';
import { nextDocSeq } from '../repos/transactions';

export type DocType = 'TAX_INVOICE_ABBR' | 'TAX_INVOICE_FULL' | 'PURCHASE_VOUCHER' | 'CREDIT_NOTE';
const PREFIX: Record<DocType, string> = { TAX_INVOICE_ABBR: 'ABB', TAX_INVOICE_FULL: 'INV', PURCHASE_VOUCHER: 'PV', CREDIT_NOTE: 'CN' };
export interface Buyer { buyerName?: string | null; buyerTaxId?: string | null; buyerAddress?: string | null; buyerBranch?: string | null }

export function issueDocument(db: DB, actor: Actor, txId: number, type: DocType, buyer: Buyer = {}) {
  const tx = db.prepare('SELECT id, status, sale_total AS saleTotal, tax, trade_in_credit AS credit, net, customer_id AS customerId FROM transactions WHERE id = ?').get(txId) as
    { id: number; status: string; saleTotal: number; tax: number; credit: number; net: number; customerId: number | null } | undefined;
  if (!tx) throw new DomainError('NOT_FOUND', 'transaction not found');
  if (tx.status !== 'COMPLETED') throw new DomainError('INVALID_STATE', 'transaction is voided');
  const isPurchase = type === 'PURCHASE_VOUCHER';
  if (!isPurchase && tx.saleTotal <= 0) throw new DomainError('INVALID_STATE', 'transaction has no sale to invoice');
  if (isPurchase && tx.credit <= 0) throw new DomainError('INVALID_STATE', 'transaction buys no gold');
  if (type === 'TAX_INVOICE_FULL' && (!buyer.buyerName || !buyer.buyerTaxId || !buyer.buyerAddress))
    throw new DomainError('BUYER_REQUIRED', 'buyer name, tax id and address are required for a full tax invoice');

  const s = getSettings(db);
  const seller = { name: s.shop_name, taxId: s.shop_tax_id, address: s.shop_address, branch: s.shop_branch };
  if (type !== 'PURCHASE_VOUCHER' && !seller.taxId) throw new DomainError('SELLER_NOT_CONFIGURED', 'set shop_tax_id in settings before issuing tax invoices');

  const year = new Date().toISOString().slice(0, 4);
  const docNo = `${PREFIX[type]}-${year}-${String(nextDocSeq(db, `${PREFIX[type]}-${year}`)).padStart(6, '0')}`;
  const total = isPurchase ? tx.credit : tx.saleTotal;
  const tax = isPurchase ? 0 : tx.tax;
  const id = db.prepare(
    `INSERT INTO documents(doc_type,doc_no,transaction_id,buyer_name,buyer_tax_id,buyer_address,buyer_branch,seller_snapshot,amount_before_tax,tax,total,issued_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(type, docNo, txId, buyer.buyerName ?? null, buyer.buyerTaxId ?? null, buyer.buyerAddress ?? null, buyer.buyerBranch ?? null, JSON.stringify(seller), total - tax, tax, total, actor.id).lastInsertRowid as number;
  if (!isPurchase) db.prepare('INSERT INTO etax_outbox(document_id) VALUES (?)').run(id);
  audit(db, actor, 'document.issue', 'document', id, { docNo, type, txId });
  return { id, docNo };
}

/** Auto-issue the default document for a completed transaction; skipped silently when the seller is not yet configured. */
export function issueDefault(db: DB, actor: Actor, txId: number, type: 'SALE' | 'TRADE_IN' | 'BUYBACK') {
  const out: Array<{ id: number; docNo: string }> = [];
  if (type !== 'BUYBACK') {
    if (getSettings(db).shop_tax_id) out.push(issueDocument(db, actor, txId, 'TAX_INVOICE_ABBR'));
  }
  if (type !== 'SALE') out.push(issueDocument(db, actor, txId, 'PURCHASE_VOUCHER'));
  return out;
}

export function cancelDocuments(db: DB, txId: number) {
  db.prepare("UPDATE documents SET status = 'CANCELLED' WHERE transaction_id = ?").run(txId);
}

export const documentsForTransaction = (db: DB, txId: number) =>
  db.prepare(`SELECT id, doc_type AS docType, doc_no AS docNo, status, buyer_name AS buyerName, buyer_tax_id AS buyerTaxId, buyer_address AS buyerAddress,
    buyer_branch AS buyerBranch, seller_snapshot AS seller, amount_before_tax AS amountBeforeTax, tax, total, issued_at AS issuedAt FROM documents WHERE transaction_id = ? ORDER BY id`)
    .all(txId).map((d) => ({ ...(d as { seller: string }), seller: JSON.parse((d as { seller: string }).seller) }));

export const etaxQueue = (db: DB, status = 'PENDING') =>
  db.prepare(`SELECT o.id, o.status, o.attempts, o.last_error AS lastError, o.created_at AS createdAt, d.doc_no AS docNo, d.total
    FROM etax_outbox o JOIN documents d ON d.id = o.document_id WHERE o.status = ? ORDER BY o.id LIMIT 200`).all(status);

export function markEtax(db: DB, actor: Actor, outboxId: number, result: { ok: boolean; error?: string }) {
  const r = db.prepare("UPDATE etax_outbox SET status = ?, attempts = attempts + 1, last_error = ?, sent_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END WHERE id = ?")
    .run(result.ok ? 'SENT' : 'FAILED', result.error ?? null, result.ok ? 1 : 0, outboxId);
  if (!r.changes) throw new DomainError('NOT_FOUND', 'outbox entry not found');
  audit(db, actor, 'etax.mark', 'etax_outbox', outboxId, result);
}

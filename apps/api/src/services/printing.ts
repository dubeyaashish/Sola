import { DomainError, MG_PER_BAHT, bahtText, formatGrams, formatMoney } from '@sola/core';
import type { DB } from '../db/schema';
import { getSettings } from '../repos/settings';
import { getTransaction } from '../repos/transactions';
import { getContract } from './pawn';
import { statement } from './savings';

/**
 * Print-ready standalone HTML for bills and documents (A4 or 80 mm slip, Thai / English / both).
 * No scripts except an optional print() call, no external assets: the file can be saved, emailed or printed anywhere.
 */
export type Lang = 'th' | 'en' | 'both';
export type Format = 'a4' | 'slip';
export interface Opts { lang: Lang; format: Format; autoprint?: boolean; embed?: boolean }

const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const m = (n: number) => formatMoney(n);

const T: Record<string, [string, string]> = {
  abbr: ['ใบกำกับภาษีอย่างย่อ', 'Abbreviated Tax Invoice'], full: ['ใบกำกับภาษี', 'Tax Invoice'], pv: ['ใบรับซื้อทอง', 'Gold Purchase Voucher'], receipt: ['ใบเสร็จรับเงิน', 'Receipt'],
  cn: ['ใบลดหนี้', 'Credit Note'], pawn: ['สัญญาจำนำ', 'Pawn Ticket'], sellback: ['สัญญาขายฝาก', 'Sell-Back Contract'], savings: ['ตั๋วออมทอง', 'Gold Savings Ticket'],
  no: ['เลขที่', 'No.'], date: ['วันที่', 'Date'], taxId: ['เลขประจำตัวผู้เสียภาษี', 'Tax ID'], branch: ['สาขา', 'Branch'], hq: ['สำนักงานใหญ่', 'Head office'], tel: ['โทร', 'Tel'],
  customer: ['ลูกค้า', 'Customer'], idNo: ['เลขบัตรประชาชน', 'ID card no.'], address: ['ที่อยู่', 'Address'], buyer: ['ผู้ซื้อ', 'Buyer'],
  item: ['รายการ', 'Description'], weight: ['น้ำหนัก (ก.)', 'Weight (g)'], purity: ['ความบริสุทธิ์', 'Purity'], gold: ['ค่าทอง', 'Gold'], making: ['ค่ากำเหน็จ', 'Making'], amount: ['จำนวนเงิน', 'Amount'],
  subtotal: ['รวมเป็นเงิน', 'Subtotal'], discount: ['ส่วนลด', 'Discount'], beforeVat: ['มูลค่าก่อนภาษี', 'Amount before VAT'], vat: ['ภาษีมูลค่าเพิ่ม', 'VAT'], total: ['รวมทั้งสิ้น', 'Total'],
  tradeIn: ['หัก ทองเก่า', 'Less: trade-in gold'], net: ['ยอดชำระสุทธิ', 'Net payable'], paidOut: ['ยอดจ่ายให้ลูกค้า', 'Paid to customer'], payment: ['การชำระเงิน', 'Payment'],
  cashier: ['พนักงาน', 'Cashier'], received: ['ผู้รับเงิน', 'Received by'], seller: ['ผู้ขาย', 'Seller'], rate: ['ราคาทอง/บาททองคำ 96.5% (ขาย)', 'Gold rate per baht-wt 96.5% (sell)'],
  words: ['ตัวอักษร', 'In words'], cancelled: ['ยกเลิก', 'CANCELLED'], thanks: ['ขอบคุณที่ใช้บริการ', 'Thank you'], notTax: ['เอกสารนี้ไม่ใช่ใบกำกับภาษี', 'This is not a tax invoice'],
  deducted: ['หักทองเก่า', 'Trade-in deduction'], pts: ['แต้มที่ได้รับ', 'Points earned'],
  principal: ['เงินต้น', 'Principal'], rateMonth: ['อัตราดอกเบี้ย/เดือน', 'Interest rate / month'], term: ['ระยะเวลา (วัน)', 'Term (days)'], start: ['วันที่ทำสัญญา', 'Start date'], due: ['วันครบกำหนด', 'Due date'],
  pledged: ['ทรัพย์ที่รับจำนำ/ขายฝาก', 'Pledged items'], appraised: ['ราคาประเมิน', 'Appraised'], pawner: ['ผู้ทำสัญญา', 'Customer'], staff: ['เจ้าหน้าที่', 'Staff'],
  acct: ['เลขที่บัญชี', 'Account no.'], member: ['สมาชิก', 'Member'], saved: ['ยอดออมสะสม', 'Total saved'], goldSaved: ['ทองสะสม (ก.)', 'Gold accumulated (g)'], next: ['งวดถัดไป', 'Next installment'],
  history: ['รายการล่าสุด', 'Recent activity'], kind: ['ประเภท', 'Type'], print: ['พิมพ์', 'Print'],
  'm.CASH': ['เงินสด', 'Cash'], 'm.CARD': ['บัตร', 'Card'], 'm.TRANSFER': ['โอนเงิน', 'Transfer'], 'm.SAVINGS': ['บัญชีออมทอง', 'Savings'], 'm.OTHER': ['อื่นๆ', 'Other'],
  'k.DEPOSIT': ['ฝาก', 'Deposit'], 'k.REDEEM': ['ใช้ชำระ', 'Redeem'], 'k.REFUND': ['คืนเงิน', 'Refund'],
};
/** Table-header variant: in bilingual mode the English sits on its own line. */
const lblH = (lang: Lang) => (k: string): string => {
  const [th, en] = T[k] ?? [k, k];
  return lang === 'both' ? `${esc(th)}<small>${esc(en)}</small>` : lang === 'th' ? esc(th) : esc(en);
};
const lbl = (lang: Lang) => (k: string): string => {
  const [th, en] = T[k] ?? [k, k];
  return lang === 'th' ? esc(th) : lang === 'en' ? esc(en) : `${esc(th)}<small> / ${esc(en)}</small>`;
};

const CSS = `
*{box-sizing:border-box}body{margin:0;font:13px/1.45 "Sarabun","Noto Sans Thai","Segoe UI",Arial,sans-serif;color:#2b1a1c;background:#fff}
.page{max-width:210mm;margin:0 auto;padding:14mm}.slip .page{max-width:80mm;padding:3mm;font-size:12px}
small{color:#7a6a68;font-weight:400}
.head{display:flex;gap:14px;align-items:flex-start;border-bottom:3px double #c9a227;padding-bottom:10px;margin-bottom:10px}
.head img{max-height:70px;max-width:130px;object-fit:contain}.slip .head{flex-direction:column;align-items:center;text-align:center}.slip .head img{max-height:48px}
.head .co{flex:1}.co h1{margin:0;font-size:19px;color:#781323}.slip .co h1{font-size:15px}.co div{color:#5b4a4c}
.title{display:flex;justify-content:space-between;align-items:flex-end;margin:8px 0}.title h2{margin:0;font-size:18px;color:#781323}.slip .title{flex-direction:column;align-items:center;text-align:center}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-bottom:8px}.slip .meta{grid-template-columns:1fr}
.box{border:1px solid #e3d6c4;border-radius:6px;padding:8px 10px;margin-bottom:8px;background:#fffdf8}
table{width:100%;border-collapse:collapse;margin:6px 0}th{background:#781323;color:#fff;font-size:12px;text-align:left;padding:5px 6px}th small{color:#f1d98a}
td{padding:5px 6px;border-bottom:1px solid #eee3d3;vertical-align:top}
table.items{table-layout:fixed}table.items th,table.items td{overflow-wrap:anywhere}table.items th{white-space:normal;font-size:11px;line-height:1.25}table.items th small{display:block}
table.items th:nth-child(1){width:5%}table.items th:nth-child(2){width:29%}table.items th:nth-child(3),table.items th:nth-child(4){width:11%}table.items th:nth-child(5){width:14%}table.items th:nth-child(6),table.items th:nth-child(7){width:15%}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tot{margin-left:auto;width:min(100%,330px)}.tot div{display:flex;justify-content:space-between;gap:12px;padding:2px 0}.tot .g{border-top:2px solid #c9a227;font-weight:700;font-size:15px;color:#781323;margin-top:4px;padding-top:5px}
.words{margin:8px 0;padding:6px 10px;background:#fcf8e9;border:1px solid #efdc9c;border-radius:6px}
.sign{display:flex;justify-content:space-around;gap:20px;margin-top:34px;text-align:center}.sign div{flex:1;border-top:1px solid #333;padding-top:4px}.slip .sign{margin-top:22px}
.stamp{position:fixed;top:40%;left:15%;font-size:70px;color:rgba(179,32,47,.25);transform:rotate(-20deg);border:6px solid rgba(179,32,47,.25);padding:0 20px;border-radius:10px}
.muted{color:#7a6a68}.foot{text-align:center;margin-top:12px;color:#7a6a68}
.noprint{position:fixed;top:10px;right:10px}.noprint button{background:#9b1b30;color:#fff;border:0;border-radius:6px;padding:8px 16px;font:inherit;cursor:pointer}
@page{size:A4;margin:0}.slip{--x:0}@media print{.noprint{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
const SLIP_PAGE = '@page{size:80mm auto;margin:0}';

function shell(title: string, body: string, o: Opts): string {
  return `<!doctype html><html lang="${o.lang === 'en' ? 'en' : 'th'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>${CSS}${o.format === 'slip' ? SLIP_PAGE : ''}</style></head><body class="${o.format}">${o.embed ? '' : `<div class="noprint"><button onclick="window.print()">${esc(T.print![o.lang === 'en' ? 1 : 0])}</button></div>`}` +
    `<div class="page">${body}</div>${o.autoprint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})</script>' : ''}</body></html>`;
}

interface Seller { name?: string; nameEn?: string; taxId?: string; address?: string; addressEn?: string; branch?: string; phone?: string; email?: string }
const sellerFromSettings = (s: Record<string, string>): Seller => ({ name: s.shop_name, nameEn: s.shop_name_en, taxId: s.shop_tax_id, address: s.shop_address, addressEn: s.shop_address_en, branch: s.shop_branch, phone: s.shop_phone, email: s.shop_email });

function header(sel: Seller, logo: string | null, o: Opts): string {
  const L = lbl(o.lang);
  const en = o.lang === 'en';
  const name = en ? sel.nameEn || sel.name : sel.name;
  const addr = en ? sel.addressEn || sel.address : sel.address;
  const branch = !sel.branch || sel.branch === '00000' ? L('hq') : `${L('branch')} ${esc(sel.branch)}`;
  return `<div class="head">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div class="co"><h1>${esc(name)}</h1>` +
    (o.lang === 'both' && sel.nameEn ? `<div>${esc(sel.nameEn)}</div>` : '') +
    (addr ? `<div>${esc(addr)}</div>` : '') +
    `<div>${sel.taxId ? `${L('taxId')}: ${esc(sel.taxId)} · ` : ''}${branch}</div>` +
    (sel.phone || sel.email ? `<div>${sel.phone ? `${L('tel')} ${esc(sel.phone)}` : ''} ${esc(sel.email ?? '')}</div>` : '') + `</div></div>`;
}

const perBaht = (perGram: number) => Math.round((perGram * MG_PER_BAHT * 9650) / 1e7);
const dateTime = (iso: string) => iso.replace('T', ' ').slice(0, 16);

interface Tx {
  id: number; docNo: string; type: string; status: string; customerId: number | null; cashier: string; createdAt: string; rateSellPerGram: number;
  goldTotal: number; makingTotal: number; otherTotal: number; subtotal: number; discount: number; tax: number; saleTotal: number; tradeInCredit: number; net: number; pointsEarned: number;
  lines: Array<{ kind: string; description: string; weightMg: number; purityBp: number; goldValue: number; making: number; other: number; deduction: number; lineTotal: number }>;
  payments: Array<{ method: string; amount: number; reference: string | null }>;
}
const loadTx = (db: DB, id: number): Tx => {
  const tx = getTransaction(db, id) as Tx | undefined;
  if (!tx) throw new DomainError('NOT_FOUND', 'transaction not found');
  return tx;
};
const loadCustomer = (db: DB, id: number | null) =>
  id ? (db.prepare('SELECT name, national_id AS nationalId, address, phone, member_no AS memberNo FROM customers WHERE id = ?').get(id) as { name: string; nationalId: string | null; address: string | null; phone: string | null; memberNo: string | null } | undefined) : undefined;

function linesTable(tx: Tx, kind: 'SALE' | 'TRADE_IN', o: Opts): string {
  const L = lbl(o.lang);
  const rows = tx.lines.filter((l) => l.kind === kind);
  if (!rows.length) return '';
  if (o.format === 'slip') {
    return `<table>${rows.map((l) => `<tr><td colspan="2">${esc(l.description)}<br><span class="muted">${formatGrams(l.weightMg)} g · ${(l.purityBp / 100).toFixed(2)}%</span></td></tr>` +
      `<tr><td class="muted">${kind === 'SALE' ? `${L('gold')} ${m(l.goldValue)} + ${L('making')} ${m(l.making + l.other)}` : l.deduction ? `${L('deducted')} ${m(l.deduction)}` : ''}</td><td class="n">${m(l.lineTotal)}</td></tr>`).join('')}</table>`;
  }
  const H = lblH(o.lang);
  return `<table class="items"><thead><tr><th>#</th><th>${H('item')}</th><th class="n">${H('weight')}</th><th class="n">${H('purity')}</th><th class="n">${H('gold')}</th><th class="n">${kind === 'SALE' ? H('making') : H('deducted')}</th><th class="n">${H('amount')}</th></tr></thead><tbody>` +
    rows.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td class="n">${formatGrams(l.weightMg)}</td><td class="n">${(l.purityBp / 100).toFixed(2)}%</td><td class="n">${m(l.goldValue)}</td>` +
      `<td class="n">${kind === 'SALE' ? m(l.making + l.other) : m(l.deduction)}</td><td class="n">${m(l.lineTotal)}</td></tr>`).join('') + `</tbody></table>`;
}

function payments(tx: Tx, o: Opts): string {
  const L = lbl(o.lang);
  if (!tx.payments.length) return '';
  return `<div class="box"><b>${L('payment')}</b>` + tx.payments.map((p) => `<div style="display:flex;justify-content:space-between"><span>${L(`m.${p.method}`)}${p.reference ? ` <span class="muted">${esc(p.reference)}</span>` : ''}</span><span class="n">${m(Math.abs(p.amount))}</span></div>`).join('') + `</div>`;
}

export function renderDocument(db: DB, docId: number, o: Opts): string {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as
    { id: number; doc_type: string; doc_no: string; transaction_id: number; buyer_name: string | null; buyer_tax_id: string | null; buyer_address: string | null; buyer_branch: string | null; seller_snapshot: string; amount_before_tax: number; tax: number; total: number; status: string; issued_at: string } | undefined;
  if (!d) throw new DomainError('NOT_FOUND', 'document not found');
  const tx = loadTx(db, d.transaction_id);
  const cust = loadCustomer(db, tx.customerId);
  const L = lbl(o.lang);
  const seller = JSON.parse(d.seller_snapshot) as Seller;
  const logo = getSettings(db).shop_logo ?? null;
  const titleKey = { TAX_INVOICE_ABBR: 'abbr', TAX_INVOICE_FULL: 'full', PURCHASE_VOUCHER: 'pv', CREDIT_NOTE: 'cn' }[d.doc_type] ?? 'receipt';
  const isPV = d.doc_type === 'PURCHASE_VOUCHER';
  const buyerName = d.buyer_name ?? cust?.name;

  let body = (d.status === 'CANCELLED' || tx.status === 'VOIDED' ? `<div class="stamp">${L('cancelled')}</div>` : '') + header(seller, logo, o);
  body += `<div class="title"><h2>${L(titleKey)}</h2><div>${L('no')}: <b>${esc(d.doc_no)}</b><br>${L('date')}: ${esc(dateTime(d.issued_at))}</div></div>`;
  if (d.doc_type === 'TAX_INVOICE_FULL' || isPV || buyerName) {
    body += `<div class="box"><b>${isPV ? L('seller') : L('buyer')}:</b> ${esc(buyerName ?? '-')}` +
      (d.buyer_tax_id ? `<br>${L('taxId')}: ${esc(d.buyer_tax_id)}${d.buyer_branch ? ` ${L('branch')} ${esc(d.buyer_branch)}` : ''}` : '') +
      (isPV && cust?.nationalId ? `<br>${L('idNo')}: ${esc(cust.nationalId)}` : '') +
      ((d.buyer_address ?? cust?.address) ? `<br>${L('address')}: ${esc(d.buyer_address ?? cust?.address)}` : '') + `</div>`;
  }
  if (isPV) {
    body += linesTable(tx, 'TRADE_IN', o);
    body += `<div class="tot"><div class="g"><span>${L('paidOut')}</span><span>${m(d.total)}</span></div></div>`;
  } else {
    body += linesTable(tx, 'SALE', o);
    body += `<div class="tot"><div><span>${L('subtotal')}</span><span>${m(tx.subtotal)}</span></div>` +
      (tx.discount ? `<div><span>${L('discount')}</span><span>-${m(tx.discount)}</span></div>` : '') +
      `<div><span>${L('beforeVat')}</span><span>${m(d.amount_before_tax)}</span></div><div><span>${L('vat')}</span><span>${m(d.tax)}</span></div>` +
      `<div class="g"><span>${L('total')}</span><span>${m(d.total)}</span></div>` +
      (tx.tradeInCredit ? `<div><span>${L('tradeIn')}</span><span>-${m(tx.tradeInCredit)}</span></div><div class="g"><span>${L('net')}</span><span>${m(tx.net)}</span></div>` : '') + `</div>`;
  }
  if (o.lang !== 'en') body += `<div class="words">${L('words')}: ${esc(bahtText(isPV ? d.total : tx.tradeInCredit ? Math.abs(tx.net) : d.total))}</div>`;
  body += payments(tx, o);
  if (!isPV) body += `<div class="muted">${L('rate')}: ${m(perBaht(tx.rateSellPerGram))}</div>`;
  body += `<div class="muted">${L('cashier')}: ${esc(tx.cashier)} · ${esc(tx.docNo)}</div>`;
  body += o.format === 'a4' ? `<div class="sign"><div>${L(isPV ? 'seller' : 'buyer')}</div><div>${L('received')}</div></div>` : `<div class="foot">${L('thanks')}</div>`;
  return shell(`${d.doc_no}`, body, o);
}

/** A bill for any transaction. Marked "not a tax invoice" because the legal documents are rendered by renderDocument. */
export function renderReceipt(db: DB, txId: number, o: Opts): string {
  const tx = loadTx(db, txId);
  const L = lbl(o.lang);
  const s = getSettings(db);
  const cust = loadCustomer(db, tx.customerId);
  let body = (tx.status === 'VOIDED' ? `<div class="stamp">${L('cancelled')}</div>` : '') + header(sellerFromSettings(s), s.shop_logo ?? null, o);
  body += `<div class="title"><h2>${L('receipt')}</h2><div>${L('no')}: <b>${esc(tx.docNo)}</b><br>${L('date')}: ${esc(dateTime(tx.createdAt))}</div></div>`;
  if (cust) body += `<div class="box">${L('customer')}: <b>${esc(cust.name)}</b> ${cust.memberNo ? `<span class="muted">${esc(cust.memberNo)}</span>` : ''}</div>`;
  body += linesTable(tx, 'SALE', o);
  if (tx.lines.some((l) => l.kind === 'TRADE_IN')) body += `<b>${lbl(o.lang)('tradeIn')}</b>` + linesTable(tx, 'TRADE_IN', o);
  body += `<div class="tot"><div><span>${L('subtotal')}</span><span>${m(tx.subtotal)}</span></div>` +
    (tx.discount ? `<div><span>${L('discount')}</span><span>-${m(tx.discount)}</span></div>` : '') +
    (tx.tax ? `<div><span>${L('vat')}</span><span>${m(tx.tax)}</span></div>` : '') +
    (tx.tradeInCredit ? `<div><span>${L('tradeIn')}</span><span>-${m(tx.tradeInCredit)}</span></div>` : '') +
    `<div class="g"><span>${L(tx.net >= 0 ? 'net' : 'paidOut')}</span><span>${m(Math.abs(tx.net))}</span></div></div>`;
  if (o.lang !== 'en') body += `<div class="words">${L('words')}: ${esc(bahtText(Math.abs(tx.net)))}</div>`;
  body += payments(tx, o);
  if (tx.pointsEarned) body += `<div class="muted">${L('pts')}: ${tx.pointsEarned}</div>`;
  body += `<div class="muted">${L('cashier')}: ${esc(tx.cashier)}</div><div class="foot">${L('notTax')}<br>${L('thanks')}</div>`;
  return shell(tx.docNo, body, o);
}

export function renderPawn(db: DB, id: number, o: Opts): string {
  const c = getContract(db, id);
  const L = lbl(o.lang);
  const s = getSettings(db);
  const cust = loadCustomer(db, c.customerId);
  let body = header(sellerFromSettings(s), s.shop_logo ?? null, o);
  body += `<div class="title"><h2>${L(c.type === 'PAWN' ? 'pawn' : 'sellback')}</h2><div>${L('no')}: <b>${esc(c.contractNo)}</b></div></div>`;
  body += `<div class="box">${L('pawner')}: <b>${esc((c as unknown as { customerName: string }).customerName)}</b>${cust?.nationalId ? `<br>${L('idNo')}: ${esc(cust.nationalId)}` : ''}${cust?.address ? `<br>${L('address')}: ${esc(cust.address)}` : ''}${cust?.phone ? `<br>${L('tel')}: ${esc(cust.phone)}` : ''}</div>`;
  body += `<div class="meta"><div>${L('principal')}: <b>${m(c.principal)}</b></div><div>${L('rateMonth')}: <b>${(c.rateBpPerMonth / 100).toFixed(2)}%</b></div>` +
    `<div>${L('start')}: ${esc(c.startDate)}</div><div>${L('due')}: <b>${esc(c.dueDate)}</b></div><div>${L('term')}: ${c.termDays}</div></div>`;
  if (o.lang !== 'en') body += `<div class="words">${L('words')}: ${esc(bahtText(c.principal))}</div>`;
  body += `<b>${L('pledged')}</b><table><thead><tr><th>${L('item')}</th><th class="n">${L('weight')}</th><th class="n">${L('purity')}</th><th class="n">${L('appraised')}</th></tr></thead><tbody>` +
    (c.items as Array<{ description: string; weightMg: number; purityBp: number; appraisedValue: number }>).map((i) => `<tr><td>${esc(i.description)}</td><td class="n">${formatGrams(i.weightMg)}</td><td class="n">${(i.purityBp / 100).toFixed(2)}%</td><td class="n">${m(i.appraisedValue)}</td></tr>`).join('') + `</tbody></table>`;
  body += o.format === 'a4' ? `<div class="sign"><div>${L('pawner')}</div><div>${L('staff')}</div></div>` : `<div class="foot">${L('thanks')}</div>`;
  return shell(c.contractNo, body, o);
}

export function renderSavings(db: DB, id: number, o: Opts): string {
  const st = statement(db, id);
  const L = lbl(o.lang);
  const s = getSettings(db);
  const a = st.account;
  const c = st.customer as { name: string; memberNo: string | null } | undefined;
  let body = header(sellerFromSettings(s), s.shop_logo ?? null, o);
  body += `<div class="title"><h2>${L('savings')}</h2><div>${L('acct')}: <b>${esc(a.accountNo)}</b></div></div>`;
  body += `<div class="box">${L('customer')}: <b>${esc(c?.name)}</b> ${c?.memberNo ? `<span class="muted">${L('member')} ${esc(c.memberNo)}</span>` : ''}</div>`;
  body += `<div class="meta"><div>${L('saved')}: <b>${m(a.balance)}</b></div><div>${L('goldSaved')}: <b>${formatGrams(a.goldMg)}</b></div>` +
    (st.nextDueDate ? `<div>${L('next')}: ${esc(st.nextDueDate)}${a.installmentAmount ? ` (${m(a.installmentAmount)})` : ''}</div>` : '') + `</div>`;
  const entries = (st.entries as Array<{ createdAt: string; kind: string; amount: number; goldMg: number }>).slice(0, 12);
  body += `<b>${L('history')}</b><table><thead><tr><th>${L('date')}</th><th>${L('kind')}</th><th class="n">${L('amount')}</th><th class="n">${L('weight')}</th></tr></thead><tbody>` +
    entries.map((e) => `<tr><td>${esc(e.createdAt.slice(0, 10))}</td><td>${L(`k.${e.kind}`)}</td><td class="n">${m(e.amount)}</td><td class="n">${e.goldMg ? formatGrams(e.goldMg) : ''}</td></tr>`).join('') + `</tbody></table>`;
  body += `<div class="foot">${L('thanks')}</div>`;
  return shell(a.accountNo, body, o);
}

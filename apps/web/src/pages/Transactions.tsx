import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { PrintModal } from '../PrintModal';
import { Badge, Card, ConfirmModal, Empty, Field, Icon, Modal, PageHead, baht, grams, pct, toneOf, today, useAction, useLabel } from '../ui';

export function Transactions({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [range, setRange] = useState({ from: today(), to: today() });
  const [type, setType] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [invoice, setInvoice] = useState(false);
  const [buyer, setBuyer] = useState({ buyerName: '', buyerTaxId: '', buyerAddress: '', buyerBranch: '00000' });
  const [printing, setPrinting] = useState<{ path: string; title: string; fmt: 'a4' | 'slip' } | null>(null);
  const { run, busy } = useAction();

  const load = () => {
    const to = new Date(Date.parse(`${range.to}T00:00:00Z`) + 86_400_000).toISOString();
    get(`/transactions?from=${range.from}T00:00:00.000Z&to=${to}${type ? `&type=${type}` : ''}`).then(setList);
  };
  useEffect(load, [range, type]);
  const open = (id: number) => get(`/transactions/${id}`).then(setSel);

  return (
    <>
      <PageHead title={t('nav.transactions')} />
      <Card>
        <div className="row">
          <Field label={t('common.from')}><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label={t('common.to')}><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <Field label={t('common.type')}><select value={type} onChange={(e) => setType(e.target.value)}><option value="">{t('common.all')}</option>{['SALE', 'TRADE_IN', 'BUYBACK'].map((x) => <option key={x} value={x}>{label('type', x)}</option>)}</select></Field>
        </div>
      </Card>
      <Card>
        {list.length === 0 ? <Empty icon="receipt" text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('tx.docNo')}</th><th>{t('common.time')}</th><th>{t('common.type')}</th><th>{t('common.customer')}</th><th>{t('tx.cashier')}</th><th className="num">{t('tx.net')}</th><th>{t('common.status')}</th></tr></thead><tbody>
            {list.map((x) => (
              <tr key={x.id} className="click" onClick={() => open(x.id)}>
                <td data-label={t('tx.docNo')}><b>{x.docNo}</b></td><td data-label={t('common.time')}>{date(x.createdAt, true)}</td><td data-label={t('common.type')}><Badge tone="gold">{label('type', x.type)}</Badge></td>
                <td data-label={t('common.customer')}>{x.customerName ?? '—'}</td><td data-label={t('tx.cashier')}>{x.cashier}</td>
                <td className="num" data-label={t('tx.net')}>{x.net < 0 ? '−' : ''}{baht(Math.abs(x.net))}</td><td data-label={t('common.status')}><Badge tone={toneOf(x.status)}>{label('st', x.status)}</Badge></td></tr>))}
          </tbody></table></div>)}
      </Card>

      {sel && (
        <Modal wide title={<>{sel.docNo} <Badge tone={toneOf(sel.status)}>{label('st', sel.status)}</Badge></>} onClose={() => setSel(null)}
          foot={<>
            <button className="btn" onClick={() => setPrinting({ path: `/transactions/${sel.id}/receipt`, title: sel.docNo, fmt: 'slip' })}><Icon name="print" /> {t('pos.printBill')}</button>
            {can('document.issue') && sel.status === 'COMPLETED' && sel.saleTotal > 0 && <button className="btn gold" onClick={() => setInvoice(true)}>{t('tx.fullInvoice')}</button>}
            {can('sale.void') && sel.status === 'COMPLETED' && <button className="btn danger" onClick={() => setVoiding(true)}><Icon name="undo" /> {t('tx.void')}</button>}
          </>}>
          <div className="muted small">{date(sel.createdAt, true)} · {sel.cashier} · {sel.customerName ?? '—'}</div>
          {sel.status === 'VOIDED' && <div className="alert err">{t('tx.voidedBecause')}: {sel.voidReason}</div>}
          <div className="tbl-wrap"><table><tbody>
            {sel.lines.map((l: any) => <tr key={l.id}><td>{l.kind === 'TRADE_IN' && <Badge tone="warn">{t('pos.oldGold')}</Badge>} {l.description}<div className="muted small">{grams(l.weightMg)} g · {pct(l.purityBp)}</div></td><td className="num">{l.kind === 'TRADE_IN' ? '−' : ''}{baht(l.lineTotal)}</td></tr>)}
          </tbody></table></div>
          <div className="tot" style={{ marginTop: 8 }}>
            <span>{t('pos.vat')}</span><span className="num">{baht(sel.tax)}</span>
            <span className="grand">{sel.net >= 0 ? t('pos.customerPays') : t('pos.shopPays')}</span><span className="grand num">฿{baht(Math.abs(sel.net))}</span>
          </div>
          <h4 style={{ marginTop: 14 }}>{t('tx.documents')}</h4>
          {sel.documents.length === 0 ? <div className="muted">{t('pos.noDocs')}</div> : sel.documents.map((d: any) => (
            <div className="line" key={d.id}><span><b>{d.docNo}</b> <Badge tone={d.status === 'ISSUED' ? 'ok' : 'bad'}>{label('st', d.status)}</Badge><div className="muted small">{label('dt', d.docType)}</div></span>
              <button className="btn sm" onClick={() => setPrinting({ path: `/documents/${d.id}/html`, title: d.docNo, fmt: 'a4' })}><Icon name="print" /> {t('print.print')}</button></div>))}
        </Modal>)}

      {voiding && sel && (
        <Modal title={t('tx.void')} onClose={() => setVoiding(false)} foot={<><button className="btn" onClick={() => setVoiding(false)}>{t('common.cancel')}</button>
          <button className="btn danger" disabled={busy || !reason.trim()} onClick={() => run(() => post(`/transactions/${sel.id}/void`, { reason }), t('tx.voided')).then((r) => { if (r) { setVoiding(false); setReason(''); setSel(null); load(); } })}>{t('tx.void')}</button></>}>
          <p>{t('tx.voidWarn')}</p><Field label={t('tx.voidReason')}><input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        </Modal>)}

      {invoice && sel && (
        <Modal title={t('tx.fullInvoice')} onClose={() => setInvoice(false)} foot={<><button className="btn" onClick={() => setInvoice(false)}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || !buyer.buyerName || buyer.buyerTaxId.length !== 13 || !buyer.buyerAddress}
            onClick={() => run(() => post(`/transactions/${sel.id}/documents/full`, buyer), t('tx.invoiceIssued')).then((r) => { if (r) { setInvoice(false); open(sel.id); setPrinting({ path: `/documents/${r.id}/html`, title: r.docNo, fmt: 'a4' }); } })}>{t('tx.issue')}</button></>}>
          <Field label={t('tx.buyerName')}><input value={buyer.buyerName} onChange={(e) => setBuyer({ ...buyer, buyerName: e.target.value })} /></Field>
          <div className="row"><Field label={t('settings.taxId')}><input inputMode="numeric" maxLength={13} value={buyer.buyerTaxId} onChange={(e) => setBuyer({ ...buyer, buyerTaxId: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label={t('settings.branch')}><input inputMode="numeric" maxLength={5} value={buyer.buyerBranch} onChange={(e) => setBuyer({ ...buyer, buyerBranch: e.target.value.replace(/\D/g, '') })} /></Field></div>
          <Field label={t('common.address')}><textarea rows={3} value={buyer.buyerAddress} onChange={(e) => setBuyer({ ...buyer, buyerAddress: e.target.value })} /></Field>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat={printing.fmt} onClose={() => setPrinting(null)} />}
    </>
  );
}

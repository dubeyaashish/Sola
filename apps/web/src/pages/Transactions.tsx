import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { ChipRow, DetailBody, DetailHeader, KV, ListHeader, ListRow, MasterDetail, PanelTitle, RightPanel } from '../layout';
import { PrintModal } from '../PrintModal';
import { ConfirmDialog, Empty, Field, IconTile, Loading, Modal, SearchBox, StatusPill, baht, grams, pct, toneOf, useAction, useLabel, usePersisted } from '../ui';

type TabId = 'items' | 'payments' | 'docs';
const RANGES = ['today', '7d', '30d'] as const;

export function Transactions({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [range, setRange] = usePersisted<string>('tx.range', 'today');
  const [type, setType] = usePersisted<string>('tx.type', '');
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState<any>(null);
  const [tab, setTab] = useState<TabId>('items');
  const [voiding, setVoiding] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const [buyer, setBuyer] = useState({ buyerName: '', buyerTaxId: '', buyerAddress: '', buyerBranch: '00000' });
  const [printing, setPrinting] = useState<{ path: string; title: string; fmt: 'a4' | 'slip' } | null>(null);
  const { run, busy } = useAction();

  const load = () => {
    const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    get(`/transactions?from=${from}T00:00:00.000Z&to=${to}T00:00:00.000Z${type ? `&type=${type}` : ''}`).then(setList);
  };
  useEffect(load, [range, type]);
  const open = (id: number) => { setTab('items'); get(`/transactions/${id}`).then(setSel); };
  const shown = useMemo(() => (list ?? []).filter((x) => !q || `${x.docNo} ${x.customerName ?? ''}`.toLowerCase().includes(q.toLowerCase())), [list, q]);

  const listPane = (
    <>
      <ListHeader title={t('nav.transactions')}>
        <SearchBox value={q} onChange={setQ} placeholder={t('tx.search')} />
        <ChipRow value={range} onChange={setRange} chips={RANGES.map((r) => ({ id: r, label: t(`tx.range.${r}` as any) }))} />
        <ChipRow value={type} onChange={setType} chips={[{ id: '', label: t('common.all') }, ...['SALE', 'TRADE_IN', 'BUYBACK'].map((x) => ({ id: x, label: label('type', x) }))]} />
      </ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === null ? <Loading /> : shown.length === 0 ? <Empty icon="receipt" title={t('common.empty')} /> : shown.map((x) => (
          <ListRow key={x.id} selected={sel?.id === x.id} onClick={() => open(x.id)} lead={<IconTile icon="receipt" tone={x.status === 'VOIDED' ? 'neutral' : 'brand'} />}
            title={x.docNo} sub={`${x.customerName ?? '—'} · ${date(x.createdAt, true)}`} meta={`${x.net < 0 ? '−' : ''}${baht(Math.abs(x.net))}`}
            metaSub={x.status === 'VOIDED' ? <StatusPill tone="bad">{label('st', x.status)}</StatusPill> : label('type', x.type)} />))}
      </div>
    </>
  );

  const detail = sel && (
    <>
      <DetailHeader title={sel.docNo} pill={<StatusPill tone={toneOf(sel.status)}>{label('st', sel.status)}</StatusPill>} subtitle={`${date(sel.createdAt, true)} · ${sel.cashier}`}
        primary={<button className="btn-primary" onClick={() => setPrinting({ path: `/transactions/${sel.id}/receipt`, title: sel.docNo, fmt: 'slip' })}>{t('pos.printBill')}</button>}
        secondary={can('document.issue') && sel.status === 'COMPLETED' && sel.saleTotal > 0 ? [{ label: t('tx.fullInvoice'), icon: 'receipt', onClick: () => setInvoice(true) }] : []}
        overflow={can('sale.void') && sel.status === 'COMPLETED' ? [{ label: t('tx.void'), icon: 'undo', danger: true, onClick: () => setVoiding(true) }] : []}
        tabs={[{ id: 'items', label: t('tx.items'), count: sel.lines.length }, { id: 'payments', label: t('tx.payments'), count: sel.payments.length }, { id: 'docs', label: t('tx.documents'), count: sel.documents.length }]} tab={tab} onTab={setTab} />
      <DetailBody>
        {sel.status === 'VOIDED' && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{t('tx.voidedBecause')}: {sel.voidReason}</div>}
        {tab === 'items' && (
          <div className="card">{sel.lines.map((l: any) => (
            <div key={l.id} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
              <IconTile icon={l.kind === 'TRADE_IN' ? 'undo' : 'box'} tone={l.kind === 'TRADE_IN' ? 'gold' : 'neutral'} />
              <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink-900">{l.description}</div><div className="text-xs text-ink-500">{grams(l.weightMg)} g · {pct(l.purityBp)}{l.kind === 'TRADE_IN' ? ` · ${t('pos.oldGold')}` : ''}</div></div>
              <div className="tabular-nums text-ink-900">{l.kind === 'TRADE_IN' ? '−' : ''}{baht(l.lineTotal)}</div>
            </div>))}</div>)}
        {tab === 'payments' && (sel.payments.length === 0 ? <Empty icon="receipt" text={t('common.empty')} /> : (
          <div className="card">{sel.payments.map((p: any) => <div key={p.id} className="flex justify-between border-b border-ink-100 px-4 py-3 last:border-0"><span>{label('mth', p.method)}{p.reference ? <span className="text-ink-500"> · {p.reference}</span> : null}</span><span className="tabular-nums">{p.amount < 0 ? '−' : ''}{baht(Math.abs(p.amount))}</span></div>)}</div>))}
        {tab === 'docs' && (sel.documents.length === 0 ? <Empty icon="receipt" text={t('pos.noDocs')} /> : (
          <div className="card">{sel.documents.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1"><div className="font-medium text-ink-900">{d.docNo}</div><div className="text-xs text-ink-500">{label('dt', d.docType)}</div></div>
              <StatusPill tone={toneOf(d.status)}>{label('st', d.status)}</StatusPill>
              <button className="btn-outline" onClick={() => setPrinting({ path: `/documents/${d.id}/html`, title: d.docNo, fmt: 'a4' })}>{t('print.print')}</button>
            </div>))}</div>))}
      </DetailBody>
    </>
  );

  const right = sel && (
    <RightPanel>
      <div><PanelTitle>{t('pos.summary')}</PanelTitle>
        <KV k={t('pos.gold')} v={baht(sel.goldTotal)} /><KV k={t('pos.making')} v={baht(sel.makingTotal + sel.otherTotal)} />
        {sel.discount > 0 && <KV k={t('pos.discount')} v={`−${baht(sel.discount)}`} />}<KV k={t('pos.vat')} v={baht(sel.tax)} />
        {sel.tradeInCredit > 0 && <KV k={t('pos.tradeInCredit')} v={`−${baht(sel.tradeInCredit)}`} />}
        <KV k={sel.net >= 0 ? t('pos.customerPays') : t('pos.shopPays')} v={`฿${baht(Math.abs(sel.net))}`} strong /></div>
      <div><PanelTitle>{t('common.customer')}</PanelTitle><div className="text-ink-900">{sel.customerName ?? '—'}</div>{sel.pointsEarned > 0 && <div className="text-xs text-ink-500">+{sel.pointsEarned} {t('common.pts')}</div>}</div>
    </RightPanel>
  );

  return (
    <>
      <MasterDetail panelKey="tx" list={listPane} detail={detail ?? null} right={right} onBack={() => setSel(null)} empty={<Empty icon="receipt" text={t('tx.pick')} />} />
      {voiding && sel && <ConfirmDialog destructive title={t('tx.void')} message={t('tx.voidWarn')} reasonLabel={t('tx.voidReason')} confirmLabel={t('tx.void')} onClose={() => setVoiding(false)}
        onConfirm={(reason) => run(() => post(`/transactions/${sel.id}/void`, { reason }), t('tx.voided')).then((r) => { if (r) { setSel(null); load(); } })} />}
      {invoice && sel && (
        <Modal title={t('tx.fullInvoice')} onClose={() => setInvoice(false)} footer={<><button className="btn-outline" onClick={() => setInvoice(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !buyer.buyerName || buyer.buyerTaxId.length !== 13 || !buyer.buyerAddress}
            onClick={() => run(() => post(`/transactions/${sel.id}/documents/full`, buyer), t('tx.invoiceIssued')).then((r) => { if (r) { setInvoice(false); open(sel.id); setPrinting({ path: `/documents/${r.id}/html`, title: r.docNo, fmt: 'a4' }); } })}>{t('tx.issue')}</button></>}>
          <div className="space-y-3">
            <Field label={t('tx.buyerName')} required><input className="input" value={buyer.buyerName} onChange={(e) => setBuyer({ ...buyer, buyerName: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.taxId')} required error={buyer.buyerTaxId && buyer.buyerTaxId.length !== 13 ? t('cust.id13') : undefined}><input className="input" inputMode="numeric" maxLength={13} value={buyer.buyerTaxId} onChange={(e) => setBuyer({ ...buyer, buyerTaxId: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label={t('settings.branch')}><input className="input" inputMode="numeric" maxLength={5} value={buyer.buyerBranch} onChange={(e) => setBuyer({ ...buyer, buyerBranch: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
            <Field label={t('common.address')} required><textarea className="input" rows={3} value={buyer.buyerAddress} onChange={(e) => setBuyer({ ...buyer, buyerAddress: e.target.value })} /></Field>
          </div>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat={printing.fmt} onClose={() => setPrinting(null)} />}
    </>
  );
}

import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { ChipRow, DetailBody, DetailHeader, KV, ListHeader, ListRow, MasterDetail, PanelTitle, RightPanel } from '../layout';
import { PrintModal } from '../PrintModal';
import { Avatar, ConfirmDialog, CustomerPicker, Empty, Field, Loading, Modal, PuritySelect, StatusPill, baht, grams, pct, toMg, toMinor, toneOf, today, useAction, useLabel, usePersisted } from '../ui';

type TabId = 'summary' | 'items' | 'history';

export function Pawn({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const [list, setList] = useState<any[] | null>(null);
  const [filter, setFilter] = usePersisted<string>('pawn.filter', 'ACTIVE');
  const [sel, setSel] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [asOf, setAsOf] = useState(today());
  const [tab, setTab] = useState<TabId>('summary');
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [f, setF] = useState({ type: 'PAWN', principal: '', rate: '1.25', desc: '', weight: '', purityBp: 9650, appraised: '', term: '30' });
  const [partialOpen, setPartialOpen] = useState(false);
  const [partial, setPartial] = useState('');
  const [forfeiting, setForfeiting] = useState(false);
  const [printing, setPrinting] = useState<{ path: string; title: string } | null>(null);
  const { run, busy } = useAction();

  const load = () => get(`/pawn?status=${filter}`).then(setList);
  useEffect(() => { load(); }, [filter]);
  const refresh = async (id: number, d = asOf) => { setSel(await get(`/pawn/${id}`)); setQuote(await get(`/pawn/${id}/quote?asOf=${d}`)); };
  const open = (id: number) => { setTab('summary'); refresh(id); };
  useEffect(() => { if (sel) get(`/pawn/${sel.id}/quote?asOf=${asOf}`).then(setQuote); }, [asOf]);
  const act = (path: string, extra: object, ok: string) => run(() => post(`/pawn/${sel.id}/${path}`, { asOf, ...extra }), ok).then((r) => { if (r) { load(); refresh(sel.id); } return r; });
  const overdue = (c: any) => c.status === 'ACTIVE' && c.dueDate < today();
  const canForfeit = user.permissions.includes('pawn.forfeit');

  const create = () => run(() => post('/pawn', {
    type: f.type, customerId: customer.id, principal: toMinor(f.principal), rateBpPerMonth: Math.round(Number(f.rate) * 100), termDays: Number(f.term) || undefined,
    items: [{ description: f.desc, weightMg: toMg(f.weight), purityBp: f.purityBp, appraisedValue: f.appraised ? toMinor(f.appraised) : undefined }],
  }), (c: any) => `${t('pawn.created')} ${c.contractNo}`).then((c) => { if (c) { setCreating(false); setCustomer(null); load(); setSel(null); setPrinting({ path: `/pawn/${c.id}/print`, title: c.contractNo }); } });

  const listPane = (
    <>
      <ListHeader title={t('nav.pawn')} onAdd={() => setCreating(true)} addLabel={t('pawn.new')}>
        <ChipRow value={filter} onChange={setFilter} chips={['ACTIVE', 'REDEEMED', 'FORFEITED'].map((s) => ({ id: s, label: label('st', s) }))} />
      </ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === null ? <Loading /> : list.length === 0 ? <Empty icon="vault" title={t('common.empty')} /> : list.map((c) => (
          <ListRow key={c.id} selected={sel?.id === c.id} onClick={() => open(c.id)} lead={<Avatar name={c.customerName} />} title={c.customerName} sub={`${c.contractNo} · ${t('pawn.due')} ${date(c.dueDate)}`}
            meta={baht(c.principal)} metaSub={overdue(c) ? <StatusPill tone="bad">{t('pawn.overdue')}</StatusPill> : label('pt', c.type)} />))}
      </div>
    </>
  );

  const detail = sel && quote && (
    <>
      <DetailHeader title={sel.contractNo} pill={<><StatusPill tone="gold">{label('pt', sel.type)}</StatusPill><StatusPill tone={toneOf(sel.status)}>{label('st', sel.status)}</StatusPill></>} subtitle={`${sel.customerName} · ${(sel.rateBpPerMonth / 100).toFixed(2)}% / ${t('pawn.month')}`}
        primary={sel.status === 'ACTIVE' ? <button className="btn-primary" disabled={busy} onClick={() => act('redeem', {}, t('pawn.redeemed'))}>{t('pawn.redeem')}</button> : undefined}
        secondary={sel.status === 'ACTIVE' ? [{ label: `${t('pawn.renew')} · ${baht(quote.interestDue)}`, onClick: () => act('renew', {}, t('pawn.renewed')), disabled: busy || quote.interestDue <= 0 }] : []}
        overflow={[
          ...(sel.status === 'ACTIVE' ? [{ label: t('pawn.payPrincipal'), icon: 'edit', onClick: () => setPartialOpen(true) }] : []),
          { label: t('pawn.printTicket'), icon: 'print', onClick: () => setPrinting({ path: `/pawn/${sel.id}/print`, title: sel.contractNo }) },
          ...(sel.status === 'ACTIVE' && canForfeit ? [{ label: t('pawn.forfeit'), icon: 'alert', danger: true, onClick: () => setForfeiting(true) }] : []),
        ]}
        tabs={[{ id: 'summary', label: t('pawn.summary') }, { id: 'items', label: t('pawn.items'), count: sel.items.length }, { id: 'history', label: t('pawn.events'), count: sel.events.length }]} tab={tab} onTab={setTab} />
      <DetailBody>
        {tab === 'summary' && (
          <div className="card p-4"><KV k={t('pawn.principal')} v={baht(sel.principal)} /><KV k={t('pawn.startDate')} v={date(sel.startDate)} /><KV k={t('pawn.due')} v={date(sel.dueDate)} />
            <KV k={t('pawn.termDays')} v={sel.termDays} /><KV k={t('pawn.paidTo')} v={date(sel.interestPaidTo)} /><KV k={t('pawn.appraised')} v={baht(sel.appraisedValue)} /></div>)}
        {tab === 'items' && <div className="card">{sel.items.map((i: any) => <div key={i.id} className="flex items-center justify-between border-b border-ink-100 px-4 py-3 last:border-0"><div><div className="font-medium text-ink-900">{i.description}</div><div className="text-xs text-ink-500">{grams(i.weightMg)} g · {pct(i.purityBp)}</div></div><span className="tabular-nums">{baht(i.appraisedValue)}</span></div>)}</div>}
        {tab === 'history' && <div className="card">{sel.events.map((e: any) => <div key={e.id} className="flex items-center justify-between border-b border-ink-100 px-4 py-3 last:border-0"><div><div className="font-medium text-ink-900">{label('pe', e.kind)}</div><div className="text-xs text-ink-500">{date(e.createdAt, true)}</div></div><span className="tabular-nums">{baht(Math.abs(e.principalAmount) + e.interestAmount)}</span></div>)}</div>}
      </DetailBody>
    </>
  );

  const right = sel && quote && (
    <RightPanel>
      <PanelTitle>{t('pawn.calc')}</PanelTitle>
      <Field label={t('pawn.asOf')}><input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
      <div className="mt-2">
        <KV k={t('pawn.principal')} v={baht(sel.principal)} /><KV k={`${t('pawn.interestDue')}`} v={baht(quote.interestDue)} />
        <KV k={t('pawn.redeemTotal')} v={`฿${baht(quote.redeemTotal)}`} strong />
        <div className="mt-2 text-xs text-ink-500">{t('pawn.renewTo')} {date(quote.renewNewDueDate)}{quote.overdueDays > 0 && <> · <span className="font-medium text-red-600">{t('pawn.overdue')} {quote.overdueDays} {t('pawn.days')}</span></>}</div>
      </div>
    </RightPanel>
  );

  return (
    <>
      <MasterDetail panelKey="pawn" list={listPane} detail={detail ?? null} right={right} onBack={() => setSel(null)} empty={<Empty icon="vault" text={t('pawn.pick')} />} />
      {forfeiting && <ConfirmDialog destructive title={t('pawn.forfeit')} message={t('pawn.forfeitWarn')} confirmLabel={t('pawn.forfeit')} onClose={() => setForfeiting(false)} onConfirm={() => act('forfeit', {}, t('pawn.forfeited'))} />}
      {partialOpen && (
        <Modal size="sm" title={t('pawn.payPrincipal')} onClose={() => setPartialOpen(false)} footer={<><button className="btn-outline" onClick={() => setPartialOpen(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !(toMinor(partial) > 0)} onClick={() => act('pay-principal', { amount: toMinor(partial) }, t('common.saved')).then((r) => { if (r) { setPartialOpen(false); setPartial(''); } })}>{t('pawn.reduce')}</button></>}>
          <Field label={t('common.amount')} hint={`${t('pawn.interestDue')}: ${baht(quote?.interestDue ?? 0)}`}><input className="input" inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} data-autofocus /></Field>
        </Modal>)}
      {creating && (
        <Modal size="lg" title={t('pawn.new')} onClose={() => setCreating(false)} footer={<><button className="btn-outline" onClick={() => setCreating(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy || !customer || !f.desc || !(toMinor(f.principal) > 0) || !(toMg(f.weight) > 0)} onClick={create}>{t('common.save')}</button></>}>
          <div className="space-y-4">
            <CustomerPicker value={customer} onChange={setCustomer} get={get} required />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label={t('common.type')}><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="PAWN">{label('pt', 'PAWN')}</option><option value="SELL_BACK">{label('pt', 'SELL_BACK')}</option></select></Field>
              <Field label={t('pawn.principal')} required><input className="input" inputMode="decimal" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></Field>
              <Field label={t('pawn.rateMonth')}><input className="input" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
              <Field label={t('pawn.termDays')}><input className="input" inputMode="numeric" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} /></Field>
            </div>
            <Field label={t('pawn.item')} required><input className="input" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('stock.weight')} required><input className="input" inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
              <Field label={t('stock.purity')}><PuritySelect value={f.purityBp} onChange={(bp) => setF({ ...f, purityBp: bp })} /></Field>
              <Field label={t('pawn.appraised')}><input className="input" inputMode="decimal" value={f.appraised} onChange={(e) => setF({ ...f, appraised: e.target.value })} /></Field>
            </div>
          </div>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat="a4" onClose={() => setPrinting(null)} />}
    </>
  );
}

import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { ChipRow, DetailBody, DetailHeader, KV, ListHeader, ListRow, MasterDetail, PanelTitle, RightPanel, SectionCard } from '../layout';
import { Empty, Field, IconTile, Loading, Modal, PuritySelect, SearchBox, StatusPill, baht, grams, pct, toMg, toMinor, toneOf, useAction, useLabel, usePersisted } from '../ui';

const CATS = ['RING', 'CHAIN', 'BANGLE', 'PENDANT', 'EARRING', 'BAR'];
const blank = { name: '', category: 'RING', weight: '', purityBp: 9650, makingType: 'FIXED', makingValue: '', cost: '' };
type TabId = 'details' | 'history';

export function Inventory({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [items, setItems] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [status, setStatus] = usePersisted<string>('stock.status', 'IN_STOCK');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [sel, setSel] = useState<any>(null);
  const [tab, setTab] = useState<TabId>('details');
  const [adjusting, setAdjusting] = useState(false);
  const [adj, setAdj] = useState({ status: 'MISSING', note: '' });
  const { run, busy } = useAction();

  const load = () => { get(`/items?status=${status}&q=${encodeURIComponent(q)}`).then(setItems); get('/stock/summary').then(setSummary); };
  useEffect(load, [status, q]);
  const open = (id: number) => { setTab('details'); get(`/items/${id}`).then(setSel); };
  const add = () => run(() => post('/items', {
    name: f.name, category: f.category, weightMg: toMg(f.weight), purityBp: f.purityBp, cost: toMinor(f.cost || '0'),
    making: f.makingType === 'PERCENT' ? { type: 'PERCENT', bp: Math.round(Number(f.makingValue || 0) * 100) } : { type: f.makingType, amount: toMinor(f.makingValue || '0') },
  }), t('stock.added')).then((r) => { if (r) { setAdding(false); setF(blank); load(); } });

  const listPane = (
    <>
      <ListHeader title={t('nav.stock')} onAdd={can('item.manage') ? () => setAdding(true) : undefined} addLabel={t('stock.receive')}>
        <SearchBox value={q} onChange={setQ} placeholder={t('stock.search')} />
        <ChipRow value={status} onChange={setStatus} chips={['IN_STOCK', 'SOLD', 'RESERVED', 'MISSING'].map((s) => ({ id: s, label: label('st', s) }))} />
      </ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === null ? <Loading /> : items.length === 0 ? <Empty icon="box" title={t('common.empty')} /> : items.map((i) => (
          <ListRow key={i.id} selected={sel?.id === i.id} onClick={() => open(i.id)} lead={<IconTile icon="box" tone={i.source === 'FORFEITED' ? 'gold' : 'neutral'} />}
            title={i.name} sub={`${i.sku} · ${grams(i.weightMg)} g · ${pct(i.purityBp)}`} meta={baht(i.cost)} metaSub={label('src', i.source)} />))}
      </div>
    </>
  );

  const summaryCard = (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <SectionCard title={t('dash.stockByPurity')} flush>
        {summary.length === 0 ? <Empty text={t('common.empty')} /> : (
          <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-ink-100"><th className="th">{t('common.status')}</th><th className="th">{t('stock.purity')}</th><th className="th num">{t('stock.pieces')}</th><th className="th num">{t('stock.weight')}</th><th className="th num">{t('stock.cost')}</th></tr></thead>
            <tbody className="divide-y divide-ink-100">{summary.map((s, i) => (
              <tr key={i} className="h-11"><td className="td"><StatusPill tone={toneOf(s.status)}>{label('st', s.status)}</StatusPill></td><td className="td">{pct(s.purityBp)}</td><td className="td num">{s.count}</td><td className="td num">{grams(s.weightMg)}</td><td className="td num">{baht(s.cost)}</td></tr>))}</tbody></table></div>)}
      </SectionCard>
    </div>
  );

  const detail = sel && (
    <>
      <DetailHeader title={sel.name} pill={<StatusPill tone={toneOf(sel.status)}>{label('st', sel.status)}</StatusPill>} subtitle={`${sel.sku} · ${label('src', sel.source)}`}
        overflow={can('stock.adjust') && ['IN_STOCK', 'RESERVED', 'MISSING'].includes(sel.status) ? [{ label: t('stock.adjust'), icon: 'edit', onClick: () => setAdjusting(true) }] : []}
        tabs={[{ id: 'details', label: t('stock.details') }, { id: 'history', label: t('stock.history'), count: sel.movements.length }]} tab={tab} onTab={setTab} />
      <DetailBody>
        {tab === 'details' && (
          <div className="card p-4"><KV k={t('stock.category')} v={label('cat', sel.category)} /><KV k={t('stock.weight')} v={grams(sel.weightMg)} /><KV k={t('stock.purity')} v={pct(sel.purityBp)} />
            <KV k={t('stock.making')} v={sel.making.type === 'PERCENT' ? `${(sel.making.bp / 100).toFixed(2)}%` : `${baht(sel.making.amount)}${sel.making.type === 'PER_GRAM' ? ' / g' : ''}`} /><KV k={t('stock.cost')} v={baht(sel.cost)} /></div>)}
        {tab === 'history' && (
          <div className="card">{sel.movements.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 last:border-0"><div><div className="font-medium text-ink-900">{label('mv', m.type)}</div><div className="text-xs text-ink-500">{date(m.createdAt, true)} · {m.username}{m.note ? ` · ${m.note}` : ''}</div></div>
              <div className="text-xs text-ink-500">{m.fromStatus ?? '—'} → {m.toStatus ?? '—'}</div></div>))}</div>)}
      </DetailBody>
    </>
  );

  return (
    <>
      <MasterDetail panelKey="stock" list={listPane} detail={detail ?? null} onBack={() => setSel(null)} empty={summaryCard} />
      {adding && (
        <Modal size="lg" title={t('stock.receive')} onClose={() => setAdding(false)} footer={<><button className="btn-outline" onClick={() => setAdding(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy || !f.name || !(toMg(f.weight) > 0)} onClick={add}>{t('common.save')}</button></>}>
          <div className="space-y-3">
            <Field label={t('common.name')} required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-autofocus /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('stock.category')}><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{label('cat', c)}</option>)}</select></Field>
              <Field label={t('stock.weight')} required><input className="input" inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
              <Field label={t('stock.purity')}><PuritySelect value={f.purityBp} onChange={(bp) => setF({ ...f, purityBp: bp })} /></Field>
              <Field label={t('stock.making')}><select className="input" value={f.makingType} onChange={(e) => setF({ ...f, makingType: e.target.value })}>{['FIXED', 'PER_GRAM', 'PERCENT'].map((m) => <option key={m} value={m}>{label('mk', m)}</option>)}</select></Field>
              <Field label={f.makingType === 'PERCENT' ? '%' : t('common.amount')}><input className="input" inputMode="decimal" value={f.makingValue} onChange={(e) => setF({ ...f, makingValue: e.target.value })} /></Field>
              <Field label={t('stock.cost')}><input className="input" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
            </div>
          </div>
        </Modal>)}
      {adjusting && sel && (
        <Modal size="sm" title={t('stock.adjust')} onClose={() => setAdjusting(false)} footer={<><button className="btn-outline" onClick={() => setAdjusting(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !adj.note.trim()} onClick={() => run(() => post(`/items/${sel.id}/adjust`, adj), t('common.saved')).then((r) => { if (r) { setAdjusting(false); setAdj({ ...adj, note: '' }); open(sel.id); load(); } })}>{t('common.save')}</button></>}>
          <div className="space-y-3">
            <Field label={t('common.status')}><select className="input" value={adj.status} onChange={(e) => setAdj({ ...adj, status: e.target.value })}>{['IN_STOCK', 'RESERVED', 'MISSING'].map((s) => <option key={s} value={s}>{label('st', s)}</option>)}</select></Field>
            <Field label={t('stock.reason')} required><input className="input" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} data-autofocus /></Field>
          </div>
        </Modal>)}
    </>
  );
}

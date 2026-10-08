import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { Badge, Card, Empty, Field, Icon, Modal, PageHead, PuritySelect, baht, grams, pct, toMg, toMinor, toneOf, useAction, useLabel } from '../ui';

const CATS = ['RING', 'CHAIN', 'BANGLE', 'PENDANT', 'EARRING', 'BAR'];
const blank = { name: '', category: 'RING', weight: '', purityBp: 9650, makingType: 'FIXED', makingValue: '', cost: '' };

export function Inventory({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [status, setStatus] = useState('IN_STOCK');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [sel, setSel] = useState<any>(null);
  const [adj, setAdj] = useState({ status: 'MISSING', note: '' });
  const { run, busy } = useAction();
  const can = (p: string) => user.permissions.includes(p);

  const load = () => { get(`/items?status=${status}&q=${encodeURIComponent(q)}`).then(setItems); get('/stock/summary').then(setSummary); };
  useEffect(load, [status, q]);

  const add = () => run(() => post('/items', {
    name: f.name, category: f.category, weightMg: toMg(f.weight), purityBp: f.purityBp, cost: toMinor(f.cost || '0'),
    making: f.makingType === 'PERCENT' ? { type: 'PERCENT', bp: Math.round(Number(f.makingValue || 0) * 100) } : { type: f.makingType, amount: toMinor(f.makingValue || '0') },
  }), t('stock.added')).then((r) => { if (r) { setAdding(false); setF(blank); load(); } });

  return (
    <>
      <PageHead title={t('nav.stock')}>{can('item.manage') && <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> {t('stock.receive')}</button>}</PageHead>
      <Card title={t('dash.stockByPurity')} tone="gold">
        {summary.length === 0 ? <Empty text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('common.status')}</th><th>{t('stock.purity')}</th><th className="num">{t('stock.pieces')}</th><th className="num">{t('stock.weight')}</th><th className="num">{t('stock.cost')}</th></tr></thead><tbody>
            {summary.map((s, i) => <tr key={i}><td data-label={t('common.status')}><Badge tone={toneOf(s.status)}>{label('st', s.status)}</Badge></td><td data-label={t('stock.purity')}>{pct(s.purityBp)}</td><td className="num" data-label={t('stock.pieces')}>{s.count}</td><td className="num" data-label={t('stock.weight')}>{grams(s.weightMg)}</td><td className="num" data-label={t('stock.cost')}>{baht(s.cost)}</td></tr>)}
          </tbody></table></div>)}
      </Card>
      <Card title={t('stock.items')} right={<div className="row center">
        <input style={{ width: 180 }} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
        <select style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>{['IN_STOCK', 'SOLD', 'RESERVED', 'MISSING'].map((s) => <option key={s} value={s}>{label('st', s)}</option>)}</select></div>}>
        {items.length === 0 ? <Empty text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>SKU</th><th>{t('common.name')}</th><th>{t('stock.category')}</th><th className="num">{t('stock.weight')}</th><th>{t('stock.purity')}</th><th>{t('stock.source')}</th><th className="num">{t('stock.cost')}</th></tr></thead><tbody>
            {items.map((i) => <tr key={i.id} className="click" onClick={() => get(`/items/${i.id}`).then(setSel)}><td data-label="SKU"><b>{i.sku}</b></td><td data-label={t('common.name')}>{i.name}</td><td data-label={t('stock.category')}>{label('cat', i.category)}</td>
              <td className="num" data-label={t('stock.weight')}>{grams(i.weightMg)}</td><td data-label={t('stock.purity')}>{pct(i.purityBp)}</td>
              <td data-label={t('stock.source')}><Badge tone={i.source === 'FORFEITED' ? 'warn' : i.source === 'TRADE_IN' ? 'gold' : undefined}>{label('src', i.source)}</Badge></td><td className="num" data-label={t('stock.cost')}>{baht(i.cost)}</td></tr>)}
          </tbody></table></div>)}
      </Card>

      {adding && (
        <Modal title={t('stock.receive')} onClose={() => setAdding(false)} foot={<><button className="btn" onClick={() => setAdding(false)}>{t('common.cancel')}</button><button className="btn primary" disabled={busy || !f.name || !(toMg(f.weight) > 0)} onClick={add}>{t('common.save')}</button></>}>
          <Field label={t('common.name')}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <div className="row">
            <Field label={t('stock.category')}><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{label('cat', c)}</option>)}</select></Field>
            <Field label={t('stock.weight')}><input inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
            <Field label={t('stock.purity')}><PuritySelect value={f.purityBp} onChange={(bp) => setF({ ...f, purityBp: bp })} /></Field>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Field label={t('stock.making')}><select value={f.makingType} onChange={(e) => setF({ ...f, makingType: e.target.value })}>{['FIXED', 'PER_GRAM', 'PERCENT'].map((m) => <option key={m} value={m}>{label('mk', m)}</option>)}</select></Field>
            <Field label={f.makingType === 'PERCENT' ? '%' : t('common.amount')}><input inputMode="decimal" value={f.makingValue} onChange={(e) => setF({ ...f, makingValue: e.target.value })} /></Field>
            <Field label={t('stock.cost')}><input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          </div>
        </Modal>)}

      {sel && (
        <Modal wide title={<>{sel.sku} <Badge tone={toneOf(sel.status)}>{label('st', sel.status)}</Badge></>} onClose={() => setSel(null)}>
          <p>{sel.name} · {grams(sel.weightMg)} g · {pct(sel.purityBp)} · {label('src', sel.source)}</p>
          {can('stock.adjust') && ['IN_STOCK', 'RESERVED', 'MISSING'].includes(sel.status) && (
            <div className="row" style={{ marginBottom: 12 }}>
              <Field label={t('common.status')}><select value={adj.status} onChange={(e) => setAdj({ ...adj, status: e.target.value })}>{['IN_STOCK', 'RESERVED', 'MISSING'].map((s) => <option key={s} value={s}>{label('st', s)}</option>)}</select></Field>
              <Field label={t('stock.reason')}><input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
              <button className="btn" disabled={busy || !adj.note.trim()} onClick={() => run(() => post(`/items/${sel.id}/adjust`, adj), t('common.saved')).then((r) => { if (r) { setSel(null); load(); } })}>{t('stock.adjust')}</button>
            </div>)}
          <h4>{t('stock.history')}</h4>
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('common.time')}</th><th>{t('common.type')}</th><th>{t('common.status')}</th><th>{t('common.user')}</th></tr></thead><tbody>
            {sel.movements.map((m: any) => <tr key={m.id}><td data-label={t('common.time')}>{date(m.createdAt, true)}</td><td data-label={t('common.type')}>{label('mv', m.type)}</td><td data-label={t('common.status')}>{m.fromStatus ?? '—'} → {m.toStatus ?? '—'}</td><td data-label={t('common.user')}>{m.username}{m.note ? ` · ${m.note}` : ''}</td></tr>)}
          </tbody></table></div>
        </Modal>)}
    </>
  );
}

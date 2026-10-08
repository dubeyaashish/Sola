import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { PrintModal } from '../PrintModal';
import { Badge, Card, ConfirmModal, CustomerPicker, Empty, Field, Icon, Modal, PageHead, PuritySelect, baht, grams, pct, toMg, toMinor, toneOf, today, useAction, useLabel } from '../ui';

export function Pawn({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState('ACTIVE');
  const [sel, setSel] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [asOf, setAsOf] = useState(today());
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [f, setF] = useState({ type: 'PAWN', principal: '', rate: '1.25', desc: '', weight: '', purityBp: 9650, appraised: '', term: '30' });
  const [partial, setPartial] = useState('');
  const [forfeiting, setForfeiting] = useState(false);
  const [printing, setPrinting] = useState<{ path: string; title: string } | null>(null);
  const { run, busy } = useAction();

  const load = () => get(`/pawn?status=${filter}`).then(setList);
  useEffect(() => { load(); }, [filter]);
  const refresh = async (id: number, d = asOf) => { setSel(await get(`/pawn/${id}`)); setQuote(await get(`/pawn/${id}/quote?asOf=${d}`)); };
  useEffect(() => { if (sel) get(`/pawn/${sel.id}/quote?asOf=${asOf}`).then(setQuote); }, [asOf]);
  const act = (path: string, extra: object, ok: string) => run(() => post(`/pawn/${sel.id}/${path}`, { asOf, ...extra }), ok).then((r) => { if (r) { load(); refresh(sel.id); } });
  const overdue = (c: any) => c.status === 'ACTIVE' && c.dueDate < today();

  const create = () => run(() => post('/pawn', {
    type: f.type, customerId: customer.id, principal: toMinor(f.principal), rateBpPerMonth: Math.round(Number(f.rate) * 100), termDays: Number(f.term) || undefined,
    items: [{ description: f.desc, weightMg: toMg(f.weight), purityBp: f.purityBp, appraisedValue: f.appraised ? toMinor(f.appraised) : undefined }],
  }), (c: any) => `${t('pawn.created')} ${c.contractNo}`).then((c) => { if (c) { setCreating(false); setCustomer(null); load(); setSel(null); setPrinting({ path: `/pawn/${c.id}/print`, title: c.contractNo }); } });

  return (
    <>
      <PageHead title={t('nav.pawn')}><button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> {t('pawn.new')}</button></PageHead>
      <Card right={<select style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('common.status')}>{['ACTIVE', 'REDEEMED', 'FORFEITED'].map((s) => <option key={s} value={s}>{label('st', s)}</option>)}</select>}>
        {list.length === 0 ? <Empty icon="vault" text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('pawn.no')}</th><th>{t('common.type')}</th><th>{t('common.customer')}</th><th className="num">{t('pawn.principal')}</th><th>{t('pawn.due')}</th></tr></thead><tbody>
            {list.map((c) => <tr key={c.id} className="click" onClick={() => { refresh(c.id); }}><td data-label={t('pawn.no')}><b>{c.contractNo}</b></td><td data-label={t('common.type')}><Badge tone="gold">{label('pt', c.type)}</Badge></td><td data-label={t('common.customer')}>{c.customerName}</td>
              <td className="num" data-label={t('pawn.principal')}>{baht(c.principal)}</td><td data-label={t('pawn.due')}>{date(c.dueDate)} {overdue(c) && <Badge tone="bad">{t('pawn.overdue')}</Badge>}</td></tr>)}
          </tbody></table></div>)}
      </Card>

      {sel && quote && (
        <Modal wide title={<>{sel.contractNo} <Badge tone="gold">{label('pt', sel.type)}</Badge> <Badge tone={toneOf(sel.status)}>{label('st', sel.status)}</Badge></>} onClose={() => setSel(null)}
          foot={<button className="btn" onClick={() => setPrinting({ path: `/pawn/${sel.id}/print`, title: sel.contractNo })}><Icon name="print" /> {t('pawn.printTicket')}</button>}>
          <div className="muted">{sel.customerName} · {(sel.rateBpPerMonth / 100).toFixed(2)}% / {t('pawn.month')} · {t('pawn.due')} {date(sel.dueDate)}</div>
          <Field label={t('pawn.asOf')}><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
          <div className="tot">
            <span>{t('pawn.principal')}</span><span className="num">{baht(sel.principal)}</span>
            <span>{t('pawn.interestDue')} <span className="muted small">({sel.interestPaidTo} → {asOf})</span></span><span className="num">{baht(quote.interestDue)}</span>
            <span className="grand">{t('pawn.redeemTotal')}</span><span className="grand big num">฿{baht(quote.redeemTotal)}</span>
          </div>
          <ul>{sel.items.map((i: any) => <li key={i.id}>{i.description} · {grams(i.weightMg)} g · {pct(i.purityBp)}</li>)}</ul>
          {sel.status === 'ACTIVE' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => act('redeem', {}, t('pawn.redeemed'))}>{t('pawn.redeem')}</button>
                <button className="btn gold" disabled={busy || quote.interestDue <= 0} onClick={() => act('renew', {}, t('pawn.renewed'))}>{t('pawn.renew')} · {baht(quote.interestDue)}</button>
              </div>
              <div className="row"><Field label={t('pawn.payPrincipal')}><input inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} /></Field>
                <button className="btn" disabled={busy || !partial} onClick={() => act('pay-principal', { amount: toMinor(partial) }, t('common.saved')).then(() => setPartial(''))}>{t('pawn.reduce')}</button></div>
              {user.permissions.includes('pawn.forfeit') && <button className="btn danger" disabled={busy} onClick={() => setForfeiting(true)}>{t('pawn.forfeit')}</button>}
            </div>)}
          <h4 style={{ marginTop: 14 }}>{t('pawn.events')}</h4>
          {sel.events.map((e: any) => <div className="line" key={e.id}><span>{label('pe', e.kind)} <span className="muted small">{date(e.createdAt, true)}</span></span><span className="num">{baht(Math.abs(e.principalAmount) + e.interestAmount)}</span></div>)}
        </Modal>)}

      {forfeiting && <ConfirmModal danger title={t('pawn.forfeit')} text={t('pawn.forfeitWarn')} confirmLabel={t('pawn.forfeit')} onClose={() => setForfeiting(false)} onConfirm={() => act('forfeit', {}, t('pawn.forfeited'))} />}

      {creating && (
        <Modal wide title={t('pawn.new')} onClose={() => setCreating(false)} foot={<><button className="btn" onClick={() => setCreating(false)}>{t('common.cancel')}</button><button className="btn primary" disabled={busy || !customer || !f.desc || !(toMinor(f.principal) > 0) || !(toMg(f.weight) > 0)} onClick={create}>{t('common.save')}</button></>}>
          <CustomerPicker value={customer} onChange={setCustomer} get={get} />
          <div className="row">
            <Field label={t('common.type')}><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="PAWN">{label('pt', 'PAWN')}</option><option value="SELL_BACK">{label('pt', 'SELL_BACK')}</option></select></Field>
            <Field label={t('pawn.principal')}><input inputMode="decimal" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></Field>
            <Field label={t('pawn.rateMonth')}><input inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
            <Field label={t('pawn.termDays')}><input inputMode="numeric" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} /></Field>
          </div>
          <Field label={t('pawn.item')}><input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
          <div className="row">
            <Field label={t('stock.weight')}><input inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
            <Field label={t('stock.purity')}><PuritySelect value={f.purityBp} onChange={(bp) => setF({ ...f, purityBp: bp })} /></Field>
            <Field label={t('pawn.appraised')}><input inputMode="decimal" value={f.appraised} onChange={(e) => setF({ ...f, appraised: e.target.value })} /></Field>
          </div>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat="a4" onClose={() => setPrinting(null)} />}
    </>
  );
}

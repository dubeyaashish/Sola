import { useEffect, useState } from 'react';
import { get, patch, post } from '../api';
import { useI18n } from '../i18n';
import { Badge, Card, Empty, Field, Icon, Modal, PageHead, baht, useAction, useLabel } from '../ui';

const blank = { title: '', name: '', nationalId: '', birthDate: '', phone: '', address: '', member: true };

export function Customers({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null); // form state or null
  const [sel, setSel] = useState<any>(null);
  const [points, setPoints] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const { run, busy } = useAction();
  const load = () => get(`/customers?q=${encodeURIComponent(q)}`).then(setList);
  useEffect(() => { load(); }, [q]);
  const open = async (id: number) => { const c = await get(`/customers/${id}`); setSel(c); setPoints(await get(`/customers/${id}/points`)); setRewards(await get('/rewards')); };
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const idBad = edit?.nationalId && !/^\d{13}$/.test(edit.nationalId);

  const save = () => {
    const body = Object.fromEntries(Object.entries(edit).filter(([k]) => k !== 'id').map(([k, v]) => [k, v === '' ? null : v]));
    return run(() => (edit.id ? patch(`/customers/${edit.id}`, body) : post('/customers', body)), t('common.saved')).then((r) => { if (r) { setEdit(null); load(); if (sel) open(sel.id); } });
  };

  return (
    <>
      <PageHead title={t('nav.customers')}>{can('customer.manage') && <button className="btn primary" onClick={() => setEdit(blank)}><Icon name="plus" /> {t('cust.new')}</button>}</PageHead>
      <Card right={<input style={{ width: 'min(260px,100%)' }} placeholder={t('cust.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />}>
        {list.length === 0 ? <Empty icon="users" text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('cust.member')}</th><th>{t('common.name')}</th><th>{t('common.phone')}</th><th className="num">{t('common.pts')}</th></tr></thead><tbody>
            {list.map((c) => <tr key={c.id} className="click" onClick={() => open(c.id)}><td data-label={t('cust.member')}>{c.memberNo ?? '—'}</td><td data-label={t('common.name')}><b>{c.name}</b></td><td data-label={t('common.phone')}>{c.phone ?? '—'}</td><td className="num" data-label={t('common.pts')}>{c.pointsBalance}</td></tr>)}
          </tbody></table></div>)}
      </Card>

      {sel && !edit && (
        <Modal wide title={<>{sel.name} {sel.memberNo && <Badge tone="gold">{sel.memberNo}</Badge>}</>} onClose={() => setSel(null)}
          foot={can('customer.manage') ? <button className="btn" onClick={() => setEdit({ ...blank, ...Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, v ?? ''])), member: !!sel.memberNo })}>{t('common.edit')}</button> : undefined}>
          <div className="muted">{t('cust.idCard')}: {sel.nationalId ?? '—'} {sel.idSource === 'CARD_READER' && <Badge tone="ok">{t('cust.fromReader')}</Badge>} · {sel.phone ?? ''}</div>
          <div className="stat" style={{ margin: '12px 0' }}><div className="k">{t('cust.points')}</div><div className="v">{sel.pointsBalance}</div></div>
          {can('loyalty.manage') && rewards.length > 0 && <>
            <h4>{t('cust.rewards')}</h4>
            {rewards.filter((r) => r.active).map((r) => (
              <div className="line" key={r.id}><span>{r.name} <span className="muted small">· {r.pointsCost} {t('common.pts')} · {t('cust.left')} {r.stockQty}</span></span>
                <button className="btn sm gold" disabled={busy || r.stockQty < 1 || sel.pointsBalance < r.pointsCost} onClick={() => run(() => post(`/customers/${sel.id}/redeem-reward`, { rewardId: r.id }), t('cust.redeemed')).then(() => { open(sel.id); load(); })}>{t('cust.redeem')}</button></div>))}</>}
          <h4 style={{ marginTop: 14 }}>{t('cust.pointsHistory')}</h4>
          {points.length === 0 ? <div className="muted">{t('common.empty')}</div> : points.slice(0, 8).map((p) => <div className="line" key={p.id}><span>{label('pr', p.reason)} <span className="muted small">{date(p.createdAt)} {p.note ?? ''}</span></span><b className="num">{p.delta > 0 ? '+' : ''}{p.delta}</b></div>)}
          <h4 style={{ marginTop: 14 }}>{t('nav.transactions')}</h4>
          {sel.transactions.length === 0 ? <div className="muted">{t('common.empty')}</div> : sel.transactions.slice(0, 8).map((x: any) => <div className="line" key={x.id}><span><b>{x.docNo}</b> <span className="muted small">{date(x.createdAt)}</span></span><span className="num">{baht(Math.abs(x.net))}</span></div>)}
        </Modal>)}

      {edit && (
        <Modal title={edit.id ? t('common.edit') : t('cust.new')} onClose={() => setEdit(null)} foot={<><button className="btn" onClick={() => setEdit(null)}>{t('common.cancel')}</button><button className="btn primary" disabled={busy || !edit.name || idBad} onClick={save}>{t('common.save')}</button></>}>
          <div className="alert warn small">{t('cust.readerHint')}</div>
          <div className="row"><Field label={t('cust.title')}><input value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field><div style={{ flex: '3 1 200px' }}><Field label={t('cust.fullName')}><input value={edit.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field></div></div>
          <Field label={t('cust.idCard')}><input inputMode="numeric" maxLength={13} value={edit.nationalId ?? ''} onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, ''))} aria-invalid={!!idBad} />{idBad && <small className="muted">{t('cust.id13')}</small>}</Field>
          <div className="row"><Field label={t('cust.birth')}><input type="date" value={edit.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} /></Field><Field label={t('common.phone')}><input inputMode="tel" value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field></div>
          <Field label={t('common.address')}><textarea rows={2} value={edit.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <label className="check"><input type="checkbox" checked={edit.member} disabled={!!sel?.memberNo && !!edit.id} onChange={(e) => set('member', e.target.checked)} /> {t('cust.joinMember')}</label>
        </Modal>)}
    </>
  );
}

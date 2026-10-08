import { useEffect, useState } from 'react';
import { get, patch, post } from '../api';
import { useI18n } from '../i18n';
import { DetailBody, DetailHeader, KV, ListHeader, ListRow, MasterDetail, PanelTitle, RightPanel } from '../layout';
import { Avatar, Empty, Field, Loading, Modal, Notice, SearchBox, StatusPill, baht, useAction, useLabel } from '../ui';

const blank = { title: '', name: '', nationalId: '', birthDate: '', phone: '', address: '', member: true };
type TabId = 'overview' | 'points' | 'bills';

export function Customers({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [points, setPoints] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [tab, setTab] = useState<TabId>('overview');
  const { run, busy } = useAction();
  const load = () => get(`/customers?q=${encodeURIComponent(q)}`).then(setList);
  useEffect(() => { load(); }, [q]);
  const open = async (id: number) => { setTab('overview'); const c = await get(`/customers/${id}`); setSel(c); setPoints(await get(`/customers/${id}/points`)); setRewards(await get('/rewards')); };
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const idBad = edit?.nationalId && !/^\d{13}$/.test(edit.nationalId);
  const save = () => {
    const body = Object.fromEntries(Object.entries(edit).filter(([k]) => !['id', 'transactions', 'createdAt', 'pointsBalance', 'memberNo', 'idSource'].includes(k)).map(([k, v]) => [k, v === '' ? null : v]));
    return run(() => (edit.id ? patch(`/customers/${edit.id}`, body) : post('/customers', body)), t('common.saved')).then((r) => { if (r) { setEdit(null); load(); if (edit.id) open(edit.id); } });
  };

  const listPane = (
    <>
      <ListHeader title={t('nav.customers')} onAdd={can('customer.manage') ? () => setEdit(blank) : undefined} addLabel={t('cust.new')}><SearchBox value={q} onChange={setQ} placeholder={t('cust.search')} /></ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === null ? <Loading /> : list.length === 0 ? <Empty icon="users" title={t('common.empty')} action={can('customer.manage') && <button className="btn-primary" onClick={() => setEdit(blank)}>{t('cust.new')}</button>} /> : list.map((c) => (
          <ListRow key={c.id} selected={sel?.id === c.id} onClick={() => open(c.id)} lead={<Avatar name={c.name} />} title={c.name} sub={`${c.memberNo ?? '—'} · ${c.phone ?? '—'}`} meta={c.pointsBalance > 0 ? `${c.pointsBalance} ${t('common.pts')}` : undefined} />))}
      </div>
    </>
  );

  const detail = sel && (
    <>
      <DetailHeader avatar={sel.name} title={sel.name} pill={sel.memberNo ? <StatusPill tone="gold">{sel.memberNo}</StatusPill> : undefined} subtitle={sel.phone ?? undefined}
        primary={can('customer.manage') ? <button className="btn-primary" onClick={() => setEdit({ ...blank, ...Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, v ?? ''])), member: !!sel.memberNo })}>{t('common.edit')}</button> : undefined}
        tabs={[{ id: 'overview', label: t('cust.overview') }, { id: 'points', label: t('cust.pointsHistory'), count: points.length }, { id: 'bills', label: t('nav.transactions'), count: sel.transactions.length }]} tab={tab} onTab={setTab} />
      <DetailBody>
        {tab === 'overview' && (
          <div className="card p-4">
            <KV k={t('cust.idCard')} v={<>{sel.nationalId ?? '—'} {sel.idSource === 'CARD_READER' && <StatusPill tone="ok">{t('cust.fromReader')}</StatusPill>}</>} />
            <KV k={t('cust.birth')} v={sel.birthDate ? date(sel.birthDate) : '—'} /><KV k={t('common.phone')} v={sel.phone ?? '—'} />
            <div className="kv items-start"><span className="text-ink-500">{t('common.address')}</span><span className="max-w-xs text-right">{sel.address ?? '—'}</span></div>
          </div>)}
        {tab === 'points' && (points.length === 0 ? <Empty text={t('common.empty')} /> : <div className="card">{points.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b border-ink-100 px-4 py-3 last:border-0"><div><div className="font-medium text-ink-900">{label('pr', p.reason)}</div><div className="text-xs text-ink-500">{date(p.createdAt)} {p.note ?? ''}</div></div>
            <b className={p.delta > 0 ? 'text-emerald-700' : 'text-ink-700'}>{p.delta > 0 ? '+' : ''}{p.delta}</b></div>))}</div>)}
        {tab === 'bills' && (sel.transactions.length === 0 ? <Empty text={t('common.empty')} /> : <div className="card">{sel.transactions.map((x: any) => (
          <div key={x.id} className="flex items-center justify-between border-b border-ink-100 px-4 py-3 last:border-0"><div><div className="font-medium text-ink-900">{x.docNo}</div><div className="text-xs text-ink-500">{date(x.createdAt)} · {label('type', x.type)}</div></div><span className="tabular-nums">{baht(Math.abs(x.net))}</span></div>))}</div>)}
      </DetailBody>
    </>
  );

  const right = sel && (
    <RightPanel>
      <div><PanelTitle>{t('cust.points')}</PanelTitle><div className="text-3xl font-semibold tabular-nums text-ink-900">{sel.pointsBalance}</div></div>
      {can('loyalty.manage') && (
        <div><PanelTitle>{t('cust.rewards')}</PanelTitle>
          {rewards.filter((r) => r.active).length === 0 ? <div className="text-ink-500">{t('common.empty')}</div> : rewards.filter((r) => r.active).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b border-ink-100 py-2 last:border-0"><div className="min-w-0"><div className="truncate font-medium text-ink-900">{r.name}</div><div className="text-xs text-ink-500">{r.pointsCost} {t('common.pts')} · {t('cust.left')} {r.stockQty}</div></div>
              <button className="btn-outline px-2.5 py-1" disabled={busy || r.stockQty < 1 || sel.pointsBalance < r.pointsCost} onClick={() => run(() => post(`/customers/${sel.id}/redeem-reward`, { rewardId: r.id }), t('cust.redeemed')).then(() => { open(sel.id); load(); })}>{t('cust.redeem')}</button></div>))}
        </div>)}
    </RightPanel>
  );

  return (
    <>
      <MasterDetail panelKey="cust" list={listPane} detail={detail ?? null} right={right} onBack={() => setSel(null)} empty={<Empty icon="users" text={t('cust.pick')} />} />
      {edit && (
        <Modal size="lg" title={edit.id ? t('common.edit') : t('cust.new')} onClose={() => setEdit(null)} footer={<><button className="btn-outline" onClick={() => setEdit(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy || !edit.name || !!idBad} onClick={save}>{t('common.save')}</button></>}>
          <div className="space-y-4">
            <Notice>{t('cust.readerHint')}</Notice>
            <div className="grid gap-3 sm:grid-cols-4"><Field label={t('cust.title')}><input className="input" value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field><Field label={t('cust.fullName')} required className="sm:col-span-3"><input className="input" value={edit.name} onChange={(e) => set('name', e.target.value)} data-autofocus /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('cust.idCard')} hint={t('cust.id13')} error={idBad ? t('cust.id13') : undefined}><input className={`input ${idBad ? 'input-error' : ''}`} inputMode="numeric" maxLength={13} value={edit.nationalId ?? ''} onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label={t('cust.birth')}><input className="input" type="date" value={edit.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} /></Field>
              <Field label={t('common.phone')}><input className="input" inputMode="tel" value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            </div>
            <Field label={t('common.address')}><textarea className="input" rows={2} value={edit.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#b3202f]" checked={edit.member} disabled={!!sel?.memberNo && !!edit.id} onChange={(e) => set('member', e.target.checked)} /> {t('cust.joinMember')}</label>
          </div>
        </Modal>)}
    </>
  );
}

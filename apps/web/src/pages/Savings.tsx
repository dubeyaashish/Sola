import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { DetailBody, DetailHeader, KV, ListHeader, ListRow, MasterDetail, PanelTitle, RightPanel } from '../layout';
import { PrintModal } from '../PrintModal';
import { Avatar, ConfirmDialog, CustomerPicker, Empty, Field, Loading, Modal, StatusPill, baht, grams, toMinor, toneOf, useAction, useLabel } from '../ui';

export function Savings({ }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const [list, setList] = useState<any[] | null>(null);
  const [st, setSt] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [f, setF] = useState({ plan: 'FIXED', mode: 'GOLD_WEIGHT', installment: '', frequency: 'MONTHLY', target: '' });
  const [depositing, setDepositing] = useState(false);
  const [amount, setAmount] = useState('');
  const [closing, setClosing] = useState(false);
  const [printing, setPrinting] = useState<{ path: string; title: string } | null>(null);
  const { run, busy } = useAction();
  const load = () => get('/savings').then(setList);
  useEffect(() => { load(); }, []);
  const open = (id: number) => get(`/savings/${id}`).then(setSt);

  const create = () => run(() => post('/savings', {
    customerId: customer.id, plan: f.plan, mode: f.mode,
    ...(f.plan === 'FIXED' ? { installmentAmount: toMinor(f.installment), frequency: f.frequency } : {}), ...(f.target ? { targetAmount: toMinor(f.target) } : {}),
  }), (a: any) => `${t('sav.opened')} ${a.accountNo}`).then((a) => { if (a) { setCreating(false); setCustomer(null); load(); open(a.id); } });

  const listPane = (
    <>
      <ListHeader title={t('nav.savings')} onAdd={() => setCreating(true)} addLabel={t('sav.new')} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === null ? <Loading /> : list.length === 0 ? <Empty icon="piggy" title={t('common.empty')} /> : list.map((a) => (
          <ListRow key={a.id} selected={st?.account.id === a.id} onClick={() => open(a.id)} lead={<Avatar name={a.accountNo} />} title={a.accountNo} sub={`${label('plan', a.plan)} · ${label('mode', a.mode)}`} meta={baht(a.balance)} metaSub={<StatusPill tone={toneOf(a.status)}>{label('st', a.status)}</StatusPill>} />))}
      </div>
    </>
  );

  const a = st?.account;
  const detail = st && (
    <>
      <DetailHeader title={a.accountNo} pill={<StatusPill tone={toneOf(a.status)}>{label('st', a.status)}</StatusPill>} subtitle={st.customer?.name}
        primary={a.status === 'ACTIVE' ? <button className="btn-primary" onClick={() => setDepositing(true)}>{t('sav.deposit')}</button> : undefined}
        secondary={[{ label: t('sav.printTicket'), icon: 'print', onClick: () => setPrinting({ path: `/savings/${a.id}/print`, title: a.accountNo }) }]}
        overflow={a.status !== 'CLOSED' ? [{ label: t('sav.close'), icon: 'x', danger: true, onClick: () => setClosing(true) }] : []} />
      <DetailBody>
        <div className="card max-w-md border border-gold-200 bg-gold-50 p-4">
          <div className="text-xs font-medium text-gold-700">{t('sav.ticket')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{baht(a.balance)}</div>
          <div className="text-ink-500">{st.customer?.name} {st.customer?.memberNo && `· ${st.customer.memberNo}`}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-500"><span>{t('sav.gold')}: <b className="text-ink-900">{grams(a.goldMg)}</b></span>{st.nextDueDate && <span>{t('sav.next')}: <b className="text-ink-900">{date(st.nextDueDate)}</b></span>}</div>
        </div>
        <h3 className="pt-2 font-semibold text-ink-900">{t('sav.history')}</h3>
        {st.entries.length === 0 ? <Empty text={t('common.empty')} /> : <div className="card">{st.entries.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between border-b border-ink-100 px-4 py-3 last:border-0"><div><div className="font-medium text-ink-900">{label('sk', e.kind)}</div><div className="text-xs text-ink-500">{date(e.createdAt, true)}</div></div><b className={e.amount > 0 ? 'text-emerald-700' : 'text-ink-700'}>{e.amount > 0 ? '+' : ''}{baht(e.amount)}</b></div>))}</div>}
      </DetailBody>
    </>
  );

  const right = st && (
    <RightPanel>
      <PanelTitle>{t('sav.plan')}</PanelTitle>
      <KV k={t('sav.plan')} v={label('plan', a.plan)} /><KV k={t('sav.mode')} v={label('mode', a.mode)} />
      {a.installmentAmount && <KV k={t('sav.installment')} v={`${baht(a.installmentAmount)} · ${label('fr', a.frequency)}`} />}
      {a.targetAmount && <KV k={t('sav.target')} v={baht(a.targetAmount)} />}
      <KV k={t('sav.startDate')} v={date(a.startDate)} />
    </RightPanel>
  );

  return (
    <>
      <MasterDetail panelKey="sav" list={listPane} detail={detail ?? null} right={right} onBack={() => setSt(null)} empty={<Empty icon="piggy" text={t('sav.pick')} />} />
      {depositing && st && (
        <Modal size="sm" title={t('sav.deposit')} onClose={() => setDepositing(false)} footer={<><button className="btn-outline" onClick={() => setDepositing(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !(toMinor(amount) > 0)} onClick={() => run(() => post(`/savings/${a.id}/deposit`, { amount: toMinor(amount) }), t('sav.deposited')).then((r) => { if (r) { setDepositing(false); setAmount(''); load(); open(a.id); } })}>{t('sav.deposit')}</button></>}>
          <Field label={t('sav.depositAmount')} hint={a.installmentAmount ? `${t('sav.installment')}: ${baht(a.installmentAmount)}` : undefined}><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus /></Field>
        </Modal>)}
      {closing && st && <ConfirmDialog destructive title={t('sav.close')} message={t('sav.closeWarn')} confirmLabel={t('sav.close')} onClose={() => setClosing(false)}
        onConfirm={() => run(() => post(`/savings/${a.id}/close`, {}), (r: any) => `${t('sav.refunded')} ${baht(r.refunded)}`).then(() => { load(); open(a.id); })} />}
      {creating && (
        <Modal size="md" title={t('sav.new')} onClose={() => setCreating(false)} footer={<><button className="btn-outline" onClick={() => setCreating(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy || !customer || (f.plan === 'FIXED' && !(toMinor(f.installment) > 0))} onClick={create}>{t('sav.open')}</button></>}>
          <div className="space-y-4">
            <CustomerPicker value={customer} onChange={setCustomer} get={get} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('sav.plan')}><select className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="FIXED">{label('plan', 'FIXED')}</option><option value="FLEXIBLE">{label('plan', 'FLEXIBLE')}</option></select></Field>
              <Field label={t('sav.mode')}><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="GOLD_WEIGHT">{label('mode', 'GOLD_WEIGHT')}</option><option value="CASH">{label('mode', 'CASH')}</option></select></Field>
              {f.plan === 'FIXED' && <>
                <Field label={t('sav.installment')} required><input className="input" inputMode="decimal" value={f.installment} onChange={(e) => setF({ ...f, installment: e.target.value })} /></Field>
                <Field label={t('sav.frequency')}><select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="MONTHLY">{label('fr', 'MONTHLY')}</option><option value="WEEKLY">{label('fr', 'WEEKLY')}</option></select></Field></>}
              <Field label={t('sav.target')}><input className="input" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
            </div>
          </div>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat="slip" onClose={() => setPrinting(null)} />}
    </>
  );
}

import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { PrintModal } from '../PrintModal';
import { Badge, Card, ConfirmModal, CustomerPicker, Empty, Field, Icon, Modal, PageHead, baht, grams, toMinor, toneOf, useAction, useLabel } from '../ui';

export function Savings({ }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const [list, setList] = useState<any[]>([]);
  const [st, setSt] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [f, setF] = useState({ plan: 'FIXED', mode: 'GOLD_WEIGHT', installment: '', frequency: 'MONTHLY', target: '' });
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

  return (
    <>
      <PageHead title={t('nav.savings')}><button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> {t('sav.new')}</button></PageHead>
      <Card>
        {list.length === 0 ? <Empty icon="piggy" text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('sav.acct')}</th><th>{t('sav.plan')}</th><th className="num">{t('sav.saved')}</th><th className="num">{t('sav.gold')}</th><th>{t('common.status')}</th></tr></thead><tbody>
            {list.map((a) => <tr key={a.id} className="click" onClick={() => open(a.id)}><td data-label={t('sav.acct')}><b>{a.accountNo}</b></td><td data-label={t('sav.plan')}>{label('plan', a.plan)} · {label('mode', a.mode)}</td>
              <td className="num" data-label={t('sav.saved')}>{baht(a.balance)}</td><td className="num" data-label={t('sav.gold')}>{grams(a.goldMg)}</td><td data-label={t('common.status')}><Badge tone={toneOf(a.status)}>{label('st', a.status)}</Badge></td></tr>)}
          </tbody></table></div>)}
      </Card>

      {st && (
        <Modal wide title={<>{st.account.accountNo} <Badge tone={toneOf(st.account.status)}>{label('st', st.account.status)}</Badge></>} onClose={() => setSt(null)}
          foot={<button className="btn" onClick={() => setPrinting({ path: `/savings/${st.account.id}/print`, title: st.account.accountNo })}><Icon name="print" /> {t('sav.printTicket')}</button>}>
          <div className="ticket">
            <b>{t('sav.ticket')}</b><br />{st.customer?.name} {st.customer?.memberNo && <span className="muted">· {st.customer.memberNo}</span>}
            <div className="tot" style={{ marginTop: 8 }}><span>{t('sav.saved')}</span><b className="num">{baht(st.account.balance)}</b><span>{t('sav.gold')}</span><b className="num">{grams(st.account.goldMg)}</b>
              {st.nextDueDate && <><span>{t('sav.next')}</span><b className="num">{date(st.nextDueDate)}</b></>}</div>
          </div>
          {st.account.status === 'ACTIVE' && (
            <div className="row" style={{ margin: '14px 0' }}>
              <Field label={t('sav.depositAmount')}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <button className="btn primary" disabled={busy || !(toMinor(amount) > 0)} onClick={() => run(() => post(`/savings/${st.account.id}/deposit`, { amount: toMinor(amount) }), t('sav.deposited')).then((r) => { if (r) { setAmount(''); load(); open(st.account.id); } })}>{t('sav.deposit')}</button>
              <button className="btn danger" disabled={busy} onClick={() => setClosing(true)}>{t('sav.close')}</button>
            </div>)}
          <h4>{t('sav.history')}</h4>
          {st.entries.map((e: any) => <div className="line" key={e.id}><span>{label('sk', e.kind)} <span className="muted small">{date(e.createdAt, true)}</span></span><b className="num">{e.amount > 0 ? '+' : ''}{baht(e.amount)}</b></div>)}
        </Modal>)}
      {closing && st && <ConfirmModal danger title={t('sav.close')} text={t('sav.closeWarn')} confirmLabel={t('sav.close')} onClose={() => setClosing(false)}
        onConfirm={() => run(() => post(`/savings/${st.account.id}/close`, {}), (r: any) => `${t('sav.refunded')} ${baht(r.refunded)}`).then(() => { load(); open(st.account.id); })} />}

      {creating && (
        <Modal title={t('sav.new')} onClose={() => setCreating(false)} foot={<><button className="btn" onClick={() => setCreating(false)}>{t('common.cancel')}</button><button className="btn primary" disabled={busy || !customer || (f.plan === 'FIXED' && !(toMinor(f.installment) > 0))} onClick={create}>{t('sav.open')}</button></>}>
          <CustomerPicker value={customer} onChange={setCustomer} get={get} />
          <div className="row">
            <Field label={t('sav.plan')}><select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="FIXED">{label('plan', 'FIXED')}</option><option value="FLEXIBLE">{label('plan', 'FLEXIBLE')}</option></select></Field>
            <Field label={t('sav.mode')}><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="GOLD_WEIGHT">{label('mode', 'GOLD_WEIGHT')}</option><option value="CASH">{label('mode', 'CASH')}</option></select></Field>
          </div>
          {f.plan === 'FIXED' && <div className="row" style={{ marginTop: 10 }}>
            <Field label={t('sav.installment')}><input inputMode="decimal" value={f.installment} onChange={(e) => setF({ ...f, installment: e.target.value })} /></Field>
            <Field label={t('sav.frequency')}><select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="MONTHLY">{label('fr', 'MONTHLY')}</option><option value="WEEKLY">{label('fr', 'WEEKLY')}</option></select></Field>
          </div>}
          <Field label={t('sav.target')}><input inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat="slip" onClose={() => setPrinting(null)} />}
    </>
  );
}

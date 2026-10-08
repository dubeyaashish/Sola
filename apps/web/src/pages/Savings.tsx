import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { Card, CustomerPicker, Field, baht, grams, toMinor, useAction } from '../ui';

export function Savings(_: { user: any }) {
  const [list, setList] = useState<any[]>([]);
  const [st, setSt] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [f, setF] = useState({ plan: 'FIXED', mode: 'GOLD_WEIGHT', installment: '', frequency: 'MONTHLY', target: '' });
  const [amount, setAmount] = useState('');
  const { run, busy, banner } = useAction();
  const load = () => get('/savings').then(setList);
  useEffect(() => { load(); }, []);
  const open = (id: number) => get(`/savings/${id}`).then(setSt);
  return (
    <div className="grid2">
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <Card title="บัญชีออมทอง · Accounts">
          <table><thead><tr><th>เลขที่</th><th>แผน</th><th className="num">ยอดออม</th><th className="num">ทองสะสม g</th><th>สถานะ</th></tr></thead><tbody>
            {list.map((a) => <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => open(a.id)}><td>{a.accountNo}</td><td>{a.plan}/{a.mode}</td><td className="num">{baht(a.balance)}</td><td className="num">{grams(a.goldMg)}</td><td>{a.status}</td></tr>)}
          </tbody></table>
        </Card>
        {st && (
          <Card title={st.account.accountNo} right={<button className="no-print" onClick={() => window.print()}>พิมพ์ตั๋ว</button>}>
            <div className="ticket">
              <b>ตั๋วออมทอง · Gold Savings</b><br />
              {st.customer?.name} {st.customer?.memberNo}<br />
              ยอดสะสม {baht(st.account.balance)} · ทอง {grams(st.account.goldMg)} g<br />
              {st.nextDueDate && <>งวดถัดไป {st.nextDueDate} ({baht(st.account.installmentAmount)})<br /></>}
              <table><tbody>{st.entries.slice(0, 8).map((e: any) => <tr key={e.id}><td>{e.createdAt.slice(0, 10)}</td><td>{e.kind}</td><td className="num">{baht(e.amount)}</td></tr>)}</tbody></table>
            </div>
            {st.account.status === 'ACTIVE' && <div className="row no-print" style={{ marginTop: 8 }}>
              <input style={{ width: 130 }} placeholder="ยอดฝาก" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="primary" disabled={busy} onClick={() => run(() => post(`/savings/${st.account.id}/deposit`, { amount: toMinor(amount) }), 'ฝากแล้ว').then(() => { setAmount(''); load(); open(st.account.id); })}>ฝาก</button>
              <button className="danger" disabled={busy} onClick={() => confirm('ปิดบัญชีและคืนเงิน?') && run(() => post(`/savings/${st.account.id}/close`, {}), (r: any) => `คืนเงิน ${baht(r.refunded)}`).then(() => { load(); open(st.account.id); })}>ปิดบัญชี</button>
            </div>}
            {banner}
          </Card>
        )}
      </div>
      <Card title="เปิดบัญชีใหม่ · New account">
        <CustomerPicker value={customer} onChange={setCustomer} get={get} />
        <div className="row">
          <Field label="แผน"><select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="FIXED">รายงวด</option><option value="FLEXIBLE">อิสระ</option></select></Field>
          <Field label="โหมด"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="GOLD_WEIGHT">สะสมน้ำหนักทอง</option><option value="CASH">สะสมเงิน</option></select></Field>
        </div>
        {f.plan === 'FIXED' && <div className="row">
          <Field label="ยอดต่องวด"><input value={f.installment} onChange={(e) => setF({ ...f, installment: e.target.value })} /></Field>
          <Field label="รอบ"><select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="MONTHLY">รายเดือน</option><option value="WEEKLY">รายสัปดาห์</option></select></Field>
        </div>}
        <Field label="เป้าหมาย (ไม่บังคับ)"><input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
        <button className="primary" disabled={busy || !customer} onClick={() => run(() => post('/savings', {
          customerId: customer.id, plan: f.plan, mode: f.mode, ...(f.plan === 'FIXED' ? { installmentAmount: toMinor(f.installment), frequency: f.frequency } : {}), ...(f.target ? { targetAmount: toMinor(f.target) } : {}),
        }), (a: any) => `เปิดบัญชี ${a.accountNo}`).then(load)}>เปิดบัญชี</button>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { Card, Field, useAction } from '../ui';

const empty = { name: '', phone: '', nationalId: '', address: '', title: '', birthDate: '', member: true };
export function Customers(_: { user: any }) {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [f, setF] = useState(empty);
  const [sel, setSel] = useState<any>(null);
  const { run, busy, banner } = useAction();
  const load = () => get(`/customers?q=${encodeURIComponent(q)}`).then(setList);
  useEffect(() => { load(); }, [q]);
  const t = (k: keyof typeof empty, label: string, type = 'text') => <Field label={label}><input type={type} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <div className="grid2">
      <Card title="ลูกค้า · Customers" right={<input placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <table><thead><tr><th>สมาชิก</th><th>ชื่อ</th><th>โทร</th><th>แต้ม</th></tr></thead><tbody>
          {list.map((c) => <tr key={c.id} onClick={() => get(`/customers/${c.id}`).then(setSel)} style={{ cursor: 'pointer' }}><td>{c.memberNo ?? '—'}</td><td>{c.name}</td><td>{c.phone}</td><td>{c.pointsBalance}</td></tr>)}
        </tbody></table>
        {sel && <div style={{ marginTop: 8 }}><b>{sel.name}</b> · บัตร {sel.nationalId ?? '—'} ({sel.idSource}) · {sel.transactions.length} รายการ</div>}
      </Card>
      <Card title="เพิ่มลูกค้า · New customer">
        {t('title', 'คำนำหน้า')}{t('name', 'ชื่อ-สกุล')}{t('nationalId', 'เลขบัตรประชาชน (13 หลัก)')}{t('birthDate', 'วันเกิด', 'date')}{t('phone', 'โทร')}{t('address', 'ที่อยู่')}
        <label><input type="checkbox" checked={f.member} style={{ width: 'auto' }} onChange={(e) => setF({ ...f, member: e.target.checked })} /> สมัครสมาชิก</label>
        <p className="muted">เครื่องอ่านบัตรประชาชน: ตัวอ่านฝั่งเครื่องลูกค้าจะกรอกฟอร์มนี้และส่ง idSource=CARD_READER (ยังไม่เชื่อมต่อ)</p>
        {banner}
        <button className="primary" disabled={busy || !f.name} onClick={() => run(() => post('/customers', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))), 'บันทึกแล้ว').then(() => { setF(empty); load(); })}>บันทึก</button>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { Card, Field, PuritySelect, baht, grams, pct, toMg, toMinor, useAction } from '../ui';

export function Inventory({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [status, setStatus] = useState('IN_STOCK');
  const [f, setF] = useState({ name: '', category: 'RING', weight: '', purityBp: 9650, makingType: 'FIXED', makingValue: '', cost: '' });
  const { run, busy, banner } = useAction();
  const load = () => { get(`/items?status=${status}`).then(setItems); get('/stock/summary').then(setSummary); };
  useEffect(load, [status]);
  const manage = user.permissions.includes('item.manage');
  const add = () => run(() => post('/items', {
    name: f.name, category: f.category, weightMg: toMg(f.weight), purityBp: f.purityBp, cost: toMinor(f.cost || '0'),
    making: f.makingType === 'PERCENT' ? { type: 'PERCENT', bp: Math.round(Number(f.makingValue) * 100) } : { type: f.makingType, amount: toMinor(f.makingValue || '0') },
  }), 'เพิ่มสินค้าแล้ว').then(load);
  return (
    <>
      <Card title="สต็อกตามความบริสุทธิ์ · Stock by purity">
        <table><thead><tr><th>สถานะ</th><th>Purity</th><th className="num">ชิ้น</th><th className="num">น้ำหนัก g</th><th className="num">ต้นทุน</th></tr></thead><tbody>
          {summary.map((s, i) => <tr key={i}><td>{s.status}</td><td>{pct(s.purityBp)}</td><td className="num">{s.count}</td><td className="num">{grams(s.weightMg)}</td><td className="num">{baht(s.cost)}</td></tr>)}
        </tbody></table>
      </Card>
      {manage && <Card title="รับสินค้าเข้า · Receive item">
        <div className="row">
          <div className="grow"><Field label="ชื่อ"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
          <Field label="ประเภท"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['RING', 'CHAIN', 'BANGLE', 'PENDANT', 'EARRING', 'BAR'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="น้ำหนัก g"><input style={{ width: 90 }} value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
          <Field label="Purity"><PuritySelect value={f.purityBp} onChange={(bp) => setF({ ...f, purityBp: bp })} /></Field>
          <Field label="ค่ากำเหน็จ"><select value={f.makingType} onChange={(e) => setF({ ...f, makingType: e.target.value })}><option value="FIXED">คงที่</option><option value="PER_GRAM">ต่อกรัม</option><option value="PERCENT">% ของทอง</option></select></Field>
          <Field label="ค่า"><input style={{ width: 90 }} value={f.makingValue} onChange={(e) => setF({ ...f, makingValue: e.target.value })} /></Field>
          <Field label="ต้นทุน"><input style={{ width: 100 }} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          <button className="primary" disabled={busy} onClick={add}>เพิ่ม</button>
        </div>{banner}
      </Card>}
      <Card title="รายการ · Items" right={<select value={status} onChange={(e) => setStatus(e.target.value)}>{['IN_STOCK', 'SOLD', 'RESERVED', 'MISSING'].map((s) => <option key={s}>{s}</option>)}</select>}>
        <table><thead><tr><th>SKU</th><th>ชื่อ</th><th>ประเภท</th><th className="num">g</th><th>Purity</th><th>ที่มา</th><th className="num">ต้นทุน</th></tr></thead><tbody>
          {items.map((i) => <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.category}</td><td className="num">{grams(i.weightMg)}</td><td>{pct(i.purityBp)}</td>
            <td><span className={`tag ${i.source === 'FORFEITED' ? 'warn' : ''}`}>{i.source}</span></td><td className="num">{baht(i.cost)}</td></tr>)}
        </tbody></table>
      </Card>
    </>
  );
}

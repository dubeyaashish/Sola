import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { Card, CustomerPicker, Field, PuritySelect, baht, grams, pct, toMg, toMinor, today, useAction } from '../ui';

export function Pawn({ user }: { user: any }) {
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState('ACTIVE');
  const [sel, setSel] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [asOf, setAsOf] = useState(today());
  const [customer, setCustomer] = useState<any>(null);
  const [f, setF] = useState({ type: 'PAWN', principal: '', rate: '1.25', desc: '', weight: '', purityBp: 9650, appraised: '' });
  const [partial, setPartial] = useState('');
  const { run, busy, banner } = useAction();
  const load = () => get(`/pawn?status=${filter}`).then(setList);
  useEffect(() => { load(); }, [filter]);
  const open = async (id: number) => { const c = await get(`/pawn/${id}`); setSel(c); setQuote(await get(`/pawn/${id}/quote?asOf=${asOf}`)); };
  useEffect(() => { if (sel) get(`/pawn/${sel.id}/quote?asOf=${asOf}`).then(setQuote); }, [asOf]);
  const act = (path: string, body: object, ok: string) => run(() => post(`/pawn/${sel.id}/${path}`, { asOf, ...body }), ok).then(() => { load(); open(sel.id); });
  const overdue = (c: any) => c.status === 'ACTIVE' && c.dueDate < today();
  return (
    <div className="grid2">
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <Card title="สัญญา · Contracts" right={<select value={filter} onChange={(e) => setFilter(e.target.value)}>{['ACTIVE', 'REDEEMED', 'FORFEITED'].map((s) => <option key={s}>{s}</option>)}</select>}>
          <table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th className="num">เงินต้น</th><th>ครบกำหนด</th></tr></thead><tbody>
            {list.map((c) => <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => open(c.id)}><td>{c.contractNo}</td><td>{c.customerName}</td><td className="num">{baht(c.principal)}</td>
              <td>{c.dueDate} {overdue(c) && <span className="tag bad">เกินกำหนด</span>}</td></tr>)}
          </tbody></table>
        </Card>
        {sel && quote && (
          <Card title={<>{sel.contractNo} <span className="tag">{sel.type === 'PAWN' ? 'จำนำ' : 'ขายฝาก'}</span> <span className="tag">{sel.status}</span></>}>
            <div className="row"><Field label="คำนวณ ณ วันที่"><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field></div>
            <div className="tot">
              <span>เงินต้น</span><span className="num">{baht(sel.principal)}</span>
              <span>ดอกเบี้ยค้าง ({sel.interestPaidTo} → {asOf})</span><span className="num">{baht(quote.interestDue)}</span>
              <b>ไถ่ถอนรวม · Redeem total</b><b className="big">{baht(quote.redeemTotal)}</b>
            </div>
            <p className="muted">อัตรา {(sel.rateBpPerMonth / 100).toFixed(2)}%/เดือน · ครบกำหนด {sel.dueDate} · ต่อดอกได้ถึง {quote.renewNewDueDate}</p>
            <ul>{sel.items.map((i: any) => <li key={i.id}>{i.description} · {grams(i.weightMg)} g · {pct(i.purityBp)}</li>)}</ul>
            {banner}
            {sel.status === 'ACTIVE' && (
              <div className="row">
                <button className="primary" disabled={busy} onClick={() => act('redeem', {}, 'ไถ่ถอนแล้ว')}>ไถ่ถอน</button>
                <button disabled={busy} onClick={() => act('renew', {}, 'ต่อดอกแล้ว')}>ต่อดอก {baht(quote.interestDue)}</button>
                <input style={{ width: 110 }} placeholder="ชำระต้น" value={partial} onChange={(e) => setPartial(e.target.value)} />
                <button disabled={busy || !partial} onClick={() => act('pay-principal', { amount: toMinor(partial) }, 'ชำระเงินต้นแล้ว')}>ลดต้น</button>
                {user.permissions.includes('pawn.forfeit') && <button className="danger" disabled={busy} onClick={() => confirm('ยืนยันหลุดจำนำ → เข้าสต็อก?') && act('forfeit', {}, 'ย้ายเข้าสต็อกแล้ว')}>หลุดจำนำ</button>}
              </div>)}
          </Card>
        )}
      </div>
      <Card title="ทำสัญญาใหม่ · New contract">
        <CustomerPicker value={customer} onChange={setCustomer} get={get} />
        <div className="row">
          <Field label="ประเภท"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="PAWN">จำนำ</option><option value="SELL_BACK">ขายฝาก</option></select></Field>
          <Field label="เงินต้น"><input value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></Field>
          <Field label="ดอกเบี้ย %/เดือน"><input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        </div>
        <Field label="รายการทรัพย์"><input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
        <div className="row">
          <Field label="น้ำหนัก g"><input value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
          <Field label="Purity"><PuritySelect value={f.purityBp} onChange={(bp) => setF({ ...f, purityBp: bp })} /></Field>
          <Field label="ประเมิน"><input value={f.appraised} onChange={(e) => setF({ ...f, appraised: e.target.value })} /></Field>
        </div>
        <button className="primary" disabled={busy || !customer || !f.desc} onClick={() => run(() => post('/pawn', {
          type: f.type, customerId: customer.id, principal: toMinor(f.principal), rateBpPerMonth: Math.round(Number(f.rate) * 100),
          items: [{ description: f.desc, weightMg: toMg(f.weight), purityBp: f.purityBp, appraisedValue: f.appraised ? toMinor(f.appraised) : undefined }],
        }), (c: any) => `ทำสัญญา ${c.contractNo}`).then(() => load())}>บันทึกสัญญา</button>
      </Card>
    </div>
  );
}

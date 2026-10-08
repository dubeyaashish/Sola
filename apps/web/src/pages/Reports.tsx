import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { Card, Field, baht, grams, pct, toMinor, today, useAction } from '../ui';

export function Reports({ user }: { user: any }) {
  const [dash, setDash] = useState<any>(null);
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [pl, setPl] = useState<any>(null);
  const [exp, setExp] = useState({ category: '', amount: '' });
  const { run, busy, banner } = useAction();
  useEffect(() => { get('/reports/dashboard').then(setDash); }, []);
  useEffect(() => { get(`/reports/profit-loss?from=${range.from}&to=${range.to}`).then(setPl); }, [range]);
  const stat = (label: string, v: string, sub?: string) => <div><div className="muted">{label}</div><div className="big">{v}</div>{sub && <div className="muted">{sub}</div>}</div>;
  return (
    <>
      {dash && <Card title="แดชบอร์ด · Dashboard">
        <div className="grid3">
          {stat('ยอดขายวันนี้ (ก่อน VAT)', baht(dash.today.revenue), `${dash.today.salesCount} บิล · กำไรขั้นต้น ${baht(dash.today.grossProfit)}`)}
          {stat('ยอดขายเดือนนี้', baht(dash.monthToDate.revenue), `กำไรสุทธิ ${baht(dash.monthToDate.netProfit)}`)}
          {stat('มูลค่าสต็อก (ราคารับซื้อ)', baht(dash.stockMarketValue ?? 0))}
          {stat('จำนำ/ขายฝากคงเหลือ', baht(dash.pawn.active.principal), `${dash.pawn.active.n} สัญญา · เกินกำหนด ${dash.pawn.overdue}`)}
          {stat('เงินออมทองค้างจ่าย', baht(dash.savingsLiability))}
          {stat('รอส่งสรรพากร (e-Tax)', String(dash.pendingEtax), `แต้มคงค้าง ${dash.pointsOutstanding}`)}
        </div>
        <table style={{ marginTop: 12 }}><thead><tr><th>Purity</th><th>ที่มา</th><th className="num">ชิ้น</th><th className="num">น้ำหนัก g</th></tr></thead><tbody>
          {dash.stock.map((s: any, i: number) => <tr key={i}><td>{pct(s.purityBp)}</td><td>{s.source === 'FORFEITED' ? 'ทองหลุดจำนำ' : s.source === 'TRADE_IN' ? 'ทองเก่ารับซื้อ' : 'ใหม่'}</td><td className="num">{s.count}</td><td className="num">{grams(s.weightMg)}</td></tr>)}
        </tbody></table>
      </Card>}
      <Card title="กำไร-ขาดทุน · Profit & Loss" right={<div className="row"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>}>
        {pl && <div className="tot">
          <span>ยอดขาย (ไม่รวม VAT) · {pl.salesCount} บิล</span><span className="num">{baht(pl.revenue)}</span>
          <span>ต้นทุนสินค้าที่ขาย</span><span className="num">-{baht(pl.cogs)}</span>
          <b>กำไรขั้นต้น</b><b className="num">{baht(pl.grossProfit)}</b>
          <span>ดอกเบี้ยรับ (จำนำ/ขายฝาก)</span><span className="num">{baht(pl.pawnInterestIncome)}</span>
          <span>รายได้อื่น</span><span className="num">{baht(pl.otherIncome)}</span>
          <span>ค่าใช้จ่าย</span><span className="num">-{baht(pl.expenses)}</span>
          <b>กำไรสุทธิ · Net</b><b className="big">{baht(pl.netProfit)}</b>
          <span className="muted">VAT ขาย (ภาษีขาย)</span><span className="muted num">{baht(pl.outputTax)}</span>
        </div>}
      </Card>
      {user.permissions.includes('ledger.manage') && <Card title="บันทึกรายจ่าย · Add expense">
        <div className="row">
          <Field label="หมวด"><input value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })} placeholder="ค่าเช่า / เงินเดือน…" /></Field>
          <Field label="จำนวน"><input value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} /></Field>
          <button className="primary" disabled={busy || !exp.category || !exp.amount} onClick={() => run(() => post('/ledger', { kind: 'EXPENSE', category: exp.category, amount: toMinor(exp.amount) }), 'บันทึกแล้ว').then(() => { setExp({ category: '', amount: '' }); setRange({ ...range }); })}>บันทึก</button>
        </div>{banner}
      </Card>}
    </>
  );
}

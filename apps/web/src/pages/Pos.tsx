import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../api';
import { Card, CustomerPicker, Field, PuritySelect, baht, grams, pct, toMg, toMinor, useAction } from '../ui';

interface TradeIn { description: string; weightMg: number; purityBp: number; deductionBp: number; isBar: boolean }
const METHODS = ['CASH', 'TRANSFER', 'CARD', 'SAVINGS', 'OTHER'] as const;

/** Sell, exchange (trade-in) and buy gold on one screen. Totals always come from the server quote. */
export function Pos({ user }: { user: any }) {
  const can = (p: string) => user.permissions.includes(p);
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [tradeIns, setTradeIns] = useState<TradeIn[]>([]);
  const [discount, setDiscount] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [payments, setPayments] = useState<{ method: string; amount: string; savingsAccountId?: number }[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [done, setDone] = useState<any>(null);
  const { run, busy, banner } = useAction();
  const [ti, setTi] = useState({ description: '', weight: '', purityBp: 9650, deduction: '1', isBar: false });

  const loadItems = () => get(`/items?status=IN_STOCK&q=${encodeURIComponent(q)}`).then(setItems);
  useEffect(() => { loadItems(); }, [q]);
  useEffect(() => { customer ? get(`/savings?customerId=${customer.id}`).then(setAccounts) : setAccounts([]); }, [customer]);

  const discountMinor = discount ? toMinor(discount) : 0;
  const body = useMemo(() => ({
    itemIds: cart.map((i) => i.id),
    tradeIns: tradeIns.map((t) => ({ description: t.description || undefined, weightMg: t.weightMg, purityBp: t.purityBp, deductionBp: t.deductionBp, isBar: t.isBar })),
    discount: discountMinor || undefined,
  }), [cart, tradeIns, discountMinor]);

  useEffect(() => {
    setQuote(null);
    if (!cart.length && !tradeIns.length) return;
    post('/pricing/quote', body).then(setQuote).catch((e) => setQuote({ error: e.message }));
  }, [body]);

  const net: number = quote?.quote?.net ?? 0;
  const due = Math.abs(net);
  const paid = payments.reduce((a, p) => a + (toMinor(p.amount) || 0), 0);
  const kind = cart.length && tradeIns.length ? 'แลกเปลี่ยน · EXCHANGE' : cart.length ? 'ขาย · SALE' : tradeIns.length ? 'รับซื้อ · BUY' : '—';

  const add = (it: any) => !cart.some((c) => c.id === it.id) && setCart([...cart, it]);
  const reset = () => { setCart([]); setTradeIns([]); setPayments([]); setDiscount(''); setCustomer(null); loadItems(); };

  const submit = () => run(() => post('/transactions', {
    ...body, customerId: customer?.id ?? null,
    payments: payments.filter((p) => toMinor(p.amount) > 0).map((p) => ({ method: p.method, amount: toMinor(p.amount), savingsAccountId: p.savingsAccountId })),
  }), (r) => `บันทึกแล้ว ${r.docNo}`).then((r) => { if (r) { setDone(r); reset(); } });

  return (
    <div className="grid2">
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <Card title="สินค้า · Items in stock" right={<input style={{ width: 220 }} placeholder="SKU / ชื่อ" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { const m = items.find((i) => i.sku.toLowerCase() === q.toLowerCase()); if (m) { add(m); setQ(''); } } }} />}>
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <table><thead><tr><th>SKU</th><th>Name</th><th className="num">g</th><th>Purity</th><th /></tr></thead><tbody>
              {items.filter((i) => i.source !== 'FORFEITED' || can('sale.create')).map((i) => (
                <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td className="num">{grams(i.weightMg)}</td><td>{pct(i.purityBp)}</td>
                  <td><button onClick={() => add(i)} disabled={cart.some((c) => c.id === i.id)}>+</button></td></tr>))}
            </tbody></table>
          </div>
        </Card>

        {can('buyback.create') && (
          <Card title="ทองเก่าลูกค้า (รับซื้อ/เปลี่ยน) · Customer's gold">
            <div className="row">
              <div className="grow"><Field label="รายละเอียด"><input value={ti.description} onChange={(e) => setTi({ ...ti, description: e.target.value })} /></Field></div>
              <div style={{ width: 90 }}><Field label="น้ำหนัก g"><input value={ti.weight} onChange={(e) => setTi({ ...ti, weight: e.target.value })} /></Field></div>
              <div style={{ width: 120 }}><Field label="ความบริสุทธิ์"><PuritySelect value={ti.purityBp} onChange={(bp) => setTi({ ...ti, purityBp: bp })} /></Field></div>
              <div style={{ width: 80 }}><Field label="หัก %"><input value={ti.deduction} onChange={(e) => setTi({ ...ti, deduction: e.target.value })} /></Field></div>
              <label><input type="checkbox" checked={ti.isBar} onChange={(e) => setTi({ ...ti, isBar: e.target.checked })} style={{ width: 'auto' }} /> ทองแท่ง</label>
              <button onClick={() => { const mg = toMg(ti.weight); if (mg > 0) { setTradeIns([...tradeIns, { description: ti.description, weightMg: mg, purityBp: ti.purityBp, deductionBp: Math.round(Number(ti.deduction || 0) * 100), isBar: ti.isBar }]); setTi({ ...ti, description: '', weight: '' }); } }}>เพิ่ม</button>
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <Card title={<>บิล · Ticket <span className="tag">{kind}</span></>}>
          <CustomerPicker value={customer} onChange={setCustomer} get={get} />
          <table><tbody>
            {cart.map((c, i) => (
              <tr key={c.id}><td>{c.sku} {c.name}</td><td className="num">{quote?.quote?.saleLines?.[i] ? baht(quote.quote.saleLines[i].total) : ''}</td>
                <td><button onClick={() => setCart(cart.filter((x) => x.id !== c.id))}>×</button></td></tr>))}
            {tradeIns.map((t, i) => (
              <tr key={i}><td>↩ {t.description || 'ทองเก่า'} {grams(t.weightMg)} g {pct(t.purityBp)}</td>
                <td className="num">{quote?.quote?.tradeIns?.[i] ? `-${baht(quote.quote.tradeIns[i].value)}` : ''}</td>
                <td><button onClick={() => setTradeIns(tradeIns.filter((_, j) => j !== i))}>×</button></td></tr>))}
          </tbody></table>
          {can('discount.apply') && <Field label="ส่วนลด · Discount"><input value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>}
          {quote?.error && <div className="banner err">{quote.error}</div>}
          {quote?.quote && (
            <div className="tot">
              <span>ทอง · Gold</span><span className="num">{baht(quote.quote.goldTotal)}</span>
              <span>ค่ากำเหน็จ · Making</span><span className="num">{baht(quote.quote.makingTotal + quote.quote.otherTotal)}</span>
              {quote.quote.discount > 0 && <><span>ส่วนลด</span><span>-{baht(quote.quote.discount)}</span></>}
              <span>ภาษี · VAT</span><span className="num">{baht(quote.quote.tax)}</span>
              {quote.quote.tradeInCredit > 0 && <><span>หักทองเก่า · Trade-in</span><span className="num">-{baht(quote.quote.tradeInCredit)}</span></>}
              <b>{net >= 0 ? 'ลูกค้าจ่าย · Customer pays' : 'ร้านจ่าย · Shop pays'}</b><b className="big">{baht(due)}</b>
            </div>
          )}
        </Card>

        {quote?.quote && (
          <Card title="ชำระเงิน · Payment" right={<button onClick={() => setPayments([...payments, { method: 'CASH', amount: baht(Math.max(0, due - paid)) }])}>+ วิธีชำระ</button>}>
            {payments.map((p, i) => (
              <div className="row" key={i}>
                <select style={{ width: 120 }} value={p.method} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}>
                  {METHODS.filter((m) => m !== 'SAVINGS' || (net > 0 && accounts.length)).map((m) => <option key={m}>{m}</option>)}
                </select>
                {p.method === 'SAVINGS' && <select style={{ width: 150 }} value={p.savingsAccountId ?? ''} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, savingsAccountId: Number(e.target.value) } : x)))}>
                  <option value="">บัญชีออม…</option>{accounts.filter((a) => a.status !== 'CLOSED').map((a) => <option key={a.id} value={a.id}>{a.accountNo} ({baht(a.balance)})</option>)}</select>}
                <input className="grow" value={p.amount} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <button onClick={() => setPayments(payments.filter((_, j) => j !== i))}>×</button>
              </div>))}
            {banner}
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">รับแล้ว {baht(paid)} / {baht(due)}</span><span className="grow" />
              <button className="primary" disabled={busy || paid !== due || (net > 0 && !customer && tradeIns.length > 0) || (tradeIns.length > 0 && !customer)} onClick={submit}>ยืนยัน · Confirm</button>
            </div>
            {tradeIns.length > 0 && !customer && <div className="muted">ต้องเลือกลูกค้าเมื่อรับซื้อทอง · customer required when buying gold</div>}
          </Card>
        )}
        {done && <Card title="เสร็จสิ้น · Done"><div>{done.docNo} · {done.documents?.map((d: any) => d.docNo).join(', ')} {done.pointsEarned ? `· +${done.pointsEarned} pts` : ''}</div></Card>}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { PrintModal } from '../PrintModal';
import { Badge, Card, CustomerPicker, Empty, Field, Icon, Modal, PageHead, PuritySelect, baht, grams, pct, toMg, toMinor, useAction, useLabel } from '../ui';

interface TradeIn { description: string; weightMg: number; purityBp: number; deductionBp: number; isBar: boolean }
interface Pay { method: string; amount: string; savingsAccountId?: number }
const METHODS = ['CASH', 'TRANSFER', 'CARD', 'SAVINGS', 'OTHER'] as const;

/** Sell, exchange (trade-in) and buy gold on one screen. All totals come from the server quote. */
export function Pos({ user }: { user: any }) {
  const { t } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [tradeIns, setTradeIns] = useState<TradeIn[]>([]);
  const [discount, setDiscount] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [quoteErr, setQuoteErr] = useState('');
  const [payments, setPayments] = useState<Pay[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [done, setDone] = useState<any>(null);
  const [printing, setPrinting] = useState<{ path: string; title: string; fmt: 'a4' | 'slip' } | null>(null);
  const [ti, setTi] = useState({ description: '', weight: '', purityBp: 9650, deduction: '1', isBar: false });
  const { run, busy } = useAction();

  const loadItems = () => get(`/items?status=IN_STOCK&q=${encodeURIComponent(q)}`).then(setItems).catch(() => {});
  useEffect(() => { loadItems(); }, [q]);
  const sellable = items.filter((i) => i.category !== 'SCRAP'); // customer scrap is for melting, not for sale
  useEffect(() => { customer ? get(`/savings?customerId=${customer.id}`).then(setAccounts) : setAccounts([]); }, [customer]);

  const discountMinor = discount ? toMinor(discount) : 0;
  const body = useMemo(() => ({
    itemIds: cart.map((i) => i.id),
    tradeIns: tradeIns.map((x) => ({ description: x.description || undefined, weightMg: x.weightMg, purityBp: x.purityBp, deductionBp: x.deductionBp, isBar: x.isBar })),
    discount: discountMinor > 0 ? discountMinor : undefined,
  }), [cart, tradeIns, discountMinor]);

  useEffect(() => {
    setQuote(null); setQuoteErr('');
    if (!cart.length && !tradeIns.length) return;
    post('/pricing/quote', body).then(setQuote).catch((e) => setQuoteErr(e.code === 'NO_RATE' ? t('err.NO_RATE') : e.message));
  }, [body]);

  const net: number = quote?.quote?.net ?? 0;
  const due = Math.abs(net);
  // One tap for the common case: a single cash payment for the exact amount.
  useEffect(() => { if (quote && payments.length <= 1 && !payments[0]?.savingsAccountId && payments[0]?.method !== 'SAVINGS') setPayments(due ? [{ method: payments[0]?.method ?? 'CASH', amount: baht(due) }] : []); }, [due, quote?.quote?.net]);
  const paid = payments.reduce((a, p) => a + (toMinor(p.amount) || 0), 0);
  const kind = cart.length && tradeIns.length ? 'exchange' : cart.length ? 'sale' : tradeIns.length ? 'buy' : '';
  const needCustomer = tradeIns.length > 0 && !customer;
  const savingsOk = payments.every((p) => p.method !== 'SAVINGS' || p.savingsAccountId);
  const canConfirm = !!quote?.quote && !busy && paid === due && !needCustomer && savingsOk && due >= 0;

  const add = (it: any) => !cart.some((c) => c.id === it.id) && setCart([...cart, it]);
  const reset = () => { setCart([]); setTradeIns([]); setPayments([]); setDiscount(''); setCustomer(null); setQuote(null); loadItems(); };
  const submit = () => run(() => post('/transactions', {
    ...body, customerId: customer?.id ?? null,
    payments: payments.filter((p) => toMinor(p.amount) > 0).map((p) => ({ method: p.method, amount: toMinor(p.amount), savingsAccountId: p.savingsAccountId })),
  }), (r) => `${t('pos.saved')} ${r.docNo}`).then((r) => { if (r) { setDone(r); reset(); } });

  const setPay = (i: number, patch: Partial<Pay>) => setPayments(payments.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <PageHead title={t('pos.title')}>{kind && <Badge tone="gold">{t(`pos.kind.${kind}` as any)}</Badge>}</PageHead>
      <div className="grid g12">
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={t('pos.items')} right={<input style={{ width: 'min(240px,100%)' }} placeholder={t('pos.scan')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('pos.scan')}
            onKeyDown={(e) => { if (e.key === 'Enter') { const m = sellable.find((i) => i.sku.toLowerCase() === q.trim().toLowerCase()); if (m) { add(m); setQ(''); } } }} />}>
            {sellable.length === 0 ? <Empty icon="search" text={t('common.empty')} /> : (
              <div className="tbl-wrap" style={{ maxHeight: 340, overflow: 'auto' }}><table className="rtable"><thead><tr><th>SKU</th><th>{t('common.name')}</th><th className="num">{t('stock.weight')}</th><th>{t('stock.purity')}</th><th /></tr></thead><tbody>
                {sellable.map((i) => (
                  <tr key={i.id}><td data-label="SKU">{i.sku}</td><td data-label={t('common.name')}>{i.name}</td><td className="num" data-label={t('stock.weight')}>{grams(i.weightMg)}</td><td data-label={t('stock.purity')}>{pct(i.purityBp)}</td>
                    <td className="act"><button className="btn sm" disabled={cart.some((c) => c.id === i.id)} onClick={() => add(i)}><Icon name="plus" /> {t('common.add')}</button></td></tr>))}
              </tbody></table></div>)}
          </Card>

          {can('buyback.create') && (
            <Card title={t('pos.customerGold')} tone="red">
              <div className="row">
                <Field label={t('common.description')}><input value={ti.description} onChange={(e) => setTi({ ...ti, description: e.target.value })} /></Field>
                <Field label={t('stock.weight')}><input inputMode="decimal" value={ti.weight} onChange={(e) => setTi({ ...ti, weight: e.target.value })} /></Field>
                <Field label={t('stock.purity')}><PuritySelect value={ti.purityBp} onChange={(bp) => setTi({ ...ti, purityBp: bp })} /></Field>
                <Field label={t('pos.deduction')}><input inputMode="decimal" value={ti.deduction} onChange={(e) => setTi({ ...ti, deduction: e.target.value })} /></Field>
              </div>
              <div className="row center" style={{ marginTop: 10 }}>
                <label className="check"><input type="checkbox" checked={ti.isBar} onChange={(e) => setTi({ ...ti, isBar: e.target.checked })} /> {t('pos.isBar')}</label><span className="grow" />
                <button className="btn gold" disabled={!(toMg(ti.weight) > 0)} onClick={() => { setTradeIns([...tradeIns, { description: ti.description, weightMg: toMg(ti.weight), purityBp: ti.purityBp, deductionBp: Math.round(Number(ti.deduction || 0) * 100), isBar: ti.isBar }]); setTi({ ...ti, description: '', weight: '' }); }}><Icon name="plus" /> {t('pos.addGold')}</button>
              </div>
            </Card>)}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={t('pos.bill')} tone="gold">
            <CustomerPicker value={customer} onChange={setCustomer} get={get} />
            {cart.length === 0 && tradeIns.length === 0 && <Empty icon="cart" text={t('pos.emptyBill')} />}
            {cart.map((c, i) => (
              <div className="line" key={c.id}><div className="name"><b>{c.sku}</b> {c.name}<div className="muted small">{grams(c.weightMg)} g · {pct(c.purityBp)}</div></div>
                <div className="row center"><b className="num">{quote?.quote?.saleLines?.[i] ? baht(quote.quote.saleLines[i].total) : '…'}</b><button className="btn ghost icon-btn" aria-label={t('common.remove')} onClick={() => setCart(cart.filter((x) => x.id !== c.id))}><Icon name="x" /></button></div></div>))}
            {tradeIns.map((x, i) => (
              <div className="line" key={i}><div className="name"><Badge tone="warn">{t('pos.oldGold')}</Badge> {x.description || ''}<div className="muted small">{grams(x.weightMg)} g · {pct(x.purityBp)}{x.isBar ? ` · ${t('pos.bar')}` : ''}</div></div>
                <div className="row center"><b className="num">{quote?.quote?.tradeIns?.[i] ? `−${baht(quote.quote.tradeIns[i].value)}` : '…'}</b><button className="btn ghost icon-btn" aria-label={t('common.remove')} onClick={() => setTradeIns(tradeIns.filter((_, j) => j !== i))}><Icon name="x" /></button></div></div>))}
            {can('discount.apply') && (cart.length > 0) && <Field label={t('pos.discount')}><input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" /></Field>}
            {quoteErr && <div className="alert err" role="alert">{quoteErr}</div>}
            {quote?.quote && (
              <div className="tot" style={{ marginTop: 10 }}>
                <span>{t('pos.gold')}</span><span className="num">{baht(quote.quote.goldTotal)}</span>
                <span>{t('pos.making')}</span><span className="num">{baht(quote.quote.makingTotal + quote.quote.otherTotal)}</span>
                {quote.quote.discount > 0 && <><span>{t('pos.discount')}</span><span className="num">−{baht(quote.quote.discount)}</span></>}
                <span>{t('pos.vat')}</span><span className="num">{baht(quote.quote.tax)}</span>
                {quote.quote.tradeInCredit > 0 && <><span>{t('pos.tradeInCredit')}</span><span className="num">−{baht(quote.quote.tradeInCredit)}</span></>}
                <span className="grand">{net >= 0 ? t('pos.customerPays') : t('pos.shopPays')}</span><span className="grand big num">฿{baht(due)}</span>
              </div>)}
          </Card>

          {quote?.quote && (
            <div id="pay"><Card title={t('pos.payment')} right={<button className="btn sm" onClick={() => setPayments([...payments, { method: 'CASH', amount: baht(Math.max(0, due - paid)) }])}><Icon name="plus" /> {t('pos.addMethod')}</button>}>
              {payments.map((p, i) => (
                <div className="row" key={i} style={{ marginBottom: 8 }}>
                  <Field label={t('pos.method')}><select value={p.method} onChange={(e) => setPay(i, { method: e.target.value, savingsAccountId: undefined })}>
                    {METHODS.filter((m) => m !== 'SAVINGS' || (net > 0 && accounts.length > 0)).map((m) => <option key={m} value={m}>{label('mth', m)}</option>)}</select></Field>
                  {p.method === 'SAVINGS' && <Field label={t('pos.account')}><select value={p.savingsAccountId ?? ''} onChange={(e) => setPay(i, { savingsAccountId: Number(e.target.value) || undefined })}>
                    <option value="">—</option>{accounts.filter((a) => a.status !== 'CLOSED').map((a) => <option key={a.id} value={a.id}>{a.accountNo} ({baht(a.balance)})</option>)}</select></Field>}
                  <Field label={t('common.amount')}><input inputMode="decimal" value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} /></Field>
                  {payments.length > 1 && <button className="btn ghost icon-btn" aria-label={t('common.remove')} onClick={() => setPayments(payments.filter((_, j) => j !== i))}><Icon name="x" /></button>}
                </div>))}
              <div className="row center"><span className={paid === due ? 'badge ok' : 'badge bad'}>{t('pos.received')} {baht(paid)} / {baht(due)}</span></div>
              {needCustomer && <div className="alert warn">{t('pos.needCustomer')}</div>}
              <button className="btn primary block" style={{ marginTop: 10, minHeight: 50, fontSize: 17 }} disabled={!canConfirm} onClick={submit}><Icon name="check" /> {t('pos.confirm')}</button>
            </Card></div>)}
        </div>
      </div>

      {quote?.quote && <div className="pos-bar show"><div><div className="small">{net >= 0 ? t('pos.customerPays') : t('pos.shopPays')}</div><b>฿{baht(due)}</b></div><button className="btn gold" onClick={() => document.getElementById('pay')?.scrollIntoView({ behavior: 'smooth' })}>{t('pos.pay')}</button></div>}

      {done && (
        <Modal title={<><Icon name="check" /> {t('pos.doneTitle')}</>} onClose={() => setDone(null)}
          foot={<><button className="btn" onClick={() => setDone(null)}>{t('pos.newBill')}</button></>}>
          <p><b>{done.docNo}</b> · ฿{baht(Math.abs(done.net))}{done.pointsEarned ? ` · +${done.pointsEarned} ${t('common.pts')}` : ''}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="btn primary" onClick={() => setPrinting({ path: `/transactions/${done.id}/receipt`, title: done.docNo, fmt: 'slip' })}><Icon name="print" /> {t('pos.printBill')}</button>
            {(done.documents ?? []).map((d: any) => <button key={d.id} className="btn" onClick={() => setPrinting({ path: `/documents/${d.id}/html`, title: d.docNo, fmt: 'a4' })}><Icon name="receipt" /> {t('pos.printDoc')} {d.docNo}</button>)}
            {(done.documents ?? []).length === 0 && <div className="alert warn">{t('pos.noDocs')}</div>}
          </div>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat={printing.fmt} onClose={() => setPrinting(null)} />}
    </>
  );
}

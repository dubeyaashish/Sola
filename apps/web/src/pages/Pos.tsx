import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { KV, PanelTitle } from '../layout';
import { PrintModal } from '../PrintModal';
import { Avatar, CustomerPicker, Empty, ErrorNote, Field, Icon, IconTile, Modal, Notice, PuritySelect, SearchBox, StatusPill, Tabs, baht, cx, grams, pct, toMg, toMinor, useAction, useLabel } from '../ui';

interface TradeIn { description: string; weightMg: number; purityBp: number; deductionBp: number; isBar: boolean }
interface Pay { method: string; amount: string; savingsAccountId?: number }
const METHODS = ['CASH', 'TRANSFER', 'CARD', 'SAVINGS', 'OTHER'] as const;

/** Sell, exchange (trade-in) and buy gold on one screen. All money totals come from the server quote. */
export function Pos({ user }: { user: any }) {
  const { t } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [mobileTab, setMobileTab] = useState<'items' | 'bill'>('items');
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
  useEffect(() => { customer ? get(`/savings?customerId=${customer.id}`).then(setAccounts) : setAccounts([]); }, [customer]);
  const sellable = items.filter((i) => i.category !== 'SCRAP'); // customer scrap is for melting, not for sale

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
  // Common case in one tap: a single payment for the exact amount.
  useEffect(() => { if (quote && payments.length <= 1 && !payments[0]?.savingsAccountId && payments[0]?.method !== 'SAVINGS') setPayments(due ? [{ method: payments[0]?.method ?? 'CASH', amount: baht(due) }] : []); }, [due, quote?.quote?.net]);
  const paid = payments.reduce((a, p) => a + (toMinor(p.amount) || 0), 0);
  const kind = cart.length && tradeIns.length ? 'exchange' : cart.length ? 'sale' : tradeIns.length ? 'buy' : '';
  const needCustomer = tradeIns.length > 0 && !customer;
  const savingsOk = payments.every((p) => p.method !== 'SAVINGS' || p.savingsAccountId);
  const canConfirm = !!quote?.quote && !busy && paid === due && !needCustomer && savingsOk;

  const toggle = (it: any) => setCart(cart.some((c) => c.id === it.id) ? cart.filter((c) => c.id !== it.id) : [...cart, it]);
  const reset = () => { setCart([]); setTradeIns([]); setPayments([]); setDiscount(''); setCustomer(null); setQuote(null); setMobileTab('items'); loadItems(); };
  const submit = () => run(() => post('/transactions', {
    ...body, customerId: customer?.id ?? null,
    payments: payments.filter((p) => toMinor(p.amount) > 0).map((p) => ({ method: p.method, amount: toMinor(p.amount), savingsAccountId: p.savingsAccountId })),
  }), (r) => `${t('pos.saved')} ${r.docNo}`).then((r) => { if (r) { setDone(r); reset(); } });
  const setPay = (i: number, patch: Partial<Pay>) => setPayments(payments.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const lines = cart.length + tradeIns.length;

  const itemsPane = (
    <section className={cx('min-h-0 flex-1 flex-col border-ink-100 bg-white lg:flex lg:w-[340px] lg:flex-none lg:border-r xl:w-[360px]', mobileTab === 'items' ? 'flex' : 'hidden')}>
      <div className="space-y-3 border-b border-ink-100 p-4">
        <h1 className="hidden text-lg font-semibold text-ink-900 lg:block">{t('pos.items')}</h1>
        <SearchBox value={q} onChange={setQ} placeholder={t('pos.scan')} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={(e) => { if (e.key === 'Enter') { const m = sellable.find((i) => i.sku.toLowerCase() === q.trim().toLowerCase()); if (m) { toggle(m); setQ(''); } } }}>
        {sellable.length === 0 ? <Empty icon="search" text={t('common.empty')} /> : sellable.map((i) => {
          const inCart = cart.some((c) => c.id === i.id);
          return (
            <button key={i.id} className={cx('row-item', inCart && 'row-item-on')} onClick={() => toggle(i)} aria-pressed={inCart}>
              <IconTile icon={inCart ? 'check' : 'box'} tone={inCart ? 'brand' : 'neutral'} />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink-900">{i.name}</span><span className="block truncate text-xs text-ink-500">{i.sku} · {grams(i.weightMg)} g · {pct(i.purityBp)}</span></span>
              <Icon name={inCart ? 'minus' : 'plus'} className="h-4 w-4 text-ink-500" />
            </button>);
        })}
      </div>
      {cart.length + tradeIns.length > 0 && (
        <div className="border-t border-ink-100 p-3 lg:hidden"><button className="btn-primary w-full" onClick={() => setMobileTab('bill')}>{t('pos.reviewBill')} ({lines}){quote?.quote ? ` · ฿${baht(due)}` : ''}</button></div>
      )}
    </section>
  );

  const billPane = (
    <div className={cx('min-h-0 flex-1 flex-col overflow-y-auto lg:contents', mobileTab === 'bill' ? 'flex' : 'hidden')}>
      <section className="min-w-0 space-y-4 p-4 lg:flex-1 lg:overflow-y-auto lg:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink-900">{t('pos.bill')}</h2>
          {kind && <StatusPill tone="info">{t(`pos.kind.${kind}` as any)}</StatusPill>}
        </div>
        <div className="card p-4"><CustomerPicker value={customer} onChange={setCustomer} get={get} required={tradeIns.length > 0} /></div>

        <div className="card">
          {lines === 0 ? <Empty icon="cart" text={t('pos.emptyBill')} /> : (
            <ul>
              {cart.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
                  <IconTile icon="box" />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink-900">{c.name}</div><div className="text-xs text-ink-500">{c.sku} · {grams(c.weightMg)} g · {pct(c.purityBp)}</div></div>
                  <div className="text-right tabular-nums text-ink-900">{quote?.quote?.saleLines?.[i] ? baht(quote.quote.saleLines[i].total) : '…'}</div>
                  <button className="icon-btn" aria-label={t('common.remove')} onClick={() => setCart(cart.filter((x) => x.id !== c.id))}><Icon name="x" /></button>
                </li>))}
              {tradeIns.map((x, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
                  <IconTile icon="undo" tone="gold" />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-medium text-ink-900">{x.description || t('pos.oldGold')} <StatusPill tone="gold">{t('pos.oldGold')}</StatusPill></div><div className="text-xs text-ink-500">{grams(x.weightMg)} g · {pct(x.purityBp)}{x.isBar ? ` · ${t('pos.bar')}` : ''}</div></div>
                  <div className="text-right tabular-nums text-ink-900">{quote?.quote?.tradeIns?.[i] ? `−${baht(quote.quote.tradeIns[i].value)}` : '…'}</div>
                  <button className="icon-btn" aria-label={t('common.remove')} onClick={() => setTradeIns(tradeIns.filter((_, j) => j !== i))}><Icon name="x" /></button>
                </li>))}
            </ul>)}
        </div>

        {can('buyback.create') && (
          <div className="card p-4">
            <h3 className="mb-3 font-semibold text-ink-900">{t('pos.customerGold')}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label={t('common.description')} className="sm:col-span-2 xl:col-span-1"><input className="input" value={ti.description} onChange={(e) => setTi({ ...ti, description: e.target.value })} /></Field>
              <Field label={t('stock.weight')}><input className="input" inputMode="decimal" value={ti.weight} onChange={(e) => setTi({ ...ti, weight: e.target.value })} /></Field>
              <Field label={t('stock.purity')}><PuritySelect value={ti.purityBp} onChange={(bp) => setTi({ ...ti, purityBp: bp })} /></Field>
              <Field label={t('pos.deduction')}><input className="input" inputMode="decimal" value={ti.deduction} onChange={(e) => setTi({ ...ti, deduction: e.target.value })} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#b3202f]" checked={ti.isBar} onChange={(e) => setTi({ ...ti, isBar: e.target.checked })} /> {t('pos.isBar')}</label>
              <button className="btn-outline" disabled={!(toMg(ti.weight) > 0)} onClick={() => { setTradeIns([...tradeIns, { description: ti.description, weightMg: toMg(ti.weight), purityBp: ti.purityBp, deductionBp: Math.round(Number(ti.deduction || 0) * 100), isBar: ti.isBar }]); setTi({ ...ti, description: '', weight: '' }); }}><Icon name="plus" /> {t('pos.addGold')}</button>
            </div>
          </div>)}
      </section>

      <aside className="border-t border-ink-100 bg-white p-4 lg:w-80 lg:flex-none lg:overflow-y-auto lg:border-l lg:border-t-0 xl:w-[360px]">
        <PanelTitle>{t('pos.summary')}</PanelTitle>
        {!quote?.quote && !quoteErr && <div className="py-6 text-center text-ink-500">{t('pos.emptyBill')}</div>}
        {quoteErr && <ErrorNote message={quoteErr} />}
        {quote?.quote && (
          <>
            <KV k={t('pos.gold')} v={baht(quote.quote.goldTotal)} />
            <KV k={t('pos.making')} v={baht(quote.quote.makingTotal + quote.quote.otherTotal)} />
            {can('discount.apply') && cart.length > 0 && <div className="py-1.5"><Field label={t('pos.discount')}><input className="input" inputMode="decimal" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field></div>}
            {quote.quote.discount > 0 && <KV k={t('pos.discount')} v={`−${baht(quote.quote.discount)}`} />}
            <KV k={t('pos.vat')} v={baht(quote.quote.tax)} />
            {quote.quote.tradeInCredit > 0 && <KV k={t('pos.tradeInCredit')} v={`−${baht(quote.quote.tradeInCredit)}`} />}
            <div className="mt-2 flex items-baseline justify-between border-t border-ink-100 pt-3">
              <span className="font-semibold text-ink-900">{net >= 0 ? t('pos.customerPays') : t('pos.shopPays')}</span>
              <span className="text-2xl font-semibold tabular-nums text-brand-700">฿{baht(due)}</span>
            </div>

            <div className="mt-5 flex items-center justify-between"><PanelTitle>{t('pos.payment')}</PanelTitle>
              <button className="btn-ghost -mt-2 px-2 py-1 text-xs" onClick={() => setPayments([...payments, { method: 'CASH', amount: baht(Math.max(0, due - paid)) }])}><Icon name="plus" /> {t('pos.addMethod')}</button></div>
            <div className="space-y-3">
              {payments.map((p, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label={t('pos.method')} className="w-28 flex-none"><select className="input" value={p.method} onChange={(e) => setPay(i, { method: e.target.value, savingsAccountId: undefined })}>
                    {METHODS.filter((m) => m !== 'SAVINGS' || (net > 0 && accounts.length > 0)).map((m) => <option key={m} value={m}>{label('mth', m)}</option>)}</select></Field>
                  {p.method === 'SAVINGS' && <Field label={t('pos.account')} className="min-w-0 flex-1"><select className="input" value={p.savingsAccountId ?? ''} onChange={(e) => setPay(i, { savingsAccountId: Number(e.target.value) || undefined })}>
                    <option value="">—</option>{accounts.filter((a) => a.status !== 'CLOSED').map((a) => <option key={a.id} value={a.id}>{a.accountNo} ({baht(a.balance)})</option>)}</select></Field>}
                  <Field label={t('common.amount')} className="min-w-0 flex-1"><input className="input text-right tabular-nums" inputMode="decimal" value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} /></Field>
                  {payments.length > 1 && <button className="icon-btn mb-1" aria-label={t('common.remove')} onClick={() => setPayments(payments.filter((_, j) => j !== i))}><Icon name="x" /></button>}
                </div>))}
            </div>
            <div className="mt-3"><StatusPill tone={paid === due ? 'ok' : 'warn'}>{t('pos.received')} {baht(paid)} / {baht(due)}</StatusPill></div>
            {needCustomer && <div className="mt-3"><Notice>{t('pos.needCustomer')}</Notice></div>}
            <button className="btn-primary mt-4 w-full py-2.5" disabled={!canConfirm} onClick={submit}>{busy ? t('common.saving') : t('pos.confirm')}</button>
          </>
        )}
      </aside>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex-none border-b border-ink-100 bg-white px-4 pt-2 lg:hidden">
        <Tabs tabs={[{ id: 'items' as const, label: t('pos.items') }, { id: 'bill' as const, label: t('pos.bill'), count: lines }]} value={mobileTab} onChange={setMobileTab} />
      </div>
      {itemsPane}
      {billPane}

      {done && (
        <Modal size="sm" title={t('pos.doneTitle')} onClose={() => setDone(null)} footer={<button className="btn-outline" onClick={() => setDone(null)}>{t('pos.newBill')}</button>}>
          <div className="mb-4 flex items-center gap-3"><IconTile icon="check" tone="brand" /><div><div className="font-semibold text-ink-900">{done.docNo}</div><div className="text-xs text-ink-500">฿{baht(Math.abs(done.net))}{done.pointsEarned ? ` · +${done.pointsEarned} ${t('common.pts')}` : ''}</div></div></div>
          <div className="space-y-2">
            <button className="btn-primary w-full" onClick={() => setPrinting({ path: `/transactions/${done.id}/receipt`, title: done.docNo, fmt: 'slip' })}><Icon name="print" /> {t('pos.printBill')}</button>
            {(done.documents ?? []).map((d: any) => <button key={d.id} className="btn-outline w-full" onClick={() => setPrinting({ path: `/documents/${d.id}/html`, title: d.docNo, fmt: 'a4' })}><Icon name="receipt" /> {t('pos.printDoc')} {d.docNo}</button>)}
            {(done.documents ?? []).length === 0 && <Notice>{t('pos.noDocs')}</Notice>}
          </div>
        </Modal>)}
      {printing && <PrintModal path={printing.path} title={printing.title} defaultFormat={printing.fmt} onClose={() => setPrinting(null)} />}
    </div>
  );
}

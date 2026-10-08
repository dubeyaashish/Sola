import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { KV, PageScroll, SectionCard } from '../layout';
import { Empty, Field, Icon, Modal, StatusPill, Tabs, baht, toMinor, toneOf, today, useAction, useLabel, usePersisted } from '../ui';

type TabId = 'pl' | 'entries' | 'etax';

export function Reports({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const can = (p: string) => user.permissions.includes(p);
  const [tab, setTab] = usePersisted<TabId>('reports.tab', 'pl');
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [pl, setPl] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [etax, setEtax] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [e, setE] = useState({ kind: 'EXPENSE', category: '', amount: '' });
  const { run, busy } = useAction();
  const load = () => {
    get(`/reports/profit-loss?from=${range.from}&to=${range.to}`).then(setPl);
    get(`/ledger?from=${range.from}&to=${range.to}`).then(setLedger);
    if (can('document.issue')) get('/etax/outbox?status=PENDING').then(setEtax);
  };
  useEffect(load, [range]);
  const tabs = [{ id: 'pl' as const, label: t('rep.pl') }, { id: 'entries' as const, label: t('rep.ledger'), count: ledger.length }, ...(can('document.issue') ? [{ id: 'etax' as const, label: t('rep.etax'), count: etax.length }] : [])];

  return (
    <PageScroll title={t('nav.reports')} actions={can('ledger.manage') && <button className="btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> {t('rep.addEntry')}</button>}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('common.from')}><input className="input" type="date" value={range.from} onChange={(x) => setRange({ ...range, from: x.target.value })} /></Field>
        <Field label={t('common.to')}><input className="input" type="date" value={range.to} onChange={(x) => setRange({ ...range, to: x.target.value })} /></Field>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'pl' && pl && (
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title={t('rep.pl')}>
            <KV k={t('rep.revenue')} v={baht(pl.revenue)} /><KV k={t('rep.cogs')} v={`−${baht(pl.cogs)}`} /><KV k={t('rep.gross')} v={baht(pl.grossProfit)} strong />
            <KV k={t('rep.pawnInterest')} v={baht(pl.pawnInterestIncome)} /><KV k={t('rep.otherIncome')} v={baht(pl.otherIncome)} /><KV k={t('rep.expenses')} v={`−${baht(pl.expenses)}`} />
            <KV k={t('rep.net')} v={<span className="text-brand-700">{baht(pl.netProfit)}</span>} strong />
          </SectionCard>
          <SectionCard title={t('rep.summary')}>
            <KV k={t('dash.bills')} v={pl.salesCount} /><KV k={t('pos.discount')} v={baht(pl.discount)} /><KV k={t('rep.outputTax')} v={baht(pl.outputTax)} />
          </SectionCard>
        </div>
      )}

      {tab === 'entries' && (
        <SectionCard flush>
          {ledger.length === 0 ? <Empty icon="receipt" text={t('common.empty')} /> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-ink-100"><th className="th">{t('common.date')}</th><th className="th">{t('common.type')}</th><th className="th">{t('rep.category')}</th><th className="th num">{t('common.amount')}</th></tr></thead>
              <tbody className="divide-y divide-ink-100">{ledger.map((l) => (
                <tr key={l.id} className="h-11 hover:bg-ink-50"><td className="td">{date(l.entryDate)}</td><td className="td"><StatusPill tone={l.kind === 'INCOME' ? 'ok' : 'bad'}>{l.kind === 'INCOME' ? t('rep.income') : t('rep.expense')}</StatusPill></td><td className="td">{l.category}</td><td className="td num">{baht(l.amount)}</td></tr>))}</tbody></table></div>)}
        </SectionCard>
      )}

      {tab === 'etax' && (
        <SectionCard title={t('rep.etax')} desc={t('rep.etaxHint')} flush>
          {etax.length === 0 ? <Empty icon="check" text={t('rep.etaxEmpty')} /> : etax.map((x) => (
            <div key={x.id} className="flex items-center justify-between border-t border-ink-100 px-5 py-3"><div><div className="font-medium text-ink-900">{x.docNo}</div><div className="text-xs text-ink-500">{date(x.createdAt, true)}</div></div>
              <div className="flex items-center gap-3"><StatusPill tone={toneOf(x.status)}>{label('st', x.status)}</StatusPill><span className="tabular-nums">{baht(x.total)}</span></div></div>))}
        </SectionCard>
      )}

      {adding && (
        <Modal title={t('rep.addEntry')} onClose={() => setAdding(false)} footer={<><button className="btn-outline" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !e.category || !(toMinor(e.amount) > 0)} onClick={() => run(() => post('/ledger', { kind: e.kind, category: e.category, amount: toMinor(e.amount) }), t('common.saved')).then((r) => { if (r) { setAdding(false); setE({ ...e, category: '', amount: '' }); load(); } })}>{t('common.save')}</button></>}>
          <div className="space-y-3">
            <Field label={t('common.type')}><select className="input" value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value })}><option value="EXPENSE">{t('rep.expense')}</option><option value="INCOME">{t('rep.income')}</option></select></Field>
            <Field label={t('rep.category')} required hint={t('rep.categoryHint')}><input className="input" value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })} /></Field>
            <Field label={t('common.amount')} required><input className="input" inputMode="decimal" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></Field>
          </div>
        </Modal>)}
    </PageScroll>
  );
}

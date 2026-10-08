import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { Badge, Card, Empty, Field, PageHead, Stat, baht, toMinor, toneOf, today, useAction, useLabel } from '../ui';

export function Reports({ user }: { user: any }) {
  const { t, date } = useI18n();
  const label = useLabel();
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [pl, setPl] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [etax, setEtax] = useState<any[]>([]);
  const [e, setE] = useState({ kind: 'EXPENSE', category: '', amount: '' });
  const { run, busy } = useAction();
  const can = (p: string) => user.permissions.includes(p);
  const load = () => {
    get(`/reports/profit-loss?from=${range.from}&to=${range.to}`).then(setPl);
    get(`/ledger?from=${range.from}&to=${range.to}`).then(setLedger);
    if (can('document.issue')) get('/etax/outbox?status=PENDING').then(setEtax);
  };
  useEffect(load, [range]);

  return (
    <>
      <PageHead title={t('nav.reports')} />
      <Card>
        <div className="row"><Field label={t('common.from')}><input type="date" value={range.from} onChange={(x) => setRange({ ...range, from: x.target.value })} /></Field><Field label={t('common.to')}><input type="date" value={range.to} onChange={(x) => setRange({ ...range, to: x.target.value })} /></Field></div>
      </Card>
      {pl && (<>
        <div className="stats">
          <Stat label={t('rep.revenue')} value={baht(pl.revenue)} sub={`${pl.salesCount} ${t('dash.bills')}`} />
          <Stat label={t('rep.gross')} value={baht(pl.grossProfit)} sub={`${t('rep.cogs')} ${baht(pl.cogs)}`} />
          <Stat tone="red" label={t('rep.net')} value={baht(pl.netProfit)} />
        </div>
        <Card title={t('rep.pl')} tone="gold">
          <div className="tot">
            <span>{t('rep.revenue')}</span><span className="num">{baht(pl.revenue)}</span>
            <span>{t('rep.cogs')}</span><span className="num">−{baht(pl.cogs)}</span>
            <b>{t('rep.gross')}</b><b className="num">{baht(pl.grossProfit)}</b>
            <span>{t('rep.pawnInterest')}</span><span className="num">{baht(pl.pawnInterestIncome)}</span>
            <span>{t('rep.otherIncome')}</span><span className="num">{baht(pl.otherIncome)}</span>
            <span>{t('rep.expenses')}</span><span className="num">−{baht(pl.expenses)}</span>
            <span className="grand">{t('rep.net')}</span><span className="grand big num">฿{baht(pl.netProfit)}</span>
            <span className="muted small">{t('rep.outputTax')}</span><span className="muted small num">{baht(pl.outputTax)}</span>
          </div>
        </Card>
      </>)}
      {can('ledger.manage') && (
        <Card title={t('rep.addEntry')}>
          <div className="row">
            <Field label={t('common.type')}><select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value })}><option value="EXPENSE">{t('rep.expense')}</option><option value="INCOME">{t('rep.income')}</option></select></Field>
            <Field label={t('rep.category')}><input value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })} placeholder={t('rep.categoryHint')} /></Field>
            <Field label={t('common.amount')}><input inputMode="decimal" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></Field>
            <button className="btn primary" disabled={busy || !e.category || !(toMinor(e.amount) > 0)} onClick={() => run(() => post('/ledger', { kind: e.kind, category: e.category, amount: toMinor(e.amount) }), t('common.saved')).then((r) => { if (r) { setE({ ...e, category: '', amount: '' }); load(); } })}>{t('common.save')}</button>
          </div>
        </Card>)}
      <Card title={t('rep.ledger')}>
        {ledger.length === 0 ? <Empty text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('rep.category')}</th><th className="num">{t('common.amount')}</th></tr></thead><tbody>
            {ledger.map((l) => <tr key={l.id}><td data-label={t('common.date')}>{date(l.entryDate)}</td><td data-label={t('common.type')}><Badge tone={l.kind === 'INCOME' ? 'ok' : 'bad'}>{l.kind === 'INCOME' ? t('rep.income') : t('rep.expense')}</Badge></td><td data-label={t('rep.category')}>{l.category}</td><td className="num" data-label={t('common.amount')}>{baht(l.amount)}</td></tr>)}
          </tbody></table></div>)}
      </Card>
      {can('document.issue') && (
        <Card title={t('rep.etax')}>
          <p className="muted small">{t('rep.etaxHint')}</p>
          {etax.length === 0 ? <Empty icon="check" text={t('rep.etaxEmpty')} /> : etax.map((x) => <div className="line" key={x.id}><span><b>{x.docNo}</b> <span className="muted small">{date(x.createdAt, true)}</span></span><span><Badge tone={toneOf(x.status)}>{label('st', x.status)}</Badge> <b className="num">{baht(x.total)}</b></span></div>)}
        </Card>)}
    </>
  );
}

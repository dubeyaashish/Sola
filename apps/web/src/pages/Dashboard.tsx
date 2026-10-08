import { useEffect, useState } from 'react';
import { get } from '../api';
import { useI18n } from '../i18n';
import { PageScroll, SectionCard } from '../layout';
import { Empty, Icon, Loading, Notice, StatusPill, baht, grams, pct, useLabel } from '../ui';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return <div className="card p-4"><div className="text-xs font-medium text-ink-500">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</div>{sub && <div className="mt-0.5 text-xs text-ink-500">{sub}</div>}</div>;
}

export function Dashboard({ go }: { user: any; go: (id: string) => void }) {
  const { t } = useI18n();
  const label = useLabel();
  const [d, setD] = useState<any>(null);
  useEffect(() => { get('/reports/dashboard').then(setD); }, []);
  const actions = (
    <>
      <button className="btn-outline" onClick={() => go('pawn')}><Icon name="vault" /> {t('nav.pawn')}</button>
      <button className="btn-primary" onClick={() => go('pos')}><Icon name="plus" /> {t('dash.newSale')}</button>
    </>
  );
  return (
    <PageScroll title={t('nav.dashboard')} actions={actions}>
      {!d ? <Loading /> : (
        <>
          {!d.rate && <Notice>{t('rate.none')} <button className="font-medium underline" onClick={() => go('rates')}>{t('rates.set')}</button></Notice>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Stat label={t('dash.salesToday')} value={baht(d.today.revenue)} sub={`${d.today.salesCount} ${t('dash.bills')} · ${t('dash.gross')} ${baht(d.today.grossProfit)}`} />
            <Stat label={t('dash.salesMonth')} value={baht(d.monthToDate.revenue)} sub={`${t('rep.net')} ${baht(d.monthToDate.netProfit)}`} />
            <Stat label={t('dash.stockValue')} value={baht(d.stockMarketValue ?? 0)} sub={t('dash.atBuyRate')} />
            <Stat label={t('dash.pawnActive')} value={baht(d.pawn.active.principal)} sub={<>{d.pawn.active.n} {t('dash.contracts')}{d.pawn.overdue > 0 && <> · <span className="font-medium text-red-600">{t('dash.overdue')} {d.pawn.overdue}</span></>}</>} />
            <Stat label={t('dash.savingsLiab')} value={baht(d.savingsLiability)} />
            <Stat label={t('dash.etax')} value={d.pendingEtax} sub={`${t('dash.points')} ${d.pointsOutstanding}`} />
          </div>
          <SectionCard title={t('dash.stockByPurity')} flush>
            {d.stock.length === 0 ? <Empty icon="box" text={t('common.empty')} /> : (
              <div className="overflow-x-auto">
                <table className="w-full"><thead><tr className="border-b border-ink-100"><th className="th">{t('stock.purity')}</th><th className="th">{t('stock.source')}</th><th className="th num">{t('stock.pieces')}</th><th className="th num">{t('stock.weight')}</th></tr></thead>
                  <tbody className="divide-y divide-ink-100">{d.stock.map((s: any, i: number) => (
                    <tr key={i} className="h-11 hover:bg-ink-50"><td className="td">{pct(s.purityBp)}</td><td className="td"><StatusPill tone={s.source === 'FORFEITED' ? 'warn' : s.source === 'TRADE_IN' ? 'gold' : 'neutral'}>{label('src', s.source)}</StatusPill></td><td className="td num">{s.count}</td><td className="td num">{grams(s.weightMg)}</td></tr>))}</tbody></table>
              </div>)}
          </SectionCard>
        </>
      )}
    </PageScroll>
  );
}

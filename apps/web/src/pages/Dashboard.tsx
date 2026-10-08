import { useEffect, useState } from 'react';
import { get } from '../api';
import { useI18n } from '../i18n';
import { Badge, Card, Empty, Icon, PageHead, Stat, baht, grams, pct, useLabel } from '../ui';

export function Dashboard({ go }: { user: any; go: (id: string) => void }) {
  const { t } = useI18n();
  const label = useLabel();
  const [d, setD] = useState<any>(null);
  useEffect(() => { get('/reports/dashboard').then(setD); }, []);
  if (!d) return <Empty icon="chart" text={t('common.loading')} />;
  return (
    <>
      <PageHead title={t('nav.dashboard')}>
        <button className="btn primary" onClick={() => go('pos')}><Icon name="cart" /> {t('dash.newSale')}</button>
        <button className="btn" onClick={() => go('pawn')}><Icon name="vault" /> {t('nav.pawn')}</button>
      </PageHead>
      {!d.rate && <div className="alert warn">{t('rate.none')} — <button className="btn sm" onClick={() => go('rates')}>{t('rates.set')}</button></div>}
      <div className="stats">
        <Stat label={t('dash.salesToday')} value={baht(d.today.revenue)} sub={`${d.today.salesCount} ${t('dash.bills')} · ${t('dash.gross')} ${baht(d.today.grossProfit)}`} />
        <Stat label={t('dash.salesMonth')} value={baht(d.monthToDate.revenue)} sub={`${t('rep.net')} ${baht(d.monthToDate.netProfit)}`} />
        <Stat label={t('dash.stockValue')} value={baht(d.stockMarketValue ?? 0)} sub={t('dash.atBuyRate')} />
        <Stat tone="red" label={t('dash.pawnActive')} value={baht(d.pawn.active.principal)} sub={`${d.pawn.active.n} ${t('dash.contracts')} · ${t('dash.overdue')} ${d.pawn.overdue}`} />
        <Stat label={t('dash.savingsLiab')} value={baht(d.savingsLiability)} />
        <Stat tone="red" label={t('dash.etax')} value={d.pendingEtax} sub={`${t('dash.points')} ${d.pointsOutstanding}`} />
      </div>
      <Card title={t('dash.stockByPurity')} tone="gold">
        {d.stock.length === 0 ? <Empty text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('stock.purity')}</th><th>{t('stock.source')}</th><th className="num">{t('stock.pieces')}</th><th className="num">{t('stock.weight')}</th></tr></thead><tbody>
            {d.stock.map((s: any, i: number) => (
              <tr key={i}><td data-label={t('stock.purity')}>{pct(s.purityBp)}</td><td data-label={t('stock.source')}><Badge tone={s.source === 'FORFEITED' ? 'warn' : s.source === 'TRADE_IN' ? 'gold' : undefined}>{label('src', s.source)}</Badge></td>
                <td className="num" data-label={t('stock.pieces')}>{s.count}</td><td className="num" data-label={t('stock.weight')}>{grams(s.weightMg)}</td></tr>))}
          </tbody></table></div>)}
      </Card>
    </>
  );
}

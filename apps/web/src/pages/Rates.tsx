import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { Badge, Card, Empty, Field, PageHead, Stat, baht, toMinor, useAction } from '../ui';

const perBaht = (perGram: number) => Math.round((perGram * 15244 * 9650) / 1e7);

export function Rates({ user }: { user: any }) {
  const { t, date } = useI18n();
  const [cur, setCur] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [f, setF] = useState({ announcementNo: '', barBuy: '', barSell: '', ornamentBuy: '', ornamentSell: '' });
  const { run, busy } = useAction();
  const load = () => { get('/rates/current').then(setCur); get('/rates').then(setHist); window.dispatchEvent(new Event('sola:rate')); };
  useEffect(load, []);
  const canSet = user.permissions.includes('rate.set');
  const v = (k: keyof typeof f) => toMinor(f[k]);
  const valid = v('barBuy') > 0 && v('barSell') >= v('barBuy') && v('ornamentBuy') > 0 && v('ornamentSell') >= v('ornamentBuy');
  const inp = (k: keyof typeof f, label: string, numeric = true) => <Field label={label}><input inputMode={numeric ? 'decimal' : 'text'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;

  return (
    <>
      <PageHead title={t('nav.rates')} />
      <Card title={t('rates.current')} tone="gold">
        {cur ? (<>
          <div className="stats">
            <Stat label={`${t('rate.bar')} · ${t('rates.buy')}`} value={baht(perBaht(cur.barBuyPerGram))} />
            <Stat label={`${t('rate.bar')} · ${t('rates.sell')}`} value={baht(perBaht(cur.barSellPerGram))} />
            <Stat tone="red" label={`${t('rate.ornament')} · ${t('rates.buy')}`} value={baht(perBaht(cur.buyPerGram))} />
            <Stat tone="red" label={`${t('rate.ornament')} · ${t('rates.sell')}`} value={baht(perBaht(cur.sellPerGram))} />
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>{t('rates.unit')} · {cur.source === 'ASSOCIATION' ? t('rates.byAssoc') : t('rates.manual')}{cur.announcementNo ? ` #${cur.announcementNo}` : ''} · {date(cur.effectiveAt, true)} · {cur.setBy}</div>
        </>) : <div className="alert err">{t('rate.none')}</div>}
      </Card>
      {canSet && (
        <Card title={t('rates.update')}>
          <p className="muted small">{t('rates.updateHint')}</p>
          <div className="row">{inp('announcementNo', t('rates.announcement'), false)}</div>
          <div className="grid g2" style={{ marginTop: 10 }}>
            <div><h4>{t('rate.bar')}</h4><div className="row">{inp('barBuy', t('rates.buy'))}{inp('barSell', t('rates.sell'))}</div></div>
            <div><h4>{t('rate.ornament')}</h4><div className="row">{inp('ornamentBuy', t('rates.buy'))}{inp('ornamentSell', t('rates.sell'))}</div></div>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !valid} onClick={() => run(() => post('/rates/association', { announcementNo: f.announcementNo || undefined, barBuy: v('barBuy'), barSell: v('barSell'), ornamentBuy: v('ornamentBuy'), ornamentSell: v('ornamentSell') }),
            (r: any) => (r.changed ? t('rates.updated') : t('rates.unchanged'))).then(load)}>{t('rates.apply')}</button>
        </Card>)}
      <Card title={t('rates.history')}>
        {hist.length === 0 ? <Empty text={t('common.empty')} /> : (
          <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('common.time')}</th><th className="num">{t('rate.bar')}</th><th className="num">{t('rate.ornament')}</th><th>{t('common.user')}</th></tr></thead><tbody>
            {hist.map((h) => <tr key={h.id}><td data-label={t('common.time')}>{date(h.effectiveAt, true)}</td><td className="num" data-label={t('rate.bar')}>{baht(perBaht(h.barBuyPerGram))} / {baht(perBaht(h.barSellPerGram))}</td>
              <td className="num" data-label={t('rate.ornament')}>{baht(perBaht(h.buyPerGram))} / {baht(perBaht(h.sellPerGram))}</td><td data-label={t('common.user')}>{h.setBy} <Badge tone={h.source === 'ASSOCIATION' ? 'gold' : undefined}>{h.source === 'ASSOCIATION' ? t('rates.byAssoc') : t('rates.manual')}</Badge></td></tr>)}
          </tbody></table></div>)}
      </Card>
    </>
  );
}

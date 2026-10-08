import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useI18n } from '../i18n';
import { PageScroll, SectionCard } from '../layout';
import { Empty, ErrorNote, Field, StatusPill, baht, toMinor, useAction } from '../ui';

const perBaht = (perGram: number) => Math.round((perGram * 15244 * 9650) / 1e7);

export function Rates({ user }: { user: any }) {
  const { t, date } = useI18n();
  const [cur, setCur] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [f, setF] = useState({ announcementNo: '', barBuy: '', barSell: '', ornamentBuy: '', ornamentSell: '' });
  const { run, busy } = useAction();
  const load = () => { get('/rates/current').then(setCur); get('/rates').then(setHist); window.dispatchEvent(new Event('sola:rate')); };
  useEffect(load, []);
  const v = (k: keyof typeof f) => toMinor(f[k]);
  const valid = v('barBuy') > 0 && v('barSell') >= v('barBuy') && v('ornamentBuy') > 0 && v('ornamentSell') >= v('ornamentBuy');
  const touched = Object.values(f).some(Boolean);
  const inp = (k: keyof typeof f, label: string, numeric = true) => <Field label={label}><input className="input" inputMode={numeric ? 'decimal' : 'text'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  const Price = ({ label, value }: { label: string; value: number }) => <div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-500">{label}</div><div className="text-xl font-semibold tabular-nums text-ink-900">{baht(value)}</div></div>;

  return (
    <PageScroll title={t('nav.rates')}>
      <SectionCard title={t('rates.current')} desc={t('rates.unit')}>
        {cur ? (<>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Price label={`${t('rate.bar')} · ${t('rates.buy')}`} value={perBaht(cur.barBuyPerGram)} /><Price label={`${t('rate.bar')} · ${t('rates.sell')}`} value={perBaht(cur.barSellPerGram)} />
            <Price label={`${t('rate.ornament')} · ${t('rates.buy')}`} value={perBaht(cur.buyPerGram)} /><Price label={`${t('rate.ornament')} · ${t('rates.sell')}`} value={perBaht(cur.sellPerGram)} />
          </div>
          <div className="mt-3 text-xs text-ink-500">{cur.source === 'ASSOCIATION' ? t('rates.byAssoc') : t('rates.manual')}{cur.announcementNo ? ` #${cur.announcementNo}` : ''} · {date(cur.effectiveAt, true)} · {cur.setBy}</div>
        </>) : <ErrorNote message={t('rate.none')} />}
      </SectionCard>

      {user.permissions.includes('rate.set') && (
        <SectionCard title={t('rates.update')} desc={t('rates.updateHint')}>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 sm:max-w-xs">{inp('announcementNo', t('rates.announcement'), false)}</div>
            <div><h3 className="mb-2 font-medium text-ink-900">{t('rate.bar')}</h3><div className="grid grid-cols-2 gap-3">{inp('barBuy', t('rates.buy'))}{inp('barSell', t('rates.sell'))}</div></div>
            <div><h3 className="mb-2 font-medium text-ink-900">{t('rate.ornament')}</h3><div className="grid grid-cols-2 gap-3">{inp('ornamentBuy', t('rates.buy'))}{inp('ornamentSell', t('rates.sell'))}</div></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={busy || !valid} onClick={() => run(() => post('/rates/association', { announcementNo: f.announcementNo || undefined, barBuy: v('barBuy'), barSell: v('barSell'), ornamentBuy: v('ornamentBuy'), ornamentSell: v('ornamentSell') }),
              (r: any) => (r.changed ? t('rates.updated') : t('rates.unchanged'))).then((r) => { if (r) { setF({ announcementNo: '', barBuy: '', barSell: '', ornamentBuy: '', ornamentSell: '' }); load(); } })}>{t('rates.apply')}</button>
            {touched && <button className="btn-ghost" onClick={() => setF({ announcementNo: '', barBuy: '', barSell: '', ornamentBuy: '', ornamentSell: '' })}>{t('common.clear')}</button>}
          </div>
        </SectionCard>)}

      <SectionCard title={t('rates.history')} flush>
        {hist.length === 0 ? <Empty icon="tag" text={t('common.empty')} /> : (
          <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-ink-100"><th className="th">{t('common.time')}</th><th className="th num">{t('rate.bar')}</th><th className="th num">{t('rate.ornament')}</th><th className="th">{t('common.user')}</th></tr></thead>
            <tbody className="divide-y divide-ink-100">{hist.map((h) => (
              <tr key={h.id} className="h-11 hover:bg-ink-50"><td className="td whitespace-nowrap">{date(h.effectiveAt, true)}</td><td className="td num whitespace-nowrap">{baht(perBaht(h.barBuyPerGram))} / {baht(perBaht(h.barSellPerGram))}</td>
                <td className="td num whitespace-nowrap">{baht(perBaht(h.buyPerGram))} / {baht(perBaht(h.sellPerGram))}</td><td className="td whitespace-nowrap">{h.setBy} <StatusPill tone={h.source === 'ASSOCIATION' ? 'gold' : 'neutral'}>{h.source === 'ASSOCIATION' ? t('rates.byAssoc') : t('rates.manual')}</StatusPill></td></tr>))}</tbody></table></div>)}
      </SectionCard>
    </PageScroll>
  );
}

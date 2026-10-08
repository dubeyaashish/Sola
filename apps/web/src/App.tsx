import { useEffect, useState } from 'react';
import { get, post, setToken, getToken } from './api';
import { useI18n } from './i18n';
import { Avatar, Coin, ConfirmDialog, DirtyProvider, Field, Icon, Menu, Modal, ToastProvider, baht, cx, errMsg, usePersisted } from './ui';
import type { Key } from './dict';
import { Dashboard } from './pages/Dashboard';
import { Pos } from './pages/Pos';
import { Transactions } from './pages/Transactions';
import { Inventory } from './pages/Inventory';
import { Customers } from './pages/Customers';
import { Pawn } from './pages/Pawn';
import { Savings } from './pages/Savings';
import { Rates } from './pages/Rates';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';

const perBaht = (perGram: number) => Math.round((perGram * 15244 * 9650) / 1e7);

interface Tab { id: string; key: Key; short: Key; icon: string; perms: string[]; el: (p: { user: any; go: (id: string) => void }) => JSX.Element }
const TABS: Tab[] = [
  { id: 'dash', key: 'nav.dashboard', short: 'navs.dash', icon: 'home', perms: ['report.view'], el: Dashboard },
  { id: 'pos', key: 'nav.pos', short: 'navs.pos', icon: 'cart', perms: ['sale.create', 'buyback.create'], el: Pos },
  { id: 'tx', key: 'nav.transactions', short: 'navs.tx', icon: 'receipt', perms: ['sale.create', 'report.view'], el: Transactions },
  { id: 'stock', key: 'nav.stock', short: 'navs.stock', icon: 'box', perms: ['item.read'], el: Inventory },
  { id: 'cust', key: 'nav.customers', short: 'navs.cust', icon: 'users', perms: ['customer.read'], el: Customers },
  { id: 'pawn', key: 'nav.pawn', short: 'navs.pawn', icon: 'vault', perms: ['pawn.manage'], el: Pawn },
  { id: 'sav', key: 'nav.savings', short: 'navs.sav', icon: 'piggy', perms: ['savings.manage'], el: Savings },
  { id: 'rates', key: 'nav.rates', short: 'navs.rates', icon: 'tag', perms: ['rate.read'], el: Rates },
  { id: 'rep', key: 'nav.reports', short: 'navs.rep', icon: 'chart', perms: ['report.view'], el: Reports },
  { id: 'set', key: 'nav.settings', short: 'navs.set', icon: 'gear', perms: ['user.manage', 'audit.view'], el: Settings },
];

export function App() {
  return <ToastProvider><Root /></ToastProvider>;
}

function Root() {
  const { t, lang, setLang } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = usePersisted<string>('tab', '');
  const [more, setMore] = useState(false);
  const [rate, setRate] = useState<any>(null);
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({ name: 'Sola', logo: null });
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const allowed = (u: any) => TABS.filter((x) => x.perms.some((p) => u.permissions.includes(p)));
  const start = (u: any) => { setUser(u); const a = allowed(u); if (!a.some((x) => x.id === tab)) setTab((a.find((x) => x.id === 'dash') ?? a.find((x) => x.id === 'pos') ?? a[0])?.id ?? ''); };

  useEffect(() => {
    if (!getToken()) return setReady(true);
    get('/auth/me').then(start).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const loadBrand = () => Promise.all([get('/settings/company'), get('/settings/logo')]).then(([c, l]) => setBrand({ name: c.name || 'Sola', logo: l.dataUrl })).catch(() => {});
  const loadRate = () => get('/rates/current').then(setRate).catch(() => {});
  useEffect(() => {
    if (!user) return;
    loadBrand(); loadRate();
    const id = setInterval(loadRate, 60_000);
    window.addEventListener('sola:rate', loadRate); window.addEventListener('sola:brand', loadBrand);
    return () => { clearInterval(id); window.removeEventListener('sola:rate', loadRate); window.removeEventListener('sola:brand', loadBrand); };
  }, [user]);

  if (!ready) return null;
  if (!user) return <Login onLogin={start} />;

  const tabs = allowed(user);
  const cur = tabs.find((x) => x.id === tab) ?? tabs[0];
  const Page = cur?.el;
  const main = tabs.slice(0, 4), rest = tabs.slice(4);
  const stale = !rate || Date.now() - Date.parse(rate.effectiveAt) > 12 * 3600_000;
  const logout = () => { setToken(null); location.reload(); };
  const go = (id: string) => { setMore(false); if (id === cur?.id) return; if (dirty) setPending(id); else setTab(id); };

  const userMenu = [
    { label: 'ไทย', icon: 'globe', onClick: () => setLang('th'), active: lang === 'th' },
    { label: 'English', icon: 'globe', onClick: () => setLang('en'), active: lang === 'en' },
    { label: t('auth.logout'), icon: 'out', onClick: logout, danger: true },
  ];

  return (
    <DirtyProvider value={{ dirty, setDirty }}>
      <div className="flex h-dvh flex-col bg-ink-50 lg:flex-row">
        {/* icon rail (desktop) */}
        <nav className="hidden w-16 flex-none flex-col items-center gap-1 border-r border-ink-100 bg-white py-3 lg:flex" aria-label="Main">
          <div className="mb-2 flex h-10 w-10 items-center justify-center">{brand.logo ? <img src={brand.logo} alt={brand.name} className="max-h-10 max-w-10 rounded-lg object-contain" /> : <Coin />}</div>
          {tabs.map((x) => (
            <button key={x.id} data-nav={x.id} onClick={() => go(x.id)} title={t(x.key)} aria-current={x.id === cur?.id ? 'page' : undefined}
              className={cx('flex w-14 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-colors', x.id === cur?.id ? 'bg-brand-50 text-brand-600' : 'text-ink-500 hover:bg-ink-100')}>
              <Icon name={x.icon} className="h-5 w-5" /><span className="line-clamp-1 text-[10px] font-medium leading-tight">{t(x.short)}</span>
            </button>
          ))}
          <div className="flex-1" />
          <Menu up align="left" label={user.username} button={<Avatar name={user.fullName ?? user.username} size={36} />} items={[{ label: `${user.username} · ${t(`role.${user.role}` as Key)}`, onClick: () => {}, icon: undefined }, ...userMenu]} />
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* gold price strip */}
          <div className={cx('flex flex-none items-center gap-3 overflow-x-auto whitespace-nowrap border-b border-ink-100 bg-white px-4 py-1.5 text-xs', stale && 'bg-amber-50')}>
            <span className={cx('h-2 w-2 flex-none rounded-full', stale ? 'bg-amber-500' : 'bg-emerald-500')} />
            {rate ? (
              <>
                <span className="text-ink-500">{t('rate.buySell')}</span>
                <span className="text-ink-500">{t('rate.bar')}</span><b className="tabular-nums text-ink-900">{baht(perBaht(rate.barBuyPerGram))} / {baht(perBaht(rate.barSellPerGram))}</b>
                <span className="hidden text-ink-500 sm:inline">{t('rate.ornament')}</span><b className="hidden tabular-nums text-ink-900 sm:inline">{baht(perBaht(rate.buyPerGram))} / {baht(perBaht(rate.sellPerGram))}</b>
                {stale && <span className="text-amber-700">{t('rate.stale')}</span>}
              </>
            ) : <b className="text-amber-700">{t('rate.none')}</b>}
            <span className="flex-1" />
            {tabs.some((x) => x.id === 'rates') && <button className="text-brand-600 hover:underline" onClick={() => go('rates')}>{t('rates.update')}</button>}
          </div>
          <main className="min-h-0 flex-1">{Page && <Page user={user} go={go} />}</main>
        </div>

        {/* bottom tab bar (phones / tablets) */}
        <nav className="flex flex-none border-t border-ink-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
          {main.map((x) => (
            <button key={x.id} data-nav={x.id} onClick={() => go(x.id)} aria-current={x.id === cur?.id ? 'page' : undefined} className={cx('flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1', x.id === cur?.id ? 'text-brand-600' : 'text-ink-500')}>
              <Icon name={x.icon} className="h-5 w-5" /><span className="max-w-full truncate text-[10px] font-medium">{t(x.short)}</span>
            </button>
          ))}
          <button data-nav="more" onClick={() => setMore(true)} className={cx('flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1', rest.some((x) => x.id === cur?.id) ? 'text-brand-600' : 'text-ink-500')}>
            <Icon name="dots" className="h-5 w-5" /><span className="text-[10px] font-medium">{t('nav.more')}</span>
          </button>
        </nav>
      </div>

      {more && (
        <Modal size="sm" title={t('nav.more')} onClose={() => setMore(false)}>
          <div className="-mx-2 space-y-0.5">
            {rest.map((x) => <button key={x.id} data-nav={x.id} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-ink-50" onClick={() => go(x.id)}><Icon name={x.icon} className="h-5 w-5 text-ink-500" />{t(x.key)}</button>)}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
            <div className="flex gap-1.5"><button className={cx('chip', lang === 'th' && 'chip-on')} onClick={() => setLang('th')}>ไทย</button><button className={cx('chip', lang === 'en' && 'chip-on')} onClick={() => setLang('en')}>EN</button></div>
            <button className="btn-danger" onClick={logout}><Icon name="out" /> {t('auth.logout')}</button>
          </div>
          <div className="mt-2 text-xs text-ink-500">{user.username} · {t(`role.${user.role}` as Key)}</div>
        </Modal>
      )}
      {pending && <ConfirmDialog title={t('common.unsavedTitle')} message={t('common.unsavedMsg')} confirmLabel={t('common.discardLeave')} destructive onClose={() => setPending(null)} onConfirm={() => { setDirty(false); setTab(pending); setPending(null); }} />}
    </DirtyProvider>
  );
}

function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const { t, lang, setLang } = useI18n();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink-50 p-4">
      <div className="absolute right-4 top-4 flex gap-1.5"><button className={cx('chip', lang === 'th' && 'chip-on')} onClick={() => setLang('th')}>ไทย</button><button className={cx('chip', lang === 'en' && 'chip-on')} onClick={() => setLang('en')}>EN</button></div>
      <form className="card w-full max-w-sm space-y-4 p-6" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try { const r = await post('/auth/login', { username, password }); setToken(r.token); onLogin(r.user); }
        catch (x) { setErr((x as { code?: string }).code === 'BAD_CREDENTIALS' ? t('err.BAD_CREDENTIALS') : errMsg(x)); } finally { setBusy(false); }
      }}>
        <div className="flex items-center gap-3"><Coin className="h-10 w-10" /><div><h1 className="text-lg font-semibold text-ink-900">Sola</h1><p className="text-xs text-ink-500">{t('login.tagline')}</p></div></div>
        <Field label={t('login.username')}><input className="input" value={username} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" /></Field>
        <Field label={t('login.password')}><input className="input" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></Field>
        {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{err}</div>}
        <button className="btn-primary w-full" disabled={busy || !username || !password}>{t('login.submit')}</button>
      </form>
    </div>
  );
}

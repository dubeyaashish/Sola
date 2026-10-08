import { useEffect, useState } from 'react';
import { get, post, setToken, getToken } from './api';
import { useI18n } from './i18n';
import { Coin, Field, Icon, Modal, ToastProvider, baht, errMsg } from './ui';
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

interface Tab { id: string; key: Key; icon: string; perms: string[]; el: (p: { user: any; go: (id: string) => void }) => JSX.Element }
const TABS: Tab[] = [
  { id: 'dash', key: 'nav.dashboard', icon: 'home', perms: ['report.view'], el: Dashboard },
  { id: 'pos', key: 'nav.pos', icon: 'cart', perms: ['sale.create', 'buyback.create'], el: Pos },
  { id: 'tx', key: 'nav.transactions', icon: 'receipt', perms: ['sale.create', 'report.view'], el: Transactions },
  { id: 'stock', key: 'nav.stock', icon: 'box', perms: ['item.read'], el: Inventory },
  { id: 'cust', key: 'nav.customers', icon: 'users', perms: ['customer.read'], el: Customers },
  { id: 'pawn', key: 'nav.pawn', icon: 'vault', perms: ['pawn.manage'], el: Pawn },
  { id: 'sav', key: 'nav.savings', icon: 'piggy', perms: ['savings.manage'], el: Savings },
  { id: 'rates', key: 'nav.rates', icon: 'tag', perms: ['rate.read'], el: Rates },
  { id: 'rep', key: 'nav.reports', icon: 'chart', perms: ['report.view'], el: Reports },
  { id: 'set', key: 'nav.settings', icon: 'gear', perms: ['user.manage', 'audit.view'], el: Settings },
];

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return <div className="lang" role="group" aria-label="Language"><button className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>ไทย</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button></div>;
}

export function App() {
  return <ToastProvider><Root /></ToastProvider>;
}

function Root() {
  const { t, date } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('');
  const [more, setMore] = useState(false);
  const [rate, setRate] = useState<any>(null);
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({ name: 'Sola', logo: null });

  const allowed = (u: any) => TABS.filter((x) => x.perms.some((p) => u.permissions.includes(p)));
  const start = (u: any) => { setUser(u); setTab((allowed(u).find((x) => x.id === 'dash') ?? allowed(u).find((x) => x.id === 'pos') ?? allowed(u)[0])?.id ?? ''); };

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
  const go = (id: string) => { setTab(id); setMore(false); window.scrollTo(0, 0); };

  const tickerParts = rate ? (
    <>
      <span className="legend lbl">{t('rate.buySell')}</span> <span className="lbl">{t('rate.bar')}</span> <b>{baht(perBaht(rate.barBuyPerGram))}</b> / <b>{baht(perBaht(rate.barSellPerGram))}</b>
      <span className="lbl">· {t('rate.ornament')}</span> <b>{baht(perBaht(rate.buyPerGram))}</b> / <b>{baht(perBaht(rate.sellPerGram))}</b>
    </>
  ) : <b>{t('rate.none')}</b>;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">{brand.logo ? <img src={brand.logo} alt="" style={{ width: 38, height: 38, objectFit: 'contain', background: '#fff', borderRadius: 8 }} /> : <Coin />}<div><b title={brand.name}>{brand.name}</b><small>{t('app.tagline')}</small></div></div>
        {tabs.map((x) => <button key={x.id} className={`nav-item ${x.id === cur?.id ? 'active' : ''}`} onClick={() => go(x.id)} title={t(x.key)} aria-current={x.id === cur?.id ? 'page' : undefined}><Icon name={x.icon} /><span>{t(x.key)}</span></button>)}
        <div className="nav-sep" />
        <div className="side-foot"><div className="who">{user.username} · {t(`role.${user.role}` as Key)}</div><button className="nav-item" onClick={logout} title={t('auth.logout')}><Icon name="out" /><span>{t('auth.logout')}</span></button></div>
      </aside>
      <div className="col">
        <header className="topbar">
          <div className="title"><span className="t-page">{cur ? t(cur.key) : ''}</span><span className="t-date">{date(new Date().toISOString().slice(0, 10))}</span></div><div className="grow" />
          <div className={`ticker ${stale ? 'stale' : ''}`} title={t('rate.hint')}><span className="dot" />{tickerParts}</div>
          <LangSwitch />
        </header>
        <div className={`ticker-m ${stale ? 'stale' : ''}`}><span>{t('rate.bar')}</span>{rate ? <span><b>{baht(perBaht(rate.barBuyPerGram))}</b> / <b>{baht(perBaht(rate.barSellPerGram))}</b></span> : <b>{t('rate.none')}</b>}</div>
        <main>{Page && <Page user={user} go={go} />}</main>
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {main.map((x) => <button key={x.id} className={x.id === cur?.id ? 'active' : ''} onClick={() => go(x.id)}><Icon name={x.icon} /><span>{t(x.key)}</span></button>)}
        <button onClick={() => setMore(true)} className={rest.some((x) => x.id === cur?.id) ? 'active' : ''}><Icon name="more" /><span>{t('nav.more')}</span></button>
      </nav>
      {more && (
        <Modal title={t('nav.more')} onClose={() => setMore(false)}>
          <div style={{ display: 'grid', gap: 6 }}>
            {rest.map((x) => <button key={x.id} className="btn block" onClick={() => go(x.id)}><Icon name={x.icon} /> {t(x.key)}</button>)}
            <div className="row center" style={{ justifyContent: 'space-between', marginTop: 8 }}><LangSwitch /><button className="btn danger" onClick={logout}><Icon name="out" /> {t('auth.logout')}</button></div>
            <div className="muted small">{user.username} · {t(`role.${user.role}` as Key)}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const { t } = useI18n();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-wrap">
      <div className="login-art"><Coin /><h1>Sola</h1><p>{t('login.tagline')}</p></div>
      <div className="login-form">
        <form onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr('');
          try { const r = await post('/auth/login', { username, password }); setToken(r.token); onLogin(r.user); }
          catch (x) { setErr((x as { code?: string }).code === 'BAD_CREDENTIALS' ? t('err.BAD_CREDENTIALS') : errMsg(x)); } finally { setBusy(false); }
        }}>
          <LangSwitch />
          <h2>{t('login.title')}</h2>
          <Field label={t('login.username')}><input value={username} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" /></Field>
          <Field label={t('login.password')}><input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></Field>
          {err && <div className="alert err" role="alert">{err}</div>}
          <button className="btn primary block" disabled={busy || !username || !password}>{t('login.submit')}</button>
        </form>
      </div>
    </div>
  );
}

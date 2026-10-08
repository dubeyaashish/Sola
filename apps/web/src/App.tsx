import { useEffect, useState } from 'react';
import { api, get, post, setToken, getToken } from './api';
import { Field, errMsg } from './ui';
import { Pos } from './pages/Pos';
import { Rates } from './pages/Rates';
import { Inventory } from './pages/Inventory';
import { Customers } from './pages/Customers';
import { Pawn } from './pages/Pawn';
import { Savings } from './pages/Savings';
import { Reports } from './pages/Reports';

const TABS = [
  { id: 'pos', label: 'ซื้อ-ขาย-เปลี่ยน · POS', perm: 'sale.create', el: Pos },
  { id: 'rates', label: 'ราคาทอง · Rates', perm: 'rate.read', el: Rates },
  { id: 'stock', label: 'สต็อก · Stock', perm: 'item.read', el: Inventory },
  { id: 'customers', label: 'ลูกค้า · Customers', perm: 'customer.read', el: Customers },
  { id: 'pawn', label: 'ขายฝาก/จำนำ · Pawn', perm: 'pawn.manage', el: Pawn },
  { id: 'savings', label: 'ออมทอง · Savings', perm: 'savings.manage', el: Savings },
  { id: 'reports', label: 'รายงาน · Reports', perm: 'report.view', el: Reports },
] as const;

export function App() {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<string>('pos');

  useEffect(() => {
    if (!getToken()) return setReady(true);
    get('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (!user) return <Login onLogin={(u) => { setUser(u); setTab(TABS.find((t) => u.permissions.includes(t.perm))?.id ?? 'rates'); }} />;

  const tabs = TABS.filter((t) => user.permissions.includes(t.perm));
  const Page = (tabs.find((t) => t.id === tab) ?? tabs[0])?.el;
  return (
    <div className="shell">
      <nav>
        <h1>Sola <small>Gold POS</small></h1>
        {tabs.map((t) => <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        <div className="spacer" />
        <div className="muted">{user.username} · {user.role}</div>
        <button onClick={() => { setToken(null); location.reload(); }}>ออกจากระบบ · Logout</button>
      </nav>
      <main>{Page && <Page user={user} />}</main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  return (
    <form className="login" onSubmit={async (e) => {
      e.preventDefault();
      try { const r = await post('/auth/login', { username, password }); setToken(r.token); onLogin(r.user); } catch (x) { setErr(errMsg(x)); }
    }}>
      <h1>Sola</h1>
      <Field label="Username"><input value={username} onChange={(e) => setU(e.target.value)} autoFocus /></Field>
      <Field label="Password"><input type="password" value={password} onChange={(e) => setP(e.target.value)} /></Field>
      {err && <div className="banner err">{err}</div>}
      <button className="primary">เข้าสู่ระบบ · Sign in</button>
    </form>
  );
}
void api;

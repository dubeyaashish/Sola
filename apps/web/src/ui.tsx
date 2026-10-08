import { useState, type ReactNode } from 'react';
import { formatMoney, formatGrams, parseMoney, gramsToMg, PURITY_PRESETS } from '@sola/core';

export const baht = (m: number) => formatMoney(m);
export const grams = (mg: number) => formatGrams(mg);
export const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
export const toMinor = (s: string) => { try { return parseMoney(s); } catch { return NaN; } };
export const toMg = (s: string) => { try { return gramsToMg(s); } catch { return NaN; } };
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const today = () => new Date().toISOString().slice(0, 10);

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && <header><h3>{title}</h3><div>{right}</div></header>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function PuritySelect({ value, onChange }: { value: number; onChange: (bp: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {PURITY_PRESETS.map((p) => <option key={p.bp} value={p.bp}>{p.label}</option>)}
    </select>
  );
}

/** Runs an async action, surfacing success/error as a banner. */
export function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      if (okText) setMsg({ ok: true, text: typeof okText === 'function' ? okText(r) : okText });
      return r;
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }); }
    finally { setBusy(false); }
  };
  const banner = msg && <div className={msg.ok ? 'banner ok' : 'banner err'}>{msg.text}</div>;
  return { run, busy, banner };
}

export function CustomerPicker({ value, onChange, get }: { value: any; onChange: (c: any) => void; get: (p: string) => Promise<any> }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[]>([]);
  if (value) return <div className="row"><b>{value.name}</b><span className="muted">{value.memberNo ?? ''} · {value.pointsBalance} pts</span><button onClick={() => onChange(null)}>×</button></div>;
  return (
    <div>
      <input placeholder="ค้นหาลูกค้า (ชื่อ/เบอร์/บัตร) · customer" value={q} onChange={async (e) => { setQ(e.target.value); setList(e.target.value.length > 1 ? await get(`/customers?q=${encodeURIComponent(e.target.value)}`) : []); }} />
      {list.length > 0 && <ul className="pick">{list.map((c) => <li key={c.id} onClick={() => { onChange(c); setList([]); setQ(''); }}>{c.name} <span className="muted">{c.phone}</span></li>)}</ul>}
    </div>
  );
}

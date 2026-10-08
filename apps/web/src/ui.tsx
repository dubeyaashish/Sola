import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { formatMoney, formatGrams, parseMoney, gramsToMg, PURITY_PRESETS } from '@sola/core';
import { useI18n } from './i18n';
import type { Key } from './dict';

export const baht = (m: number) => formatMoney(m);
export const grams = (mg: number) => formatGrams(mg);
export const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
export const toMinor = (s: string) => { try { return parseMoney(s); } catch { return NaN; } };
export const toMg = (s: string) => { try { return gramsToMg(s); } catch { return NaN; } };
export const today = () => new Date().toISOString().slice(0, 10);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- icons (stroke, 24px) ---------- */
const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  cart: 'M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01',
  tag: 'M3 12V3h9l9 9-9 9-9-9zM7.5 7.5h.01',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10',
  users: 'M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-2a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8',
  vault: 'M4 4h16v16H4zM12 14a2 2 0 100-4 2 2 0 000 4zM12 8V6M12 18v-2M8 12H6M18 12h-2',
  piggy: 'M5 11a7 7 0 0112-4h3v4l-1.5 1.5V16h-3v-1.5h-5V16h-3v-2.5A7 7 0 015 11zM15 10h.01',
  chart: 'M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', out: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9', print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', check: 'M5 13l4 4L19 7', undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
};
export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] ?? P.box} /></svg>;
}
export function Coin() {
  return (
    <svg className="coin" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#c9a227" stroke="#f7edc9" strokeWidth="2" /><circle cx="20" cy="20" r="13.5" fill="none" stroke="#85650f" strokeWidth="1.2" />
      <text x="20" y="26" textAnchor="middle" fontSize="18" fontWeight="800" fill="#5a0c17" fontFamily="Sarabun,serif">S</text>
    </svg>
  );
}

/* ---------- primitives ---------- */
export function Card({ title, right, children, tone }: { title?: ReactNode; right?: ReactNode; children: ReactNode; tone?: 'gold' | 'red' }) {
  return (
    <section className={`card ${tone ?? ''}`}>
      {(title || right) && <div className="card-head"><h3>{title}</h3><div className="row center">{right}</div></div>}
      {children}
    </section>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' }) {
  return <div className={`stat ${tone ?? ''}`}><div className="k">{label}</div><div className="v">{value}</div>{sub && <div className="s">{sub}</div>}</div>;
}
export function Badge({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'gold' }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}
export function Empty({ icon = 'box', text }: { icon?: string; text: string }) {
  return <div className="empty"><Icon name={icon} /><div>{text}</div></div>;
}
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="page-head"><h2>{title}</h2><div className="row center">{children}</div></div>;
}

export function Modal({ title, onClose, children, foot, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><button className="btn ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, text, confirmLabel, danger, onConfirm, onClose }: { title: string; text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onClose} foot={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onClose(); onConfirm(); }}>{confirmLabel}</button></>}>
      <p>{text}</p>
    </Modal>
  );
}

/* ---------- toasts ---------- */
const ToastCtx = createContext<(text: string, ok?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  const push = useCallback((text: string, ok = true) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, ok }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), ok ? 3500 : 7000);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{items.map((i) => <div key={i.id} className={`toast ${i.ok ? '' : 'err'}`}>{i.text}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/** Runs an async action with a busy flag; success and errors surface as toasts. Server error codes are translated when we know them. */
export function useAction() {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      const code = (e as { code?: string }).code;
      const key = `err.${code}` as Key;
      const translated = code ? t(key) : '';
      toast(translated && translated !== key ? translated : errMsg(e), false);
    } finally { setBusy(false); }
  };
  return { run, busy };
}

export function PuritySelect({ value, onChange }: { value: number; onChange: (bp: number) => void }) {
  return <select value={value} onChange={(e) => onChange(Number(e.target.value))}>{PURITY_PRESETS.map((p) => <option key={p.bp} value={p.bp}>{p.label}</option>)}</select>;
}

export function CustomerPicker({ value, onChange, get }: { value: any; onChange: (c: any) => void; get: (p: string) => Promise<any> }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[]>([]);
  if (value) return <div className="chip" style={{ marginBottom: 10 }}><b>{value.name}</b><span className="muted small">{value.memberNo ?? ''} · {value.pointsBalance} {t('common.pts')}</span><button className="btn ghost icon-btn" onClick={() => onChange(null)} aria-label="Clear"><Icon name="x" /></button></div>;
  return (
    <div className="field">
      <span>{t('common.customer')}</span>
      <input placeholder={t('cust.search')} value={q} onChange={async (e) => { setQ(e.target.value); setList(e.target.value.length > 1 ? await get(`/customers?q=${encodeURIComponent(e.target.value)}`) : []); }} />
      {list.length > 0 && <ul className="pick">{list.map((c) => <li key={c.id} onClick={() => { onChange(c); setList([]); setQ(''); }}><b>{c.name}</b> <span className="muted small">{c.phone ?? ''} {c.memberNo ?? ''}</span></li>)}</ul>}
    </div>
  );
}

/** Enum value → translated label (falls back to the raw value). */
export function useLabel() {
  const { t } = useI18n();
  return (prefix: string, v: string) => { const k = `${prefix}.${v}` as Key; const s = t(k); return s === k ? v : s; };
}
export const toneOf = (s: string): 'ok' | 'warn' | 'bad' | 'gold' | undefined =>
  ({ IN_STOCK: 'ok', ACTIVE: 'ok', COMPLETED: 'ok', REDEEMED: 'ok', SENT: 'ok', SOLD: 'gold', PENDING: 'warn', RESERVED: 'warn', FORFEITED: 'warn', MISSING: 'bad', VOIDED: 'bad', CANCELLED: 'bad', FAILED: 'bad', CLOSED: undefined } as const)[s as 'IN_STOCK'];

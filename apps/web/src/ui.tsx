import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatMoney, formatGrams, parseMoney, gramsToMg, PURITY_PRESETS } from '@sola/core';
import { useI18n } from './i18n';
import type { Key } from './dict';

/* ---------- formatting ---------- */
export const baht = (m: number) => formatMoney(m);
export const grams = (mg: number) => formatGrams(mg);
export const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
export const toMinor = (s: string) => { try { return parseMoney(s); } catch { return NaN; } };
export const toMg = (s: string) => { try { return gramsToMg(s); } catch { return NaN; } };
export const today = () => new Date().toISOString().slice(0, 10);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Per-user view state (last tab, filters, panel state). Storage can be blocked, so every access is guarded. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const full = `sola.${key}`;
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(full); return s == null ? initial : (JSON.parse(s) as T); } catch { return initial; } });
  return [v, (n: T) => { setV(n); try { localStorage.setItem(full, JSON.stringify(n)); } catch { /* ignore */ } }];
}

/* ---------- icons: one outline set, stroke 1.75, currentColor ---------- */
const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', cart: 'M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01', tag: 'M3 12V3h9l9 9-9 9-9-9zM7.5 7.5h.01',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10', users: 'M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-2a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8',
  vault: 'M4 4h16v16H4zM12 14a2 2 0 100-4 2 2 0 000 4zM12 8V6M12 18v-2M8 12H6M18 12h-2', piggy: 'M5 11a7 7 0 0112-4h3v4l-1.5 1.5V16h-3v-1.5h-5V16h-3v-2.5A7 7 0 015 11zM15 10h.01',
  chart: 'M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9', receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', out: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9', print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', check: 'M5 13l4 4L19 7', undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', back: 'M15 18l-6-6 6-6', chev: 'M9 6l6 6-6 6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z', globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9h.01', minus: 'M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4', download: 'M12 4v12M7 11l5 5 5-5M5 20h14', panel: 'M3 4h18v16H3zM15 4v16',
};
export function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return <svg className={cx('flex-none', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] ?? P.box} /></svg>;
}
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={cx('inline-block animate-spin rounded-full border-2 border-ink-200 border-r-transparent align-[-2px]', className)} role="status" aria-label="Loading" />;
}
export function Coin({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#c9a227" /><circle cx="20" cy="20" r="13.5" fill="none" stroke="#85650f" strokeWidth="1.2" />
      <text x="20" y="26" textAnchor="middle" fontSize="17" fontWeight="700" fill="#5a0c17" fontFamily="IBM Plex Sans,sans-serif">S</text></svg>
  );
}

/* ---------- avatar: initials, colour derived from the name ---------- */
const AVATAR_COLORS = ['#b3202f', '#a98418', '#8a4b2a', '#2f7d5b', '#7a3b69', '#c2571a', '#5b6b3a', '#9b2c5b'];
export function Avatar({ name, size = 40, badge }: { name: string; size?: number; badge?: ReactNode }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  return (
    <span className="relative inline-flex flex-none" style={{ width: size, height: size }}>
      <span className="inline-flex h-full w-full items-center justify-center rounded-full font-medium text-white" style={{ background: AVATAR_COLORS[h % AVATAR_COLORS.length], fontSize: size * 0.36 }} aria-hidden="true">{initials}</span>
      {badge && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-white">{badge}</span>}
    </span>
  );
}
export function IconTile({ icon, tone = 'neutral' }: { icon: string; tone?: 'neutral' | 'brand' | 'gold' }) {
  const t = { neutral: 'bg-ink-100 text-ink-500', brand: 'bg-brand-50 text-brand-600', gold: 'bg-gold-100 text-gold-700' }[tone];
  return <span className={cx('flex h-10 w-10 flex-none items-center justify-center rounded-full', t)}><Icon name={icon} className="h-5 w-5" /></span>;
}

/* ---------- status pill: soft tint + darker text, always with text ---------- */
export type Tone = 'ok' | 'warn' | 'bad' | 'gold' | 'info' | 'neutral';
const TONES: Record<Tone, string> = { ok: 'bg-emerald-50 text-emerald-700', warn: 'bg-amber-50 text-amber-700', bad: 'bg-red-50 text-red-700', gold: 'bg-gold-100 text-gold-700', info: 'bg-brand-50 text-brand-700', neutral: 'bg-ink-100 text-ink-500' };
export function StatusPill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) { return <span className={cx('pill', TONES[tone])}>{children}</span>; }
export const toneOf = (s: string): Tone =>
  ({ IN_STOCK: 'ok', ACTIVE: 'ok', COMPLETED: 'ok', REDEEMED: 'ok', SENT: 'ok', ISSUED: 'ok', SOLD: 'gold', PENDING: 'warn', RESERVED: 'warn', FORFEITED: 'warn', MISSING: 'bad', VOIDED: 'bad', CANCELLED: 'bad', FAILED: 'bad' } as Record<string, Tone>)[s] ?? 'neutral';

/* ---------- form pieces ---------- */
export function Field({ label, required, hint, error, children, className }: { label: string; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}{required && <span className="ml-0.5 text-red-600">*</span>}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-ink-200')}>
      <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}
export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => { if (local === value) return; const id = setTimeout(() => onChange(local), 250); return () => clearTimeout(id); }, [local]);
  return (
    <div className={cx('relative', className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
      <input className="input pl-9" value={local} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setLocal(e.target.value)} />
    </div>
  );
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-5 overflow-x-auto border-b border-ink-100">
      {tabs.map((x) => (
        <button key={x.id} role="tab" aria-selected={x.id === value} onClick={() => onChange(x.id)} className={cx('tab', x.id === value && 'tab-active')}>
          {x.label}
          {x.count !== undefined && <span className={cx('rounded-full px-1.5 text-[11px] font-medium leading-4', x.id === value ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>{x.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- states ---------- */
export function Empty({ icon = 'box', title, text, action }: { icon?: string; title?: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"><Icon name={icon} className="h-6 w-6" /></span>
      {title && <div className="font-medium text-ink-900">{title}</div>}
      {text && <div className="mt-0.5 max-w-xs text-ink-500">{text}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
export function Loading() {
  const { t } = useI18n();
  return <div className="flex items-center justify-center gap-2 py-10 text-ink-500"><Spinner /> {t('common.loading')}</div>;
}
export function ErrorNote({ message, details }: { message: ReactNode; details?: string[] }) {
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
      <Icon name="alert" className="mt-0.5 h-4 w-4" />
      <div><div>{message}</div>{details && <ul className="mt-1 list-disc pl-4 text-xs">{details.map((d) => <li key={d}>{d}</li>)}</ul>}</div>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"><Icon name="alert" className="mt-0.5 h-4 w-4" /><div>{children}</div></div>;
}

/* ---------- modal / confirm ---------- */
type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full';
const WIDTH: Record<Size, string> = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-none sm:h-full' };
export function Modal({ title, onClose, children, footer, size = 'md' }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: Size }) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = panel.current!;
    (el.querySelector<HTMLElement>('[data-autofocus],input,select,textarea') ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
        if (!f.length) return; const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  const big = size === 'lg' || size === 'xl' || size === 'full';
  return (
    <div className={cx('fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 sm:items-center', big ? 'p-0 lg:p-4' : 'p-0 sm:p-4')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" className={cx('flex w-full flex-col bg-white shadow-2xl outline-none', WIDTH[size], big ? 'h-[100dvh] max-h-none lg:h-auto lg:max-h-[92dvh] lg:rounded-2xl' : 'max-h-[92dvh] rounded-t-2xl sm:rounded-2xl', size === 'full' && 'lg:h-full lg:max-h-full')}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 className="text-base font-semibold text-ink-900">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
export function ConfirmDialog({ title, message, confirmLabel, destructive, reasonLabel, onConfirm, onClose }: { title?: string; message: string; confirmLabel: string; destructive?: boolean; reasonLabel?: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const blocked = !!reasonLabel && !reason.trim();
  return (
    <Modal size="sm" title={title ?? t('common.confirm')} onClose={onClose}
      footer={<><button className="btn-outline" onClick={onClose}>{t('common.cancel')}</button><button className={destructive ? 'btn-danger-solid' : 'btn-primary'} disabled={blocked} onClick={() => { onClose(); onConfirm(reason.trim()); }}>{confirmLabel}</button></>}>
      <p>{message}</p>
      {reasonLabel && <Field label={reasonLabel} required className="mt-3"><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus /></Field>}
    </Modal>
  );
}

/* ---------- dropdown menu ---------- */
export interface MenuItem { label: string; icon?: string; onClick: () => void; danger?: boolean; hidden?: boolean; active?: boolean }
export function Menu({ items, button, label, align = 'right', up }: { items: MenuItem[]; button?: ReactNode; label: string; align?: 'left' | 'right'; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const shown = items.filter((i) => !i.hidden);
  if (!shown.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button className={button ? 'rounded-full' : 'icon-btn'} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{button ?? <Icon name="dots" className="h-5 w-5" />}</button>
      {open && (
        <div role="menu" className={cx('absolute z-40 w-56 rounded-xl border border-ink-100 bg-white py-1 shadow-xl', align === 'right' ? 'right-0' : 'left-0', up ? 'bottom-full mb-2' : 'top-full mt-1')}>
          {shown.map((i) => (
            <button key={i.label} role="menuitem" onClick={() => { setOpen(false); i.onClick(); }} className={cx('flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-ink-50', i.danger ? 'text-red-600' : 'text-ink-700', i.active && 'font-semibold')}>
              {i.icon ? <Icon name={i.icon} className="h-4 w-4" /> : <span className="w-4" />}{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- toast: one at a time, top centre ---------- */
const ToastCtx = createContext<(text: string, ok?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ text: string; ok: boolean; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const push = useCallback((text: string, ok = true) => {
    clearTimeout(timer.current);
    const id = Date.now(); setT({ text, ok, id });
    timer.current = setTimeout(() => setT((c) => (c?.id === id ? null : c)), ok ? 3000 : 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-4" role="status" aria-live="polite">
        {t && <div className={cx('pointer-events-auto flex max-w-md items-center gap-2 rounded-full px-4 py-2 text-sm text-white shadow-xl', t.ok ? 'bg-ink-900' : 'bg-red-600')}><Icon name={t.ok ? 'check' : 'alert'} />{t.text}</div>}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Runs an async action with a busy flag; success and errors surface as toasts, server error codes are translated. */
export function useAction() {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return r; }
    catch (e) {
      const code = (e as { code?: string }).code;
      const key = `err.${code}` as Key; const tr = code ? t(key) : '';
      toast(tr && tr !== key ? tr : errMsg(e), false);
    } finally { setBusy(false); }
  };
  return { run, busy };
}

/** Unsaved-change guard: forms report dirtiness, navigation asks first. */
const DirtyCtx = createContext<{ dirty: boolean; setDirty: (d: boolean) => void }>({ dirty: false, setDirty: () => {} });
export const DirtyProvider = DirtyCtx.Provider;
export function useDirtyGuard(dirty: boolean) {
  const { setDirty } = useContext(DirtyCtx);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty]);
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);
}

/* ---------- domain pickers ---------- */
export function PuritySelect({ value, onChange }: { value: number; onChange: (bp: number) => void }) {
  return <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>{PURITY_PRESETS.map((p) => <option key={p.bp} value={p.bp}>{p.label}</option>)}</select>;
}
export function CustomerPicker({ value, onChange, get, required }: { value: any; onChange: (c: any) => void; get: (p: string) => Promise<any>; required?: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[]>([]);
  if (value) return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2">
      <Avatar name={value.name} size={32} />
      <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink-900">{value.name}</div><div className="text-xs text-ink-500">{value.memberNo ?? '—'} · {value.pointsBalance} {t('common.pts')}</div></div>
      <button className="icon-btn" onClick={() => onChange(null)} aria-label={t('common.remove')}><Icon name="x" /></button>
    </div>
  );
  return (
    <div className="relative">
      <Field label={t('common.customer')} required={required}>
        <SearchBox value={q} placeholder={t('cust.search')} onChange={async (v) => { setQ(v); setList(v.length > 1 ? await get(`/customers?q=${encodeURIComponent(v)}`) : []); }} />
      </Field>
      {list.length > 0 && <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-ink-100 bg-white py-1 shadow-xl">{list.map((c) => (
        <li key={c.id}><button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-50" onClick={() => { onChange(c); setList([]); setQ(''); }}><Avatar name={c.name} size={28} /><span className="font-medium text-ink-900">{c.name}</span><span className="text-xs text-ink-500">{c.phone ?? ''} {c.memberNo ?? ''}</span></button></li>))}</ul>}
    </div>
  );
}
/** Enum value → translated label (falls back to the raw value). */
export function useLabel() {
  const { t } = useI18n();
  return (prefix: string, v: string) => { const k = `${prefix}.${v}` as Key; const s = t(k); return s === k ? v : s; };
}

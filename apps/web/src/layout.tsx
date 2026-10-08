import { createContext, useContext, type ReactNode } from 'react';
import { useI18n } from './i18n';
import { Avatar, Icon, Menu, Tabs, cx, usePersisted, type MenuItem } from './ui';

/* ---------- full-width pages (dashboard, rates, reports) ---------- */
export function PageScroll({ title, actions, children, wide }: { title: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={cx('mx-auto space-y-5 p-4 lg:p-6', wide ? 'max-w-7xl' : 'max-w-6xl')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
export function SectionCard({ title, desc, right, children, flush }: { title?: ReactNode; desc?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-4 lg:px-5">
          <div><h2 className="text-base font-semibold text-ink-900">{title}</h2>{desc && <p className="mt-0.5 text-xs text-ink-500">{desc}</p>}</div>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      )}
      <div className={flush ? '' : 'px-4 pb-4 pt-3 lg:px-5'}>{children}</div>
    </section>
  );
}
/** Settings row card line: title + one-line description left, control right. */
export function SettingRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-ink-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 lg:px-5">
      <div className="min-w-0"><div className="font-medium text-ink-900">{title}</div>{desc && <div className="text-xs text-ink-500">{desc}</div>}</div>
      <div className="w-full flex-none sm:w-56">{children}</div>
    </div>
  );
}
export function KV({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return <div className={cx('kv', strong && 'border-t border-ink-100 pt-2 text-base font-semibold text-ink-900')}><span className={strong ? '' : 'text-ink-500'}>{k}</span><span className="tabular-nums">{v}</span></div>;
}

/* ---------- list + detail (+ right panel) ---------- */
const PanelCtx = createContext<{ open: boolean; toggle: () => void }>({ open: true, toggle: () => {} });

export function ListHeader({ title, onAdd, addLabel, children }: { title: string; onAdd?: () => void; addLabel?: string; children?: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-ink-100 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
        {onAdd && <button className="btn-primary h-8 w-8 !p-0" onClick={onAdd} aria-label={addLabel ?? title} title={addLabel}><Icon name="plus" /></button>}
      </div>
      {children}
    </div>
  );
}
export function ChipRow({ chips, value, onChange }: { chips: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return <div className="flex gap-1.5 overflow-x-auto">{chips.map((c) => <button key={c.id} className={cx('chip', c.id === value && 'chip-on')} aria-pressed={c.id === value} onClick={() => onChange(c.id)}>{c.label}</button>)}</div>;
}
export function ListRow({ selected, onClick, lead, title, sub, meta, metaSub }: { selected?: boolean; onClick: () => void; lead: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode; metaSub?: ReactNode }) {
  return (
    <button onClick={onClick} className={cx('row-item', selected && 'row-item-on')} aria-current={selected ? 'true' : undefined}>
      {lead}
      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink-900">{title}</span>{sub && <span className="block truncate text-xs text-ink-500">{sub}</span>}</span>
      {(meta || metaSub) && <span className="flex flex-none flex-col items-end gap-0.5 text-right"><span className="font-medium tabular-nums text-ink-900">{meta}</span>{metaSub && <span className="text-xs text-ink-500">{metaSub}</span>}</span>}
    </button>
  );
}

export function MasterDetail({ list, detail, empty, right, onBack, panelKey }: { list: ReactNode; detail: ReactNode | null; empty?: ReactNode; right?: ReactNode; onBack: () => void; panelKey: string }) {
  const [open, setOpen] = usePersisted(`panel.${panelKey}`, true);
  const has = detail !== null;
  return (
    <PanelCtx.Provider value={{ open, toggle: () => setOpen(!open) }}>
      <div className="flex h-full min-h-0">
        <aside className={cx('min-h-0 w-full flex-col border-r border-ink-100 bg-white lg:flex lg:w-[340px] lg:flex-none xl:w-[360px]', has ? 'hidden' : 'flex')}>{list}</aside>
        <div className={cx('min-w-0 flex-1 flex-col', has ? 'flex' : 'hidden lg:flex')}>
          {has ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-visible">
              <div className="min-w-0 flex-1 xl:overflow-y-auto">
                <button className="m-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={onBack}><Icon name="back" /> <BackLabel /></button>
                {detail}
              </div>
              {right && <div className={cx('border-t border-ink-100 bg-white xl:w-80 xl:flex-none xl:overflow-y-auto xl:border-l xl:border-t-0', !open && 'xl:hidden')}>{right}</div>}
            </div>
          ) : (empty ?? <div className="m-auto text-ink-500"><Icon name="panel" className="mx-auto mb-2 h-8 w-8" /></div>)}
        </div>
      </div>
    </PanelCtx.Provider>
  );
}
const BackLabel = () => { const { t } = useI18n(); return <span>{t('common.back')}</span>; };

export interface Action { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean }
export function DetailHeader({ title, subtitle, pill, avatar, primary, secondary = [], overflow = [], tabs, tab, onTab }: {
  title: ReactNode; subtitle?: ReactNode; pill?: ReactNode; avatar?: string; primary?: ReactNode; secondary?: Action[]; overflow?: MenuItem[];
  tabs?: { id: string; label: string; count?: number }[]; tab?: string; onTab?: (id: any) => void;
}) {
  const { t } = useI18n();
  const panel = useContext(PanelCtx);
  const asMenu = (a: Action): MenuItem => ({ label: a.label, icon: a.icon, onClick: a.onClick, danger: a.danger });
  return (
    <div className="border-b border-ink-100 bg-white px-4 pt-4 lg:px-6">
      <div className="flex items-start gap-3 pb-3">
        {avatar && <Avatar name={avatar} size={48} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-semibold text-ink-900">{title}</h2>{pill}</div>
          {subtitle && <div className="mt-0.5 text-ink-500">{subtitle}</div>}
        </div>
        <div className="flex flex-none items-center gap-2">
          {primary}
          {secondary.map((a) => <button key={a.label} className={cx('hidden lg:inline-flex', a.danger ? 'btn-danger' : 'btn-outline')} disabled={a.disabled} onClick={a.onClick}>{a.icon && <Icon name={a.icon} />}{a.label}</button>)}
          <span className="lg:hidden"><Menu label={t('common.more')} items={[...secondary.map(asMenu), ...overflow]} /></span>
          <span className="hidden lg:block"><Menu label={t('common.more')} items={overflow} /></span>
          <button className="icon-btn hidden xl:inline-flex" onClick={panel.toggle} aria-label={t('common.togglePanel')} title={t('common.togglePanel')}><Icon name="panel" /></button>
        </div>
      </div>
      {tabs && <Tabs tabs={tabs as never} value={tab as never} onChange={onTab as never} />}
    </div>
  );
}
export const DetailBody = ({ children }: { children: ReactNode }) => <div className="space-y-4 p-4 lg:p-6">{children}</div>;
export const RightPanel = ({ children }: { children: ReactNode }) => <div className="space-y-5 p-4 lg:p-5">{children}</div>;
export const PanelTitle = ({ children }: { children: ReactNode }) => <h3 className="mb-2 text-xs font-medium text-ink-500">{children}</h3>;

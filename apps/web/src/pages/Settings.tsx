import { useEffect, useMemo, useRef, useState } from 'react';
import { del, get, post, put } from '../api';
import { useI18n } from '../i18n';
import { SectionCard, SettingRow } from '../layout';
import { Avatar, Empty, Field, Icon, Modal, Notice, StatusPill, Toggle, cx, errMsg, useAction, useDirtyGuard, useLabel, usePersisted } from '../ui';

type Sec = 'company' | 'rules' | 'users' | 'audit';

export function Settings({ user }: { user: any }) {
  const { t } = useI18n();
  const can = (p: string) => user.permissions.includes(p);
  const groups: { title: string; items: { id: Sec; label: string; icon: string }[] }[] = [
    { title: t('settings.groupShop'), items: can('user.manage') ? [{ id: 'company' as Sec, label: t('settings.company'), icon: 'home' }, { id: 'rules' as Sec, label: t('settings.rules'), icon: 'tag' }] : [] },
    { title: t('settings.groupAccess'), items: [...(can('user.manage') ? [{ id: 'users' as Sec, label: t('settings.users'), icon: 'users' }] : []), ...(can('audit.view') ? [{ id: 'audit' as Sec, label: t('settings.audit'), icon: 'receipt' }] : [])] },
  ].filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  const [stored, setSec] = usePersisted<Sec>('settings.sec', all[0]?.id ?? 'audit');
  const sec = all.some((x) => x.id === stored) ? stored : all[0]!.id;
  const [drill, setDrill] = useState(false); // phones: menu list → page

  return (
    <div className="flex h-full min-h-0">
      <aside className={cx('w-full flex-none overflow-y-auto border-r border-ink-100 bg-white p-3 lg:block lg:w-60', drill ? 'hidden' : 'block')}>
        <h1 className="px-2 pb-2 pt-1 text-lg font-semibold text-ink-900">{t('nav.settings')}</h1>
        {groups.map((g) => (
          <div key={g.title} className="mb-3">
            <div className="px-2 pb-1 text-xs font-medium text-ink-500">{g.title}</div>
            {g.items.map((it) => (
              <button key={it.id} onClick={() => { setSec(it.id); setDrill(true); }} aria-current={sec === it.id ? 'page' : undefined}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left', sec === it.id ? 'bg-brand-50 font-medium text-brand-600' : 'text-ink-700 hover:bg-ink-50')}>
                <Icon name={it.icon} className="h-4 w-4" />{it.label}<Icon name="chev" className="ml-auto h-4 w-4 text-ink-300 lg:hidden" />
              </button>))}
          </div>))}
      </aside>
      <section className={cx('min-w-0 flex-1 overflow-y-auto lg:block', drill ? 'block' : 'hidden')}>
        <button className="m-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={() => setDrill(false)}><Icon name="back" /> {t('nav.settings')}</button>
        <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
          {sec === 'company' && <CompanyTab />}
          {sec === 'rules' && <RulesTab />}
          {sec === 'users' && <UsersTab me={user} />}
          {sec === 'audit' && <AuditTab />}
        </div>
      </section>
    </div>
  );
}

/** Reads an image file, scales it to fit 600 px and re-encodes it so it stays well under the 400 KB server limit. */
async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('PNG / JPEG / WebP');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Cannot read image')); i.src = url; });
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d')!;
    const png = () => { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/png'); };
    const jpg = (q: number) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
    const size = (d: string) => (d.length * 3) / 4;
    let out = file.type === 'image/jpeg' ? jpg(0.9) : png();
    if (size(out) > 380 * 1024) out = jpg(0.85);
    if (size(out) > 380 * 1024) out = jpg(0.7);
    return out;
  } finally { URL.revokeObjectURL(url); }
}

function CompanyTab() {
  const { t, lang } = useI18n();
  const { run, busy } = useAction();
  const [f, setF] = useState<any>(null);
  const [base, setBase] = useState('');
  const [provs, setProvs] = useState<any[]>([]);
  const [dists, setDists] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const apply = (c: any) => { setF(c); setBase(JSON.stringify(c)); };
  useEffect(() => {
    get('/settings/company').then((c) => { apply(c); if (c.provinceId) get(`/geo/provinces/${c.provinceId}/districts`).then(setDists); if (c.districtId) get(`/geo/districts/${c.districtId}/subdistricts`).then(setSubs); });
    get('/geo/provinces').then(setProvs);
    get('/settings/logo').then((l) => setLogo(l.dataUrl));
  }, []);
  const dirty = !!f && JSON.stringify(f) !== base;
  useDirtyGuard(dirty);
  if (!f) return null;

  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const nm = (x: any) => (lang === 'th' ? x.th : x.en);
  const pickProvince = async (id: number) => { setF({ ...f, provinceId: id || null, districtId: null, subDistrictId: null, postcode: '' }); setDists(id ? await get(`/geo/provinces/${id}/districts`) : []); setSubs([]); };
  const pickDistrict = async (id: number) => { setF({ ...f, districtId: id || null, subDistrictId: null, postcode: '' }); setSubs(id ? await get(`/geo/districts/${id}/subdistricts`) : []); };
  const pickSub = (id: number) => { const s = subs.find((x) => x.id === id); setF({ ...f, subDistrictId: id || null, postcode: s?.zip ?? '' }); };
  const idBad = f.taxId && !/^\d{13}$/.test(f.taxId);
  const ready = f.name && f.addressLine && f.provinceId && f.districtId && f.subDistrictId && /^\d{5}$/.test(f.postcode) && !idBad && /^\d{5}$/.test(f.branch || '00000');
  const area = (list: any[], id: number | null) => { const x = list.find((i) => i.id === id); return x ? nm(x) : ''; };
  const preview = [f.addressLine, area(subs, f.subDistrictId), area(dists, f.districtId), area(provs, f.provinceId), f.postcode].filter(Boolean).join(lang === 'th' ? ' ' : ', ');

  const save = () => run(() => put('/settings/company', { name: f.name, nameEn: f.nameEn, taxId: f.taxId, branch: f.branch || '00000', phone: f.phone, email: f.email, addressLine: f.addressLine, provinceId: f.provinceId, districtId: f.districtId, subDistrictId: f.subDistrictId, postcode: f.postcode }), t('common.saved'))
    .then((r) => { if (r) { apply(r); window.dispatchEvent(new Event('sola:brand')); } });
  const pickFile = async (fl?: File) => { if (!fl) return; try { setNewLogo(await prepareLogo(fl)); } catch (e) { run(async () => { throw e instanceof Error ? e : new Error(errMsg(e)); }); } };

  return (
    <>
      <SectionCard title={t('settings.companyInfo')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('settings.nameTh')} required><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('settings.nameEn')}><input className="input" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
          <Field label={t('settings.taxId')} error={idBad ? t('cust.id13') : undefined}><input className={cx('input', idBad && 'input-error')} inputMode="numeric" maxLength={13} value={f.taxId} onChange={(e) => set('taxId', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label={t('settings.branch')} hint={t('settings.branchHint')}><input className="input" inputMode="numeric" maxLength={5} value={f.branch} onChange={(e) => set('branch', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label={t('common.phone')}><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
      </SectionCard>

      <SectionCard title={t('settings.address')} desc={t('settings.addressHint')}>
        <div className="space-y-3">
          <Field label={t('settings.addressLine')} required><input className="input" value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} placeholder={t('settings.addressLineHint')} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('settings.province')} required><select className="input" value={f.provinceId ?? ''} onChange={(e) => pickProvince(Number(e.target.value))}><option value="">{t('settings.choose')}</option>{provs.map((p) => <option key={p.id} value={p.id}>{nm(p)}</option>)}</select></Field>
            <Field label={t('settings.district')} required><select className="input" value={f.districtId ?? ''} disabled={!dists.length} onChange={(e) => pickDistrict(Number(e.target.value))}><option value="">{t('settings.choose')}</option>{dists.map((d) => <option key={d.id} value={d.id}>{nm(d)}</option>)}</select></Field>
            <Field label={t('settings.subDistrict')} required><select className="input" value={f.subDistrictId ?? ''} disabled={!subs.length} onChange={(e) => pickSub(Number(e.target.value))}><option value="">{t('settings.choose')}</option>{subs.map((s) => <option key={s.id} value={s.id}>{nm(s)}{s.zip ? ` · ${s.zip}` : ''}</option>)}</select></Field>
            <Field label={t('settings.postcode')} required><input className="input" inputMode="numeric" maxLength={5} value={f.postcode} onChange={(e) => set('postcode', e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
          {preview && <div className="rounded-lg bg-ink-50 px-3 py-2"><div className="text-xs text-ink-500">{t('settings.preview')}</div><div className="text-ink-900">{preview}</div></div>}
        </div>
      </SectionCard>

      <SectionCard title={t('settings.logo')} desc={t('settings.logoHint')}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-28 w-44 items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50 p-2">
            {newLogo || logo ? <img src={newLogo ?? logo!} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-ink-500"><Icon name="image" className="mx-auto h-6 w-6" /><span className="text-xs">{t('settings.noLogo')}</span></span>}
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => file.current?.click()}><Icon name="plus" /> {t('settings.chooseFile')}</button>
            {newLogo && <button className="btn-primary" disabled={busy} onClick={() => run(() => put('/settings/logo', { dataUrl: newLogo }), t('common.saved')).then((r) => { if (r) { setLogo(newLogo); setNewLogo(null); window.dispatchEvent(new Event('sola:brand')); } })}>{t('settings.useLogo')}</button>}
            {newLogo && <button className="btn-ghost" onClick={() => setNewLogo(null)}>{t('common.cancel')}</button>}
            {!newLogo && logo && <button className="btn-danger" disabled={busy} onClick={() => run(() => del('/settings/logo'), t('common.saved')).then((r) => { if (r) { setLogo(null); window.dispatchEvent(new Event('sola:brand')); } })}>{t('common.remove')}</button>}
          </div>
        </div>
      </SectionCard>

      {dirty && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-ink-100 bg-white px-4 py-3 shadow-card lg:-mx-6 lg:px-6">
          <span className="text-ink-500">{t('common.unsaved')}</span>
          <div className="flex gap-2"><button className="btn-outline" onClick={() => setF(JSON.parse(base))}>{t('common.discard')}</button><button className="btn-primary" disabled={busy || !ready} onClick={save}>{t('common.saveChanges')}</button></div>
        </div>)}
    </>
  );
}

/** Text input that saves on blur (only when the value changed). */
function BlurInput({ value, onCommit, suffix, inputMode = 'decimal' }: { value: string; onCommit: (v: string) => void; suffix?: string; inputMode?: 'decimal' | 'numeric' }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="relative">
      <input className={cx('input text-right tabular-nums', suffix && 'pr-12')} inputMode={inputMode} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">{suffix}</span>}
    </div>
  );
}

function RulesTab() {
  const { t } = useI18n();
  const { run } = useAction();
  const [s, setS] = useState<Record<string, string> | null>(null);
  useEffect(() => { get('/settings').then(setS); }, []);
  if (!s) return null;
  const apply = (patch: Record<string, string | number>) => run(() => put('/settings', patch), t('common.saved')).then((r) => r && setS(r));
  const pct100 = (key: string) => String(Number(s[key] ?? 0) / 100);
  const toBp = (v: string) => Math.round(Number(v) * 100);
  const intField = (key: string) => <BlurInput inputMode="numeric" value={s[key] ?? ''} onCommit={(v) => Number.isInteger(Number(v)) && Number(v) >= 0 && apply({ [key]: Number(v) })} />;
  return (
    <>
      <SectionCard title={t('settings.tax')} flush>
        <SettingRow title={t('settings.taxMode')} desc={t('settings.taxModeDesc')}>
          <select className="input" value={s.tax_mode} onChange={(e) => apply({ tax_mode: e.target.value })}>{['NONE', 'MAKING_ONLY', 'FULL'].map((m) => <option key={m} value={m}>{t(`settings.taxMode.${m}` as any)}</option>)}</select>
        </SettingRow>
        <SettingRow title={t('settings.taxRate')} desc={t('settings.taxRateDesc')}><BlurInput suffix="%" value={pct100('tax_rate_bp')} onCommit={(v) => apply({ tax_rate_bp: toBp(v) })} /></SettingRow>
        <div className="px-4 pb-4 lg:px-5"><Notice>{t('settings.legalNote')}</Notice></div>
      </SectionCard>
      <SectionCard title={t('settings.pawnRules')} flush>
        <SettingRow title={t('settings.pawnMax')} desc={t('settings.pawnMaxDesc')}><BlurInput suffix="%" value={pct100('pawn_max_rate_bp_per_month')} onCommit={(v) => apply({ pawn_max_rate_bp_per_month: toBp(v) })} /></SettingRow>
        <SettingRow title={t('settings.pawnTerm')} desc={t('settings.pawnTermDesc')}>{intField('pawn_default_term_days')}</SettingRow>
        <SettingRow title={t('settings.pawnGrace')} desc={t('settings.pawnGraceDesc')}>{intField('pawn_grace_days')}</SettingRow>
        <SettingRow title={t('settings.pawnMinDays')} desc={t('settings.pawnMinDaysDesc')}>{intField('pawn_min_interest_days')}</SettingRow>
      </SectionCard>
      <SectionCard title={t('settings.loyalty')} flush>
        <SettingRow title={t('settings.bahtPerPoint')} desc={t('settings.bahtPerPointDesc')}><BlurInput value={String(Number(s.points_minor_per_point ?? 0) / 100)} onCommit={(v) => apply({ points_minor_per_point: toBp(v) })} /></SettingRow>
      </SectionCard>
    </>
  );
}

function UsersTab({ me }: { me: any }) {
  const { t } = useI18n();
  const label = useLabel();
  const { run, busy } = useAction();
  const [list, setList] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ username: '', fullName: '', password: '', role: 'CASHIER' });
  const load = () => get('/users').then(setList);
  useEffect(() => { load(); }, []);
  const toggle = (u: any, v: boolean) => { setList(list.map((x) => (x.id === u.id ? { ...x, active: v ? 1 : 0 } : x))); run(() => post(`/users/${u.id}/active`, { active: v }), t('common.saved')).then((r) => { if (!r) load(); }); };
  return (
    <SectionCard title={t('settings.users')} right={<button className="btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> {t('settings.addUser')}</button>} flush>
      {list.map((u) => (
        <div key={u.id} className="flex items-center gap-3 border-t border-ink-100 px-4 py-3 lg:px-5">
          <Avatar name={u.fullName} />
          <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink-900">{u.fullName}</div><div className="text-xs text-ink-500">{u.username} · {label('role', u.role)}</div></div>
          {u.id === me.id ? <StatusPill tone="ok">{t('common.you')}</StatusPill> : <><StatusPill tone={u.active ? 'ok' : 'neutral'}>{u.active ? t('common.active') : t('common.disabled')}</StatusPill><Toggle checked={!!u.active} onChange={(v) => toggle(u, v)} label={`${t('common.active')}: ${u.username}`} /></>}
        </div>))}
      {adding && (
        <Modal size="sm" title={t('settings.addUser')} onClose={() => setAdding(false)} footer={<><button className="btn-outline" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || f.username.length < 3 || f.password.length < 8 || !f.fullName} onClick={() => run(() => post('/users', f), t('common.saved')).then((r) => { if (r) { setAdding(false); setF({ username: '', fullName: '', password: '', role: 'CASHIER' }); load(); } })}>{t('common.save')}</button></>}>
          <div className="space-y-3">
            <Field label={t('login.username')} required><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="off" data-autofocus /></Field>
            <Field label={t('common.name')} required><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
            <Field label={t('login.password')} required hint={t('settings.pwHint')}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label={t('settings.role')}><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['MANAGER', 'CASHIER', 'STOCK_CLERK'].map((r) => <option key={r} value={r}>{label('role', r)}</option>)}</select></Field>
          </div>
        </Modal>)}
    </SectionCard>
  );
}

function AuditTab() {
  const { t, date } = useI18n();
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { get('/audit').then(setList); }, []);
  const rows = useMemo(() => list, [list]);
  return (
    <SectionCard title={t('settings.audit')} flush>
      {rows.length === 0 ? <Empty icon="receipt" text={t('common.empty')} /> : (
        <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-ink-100"><th className="th">{t('common.time')}</th><th className="th">{t('common.user')}</th><th className="th">{t('settings.action')}</th><th className="th">{t('settings.entity')}</th></tr></thead>
          <tbody className="divide-y divide-ink-100">{rows.map((a) => <tr key={a.id} className="h-11 hover:bg-ink-50"><td className="td whitespace-nowrap">{date(a.createdAt, true)}</td><td className="td">{a.username ?? '—'}</td><td className="td"><code className="text-xs">{a.action}</code></td><td className="td">{a.entity} {a.entityId ?? ''}</td></tr>)}</tbody></table></div>)}
    </SectionCard>
  );
}

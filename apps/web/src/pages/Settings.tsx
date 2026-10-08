import { useEffect, useRef, useState } from 'react';
import { del, get, post, put } from '../api';
import { useI18n } from '../i18n';
import { Badge, Card, Empty, Field, Icon, Modal, PageHead, errMsg, useAction, useLabel } from '../ui';

type TabId = 'company' | 'rules' | 'users' | 'audit';

export function Settings({ user }: { user: any }) {
  const { t } = useI18n();
  const can = (p: string) => user.permissions.includes(p);
  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: 'company', label: t('settings.company'), show: can('user.manage') }, { id: 'rules', label: t('settings.rules'), show: can('user.manage') },
    { id: 'users', label: t('settings.users'), show: can('user.manage') }, { id: 'audit', label: t('settings.audit'), show: can('audit.view') },
  ];
  const visible = tabs.filter((x) => x.show);
  const [tab, setTab] = useState<TabId>(visible[0]?.id ?? 'audit');
  return (
    <>
      <PageHead title={t('nav.settings')} />
      <div className="lang" role="tablist" style={{ justifySelf: 'start', maxWidth: '100%', overflowX: 'auto' }}>
        {visible.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}
      </div>
      {tab === 'company' && <CompanyTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'users' && <UsersTab me={user} />}
      {tab === 'audit' && <AuditTab />}
    </>
  );
}

/** Reads an image file, scales it to fit 600px and re-encodes so it stays well under the 400 KB server limit. */
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
  const [provs, setProvs] = useState<any[]>([]);
  const [dists, setDists] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get('/settings/company').then((c) => { setF(c); if (c.provinceId) get(`/geo/provinces/${c.provinceId}/districts`).then(setDists); if (c.districtId) get(`/geo/districts/${c.districtId}/subdistricts`).then(setSubs); });
    get('/geo/provinces').then(setProvs);
    get('/settings/logo').then((l) => setLogo(l.dataUrl));
  }, []);
  if (!f) return null;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const nm = (x: any) => (lang === 'th' ? x.th : x.en);
  const subName = (x: any) => `${nm(x)}${x.zip ? ` · ${x.zip}` : ''}`;

  const pickProvince = async (id: number) => { setF({ ...f, provinceId: id || null, districtId: null, subDistrictId: null, postcode: '' }); setDists(id ? await get(`/geo/provinces/${id}/districts`) : []); setSubs([]); };
  const pickDistrict = async (id: number) => { setF({ ...f, districtId: id || null, subDistrictId: null, postcode: '' }); setSubs(id ? await get(`/geo/districts/${id}/subdistricts`) : []); };
  const pickSub = (id: number) => { const s = subs.find((x) => x.id === id); setF({ ...f, subDistrictId: id || null, postcode: s?.zip ?? '' }); };

  const idBad = f.taxId && !/^\d{13}$/.test(f.taxId);
  const ready = f.name && f.addressLine && f.provinceId && f.districtId && f.subDistrictId && /^\d{5}$/.test(f.postcode) && !idBad && /^\d{5}$/.test(f.branch || '00000');
  const preview = [f.addressLine, subs.find((s) => s.id === f.subDistrictId) && nm(subs.find((s) => s.id === f.subDistrictId)), dists.find((d) => d.id === f.districtId) && nm(dists.find((d) => d.id === f.districtId)), provs.find((p) => p.id === f.provinceId) && nm(provs.find((p) => p.id === f.provinceId)), f.postcode].filter(Boolean).join(lang === 'th' ? ' ' : ', ');

  const save = () => run(() => put('/settings/company', { name: f.name, nameEn: f.nameEn, taxId: f.taxId, branch: f.branch || '00000', phone: f.phone, email: f.email, addressLine: f.addressLine, provinceId: f.provinceId, districtId: f.districtId, subDistrictId: f.subDistrictId, postcode: f.postcode }), t('common.saved'))
    .then((r) => { if (r) { setF(r); window.dispatchEvent(new Event('sola:brand')); } });
  const pickFile = async (fl?: File) => { if (!fl) return; try { setNewLogo(await prepareLogo(fl)); } catch (e) { run(async () => { throw e instanceof Error ? e : new Error(errMsg(e)); }); } };

  return (
    <div className="grid g12">
      <Card title={t('settings.companyInfo')} tone="gold">
        <div className="row"><Field label={t('settings.nameTh')}><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field><Field label={t('settings.nameEn')}><input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field></div>
        <div className="row" style={{ marginTop: 10, alignItems: 'flex-start' }}>
          <Field label={t('settings.taxId')}><input inputMode="numeric" maxLength={13} value={f.taxId} onChange={(e) => set('taxId', e.target.value.replace(/\D/g, ''))} aria-invalid={!!idBad} />{idBad && <small className="muted">{t('cust.id13')}</small>}</Field>
          <Field label={t('settings.branch')}><input inputMode="numeric" maxLength={5} value={f.branch} onChange={(e) => set('branch', e.target.value.replace(/\D/g, ''))} /><small className="muted">{t('settings.branchHint')}</small></Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}><Field label={t('common.phone')}><input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field><Field label="Email"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field></div>

        <h4 style={{ margin: '16px 0 8px' }}>{t('settings.address')}</h4>
        <Field label={t('settings.addressLine')}><input value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} placeholder={t('settings.addressLineHint')} /></Field>
        <div className="row wide">
          <Field label={t('settings.province')}><select value={f.provinceId ?? ''} onChange={(e) => pickProvince(Number(e.target.value))}><option value="">{t('settings.choose')}</option>{provs.map((p) => <option key={p.id} value={p.id}>{nm(p)}</option>)}</select></Field>
          <Field label={t('settings.district')}><select value={f.districtId ?? ''} disabled={!dists.length} onChange={(e) => pickDistrict(Number(e.target.value))}><option value="">{t('settings.choose')}</option>{dists.map((d) => <option key={d.id} value={d.id}>{nm(d)}</option>)}</select></Field>
          <Field label={t('settings.subDistrict')}><select value={f.subDistrictId ?? ''} disabled={!subs.length} onChange={(e) => pickSub(Number(e.target.value))}><option value="">{t('settings.choose')}</option>{subs.map((s) => <option key={s.id} value={s.id}>{subName(s)}</option>)}</select></Field>
          <Field label={t('settings.postcode')}><input inputMode="numeric" maxLength={5} value={f.postcode} onChange={(e) => set('postcode', e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
        {preview && <div className="box" style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-200)', borderRadius: 8, padding: 10, marginTop: 8 }}><span className="muted small">{t('settings.preview')}</span><div>{preview}</div></div>}
        <button className="btn primary" style={{ marginTop: 14 }} disabled={busy || !ready} onClick={save}>{t('common.save')}</button>
      </Card>

      <Card title={t('settings.logo')} tone="red">
        <p className="muted small">{t('settings.logoHint')}</p>
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 160, border: '2px dashed var(--gold-400)', borderRadius: 12, background: '#fff', padding: 12 }}>
          {newLogo || logo ? <img src={newLogo ?? logo!} alt="logo" style={{ maxWidth: '100%', maxHeight: 150, objectFit: 'contain' }} /> : <Empty icon="receipt" text={t('settings.noLogo')} />}
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => file.current?.click()}><Icon name="plus" /> {t('settings.chooseFile')}</button>
          {newLogo && <button className="btn primary" disabled={busy} onClick={() => run(() => put('/settings/logo', { dataUrl: newLogo }), t('common.saved')).then((r) => { if (r) { setLogo(newLogo); setNewLogo(null); window.dispatchEvent(new Event('sola:brand')); } })}>{t('common.save')}</button>}
          {newLogo && <button className="btn ghost" onClick={() => setNewLogo(null)}>{t('common.cancel')}</button>}
          {!newLogo && logo && <button className="btn danger" disabled={busy} onClick={() => run(() => del('/settings/logo'), t('common.saved')).then((r) => { if (r) { setLogo(null); window.dispatchEvent(new Event('sola:brand')); } })}>{t('common.remove')}</button>}
        </div>
      </Card>
    </div>
  );
}

function RulesTab() {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [s, setS] = useState<any>(null);
  useEffect(() => { get('/settings').then(setS); }, []);
  if (!s) return null;
  const set = (k: string, v: string) => setS({ ...s, [k]: v });
  const num = (k: string, label: string, hint?: string) => <Field label={label}><input inputMode="decimal" value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)} />{hint && <small className="muted">{hint}</small>}</Field>;
  const save = () => run(() => put('/settings', {
    tax_mode: s.tax_mode, tax_rate_bp: Math.round(Number(s.tax_rate_bp_pct ?? Number(s.tax_rate_bp) / 100) * 100), pawn_max_rate_bp_per_month: Math.round(Number(s.pawn_max_pct ?? Number(s.pawn_max_rate_bp_per_month) / 100) * 100),
    pawn_default_term_days: Number(s.pawn_default_term_days), pawn_grace_days: Number(s.pawn_grace_days), pawn_min_interest_days: Number(s.pawn_min_interest_days ?? 0),
    points_minor_per_point: Math.round(Number(s.points_baht_per_point ?? Number(s.points_minor_per_point) / 100) * 100),
  }), t('common.saved'));
  return (
    <div className="grid g2">
      <Card title={t('settings.tax')} tone="gold">
        <Field label={t('settings.taxMode')}><select value={s.tax_mode} onChange={(e) => set('tax_mode', e.target.value)}>{['NONE', 'MAKING_ONLY', 'FULL'].map((m) => <option key={m} value={m}>{t(`settings.taxMode.${m}` as any)}</option>)}</select></Field>
        <Field label={t('settings.taxRate')}><input inputMode="decimal" value={s.tax_rate_bp_pct ?? Number(s.tax_rate_bp) / 100} onChange={(e) => set('tax_rate_bp_pct', e.target.value)} /></Field>
        <div className="alert warn small">{t('settings.legalNote')}</div>
      </Card>
      <Card title={t('settings.pawnRules')} tone="red">
        <Field label={t('settings.pawnMax')}><input inputMode="decimal" value={s.pawn_max_pct ?? Number(s.pawn_max_rate_bp_per_month) / 100} onChange={(e) => set('pawn_max_pct', e.target.value)} /></Field>
        {num('pawn_default_term_days', t('settings.pawnTerm'))}{num('pawn_grace_days', t('settings.pawnGrace'))}{num('pawn_min_interest_days', t('settings.pawnMinDays'))}
      </Card>
      <Card title={t('settings.loyalty')}>
        <Field label={t('settings.bahtPerPoint')}><input inputMode="decimal" value={s.points_baht_per_point ?? Number(s.points_minor_per_point) / 100} onChange={(e) => set('points_baht_per_point', e.target.value)} /></Field>
      </Card>
      <div><button className="btn primary" disabled={busy} onClick={save}>{t('common.save')}</button></div>
    </div>
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
  return (
    <Card title={t('settings.users')} right={<button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> {t('settings.addUser')}</button>}>
      <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('login.username')}</th><th>{t('common.name')}</th><th>{t('settings.role')}</th><th>{t('common.status')}</th><th /></tr></thead><tbody>
        {list.map((u) => <tr key={u.id}><td data-label={t('login.username')}><b>{u.username}</b></td><td data-label={t('common.name')}>{u.fullName}</td><td data-label={t('settings.role')}>{label('role', u.role)}</td>
          <td data-label={t('common.status')}><Badge tone={u.active ? 'ok' : 'bad'}>{u.active ? t('common.active') : t('common.disabled')}</Badge></td>
          <td className="act">{u.id !== me.id && <button className="btn sm" disabled={busy} onClick={() => run(() => post(`/users/${u.id}/active`, { active: !u.active }), t('common.saved')).then(load)}>{u.active ? t('settings.disable') : t('settings.enable')}</button>}</td></tr>)}
      </tbody></table></div>
      {adding && (
        <Modal title={t('settings.addUser')} onClose={() => setAdding(false)} foot={<><button className="btn" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || f.username.length < 3 || f.password.length < 8 || !f.fullName} onClick={() => run(() => post('/users', f), t('common.saved')).then((r) => { if (r) { setAdding(false); setF({ username: '', fullName: '', password: '', role: 'CASHIER' }); load(); } })}>{t('common.save')}</button></>}>
          <Field label={t('login.username')}><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus autoComplete="off" /></Field>
          <Field label={t('common.name')}><input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label={t('login.password')}><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /><small className="muted">{t('settings.pwHint')}</small></Field>
          <Field label={t('settings.role')}><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['MANAGER', 'CASHIER', 'STOCK_CLERK'].map((r) => <option key={r} value={r}>{label('role', r)}</option>)}</select></Field>
        </Modal>)}
    </Card>
  );
}

function AuditTab() {
  const { t, date } = useI18n();
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { get('/audit').then(setList); }, []);
  return (
    <Card title={t('settings.audit')}>
      {list.length === 0 ? <Empty text={t('common.empty')} /> : (
        <div className="tbl-wrap"><table className="rtable"><thead><tr><th>{t('common.time')}</th><th>{t('common.user')}</th><th>{t('settings.action')}</th><th>{t('settings.entity')}</th></tr></thead><tbody>
          {list.map((a) => <tr key={a.id}><td data-label={t('common.time')}>{date(a.createdAt, true)}</td><td data-label={t('common.user')}>{a.username ?? '—'}</td><td data-label={t('settings.action')}><code>{a.action}</code></td><td data-label={t('settings.entity')}>{a.entity} {a.entityId ?? ''}</td></tr>)}
        </tbody></table></div>)}
    </Card>
  );
}

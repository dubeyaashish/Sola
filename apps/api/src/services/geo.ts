import { readFileSync } from 'node:fs';

/**
 * Thai administrative areas (province → district → sub-district + postcode).
 * Data: kongvut/thai-province-data (MIT) compacted to apps/api/data-static/thai-geo.json.
 */
interface Raw { p: [number, string, string][]; d: [number, number, string, string, string][]; s: [number, number, string, string, string, string][] }
const raw = JSON.parse(readFileSync(new URL('../../data-static/thai-geo.json', import.meta.url), 'utf8')) as Raw;

const provinces = raw.p.map(([id, th, en]) => ({ id, th, en }));
const districts = raw.d.map(([id, provinceId, th, en, prefix]) => ({ id, provinceId, th, en, prefix }));
const subs = raw.s.map(([id, districtId, th, en, zip, prefix]) => ({ id, districtId, th, en, zip, prefix }));
const pById = new Map(provinces.map((x) => [x.id, x]));
const dById = new Map(districts.map((x) => [x.id, x]));
const sById = new Map(subs.map((x) => [x.id, x]));
const dByProvince = new Map<number, typeof districts>();
for (const d of districts) (dByProvince.get(d.provinceId) ?? dByProvince.set(d.provinceId, []).get(d.provinceId)!).push(d);
const sByDistrict = new Map<number, typeof subs>();
for (const s of subs) (sByDistrict.get(s.districtId) ?? sByDistrict.set(s.districtId, []).get(s.districtId)!).push(s);

const byTh = (a: { th: string }, b: { th: string }) => a.th.localeCompare(b.th, 'th');
export const listProvinces = () => [...provinces].sort(byTh);
export const listDistricts = (provinceId: number) => [...(dByProvince.get(provinceId) ?? [])].sort(byTh);
export const listSubDistricts = (districtId: number) => [...(sByDistrict.get(districtId) ?? [])].sort(byTh);

export function resolveArea(subDistrictId: number) {
  const sub = sById.get(subDistrictId);
  const district = sub && dById.get(sub.districtId);
  const province = district && pById.get(district.provinceId);
  return sub && district && province ? { sub, district, province } : undefined;
}

/** Address lines for documents, in Thai and English. `line` is house no./building/moo/soi/road. */
export function formatAddress(line: string, area: NonNullable<ReturnType<typeof resolveArea>>, postcode: string) {
  const { sub, district, province } = area;
  const bkk = province.id === 1;
  const th = [line.trim(), `${sub.prefix}${sub.th}`, `${district.prefix}${district.th}`, `${bkk ? '' : 'จังหวัด'}${province.th}`, postcode].filter(Boolean).join(' ');
  const en = [line.trim(), `${sub.en} Sub-district`, `${district.en} District`, province.en, postcode].filter(Boolean).join(', ');
  return { th, en };
}

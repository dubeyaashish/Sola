import { DomainError } from '@sola/core';
import type { DB } from '../db/schema';
import type { Actor } from '../context';
import { audit } from '../repos/audit';
import { getSettings, setSetting } from '../repos/settings';
import { formatAddress, resolveArea } from './geo';

export interface CompanyInput {
  name: string; nameEn?: string; taxId?: string; branch?: string; phone?: string; email?: string;
  addressLine: string; provinceId: number; districtId: number; subDistrictId: number; postcode: string;
}

export function setCompany(db: DB, actor: Actor, c: CompanyInput) {
  const area = resolveArea(c.subDistrictId);
  if (!area) throw new DomainError('INVALID_AREA', 'unknown sub-district');
  if (area.district.id !== c.districtId || area.province.id !== c.provinceId) throw new DomainError('INVALID_AREA', 'sub-district does not belong to the selected district/province');
  const addr = formatAddress(c.addressLine, area, c.postcode);
  const values: Record<string, string> = {
    shop_name: c.name, shop_name_en: c.nameEn ?? '', shop_tax_id: c.taxId ?? '', shop_branch: c.branch || '00000', shop_phone: c.phone ?? '', shop_email: c.email ?? '',
    shop_addr_line: c.addressLine, shop_province_id: String(c.provinceId), shop_district_id: String(c.districtId), shop_subdistrict_id: String(c.subDistrictId),
    shop_postcode: c.postcode, shop_address: addr.th, shop_address_en: addr.en,
  };
  db.transaction(() => {
    for (const [k, v] of Object.entries(values)) setSetting(db, k, v);
    audit(db, actor, 'company.update', 'settings', null, { ...values });
  })();
  return getCompany(db);
}

export function getCompany(db: DB) {
  const s = getSettings(db);
  return {
    name: s.shop_name ?? '', nameEn: s.shop_name_en ?? '', taxId: s.shop_tax_id ?? '', branch: s.shop_branch ?? '00000', phone: s.shop_phone ?? '', email: s.shop_email ?? '',
    addressLine: s.shop_addr_line ?? '', provinceId: Number(s.shop_province_id) || null, districtId: Number(s.shop_district_id) || null, subDistrictId: Number(s.shop_subdistrict_id) || null,
    postcode: s.shop_postcode ?? '', address: s.shop_address ?? '', addressEn: s.shop_address_en ?? '', hasLogo: !!s.shop_logo,
  };
}

const MAX_LOGO_BYTES = 400 * 1024;
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/jpeg': (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
};

/** PNG/JPEG/WebP only (no SVG: it can carry scripts). Validates declared type against file signature. */
export function setLogo(db: DB, actor: Actor, dataUrl: string) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  if (!m) throw new DomainError('INVALID_LOGO', 'logo must be a PNG, JPEG or WebP image');
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length > MAX_LOGO_BYTES) throw new DomainError('LOGO_TOO_LARGE', `logo must be at most ${MAX_LOGO_BYTES / 1024} KB`);
  if (!MAGIC[m[1]!]!(bytes)) throw new DomainError('INVALID_LOGO', 'file content does not match its image type');
  setSetting(db, 'shop_logo', dataUrl);
  audit(db, actor, 'company.logo_set', 'settings', null, { bytes: bytes.length });
}
export function clearLogo(db: DB, actor: Actor) {
  db.prepare("DELETE FROM settings WHERE key = 'shop_logo'").run();
  audit(db, actor, 'company.logo_clear', 'settings', null);
}
export const getLogo = (db: DB): string | null => getSettings(db).shop_logo ?? null;

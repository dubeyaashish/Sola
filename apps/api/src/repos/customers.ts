import type { DB } from '../db/schema';

export interface CustomerInput {
  name: string; phone?: string | null; nationalId?: string | null; address?: string | null; note?: string | null;
  title?: string | null; nameEn?: string | null; birthDate?: string | null; idCardIssueDate?: string | null; idCardExpiryDate?: string | null;
  idSource?: 'MANUAL' | 'CARD_READER'; member?: boolean;
}
const SELECT = `SELECT id, name, phone, national_id AS nationalId, address, note, member_no AS memberNo, title, name_en AS nameEn, birth_date AS birthDate,
  id_card_issue_date AS idCardIssueDate, id_card_expiry_date AS idCardExpiryDate, id_source AS idSource, points_balance AS pointsBalance, created_at AS createdAt FROM customers`;

export function insertCustomer(db: DB, c: CustomerInput) {
  const id = db.prepare(
    `INSERT INTO customers(name, phone, national_id, address, note, title, name_en, birth_date, id_card_issue_date, id_card_expiry_date, id_source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(c.name, c.phone ?? null, c.nationalId ?? null, c.address ?? null, c.note ?? null, c.title ?? null, c.nameEn ?? null, c.birthDate ?? null,
    c.idCardIssueDate ?? null, c.idCardExpiryDate ?? null, c.idSource ?? 'MANUAL').lastInsertRowid as number;
  if (c.member) db.prepare('UPDATE customers SET member_no = ? WHERE id = ?').run(`M-${String(id).padStart(6, '0')}`, id);
  return id;
}

export const getCustomer = (db: DB, id: number) => db.prepare(`${SELECT} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

export function searchCustomers(db: DB, q?: string, limit = 50) {
  if (!q) return db.prepare(`${SELECT} ORDER BY id DESC LIMIT ?`).all(limit);
  const like = `%${q}%`;
  return db.prepare(`${SELECT} WHERE name LIKE ? OR phone LIKE ? OR national_id LIKE ? ORDER BY name LIMIT ?`).all(like, like, like, limit);
}

export function updateCustomer(db: DB, id: number, c: Partial<CustomerInput>) {
  const cur = getCustomer(db, id) as (CustomerInput & { memberNo: string | null }) | undefined;
  if (!cur) return false;
  const m = { ...cur, ...c };
  db.prepare(`UPDATE customers SET name=?, phone=?, national_id=?, address=?, note=?, title=?, name_en=?, birth_date=?, id_card_issue_date=?, id_card_expiry_date=?, id_source=? WHERE id=?`)
    .run(m.name, m.phone ?? null, m.nationalId ?? null, m.address ?? null, m.note ?? null, m.title ?? null, m.nameEn ?? null, m.birthDate ?? null,
      m.idCardIssueDate ?? null, m.idCardExpiryDate ?? null, m.idSource ?? 'MANUAL', id);
  if (c.member && !cur.memberNo) db.prepare('UPDATE customers SET member_no = ? WHERE id = ?').run(`M-${String(id).padStart(6, '0')}`, id);
  return true;
}

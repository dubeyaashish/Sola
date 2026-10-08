import type { DB } from '../db/schema';
import type { Actor } from '../context';

export function audit(db: DB, actor: Actor | null, action: string, entity: string, entityId: string | number | null, detail?: unknown): void {
  db.prepare('INSERT INTO audit_logs(user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)')
    .run(actor?.id ?? null, action, entity, entityId == null ? null : String(entityId), detail === undefined ? null : JSON.stringify(detail));
}

export function listAudit(db: DB, limit = 100, entity?: string) {
  const rows = db.prepare(
    `SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail, a.created_at AS createdAt, u.username
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${entity ? 'WHERE a.entity = ?' : ''} ORDER BY a.id DESC LIMIT ?`,
  ).all(...(entity ? [entity, limit] : [limit])) as Array<{ detail: string | null } & Record<string, unknown>>;
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

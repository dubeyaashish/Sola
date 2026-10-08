import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DB } from '../db/schema';
import type { Role } from '@sola/core';

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 64).toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export interface UserRow { id: number; username: string; fullName: string; role: Role; active: number; passwordHash: string }
const SELECT = 'SELECT id, username, full_name AS fullName, role, active, password_hash AS passwordHash FROM users';

export const findUserByUsername = (db: DB, u: string) => db.prepare(`${SELECT} WHERE username = ?`).get(u) as UserRow | undefined;
export const findUserById = (db: DB, id: number) => db.prepare(`${SELECT} WHERE id = ?`).get(id) as UserRow | undefined;
export const listUsers = (db: DB) => db.prepare('SELECT id, username, full_name AS fullName, role, active FROM users ORDER BY id').all();
export const insertUser = (db: DB, u: { username: string; password: string; fullName: string; role: Role }) =>
  db.prepare('INSERT INTO users(username,password_hash,full_name,role) VALUES (?,?,?,?)').run(u.username, hashPassword(u.password), u.fullName, u.role).lastInsertRowid as number;
export const setUserActive = (db: DB, id: number, active: boolean) => db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

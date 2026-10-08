import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { can, DomainError, type Permission } from '@sola/core';
import type { Actor } from '../context';
import type { DB } from '../db/schema';
import { findUserById } from '../repos/users';

declare module 'fastify' {
  interface FastifyRequest { actor: Actor }
}

/** Verifies the JWT and re-checks the user is still active (so deactivation takes effect immediately). */
export const authenticate = (db: DB) => async (req: FastifyRequest, reply: FastifyReply) => {
  try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHENTICATED', message: 'login required' }); }
  const payload = req.user as { id: number };
  const u = findUserById(db, payload.id);
  if (!u || !u.active) return reply.code(401).send({ error: 'UNAUTHENTICATED', message: 'account disabled' });
  req.actor = { id: u.id, username: u.username, role: u.role };
};

export const requirePerm = (...perms: Permission[]) => async (req: FastifyRequest, reply: FastifyReply) => {
  if (!perms.every((p) => can(req.actor.role, p))) return reply.code(403).send({ error: 'FORBIDDEN', message: `missing permission: ${perms.join(', ')}` });
};

export const mountProtected = (app: FastifyInstance, db: DB, fn: (a: FastifyInstance) => void) =>
  app.register(async (scope) => { scope.addHook('preHandler', authenticate(db)); fn(scope); });

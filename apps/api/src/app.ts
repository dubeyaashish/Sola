import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { DomainError } from '@sola/core';
import { openDb, type DB } from './db/schema';
import { mountProtected } from './http/guard';
import { registerBackOfficeRoutes } from './http/backoffice';
import { registerProtectedRoutes, registerPublicRoutes } from './http/routes';

const STATUS: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403,
  ITEM_UNAVAILABLE: 409, ALREADY_VOIDED: 409, VOID_BLOCKED: 409, DUPLICATE_SKU: 409, DUPLICATE: 409, DUPLICATE_ITEM: 409,
};

export function buildApp(opts: { dbPath?: string; jwtSecret?: string; db?: DB; logger?: boolean } = {}) {
  const db = opts.db ?? openDb(opts.dbPath ?? ':memory:');
  const secret = opts.jwtSecret ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error('JWT_SECRET (>= 16 chars) is required');

  const app = Fastify({ logger: opts.logger ?? false });
  app.register(cors, { origin: true });
  app.register(jwt, { secret });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'VALIDATION', message: 'invalid request', issues: err.issues });
    if (err instanceof DomainError) return reply.code(STATUS[err.code] ?? 400).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'BAD_REQUEST', message: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'INTERNAL', message: 'internal server error' });
  });

  registerPublicRoutes(app, db);
  mountProtected(app, db, (scope) => { registerProtectedRoutes(scope, db); registerBackOfficeRoutes(scope, db); });
  return { app, db };
}

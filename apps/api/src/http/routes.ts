import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { can, DomainError, ROLES, ROLE_PERMISSIONS } from '@sola/core';
import type { DB } from '../db/schema';
import { requireAny, requirePerm } from './guard';
import { documentsForTransaction } from '../services/documents';
import { audit, listAudit } from '../repos/audit';
import { getCustomer, insertCustomer, searchCustomers, updateCustomer } from '../repos/customers';
import { getItem, getItemBySku, listItems, listMovements, stockSummary } from '../repos/items';
import { currentRate, rateHistory } from '../repos/rates';
import { getSettings, setSetting } from '../repos/settings';
import { dailySummary, getTransaction, listTransactions } from '../repos/transactions';
import { findUserByUsername, insertUser, listUsers, setUserActive, verifyPassword } from '../repos/users';
import { adjustItemStatus, receiveItem } from '../services/inventory';
import { setRate } from '../services/rates';
import { createTransaction, quote, voidTransaction } from '../services/sales';

const money = z.number().int().nonnegative();
const id = z.coerce.number().int().positive();
const making = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FIXED'), amount: money }),
  z.object({ type: z.literal('PER_GRAM'), amount: money }),
  z.object({ type: z.literal('PERCENT'), bp: z.number().int().min(0).max(10000) }),
]);
const tradeIn = z.object({
  isBar: z.boolean().optional(),
  description: z.string().max(200).optional(),
  weightMg: z.number().int().positive(),
  purityBp: z.number().int().min(1).max(10000),
  deductionBp: z.number().int().min(0).max(10000).optional(),
  overrideValue: money.optional(),
});
const basket = z.object({ itemIds: z.array(id).default([]), tradeIns: z.array(tradeIn).default([]), discount: money.optional() });
const txBody = basket.extend({
  customerId: id.nullish(),
  payments: z.array(z.object({ method: z.enum(['CASH', 'CARD', 'TRANSFER', 'SAVINGS', 'OTHER']), amount: z.number().int().positive(), reference: z.string().max(100).nullish(), savingsAccountId: id.optional() })).default([]),
  note: z.string().max(500).nullish(),
});

/** Permission rules that depend on the *content* of a transaction request. */
function assertTxPermissions(role: Parameters<typeof can>[0], b: z.infer<typeof basket>) {
  const need = (ok: boolean, what: string) => { if (!ok) throw new DomainError('FORBIDDEN', `missing permission: ${what}`); };
  if (b.itemIds.length) need(can(role, 'sale.create'), 'sale.create');
  if (b.tradeIns.length) need(can(role, 'buyback.create'), 'buyback.create');
  if (b.discount) need(can(role, 'discount.apply'), 'discount.apply');
  if (b.tradeIns.some((t) => t.overrideValue !== undefined)) need(can(role, 'value.override'), 'value.override');
}

export function registerProtectedRoutes(app: FastifyInstance, db: DB) {
  app.get('/auth/me', async (req) => ({ ...req.actor, permissions: ROLE_PERMISSIONS[req.actor.role] }));

  // ---- rates
  app.get('/rates/current', { preHandler: requirePerm('rate.read') }, async () => currentRate(db) ?? null);
  app.get('/rates', { preHandler: requirePerm('rate.read') }, async () => rateHistory(db));
  app.post('/rates', { preHandler: requirePerm('rate.set') }, async (req, reply) => {
    const cls = z.object({ buyPerGram: z.number().int().positive(), sellPerGram: z.number().int().positive() });
    const b = z.object({ ornament: cls, bar: cls, note: z.string().max(200).nullish() }).parse(req.body);
    setRate(db, req.actor, b);
    return reply.code(201).send(currentRate(db));
  });

  // ---- items
  app.get('/items', { preHandler: requirePerm('item.read') }, async (req) => {
    const q = z.object({ status: z.string().optional(), q: z.string().optional(), category: z.string().optional() }).parse(req.query);
    return listItems(db, q);
  });
  app.get('/items/sku/:sku', { preHandler: requirePerm('item.read') }, async (req) => {
    const item = getItemBySku(db, (req.params as { sku: string }).sku);
    if (!item) throw new DomainError('NOT_FOUND', 'item not found');
    return item;
  });
  app.get('/items/:id', { preHandler: requirePerm('item.read') }, async (req) => {
    const item = getItem(db, id.parse((req.params as { id: string }).id));
    if (!item) throw new DomainError('NOT_FOUND', 'item not found');
    return { ...item, movements: listMovements(db, item.id) };
  });
  app.post('/items', { preHandler: requirePerm('item.manage') }, async (req, reply) => {
    const b = z.object({
      sku: z.string().min(1).max(40).optional(), name: z.string().min(1).max(200), category: z.string().max(40).optional(),
      weightMg: z.number().int().positive(), purityBp: z.number().int().min(1).max(10000), making,
      otherCharge: money.optional(), cost: money.optional(), location: z.string().max(80).nullish(),
    }).parse(req.body);
    return reply.code(201).send(receiveItem(db, req.actor, b));
  });
  app.post('/items/:id/adjust', { preHandler: requirePerm('stock.adjust') }, async (req) => {
    const b = z.object({ status: z.enum(['IN_STOCK', 'RESERVED', 'MISSING']), note: z.string().min(1).max(300) }).parse(req.body);
    return adjustItemStatus(db, req.actor, id.parse((req.params as { id: string }).id), b.status, b.note);
  });
  app.get('/stock/summary', { preHandler: requirePerm('item.read') }, async () => stockSummary(db));
  app.get('/stock/movements', { preHandler: requirePerm('item.read') }, async () => listMovements(db));

  // ---- customers
  app.get('/customers', { preHandler: requirePerm('customer.read') }, async (req) => searchCustomers(db, (req.query as { q?: string }).q));
  app.get('/customers/:id', { preHandler: requirePerm('customer.read') }, async (req) => {
    const cid = id.parse((req.params as { id: string }).id);
    const c = getCustomer(db, cid);
    if (!c) throw new DomainError('NOT_FOUND', 'customer not found');
    return { ...c, transactions: listTransactions(db, { customerId: cid, limit: 50 }) };
  });
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const customerBody = z.object({
    name: z.string().min(1).max(120), phone: z.string().max(30).nullish(), nationalId: z.string().regex(/^\d{13}$/, 'Thai national ID is 13 digits').nullish(),
    address: z.string().max(300).nullish(), note: z.string().max(500).nullish(), title: z.string().max(30).nullish(), nameEn: z.string().max(120).nullish(),
    birthDate: date.nullish(), idCardIssueDate: date.nullish(), idCardExpiryDate: date.nullish(), idSource: z.enum(['MANUAL', 'CARD_READER']).optional(), member: z.boolean().optional(),
  });
  app.post('/customers', { preHandler: requirePerm('customer.manage') }, async (req, reply) => {
    const cid = insertCustomer(db, customerBody.parse(req.body));
    audit(db, req.actor, 'customer.create', 'customer', cid);
    return reply.code(201).send(getCustomer(db, cid));
  });
  app.patch('/customers/:id', { preHandler: requirePerm('customer.manage') }, async (req) => {
    const cid = id.parse((req.params as { id: string }).id);
    if (!updateCustomer(db, cid, customerBody.partial().parse(req.body))) throw new DomainError('NOT_FOUND', 'customer not found');
    audit(db, req.actor, 'customer.update', 'customer', cid);
    return getCustomer(db, cid);
  });

  // ---- sales
  app.post('/pricing/quote', async (req) => {
    const b = basket.parse(req.body);
    assertTxPermissions(req.actor.role, b);
    return quote(db, b);
  });
  app.post('/transactions', async (req, reply) => {
    const b = txBody.parse(req.body);
    assertTxPermissions(req.actor.role, b);
    return reply.code(201).send(createTransaction(db, req.actor, b));
  });
  app.get('/transactions', { preHandler: requireAny('report.view', 'sale.create') }, async (req) =>
    listTransactions(db, z.object({ from: z.string().optional(), to: z.string().optional(), type: z.string().optional(), limit: z.coerce.number().int().max(500).optional() }).parse(req.query)));
  app.get('/transactions/:id', async (req) => {
    const txId = id.parse((req.params as { id: string }).id);
    const tx = getTransaction(db, txId);
    if (!tx) throw new DomainError('NOT_FOUND', 'transaction not found');
    return { ...tx, documents: documentsForTransaction(db, txId) };
  });
  app.post('/transactions/:id/void', { preHandler: requirePerm('sale.void') }, async (req) =>
    voidTransaction(db, req.actor, id.parse((req.params as { id: string }).id), z.object({ reason: z.string().min(1).max(300) }).parse(req.body).reason));

  // ---- reports / admin
  app.get('/reports/daily', { preHandler: requirePerm('report.view') }, async (req) => {
    const day = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(new Date().toISOString().slice(0, 10)) }).parse(req.query).day;
    return dailySummary(db, day);
  });
  app.get('/audit', { preHandler: requirePerm('audit.view') }, async (req) => listAudit(db, 200, (req.query as { entity?: string }).entity));
  app.get('/settings', async () => { const { shop_logo: _logo, ...rest } = getSettings(db); return rest; });
  app.put('/settings', { preHandler: requirePerm('user.manage') }, async (req) => {
    const b = z.object({ shop_name: z.string().min(1).max(100).optional(), tax_rate_bp: z.number().int().min(0).max(10000).optional(), tax_mode: z.enum(['NONE', 'MAKING_ONLY', 'FULL']).optional(),
      shop_tax_id: z.string().regex(/^\d{13}$/).optional(), shop_address: z.string().max(300).optional(), shop_branch: z.string().max(10).optional(),
      pawn_max_rate_bp_per_month: z.number().int().min(0).optional(), pawn_default_term_days: z.number().int().positive().optional(),
      pawn_grace_days: z.number().int().min(0).optional(), pawn_min_interest_days: z.number().int().min(0).optional(),
      points_minor_per_point: z.number().int().min(0).optional(), savings_default_purity_bp: z.number().int().min(1).max(10000).optional(),
    }).parse(req.body);
    for (const [k, v] of Object.entries(b)) if (v !== undefined) setSetting(db, k, String(v));
    audit(db, req.actor, 'settings.update', 'settings', null, b);
    const { shop_logo: _l, ...rest } = getSettings(db);
    return rest;
  });
  app.get('/users', { preHandler: requirePerm('user.manage') }, async () => listUsers(db));
  app.post('/users', { preHandler: requirePerm('user.manage') }, async (req, reply) => {
    const b = z.object({ username: z.string().min(3).max(40), password: z.string().min(8).max(100), fullName: z.string().min(1).max(100), role: z.enum(ROLES) }).parse(req.body);
    if (findUserByUsername(db, b.username)) throw new DomainError('DUPLICATE', 'username already exists');
    const uid = insertUser(db, b);
    audit(db, req.actor, 'user.create', 'user', uid, { username: b.username, role: b.role });
    return reply.code(201).send({ id: uid, username: b.username, fullName: b.fullName, role: b.role });
  });
  app.post('/users/:id/active', { preHandler: requirePerm('user.manage') }, async (req) => {
    const uid = id.parse((req.params as { id: string }).id);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    if (uid === req.actor.id) throw new DomainError('INVALID', 'you cannot disable yourself');
    setUserActive(db, uid, active);
    audit(db, req.actor, active ? 'user.enable' : 'user.disable', 'user', uid);
    return { id: uid, active };
  });
}

export function registerPublicRoutes(app: FastifyInstance, db: DB) {
  app.get('/health', async () => ({ ok: true }));
  app.post('/auth/login', async (req, reply) => {
    const b = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const u = findUserByUsername(db, b.username);
    // Run the hash check even for unknown users is unnecessary here; the message is identical either way.
    if (!u || !u.active || !verifyPassword(b.password, u.passwordHash)) {
      audit(db, null, 'auth.login_failed', 'user', b.username);
      return reply.code(401).send({ error: 'BAD_CREDENTIALS', message: 'invalid username or password' });
    }
    audit(db, { id: u.id, username: u.username, role: u.role }, 'auth.login', 'user', u.id);
    const token = app.jwt.sign({ id: u.id, username: u.username, role: u.role }, { expiresIn: '12h' });
    return { token, user: { id: u.id, username: u.username, fullName: u.fullName, role: u.role, permissions: ROLE_PERMISSIONS[u.role] } };
  });
}

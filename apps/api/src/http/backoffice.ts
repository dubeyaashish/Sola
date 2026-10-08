import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from '@sola/core';
import type { DB } from '../db/schema';
import { requirePerm } from './guard';
import { currentRate } from '../repos/rates';
import { applyAssociationQuote } from '../services/rates';
import * as pawn from '../services/pawn';
import * as savings from '../services/savings';
import * as loyalty from '../services/loyalty';
import * as docs from '../services/documents';
import * as ledger from '../services/ledger';

const id = z.coerce.number().int().positive();
const money = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const method = z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']);
const pid = (req: { params: unknown }) => id.parse((req.params as { id: string }).id);
const todayStr = () => new Date().toISOString().slice(0, 10);

export function registerBackOfficeRoutes(app: FastifyInstance, db: DB) {
  // ---- automatic rate updates (association announcement → pure-gram rates)
  app.post('/rates/association', { preHandler: requirePerm('rate.set') }, async (req, reply) => {
    const b = z.object({ announcementNo: z.string().max(40).optional(), barBuy: money, barSell: money, ornamentBuy: money, ornamentSell: money }).parse(req.body);
    const r = applyAssociationQuote(db, req.actor, b);
    return reply.code(r.changed ? 201 : 200).send({ ...r, rate: currentRate(db) });
  });

  // ---- pawn / sell-back
  const items = z.array(z.object({ description: z.string().min(1).max(200), weightMg: money, purityBp: z.number().int().min(1).max(10000), appraisedValue: z.number().int().nonnegative().optional() })).min(1);
  app.post('/pawn', { preHandler: requirePerm('pawn.manage') }, async (req, reply) => {
    const b = z.object({ type: z.enum(['PAWN', 'SELL_BACK']), customerId: id, principal: money, rateBpPerMonth: z.number().int().min(0), termDays: z.number().int().positive().max(3650).optional(), startDate: date.optional(), note: z.string().max(300).nullish(), method: method.optional(), items }).parse(req.body);
    return reply.code(201).send(pawn.openContract(db, req.actor, b));
  });
  app.get('/pawn', { preHandler: requirePerm('pawn.manage') }, async (req) => {
    const q = z.object({ status: z.enum(['ACTIVE', 'REDEEMED', 'FORFEITED']).optional(), overdue: z.enum(['true', 'false']).optional(), customerId: id.optional() }).parse(req.query);
    return pawn.listContracts(db, { ...q, overdue: q.overdue === 'true' });
  });
  app.get('/pawn/:id', { preHandler: requirePerm('pawn.manage') }, async (req) => pawn.getContract(db, pid(req)));
  app.get('/pawn/:id/quote', { preHandler: requirePerm('pawn.manage') }, async (req) =>
    pawn.quoteContract(db, pid(req), z.object({ asOf: date.optional() }).parse(req.query).asOf));
  const when = z.object({ asOf: date.optional(), method: method.optional() });
  app.post('/pawn/:id/renew', { preHandler: requirePerm('pawn.manage') }, async (req) => pawn.renew(db, req.actor, pid(req), when.parse(req.body ?? {})));
  app.post('/pawn/:id/redeem', { preHandler: requirePerm('pawn.manage') }, async (req) => pawn.redeem(db, req.actor, pid(req), when.parse(req.body ?? {})));
  app.post('/pawn/:id/pay-principal', { preHandler: requirePerm('pawn.manage') }, async (req) =>
    pawn.payPrincipal(db, req.actor, pid(req), when.extend({ amount: money }).parse(req.body)));
  app.post('/pawn/:id/forfeit', { preHandler: requirePerm('pawn.forfeit') }, async (req) =>
    pawn.forfeit(db, req.actor, pid(req), z.object({ asOf: date.optional() }).parse(req.body ?? {})));

  // ---- gold savings
  app.post('/savings', { preHandler: requirePerm('savings.manage') }, async (req, reply) => {
    const b = z.object({ customerId: id, plan: z.enum(['FIXED', 'FLEXIBLE']), mode: z.enum(['CASH', 'GOLD_WEIGHT']), purityBp: z.number().int().min(1).max(10000).optional(), installmentAmount: money.optional(), frequency: z.enum(['WEEKLY', 'MONTHLY']).optional(), targetAmount: money.optional(), startDate: date.optional() }).parse(req.body);
    return reply.code(201).send(savings.openAccount(db, req.actor, b));
  });
  app.get('/savings', { preHandler: requirePerm('savings.manage') }, async (req) => savings.listAccounts(db, req.query && (req.query as { customerId?: string }).customerId ? id.parse((req.query as { customerId: string }).customerId) : undefined));
  app.get('/savings/:id', { preHandler: requirePerm('savings.manage') }, async (req) => savings.statement(db, pid(req)));
  app.post('/savings/:id/deposit', { preHandler: requirePerm('savings.manage') }, async (req) => {
    const b = z.object({ amount: money, method: method.default('CASH') }).parse(req.body);
    return savings.deposit(db, req.actor, pid(req), b.amount, b.method);
  });
  app.post('/savings/:id/close', { preHandler: requirePerm('savings.manage') }, async (req) =>
    savings.closeAccount(db, req.actor, pid(req), z.object({ note: z.string().max(200).default('') }).parse(req.body ?? {}).note));

  // ---- loyalty
  app.get('/rewards', { preHandler: requirePerm('customer.read') }, async () => loyalty.listRewards(db));
  app.post('/rewards', { preHandler: requirePerm('loyalty.manage') }, async (req, reply) =>
    reply.code(201).send({ id: loyalty.createReward(db, req.actor, z.object({ name: z.string().min(1).max(100), pointsCost: money, stockQty: z.number().int().nonnegative() }).parse(req.body)) }));
  app.post('/customers/:id/redeem-reward', { preHandler: requirePerm('loyalty.manage') }, async (req) =>
    loyalty.redeemReward(db, req.actor, pid(req), z.object({ rewardId: id }).parse(req.body).rewardId));
  app.post('/customers/:id/points', { preHandler: requirePerm('ledger.manage') }, async (req) => {
    const b = z.object({ delta: z.number().int(), note: z.string().min(1).max(200) }).parse(req.body);
    return { balance: loyalty.adjustPoints(db, req.actor, pid(req), b.delta, b.note) };
  });
  app.get('/customers/:id/points', { preHandler: requirePerm('customer.read') }, async (req) => loyalty.pointsHistory(db, pid(req)));

  // ---- tax documents & e-Tax queue
  app.get('/transactions/:id/documents', { preHandler: requirePerm('document.issue') }, async (req) => docs.documentsForTransaction(db, pid(req)));
  app.post('/transactions/:id/documents/full', { preHandler: requirePerm('document.issue') }, async (req, reply) => {
    const b = z.object({ buyerName: z.string().min(1).max(200), buyerTaxId: z.string().regex(/^\d{13}$/), buyerAddress: z.string().min(1).max(400), buyerBranch: z.string().max(10).optional() }).parse(req.body);
    return reply.code(201).send(docs.issueDocument(db, req.actor, pid(req), 'TAX_INVOICE_FULL', b));
  });
  app.get('/etax/outbox', { preHandler: requirePerm('document.issue') }, async (req) => docs.etaxQueue(db, z.enum(['PENDING', 'SENT', 'FAILED']).default('PENDING').parse((req.query as { status?: string }).status)));
  app.post('/etax/outbox/:id/result', { preHandler: requirePerm('ledger.manage') }, async (req) => {
    docs.markEtax(db, req.actor, pid(req), z.object({ ok: z.boolean(), error: z.string().max(500).optional() }).parse(req.body));
    return { ok: true };
  });

  // ---- income / expense, P&L, dashboard
  app.post('/ledger', { preHandler: requirePerm('ledger.manage') }, async (req, reply) =>
    reply.code(201).send({ id: ledger.addEntry(db, req.actor, z.object({ entryDate: date.optional(), kind: z.enum(['INCOME', 'EXPENSE']), category: z.string().min(1).max(60), amount: money, memo: z.string().max(300).nullish() }).parse(req.body)) }));
  const range = z.object({ from: date.default(todayStr()), to: date.default(todayStr()) });
  app.get('/ledger', { preHandler: requirePerm('report.view') }, async (req) => { const r = range.parse(req.query); return ledger.listEntries(db, r.from, r.to); });
  app.get('/reports/profit-loss', { preHandler: requirePerm('report.view') }, async (req) => { const r = range.parse(req.query); return ledger.profitLoss(db, r.from, r.to); });
  app.get('/reports/dashboard', { preHandler: requirePerm('report.view') }, async () => ledger.dashboard(db, todayStr()));
}

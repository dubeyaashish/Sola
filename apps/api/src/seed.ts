import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db/schema';
import { findUserByUsername, insertUser } from './repos/users';
import { insertRate, currentRate } from './repos/rates';
import { insertItem, insertMovement } from './repos/items';
import { insertCustomer } from './repos/customers';

const dbPath = process.env.DB_PATH ?? './data/sola.db';
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

const users = [
  { username: 'owner', fullName: 'Shop Owner', role: 'OWNER' },
  { username: 'manager', fullName: 'Store Manager', role: 'MANAGER' },
  { username: 'cashier', fullName: 'Cashier', role: 'CASHIER' },
  { username: 'stock', fullName: 'Stock Clerk', role: 'STOCK_CLERK' },
] as const;
const password = process.env.SEED_PASSWORD ?? 'sola-demo-123';
for (const u of users) if (!findUserByUsername(db, u.username)) insertUser(db, { ...u, password });
const owner = findUserByUsername(db, 'owner')!;

if (!currentRate(db)) {
  // 96.5% gold ≈ 40,000/baht-weight sell → pure gram ≈ 2,720.00 ; demo numbers only.
  insertRate(db, { ornament: { buyPerGram: 270_000, sellPerGram: 276_000 }, bar: { buyPerGram: 272_000, sellPerGram: 274_000 }, userId: owner.id, note: 'seed' });
}
const existing = db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number };
if (existing.n === 0) {
  const demo = [
    ['Gold chain 1 baht', 'CHAIN', 15_244, 9650, { type: 'FIXED', amount: 80_000 }],
    ['Gold ring', 'RING', 3_800, 9650, { type: 'PER_GRAM', amount: 25_000 }],
    ['Gold bangle', 'BANGLE', 30_488, 9650, { type: 'PERCENT', bp: 300 }],
    ['Gold bar 5 g', 'BAR', 5_000, 9650, { type: 'FIXED', amount: 30_000 }],
    ['18K pendant', 'PENDANT', 4_200, 7500, { type: 'FIXED', amount: 120_000 }],
  ] as const;
  for (const [name, category, weightMg, purityBp, making] of demo) {
    const id = insertItem(db, { name, category, weightMg, purityBp, making: making as never });
    insertMovement(db, { itemId: id, type: 'RECEIVE', from: null, to: 'IN_STOCK', weightMg, userId: owner.id, note: 'seed' });
  }
}
if ((db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n === 0) {
  insertCustomer(db, { name: 'สมชาย ใจดี (demo)', phone: '0812345678', nationalId: '1101700203451', member: true, address: 'Bangkok' });
}
console.log(`Seeded ${dbPath}. Users: ${users.map((u) => u.username).join(', ')} / password: ${password}`);

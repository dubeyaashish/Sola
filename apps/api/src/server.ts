import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './app';
import { startRateFeed } from './ratefeed';

const dbPath = process.env.DB_PATH ?? './data/sola.db';
mkdirSync(dirname(dbPath), { recursive: true });
const { app, db } = buildApp({ dbPath, logger: true });
const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: process.env.HOST ?? '0.0.0.0' }).catch((e) => { console.error(e); process.exit(1); });
if (process.env.RATE_FEED_URL) startRateFeed(db, { url: process.env.RATE_FEED_URL, intervalMs: Number(process.env.RATE_FEED_INTERVAL_MS ?? 60_000), log: (m) => app.log.info(m) });

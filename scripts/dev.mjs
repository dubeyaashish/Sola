// One-command local start: seeds the demo database on first run, then starts the API (:3000) and the web app (:5173).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) { console.error(`Sola needs Node 22 or newer (you have ${process.versions.node}). Try: brew install node@22`); process.exit(1); }

const env = { ...process.env, JWT_SECRET: process.env.JWT_SECRET ?? 'sola-local-dev-secret-change-me' };
const run = (cmd, args, cwd, name) => {
  const p = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = (s) => s.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  p.stdout.on('data', (d) => process.stdout.write(tag(d)));
  p.stderr.on('data', (d) => process.stderr.write(tag(d)));
  return p;
};
const once = (p) => new Promise((res, rej) => p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`exit ${c}`)))));

if (!existsSync(join(api, 'data/sola.db'))) await once(run('npm', ['run', 'seed'], api, 'seed'));
const procs = [run('npm', ['run', 'dev'], api, 'api'), run('npm', ['run', 'dev', '-w', '@sola/web'], root, 'web')];
console.log('\n  Sola is starting →  http://localhost:5173   (login: owner / sola-demo-123)\n  Press Ctrl+C to stop.\n');
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (c) => { if (c) { console.error('A process exited; stopping.'); stop(); } }));

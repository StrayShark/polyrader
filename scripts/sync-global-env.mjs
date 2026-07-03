#!/usr/bin/env node
/**
 * Merge Polymarket (and shared dev) vars from ~/global_env/.env into project .env.
 * Usage: node scripts/sync-global-env.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ENV = resolve(ROOT, '.env');
const PROJECT_EXAMPLE = resolve(ROOT, '.env.example');

const GLOBAL_CANDIDATES = [
  resolve(homedir(), 'global_env', '.env'),
  resolve(homedir(), 'globel_env', '.env'),
];

/** Keys copied from global env for Polymarket debugging */
const SYNC_KEYS = [
  'POLYMARKET_GAMMA_API_URL',
  'POLYMARKET_CLOB_API_URL',
  'POLYMARKET_DATA_API_URL',
  'POLYMARKET_WS_URL',
  'POLYMARKET_ADDRESS',
  'POLYMARKET_FUNDER',
  'POLYMARKET_API_KEY',
  'POLYMARKET_API_SECRET',
  'POLYMARKET_API_PASSPHRASE',
  'POLYMARKET_PRIVATE_KEY',
  'POLYMARKET_SIGNATURE_TYPE',
  'POLYMARKET_LIVE_TRADING_ENABLED',
  'POLYMARKET_PROBE_TOKEN_ID',
  'POLYGON_RPC_URL',
  'ENCRYPTION_KEY',
  'DATABASE_URL',
  'POLYRADER_DATA_DIR',
];

function parseEnvLines(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function upsertEnvFile(filePath, updates) {
  const lines = existsSync(filePath) ? readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  const seen = new Set();

  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return line;
    const key = trimmed.slice(0, eq).trim();
    if (!updates.has(key)) return line;
    seen.add(key);
    return `${key}=${updates.get(key)}`;
  });

  for (const [key, value] of updates) {
    if (seen.has(key)) continue;
    if (next.length > 0 && next[next.length - 1] !== '') next.push('');
    next.push(`${key}=${value}`);
  }

  writeFileSync(filePath, `${next.join('\n').replace(/\n*$/, '\n')}`, 'utf8');
}

const globalPath = GLOBAL_CANDIDATES.find((p) => existsSync(p));
if (!globalPath) {
  console.error('ERROR: ~/global_env/.env not found (also checked ~/globel_env/.env)');
  process.exit(1);
}

if (!existsSync(PROJECT_ENV)) {
  if (existsSync(PROJECT_EXAMPLE)) {
    writeFileSync(PROJECT_ENV, readFileSync(PROJECT_EXAMPLE, 'utf8'), 'utf8');
    console.log(`Created ${PROJECT_ENV} from .env.example`);
  } else {
    writeFileSync(PROJECT_ENV, '# PolyRader CS2 local env\n', 'utf8');
    console.log(`Created empty ${PROJECT_ENV}`);
  }
}

const globalVars = parseEnvLines(readFileSync(globalPath, 'utf8'));
const updates = new Map();
for (const key of SYNC_KEYS) {
  const value = globalVars.get(key);
  if (value !== undefined && value !== '') updates.set(key, value);
}

if (updates.size === 0) {
  console.error(`ERROR: No Polymarket keys found in ${globalPath}`);
  process.exit(1);
}

upsertEnvFile(PROJECT_ENV, updates);
console.log(`Synced ${updates.size} keys from ${globalPath} → ${PROJECT_ENV}`);
console.log(`  ${[...updates.keys()].join(', ')}`);

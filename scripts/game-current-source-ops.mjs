#!/usr/bin/env node
/**
 * Run Validation Lab current-source ops for a game board:
 * normalize (sync + market discovery) → release audit → lifecycle snapshot.
 *
 * Usage:
 *   node scripts/game-current-source-ops.mjs cs2
 *   node scripts/game-current-source-ops.mjs cs2 --match-id 2396000
 *   node scripts/game-current-source-ops.mjs dota2 --no-analysis
 *   POLYRADER_API_BASE=http://127.0.0.1:3001/api node scripts/game-current-source-ops.mjs lol
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GAMES = new Set(['cs2', 'dota2', 'lol', 'valorant']);

function parseArgs(argv) {
  const args = { game: '', matchId: undefined, executeAnalysis: true, output: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--match-id') {
      args.matchId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--no-analysis') {
      args.executeAnalysis = false;
      continue;
    }
    if (token === '--output') {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (!token.startsWith('-') && !args.game) {
      args.game = token;
    }
  }
  return args;
}

async function request(base, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${payload.error ?? response.statusText}`);
  }
  return payload.data ?? payload;
}

const args = parseArgs(process.argv.slice(2));
if (!GAMES.has(args.game)) {
  console.error('Usage: node scripts/game-current-source-ops.mjs <cs2|dota2|lol|valorant> [--match-id ID] [--no-analysis] [--output file.json]');
  process.exit(1);
}

const base = process.env.POLYRADER_API_BASE ?? 'http://127.0.0.1:3001/api';
const startedAt = new Date().toISOString();

const normalizeBody = {
  refreshSources: true,
  discoverMarkets: true,
};
if (args.matchId) normalizeBody.preferredExternalMatchId = args.matchId;

const auditBody = { executeAnalysis: args.executeAnalysis };
if (args.matchId) auditBody.preferredExternalMatchId = args.matchId;

console.log(`[ops] game=${args.game} base=${base}${args.matchId ? ` match=${args.matchId}` : ''}`);

const board = await request(base, 'POST', `/validation-lab/boards/${args.game}/normalize`, normalizeBody);
console.log(
  `[ops] normalize: boardState=${board.summary?.boardState ?? 'unknown'} completeness=${Math.round((board.summary?.completeness ?? 0) * 100)}%`,
);

const audit = await request(base, 'POST', `/validation-lab/release-audits/${args.game}`, auditBody);
console.log(
  `[ops] audit: id=${audit.auditId} analysis=${audit.analysis?.status ?? 'unknown'} gate=${audit.gate?.status ?? 'unknown'}`,
);

const lifecycle = await request(base, 'GET', `/validation-lab/lifecycle/${args.game}`);
console.log(
  `[ops] lifecycle: closing=${lifecycle.closing} settlement=${lifecycle.settlement} statistics=${lifecycle.statistics}`,
);

const result = {
  generatedAt: new Date().toISOString(),
  startedAt,
  game: args.game,
  preferredExternalMatchId: args.matchId ?? null,
  executeAnalysis: args.executeAnalysis,
  board: board.summary,
  marketDiscovery: board.marketDiscovery ?? null,
  audit,
  lifecycle,
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (args.output) {
  const outputPath = resolve(args.output);
  writeFileSync(outputPath, json, 'utf8');
  console.log(`[ops] wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}

#!/usr/bin/env node
/**
 * Run current-source smoke ops for all supported esports boards.
 *
 * Usage:
 *   node scripts/current-source-smoke-all.mjs
 *   node scripts/current-source-smoke-all.mjs --no-analysis
 *   node scripts/current-source-smoke-all.mjs --match-id cs2:2396000 --output current-source-smoke.json
 *   POLYRADER_API_BASE=http://127.0.0.1:3001/api node scripts/current-source-smoke-all.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GAMES = ['cs2', 'lol', 'dota2', 'valorant'];
const GAME_LABELS = {
  cs2: 'CS2',
  lol: 'LOL',
  dota2: 'Dota 2',
  valorant: 'Valorant',
};

function printUsage() {
  console.log(`Usage: node scripts/current-source-smoke-all.mjs [options]

Options:
  --no-analysis            Skip provider execution during release audits
  --fail-fast              Stop after the first failed board
  --match-id <game:id>     Prefer an external match id for a board, repeatable
  --output <file.json>     Write the full JSON report
  --help                   Show this help
`);
}

function parseArgs(argv) {
  const args = {
    executeAnalysis: true,
    failFast: false,
    output: undefined,
    matchIds: new Map(),
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--no-analysis') {
      args.executeAnalysis = false;
      continue;
    }
    if (token === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (token === '--output') {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--match-id') {
      const value = argv[index + 1];
      index += 1;
      const separator = value?.indexOf(':') ?? -1;
      const game = separator > 0 ? value.slice(0, separator) : '';
      const matchId = separator > 0 ? value.slice(separator + 1) : '';
      if (!GAMES.includes(game) || !matchId) {
        throw new Error(`Invalid --match-id "${value}". Expected <cs2|lol|dota2|valorant>:<id>`);
      }
      args.matchIds.set(game, matchId);
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
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
    throw new Error(`${method} ${path} -> ${response.status}: ${payload.error ?? response.statusText}`);
  }
  return payload.data ?? payload;
}

function summarizeBoard(game, result) {
  if (result.status === 'failed') {
    return {
      game,
      label: GAME_LABELS[game],
      status: 'failed',
      gate: 'failed',
      blocker: result.error,
    };
  }
  const boardState = result.board?.summary?.boardState ?? 'unknown';
  const completeness = result.board?.summary?.completeness ?? 0;
  const analysisStatus = result.audit?.analysis?.status ?? 'unknown';
  const gateStatus = result.audit?.gate?.status ?? 'unknown';
  const lifecycle = result.lifecycle;
  const blockers =
    result.audit?.gate?.currentSource?.blockers ??
    result.audit?.gate?.blockers ??
    [];
  return {
    game,
    label: GAME_LABELS[game],
    status: gateStatus === 'verified' ? 'verified' : 'blocked',
    boardState,
    completeness,
    analysis: analysisStatus,
    gate: gateStatus,
    lifecycle: lifecycle
      ? {
          closing: lifecycle.closing,
          settlement: lifecycle.settlement,
          statistics: lifecycle.statistics,
        }
      : null,
    blocker:
      blockers[0] ??
      result.audit?.analysis?.detail ??
      result.board?.summary?.stages?.find((stage) => stage.status !== 'passed')?.detail ??
      null,
  };
}

async function runBoard(base, game, options) {
  const matchId = options.matchIds.get(game);
  const normalizeBody = {
    refreshSources: true,
    discoverMarkets: true,
  };
  if (matchId) normalizeBody.preferredExternalMatchId = matchId;

  const auditBody = { executeAnalysis: options.executeAnalysis };
  if (matchId) auditBody.preferredExternalMatchId = matchId;

  console.log(`[smoke] ${GAME_LABELS[game]} normalize`);
  const board = await request(base, 'POST', `/validation-lab/boards/${game}/normalize`, normalizeBody);

  console.log(`[smoke] ${GAME_LABELS[game]} release audit`);
  const audit = await request(base, 'POST', `/validation-lab/release-audits/${game}`, auditBody);

  console.log(`[smoke] ${GAME_LABELS[game]} lifecycle`);
  const lifecycle = await request(base, 'GET', `/validation-lab/lifecycle/${game}`);

  return {
    status: 'completed',
    preferredExternalMatchId: matchId ?? null,
    board,
    audit,
    lifecycle,
  };
}

function printSummary(summaries) {
  console.log('\nCurrent-source smoke summary');
  for (const item of summaries) {
    const badge = item.status === 'verified' ? 'OK' : item.status === 'failed' ? 'FAIL' : 'BLOCKED';
    const completeness =
      typeof item.completeness === 'number' ? `${Math.round(item.completeness * 100)}%` : '--';
    console.log(
      `[${badge}] ${item.label}: gate=${item.gate} board=${item.boardState ?? '--'} completeness=${completeness}`,
    );
    if (item.blocker) console.log(`      ${item.blocker}`);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(2);
}

if (args.help) {
  printUsage();
  process.exit(0);
}

const base = process.env.POLYRADER_API_BASE ?? 'http://127.0.0.1:3001/api';
const startedAt = new Date().toISOString();
const results = [];

for (const game of GAMES) {
  try {
    const result = await runBoard(base, game, args);
    results.push({ game, ...result });
  } catch (error) {
    const failed = {
      game,
      status: 'failed',
      preferredExternalMatchId: args.matchIds.get(game) ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
    results.push(failed);
    console.error(`[smoke] ${GAME_LABELS[game]} failed: ${failed.error}`);
    if (args.failFast) break;
  }
}

const summaries = results.map((result) => summarizeBoard(result.game, result));
const verifiedCount = summaries.filter((item) => item.status === 'verified').length;
const report = {
  generatedAt: new Date().toISOString(),
  startedAt,
  base,
  executeAnalysis: args.executeAnalysis,
  verifiedCount,
  total: GAMES.length,
  releaseReady: verifiedCount === GAMES.length,
  summaries,
  results,
};

printSummary(summaries);

if (args.output) {
  const outputPath = resolve(args.output);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[smoke] wrote ${outputPath}`);
}

if (!report.releaseReady) process.exit(1);

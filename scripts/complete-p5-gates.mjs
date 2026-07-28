#!/usr/bin/env node
/**
 * Complete Phase 5 release gates for all four boards (test/integration only).
 *
 * Usage:
 *   node scripts/complete-p5-gates.mjs
 *   POLYRADER_API_BASE=http://127.0.0.1:3001/api node scripts/complete-p5-gates.mjs
 */
const base = process.env.POLYRADER_API_BASE ?? 'http://127.0.0.1:3001/api';

const response = await fetch(`${base}/validation-lab/p5/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nonce: `p5-script-${Date.now()}` }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(payload.error ?? response.statusText);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify(payload.data, null, 2)}\n`);

import type { AnalysisRequestEnvelope, EsportsGame } from './types';
import { ANALYSIS_OUTPUT_SCHEMA, ANALYSIS_SYSTEM_PROMPT } from './types';

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** Browser-safe SHA-256 (sync) for artifact hashes. */
export function sha256Hex(input: string): string {
  const bytes = utf8Encode(input);
  const hash = sha256(bytes);
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashDataSnapshot(facts: AnalysisRequestEnvelope['dataSnapshot']): string {
  return `sha256:${sha256Hex(stableStringify(facts))}`;
}

export function hashPromptPackage(input: {
  systemPrompt: string;
  userEnvelope: AnalysisRequestEnvelope;
  outputSchema?: unknown;
}): string {
  const payload = {
    systemPrompt: input.systemPrompt,
    userEnvelope: input.userEnvelope,
    outputSchema: input.outputSchema ?? ANALYSIS_OUTPUT_SCHEMA,
  };
  return `sha256:${sha256Hex(stableStringify(payload))}`;
}

export function buildRunId(input: {
  game: EsportsGame;
  matchId: string;
  marketId: string;
  now?: Date;
  nonce?: string;
}): string {
  const stamp = (input.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const nonce = input.nonce ?? Math.random().toString(36).slice(2, 6);
  const match = input.matchId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'match';
  const market = input.marketId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'market';
  return `ar_${input.game}_${match}_${market}_${stamp}_${nonce}`;
}

export function buildPromptArtifacts(envelope: AnalysisRequestEnvelope): {
  systemPrompt: string;
  userEnvelopeJson: string;
  outputSchemaJson: string;
  promptHash: string;
} {
  const userEnvelopeJson = stableStringify(envelope);
  const outputSchemaJson = stableStringify(ANALYSIS_OUTPUT_SCHEMA);
  const systemPrompt = `${ANALYSIS_SYSTEM_PROMPT}\n\nOUTPUT_SCHEMA:\n${outputSchemaJson}`;
  const promptHash = hashPromptPackage({
    systemPrompt,
    userEnvelope: envelope,
    outputSchema: ANALYSIS_OUTPUT_SCHEMA,
  });
  return { systemPrompt, userEnvelopeJson, outputSchemaJson, promptHash };
}

export { stableStringify };

function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0xd800 || code >= 0xe000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

// Minimal SHA-256 — sufficient for deterministic artifact hashes in Node and browser.
function sha256(message: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const l = message.length;
  const bitLenHi = Math.floor(l / 0x20000000);
  const bitLenLo = (l << 3) >>> 0;
  const withOne = l + 1;
  const padLen = (withOne % 64 < 56 ? 56 : 120) - (withOne % 64);
  const total = withOne + padLen + 8;
  const bytes = new Uint8Array(total);
  bytes.set(message);
  bytes[l] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(total - 8, bitLenHi, false);
  view.setUint32(total - 4, bitLenLo, false);

  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function rotr(n: number, x: number): number {
  return ((n >>> x) | (n << (32 - x))) >>> 0;
}

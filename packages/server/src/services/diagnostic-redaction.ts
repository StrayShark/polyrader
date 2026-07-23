import type { ProviderFailureCategory } from '@polyrader/core';

export function sanitizeDiagnosticText(value: string, maxLength = 500): string {
  return value
    .replace(/(api[_-]?key|authorization|bearer)(\s*[:=]?\s*)\S+/gi, '$1$2[redacted]')
    .replace(/\baccount(?:\s+id)?\s*(?:\([^)]*\)|[:#]?\s*[a-z0-9_-]{4,})/gi, 'account [redacted]')
    .replace(/\brequest\s+id\s*:\s*[a-z0-9-]+/gi, 'request id: [redacted]')
    .replace(/\b0x[a-f0-9]{40}\b/gi, '[wallet redacted]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email redacted]')
    .replace(/https?:\/\/[^\s"]+/gi, '[link omitted]')
    .replace(/\/(?:Users|home)\/[^\s"']+/g, '[path omitted]')
    .slice(0, maxLength);
}

export function classifyProviderFailure(message: string): ProviderFailureCategory {
  const normalized = message.toLowerCase();
  if (/invalidsubscription|subscription|codingplan|renewal|expired plan/.test(normalized)) {
    return 'subscription';
  }
  if (/quota|insufficient credits?|billing limit|credit balance/.test(normalized)) return 'quota';
  if (/rate.?limit|too many requests|\b429\b/.test(normalized)) return 'rate_limit';
  if (/timeout|timed out|aborterror|deadline exceeded/.test(normalized)) return 'timeout';
  if (/not configured|no executable llm provider|api key not configured/.test(normalized)) {
    return 'not_configured';
  }
  if (
    /\b401\b|\b403\b|unauthori[sz]ed|forbidden|cannot be decrypted|authentication/.test(normalized)
  ) {
    return 'authentication';
  }
  if (/schema|validation|malformed|invalid response|json/.test(normalized)) {
    return 'schema_validation';
  }
  if (/api error|upstream|\b4\d\d\b|\b5\d\d\b/.test(normalized)) return 'upstream';
  return 'unknown';
}

export function sanitizeDiagnosticValue<T>(value: T): T {
  if (typeof value === 'string') return sanitizeDiagnosticText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, item]) => [key, sanitizeDiagnosticValue(item)]),
    ) as T;
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  return /(?:api.?key|secret|passphrase|authorization|private.?key|wallet|address|account.?id|database.?path|db.?path)/i.test(
    key,
  );
}

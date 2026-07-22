import { describe, expect, it } from 'vitest';
import { isAllowedSidecarOrigin } from '../utils/cors-origin';

describe('isAllowedSidecarOrigin', () => {
  it.each([
    undefined,
    'http://localhost',
    'http://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:5196',
    'http://[::1]:5196',
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
  ])('allows local desktop origin %s', (origin) => {
    expect(isAllowedSidecarOrigin(origin)).toBe(true);
  });

  it.each([
    'https://example.com',
    'http://localhost.evil.example',
    'http://127.0.0.1.evil.example:5196',
    'tauri://remote',
  ])('rejects non-local origin %s', (origin) => {
    expect(isAllowedSidecarOrigin(origin)).toBe(false);
  });
});

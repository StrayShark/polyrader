const SIDECAR_ORIGIN_PATTERNS = [
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/,
  /^https?:\/\/\[::1\](?::\d+)?$/,
  /^tauri:\/\/localhost$/,
  /^https?:\/\/tauri\.localhost$/,
];

export function isAllowedSidecarOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return SIDECAR_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

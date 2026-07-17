import { getApiBase } from './tauri-bridge';
import type { AddressGraph } from '@polyrader/core';

let apiBasePromise: Promise<string> | null = null;

export async function getBase(): Promise<string> {
  if (!apiBasePromise) {
    apiBasePromise = getApiBase();
  }
  return apiBasePromise;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getBase();
  const { headers: customHeaders, ...restOptions } = options ?? {};
  const response = await fetch(`${base}${path}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...customHeaders,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : (null as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function getAddressGraph(): Promise<AddressGraph> {
  const { data } = await api.get<{ data: AddressGraph }>('/whales/graph');
  return data;
}

export async function exportDatabase(filename?: string): Promise<void> {
  await downloadFile('/backup/export', filename ?? `polyrader-backup-${new Date().toISOString().slice(0, 10)}.db`);
}

export async function exportDatabaseCsv(filename?: string): Promise<void> {
  await downloadFile('/backup/export/csv', filename ?? `polyrader-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportDatabaseJson(filename?: string): Promise<void> {
  await downloadFile('/backup/export/json', filename ?? `polyrader-export-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function importDatabase(file: File): Promise<{ message: string }> {
  const base = await getBase();
  const response = await fetch(`${base}/backup/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: await file.arrayBuffer(),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(json.error ?? `Import failed: ${response.status}`);
  }
  return json as { message: string };
}

async function downloadFile(path: string, filename: string): Promise<void> {
  const base = await getBase();
  const response = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

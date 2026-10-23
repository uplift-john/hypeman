import type { HealthResponse, HypeRequest, HypeResponse } from '../../shared/types';
import { ApiError, type HypeApi } from '../session/engine';

const TIMEOUT_MS = 35_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: ctrl.signal });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    throw new ApiError(0, aborted ? 'Hypeman took too long to answer. Will try again later.' : "Can't reach the Hypeman server. Is `npm run dev` still running?");
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `Server error (${res.status}).`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api: HypeApi & { health(): Promise<HealthResponse> } = {
  health: () => request<HealthResponse>('/api/health'),
  hype: (req: HypeRequest) =>
    request<HypeResponse>('/api/hype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
};

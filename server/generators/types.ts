import type { HypeRequest, HypeResponse, Mode } from '../../shared/types';

export interface Generator {
  mode: Mode;
  model: string | null;
  generate(req: HypeRequest, signal?: AbortSignal): Promise<HypeResponse>;
}

/** Raised for upstream failures; message is safe to show (never contains request data). */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'auth' | 'rate-limit' | 'upstream',
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

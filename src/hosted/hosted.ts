import type { EngineDeps } from '../session/engine';
import { createHostedApi, getSample } from './hostedApi';
import { createScreenshotSource } from './screenshotSource';

/** True in the hosted (claude.ai artifact) build: screenshot input, Claude via the page runtime. */
export const HOSTED = import.meta.env.VITE_HOSTED === '1';

export const screenshots = createScreenshotSource();

type Mode = 'real' | 'mock';
let sampleFn: Awaited<ReturnType<typeof getSample>> = null;
let mode: Mode | null = null;
const modeListeners = new Set<(m: Mode) => void>();

function setMode(m: Mode) {
  mode = m;
  modeListeners.forEach((l) => l(m));
}

/** Resolve whether Claude is available in this view; mock lines otherwise. */
export function watchHostedMode(fn: (m: Mode) => void): () => void {
  modeListeners.add(fn);
  if (mode) fn(mode);
  return () => modeListeners.delete(fn);
}

if (HOSTED) {
  void getSample().then((s) => {
    sampleFn = s;
    setMode(s ? 'real' : 'mock');
  });
}

export const hostedDeps: Partial<EngineDeps> = HOSTED
  ? {
      manualOnly: true,
      startCapture: async () => screenshots.handle(),
      api: createHostedApi(screenshots, () => sampleFn, setMode),
    }
  : {};

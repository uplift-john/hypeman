import type { CaptureHandle } from '../session/engine';

/**
 * Screenshot-backed "capture" for the hosted demo, where live screen sharing isn't
 * available: the viewer pastes, drops or picks an image. It lives in memory only.
 */
export interface ScreenshotSource {
  get(): Blob | null;
  previewUrl(): string | null;
  set(blob: Blob | null): void;
  subscribe(fn: () => void): () => void;
  handle(): CaptureHandle;
}

export function createScreenshotSource(): ScreenshotSource {
  let blob: Blob | null = null;
  let url: string | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    get: () => blob,
    previewUrl: () => url,
    set(next) {
      if (url) URL.revokeObjectURL(url);
      blob = next;
      url = next ? URL.createObjectURL(next) : null;
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    handle() {
      return {
        hint: undefined,
        sampleThumb: () => null,
        // The hosted API reads the Blob directly; this only signals whether a frame exists.
        grabFrame: async () => (blob ? 'data:image/jpeg;base64,' : null),
        onEnded: () => {},
        stop: () => {},
      };
    },
  };
}

/** Pull the first image out of a paste or drop. */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/')) return f;
  return null;
}

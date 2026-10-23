import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { imageFromDataTransfer } from '../hosted/screenshotSource';
import { screenshots } from '../hosted/hosted';
import { Button } from './ui';

/** Hosted build only: where the viewer gives Hypeman something to look at. */
export function ScreenshotPanel() {
  const url = useSyncExternalStore(screenshots.subscribe, screenshots.previewUrl);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Paste anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = imageFromDataTransfer(e.clipboardData);
      if (f) {
        e.preventDefault();
        screenshots.set(f);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <section
      aria-label="Screenshot"
      className={`rounded-[var(--radius-card)] border-2 border-dashed p-4 transition-colors sm:p-5 ${over ? 'border-accent bg-accent-soft' : 'border-line-strong/50 bg-surface'}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = imageFromDataTransfer(e.dataTransfer);
        if (f) screenshots.set(f);
      }}
    >
      <input
        ref={input}
        id="screenshot-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) screenshots.set(f);
          e.target.value = '';
        }}
      />
      {url ? (
        <div className="flex items-center gap-4">
          <img src={url} alt="Your screenshot" className="h-20 w-32 shrink-0 rounded-xl border border-line object-cover object-top" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Screenshot ready</p>
            <p className="mt-0.5 text-sm text-muted">Paste or drop another anytime. It stays in this tab.</p>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => input.current?.click()}>Replace</Button>
              <Button variant="ghost" onClick={() => screenshots.set(null)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="font-semibold">Show Hypeman what’s going on</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Paste a screenshot (⌘/Ctrl+V), drop one here, or choose a file. A group chat, a call, your photos, a game, anything.
          </p>
          <Button className="mt-3" onClick={() => input.current?.click()}>
            Choose a screenshot
          </Button>
        </div>
      )}
    </section>
  );
}

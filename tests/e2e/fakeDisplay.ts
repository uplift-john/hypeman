import type { Page } from '@playwright/test';
import { SCREEN_FIXTURES } from '../../shared/fixtures';

export type FakeDisplayMode = 'grant' | 'deny' | 'cancel' | 'unsupported';

/**
 * Replaces navigator.mediaDevices.getDisplayMedia with a canvas-backed stream that
 * renders one of the shared screen fixtures. Exposes window.__fakeDisplay to tests:
 *   setScreen(id)  – switch fixture (also counts as activity)
 *   freeze()/unfreeze() – stop/start the animated "typing" so idle detection kicks in
 *   end()          – simulate the user ending the share from browser chrome
 *   setMode(m)     – what the next getDisplayMedia call does
 */
export async function installFakeDisplay(page: Page, opts: { screen?: string; mode?: FakeDisplayMode } = {}) {
  await page.addInitScript(
    ({ fixtures, screen, mode }) => {
      type Fx = (typeof fixtures)[number];
      const state = { screen: screen as string, mode: mode as string, frozen: false, tick: 0, track: null as MediaStreamTrack | null, calls: 0 };
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 800;
      const ctx = canvas.getContext('2d')!;

      function draw() {
        const f: Fx = fixtures.find((x) => x.id === state.screen) ?? fixtures[0];
        const v = f.visual;
        ctx.fillStyle = v.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = v.accent;
        ctx.fillRect(0, 0, canvas.width, 56);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(f.title, 24, 36);
        ctx.fillStyle = v.fg;
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText(v.heading, 48, 140);
        ctx.font = '26px monospace';
        v.lines.forEach((l, i) => ctx.fillText(l, 48, 210 + i * 44));
        if (!state.frozen && v.lines.length) {
          // A blinking, growing "cursor" so the pixel-diff sees activity.
          const w = 40 + ((state.tick * 37) % 600);
          ctx.fillStyle = v.accent;
          ctx.fillRect(48, 210 + v.lines.length * 44, w, 24);
        }
      }
      draw();
      setInterval(() => {
        if (!state.frozen) state.tick++;
        draw();
      }, 1000);

      const api = {
        setScreen(id: string) {
          state.screen = id;
          state.tick++;
          draw();
        },
        freeze() {
          state.frozen = true;
          draw();
        },
        unfreeze() {
          state.frozen = false;
          state.tick++;
          draw();
        },
        end() {
          if (state.track) {
            state.track.stop();
            state.track.dispatchEvent(new Event('ended'));
          }
        },
        setMode(m: string) {
          state.mode = m;
        },
        get calls() {
          return state.calls;
        },
      };
      (window as unknown as { __fakeDisplay: typeof api }).__fakeDisplay = api;

      if (state.mode === 'unsupported') {
        Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
        return;
      }
      const md = navigator.mediaDevices;
      md.getDisplayMedia = async () => {
        state.calls++;
        if (state.mode === 'deny') throw new DOMException('Permission denied', 'NotAllowedError');
        if (state.mode === 'cancel') throw new DOMException('Permission dismissed by user (cancelled)', 'NotAllowedError');
        const stream = canvas.captureStream(5);
        const track = stream.getVideoTracks()[0];
        const f = fixtures.find((x) => x.id === state.screen) ?? fixtures[0];
        Object.defineProperty(track, 'label', { value: f.title, configurable: true });
        state.track = track;
        return stream;
      };
    },
    { fixtures: SCREEN_FIXTURES, screen: opts.screen ?? 'sheet', mode: opts.mode ?? 'grant' },
  );
}

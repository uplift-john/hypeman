import { createMockGenerator } from '../../server/generators/mock';
import { systemPrompt, userPrompt } from '../../server/prompt';
import { postFilter } from '../../shared/postFilter';
import type { HypeRequest, HypeResponse } from '../../shared/types';
import { ApiError, type HypeApi } from '../session/engine';
import type { ScreenshotSource } from './screenshotSource';
import { recordedLinesFor } from './voicePack';

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json<T>(input: string, opts?: Record<string, unknown>): Promise<T>;
  limits(): Promise<{ images?: unknown }>;
};

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

/** Resolves the page's Claude sampling capability, or null outside a Claude viewer. */
export async function getSample(): Promise<SampleFn | null> {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!claude?.use) return null;
  try {
    const sample = (await claude.use('sample')) as SampleFn | null;
    if (!sample) return null;
    const limits = await sample.limits().catch(() => null);
    return limits?.images ? sample : null;
  } catch {
    return null;
  }
}

const HIDE_CODES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable']);

/**
 * Hosted "server": asks Claude about the screenshot via the viewer's own Claude
 * access; falls back to canned lines when that isn't available or allowed.
 */
export function createHostedApi(source: ScreenshotSource, getSampleFn: () => SampleFn | null, onModeChange: (m: 'real' | 'mock') => void): HypeApi {
  const mock = createMockGenerator();
  let useClaude = true;

  return {
    async hype(req: HypeRequest): Promise<HypeResponse> {
      const sample = getSampleFn();
      const blob = source.get();
      if (!useClaude || !sample) return mock.generate({ ...req, image: undefined });
      if (!blob) return { speak: false, line: '', reason: 'no-frame', mode: 'real' };
      // With a recorded voice pack, Claude picks one of the recorded reactions so it's always heard in Hypeman's real voice.
      const menu = recordedLinesFor(req.persona).filter((l) => !req.recent.includes(l));
      const menuText = menu.length
        ? `\n\nYour voice is pre-recorded. If you speak, "line" MUST be copied exactly from this list — pick the reaction that best fits what's on screen:\n${menu.map((l) => `- ${l}`).join('\n')}`
        : '';
      const prompt = `${systemPrompt(req.persona)}\n\n---\n\n${userPrompt({ recent: req.recent, trigger: req.trigger })}${menuText}\n\nThe attached image is the screenshot.`;
      try {
        const out = await sample.json<{ speak?: unknown; line?: unknown; reason?: unknown }>(prompt, {
          images: [blob],
          modelTier: 'default',
          effort: 'low',
          cache: false,
        });
        if (!out || typeof out !== 'object' || out.speak !== true || typeof out.line !== 'string') {
          const reason = typeof out?.reason === 'string' && /sensitiv/i.test(out.reason) ? 'sensitive' : 'nothing-notable';
          return { speak: false, line: '', reason, mode: 'real' };
        }
        const res = postFilter(out.line, req.recent);
        return res.ok ? { speak: true, line: res.line, reason: 'ok', mode: 'real' } : { speak: false, line: '', reason: res.reason, mode: 'real' };
      } catch (e) {
        const code = (e as { code?: string })?.code ?? 'upstream_error';
        if (HIDE_CODES.has(code)) {
          useClaude = false;
          onModeChange('mock');
          return mock.generate({ ...req, image: undefined });
        }
        if (code === 'refused') return { speak: false, line: '', reason: 'sensitive', mode: 'real' };
        if (code === 'rate_limited') throw new ApiError(429, 'Claude is busy for you right now.');
        if (code === 'invalid_json' || code === 'empty_completion') return { speak: false, line: '', reason: 'unparseable', mode: 'real' };
        throw new ApiError(502, 'Claude couldn’t be reached.');
      }
    },
  };
}


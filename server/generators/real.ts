import Anthropic from '@anthropic-ai/sdk';
import { CLIPS, hasClips, pickClip } from '../../shared/clips';
import { postFilter } from '../../shared/postFilter';
import type { HypeRequest, HypeResponse } from '../../shared/types';
import { RESPONSE_SCHEMA, systemPrompt, userPrompt } from '../prompt';
import { UpstreamError, type Generator } from './types';

/** Current Claude Sonnet model (see README → "Model"). */
export const MODEL = 'claude-sonnet-5-5';
export const REQUEST_TIMEOUT_MS = 25_000;

type MessagesClient = Pick<Anthropic, 'beta'>;

function parseDataUrl(dataUrl: string): { media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  return { media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp', data: m[2] };
}

export function createRealGenerator(client: MessagesClient): Generator {
  return {
    mode: 'real',
    model: MODEL,
    async generate(req: HypeRequest, signal?: AbortSignal): Promise<HypeResponse> {
      const silent = (reason: string): HypeResponse => ({ speak: false, line: '', reason, mode: 'real' });
      const img = req.image ? parseDataUrl(req.image) : null;
      // Real mode only talks about what it can see or hear.
      if (!img && !req.transcript) return silent('no-frame');
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
      const clipLines = req.useClips ? CLIPS.filter((c) => c.text && !req.recentClips?.includes(c.id)).map((c) => c.text) : undefined;
      content.push({ type: 'text', text: userPrompt({ recent: req.recent, hint: req.hint, trigger: req.trigger, transcript: req.transcript, hasImage: !!img, clipLines }) });

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages.create(
          {
            model: MODEL,
            max_tokens: 2000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> } },
            system: systemPrompt(req.persona),
            messages: [
              {
                role: 'user',
                content,
              },
            ],
          },
          { timeout: REQUEST_TIMEOUT_MS, maxRetries: 1, signal },
        );
      } catch (err) {
        throw toUpstreamError(err);
      }

      if (message.stop_reason === 'refusal') return silent('refusal');
      if (message.stop_reason === 'max_tokens') return silent('truncated');
      const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      const parsed = parseModelJson(text);
      if (!parsed) return silent('unparseable');
      if (!parsed.speak) return silent(normaliseReason(parsed.reason));
      if (req.useClips && hasClips) {
        const clip = pickClip({ vibe: parsed.vibe, line: parsed.line, recent: req.recentClips ?? [], rng: Math.random });
        if (clip) return { speak: true, line: clip.text, clipId: clip.id, reason: 'ok', mode: 'real' };
      }
      const res = postFilter(parsed.line, req.recent);
      if (!res.ok) return silent(res.reason);
      return { speak: true, line: res.line, reason: 'ok', mode: 'real' };
    },
  };
}

export function parseModelJson(text: string): { speak: boolean; line: string; reason: string; vibe?: string } | null {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const v: unknown = JSON.parse(text.slice(start, end + 1));
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    if (typeof o.speak !== 'boolean' || typeof o.line !== 'string') return null;
    return { speak: o.speak, line: o.line, reason: typeof o.reason === 'string' ? o.reason : '', vibe: typeof o.vibe === 'string' ? o.vibe : undefined };
  } catch {
    return null;
  }
}

/** The model's reason is internal; keep it short and never echo screen content beyond a few words. */
function normaliseReason(r: string): string {
  if (/sensitiv/i.test(r)) return 'sensitive';
  return r.replace(/\s+/g, ' ').trim().slice(0, 60) || 'declined';
}

function toUpstreamError(err: unknown): UpstreamError {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new UpstreamError('The model took too long to answer.', 'timeout');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new UpstreamError('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.', 'auth');
  if (err instanceof Anthropic.RateLimitError) return new UpstreamError('The Anthropic API is rate limiting requests.', 'rate-limit');
  if (err instanceof Anthropic.APIUserAbortError) return new UpstreamError('Request cancelled.', 'timeout');
  if (err instanceof Anthropic.APIError) return new UpstreamError(`The Anthropic API returned an error (${err.status ?? 'network'}).`, 'upstream');
  return new UpstreamError('Could not reach the model.', 'upstream');
}

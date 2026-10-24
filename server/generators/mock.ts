import { contextFromTitle, fakeContext, type ScreenContext } from '../../shared/context';
import { MOCK_LINES, TALK_LINES, renderLine, talkVibe } from '../../shared/mockLines';
import { postFilter } from '../../shared/postFilter';
import { isSensitiveHint, isSensitiveTalk } from '../../shared/sensitive';
import type { HypeRequest, HypeResponse } from '../../shared/types';
import type { Generator } from './types';

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Zero-setup generator: picks a canned line for the (title-derived or fake) context.
 * Same rules as real mode: silence on sensitive/blank screens, never repeats.
 */
export function createMockGenerator(rng: () => number = Math.random): Generator {
  return {
    mode: 'mock',
    model: null,
    async generate(req: HypeRequest): Promise<HypeResponse> {
      const silent = (reason: string, ctx?: ScreenContext): HypeResponse => ({
        speak: false,
        line: '',
        reason,
        mode: 'mock',
        context: ctx && { category: ctx.category, subject: ctx.subject, source: ctx.source },
      });

      if (isSensitiveHint(req.hint)) return silent('sensitive');

      // Listen mode: react to the vibe of what was just said.
      if (req.transcript) {
        if (isSensitiveTalk(req.transcript)) return silent('sensitive');
        const words = req.transcript.trim().split(/\s+/).length;
        if (words < 4) return silent('nothing-notable');
        const vibe = talkVibe(req.transcript);
        const pool = [...shuffle(TALK_LINES[vibe][req.persona], rng), ...shuffle(TALK_LINES.any[req.persona], rng)];
        for (const line of pool) {
          const res = postFilter(line, req.recent);
          if (res.ok) return { speak: true, line: res.line, reason: 'ok', mode: 'mock' };
        }
        return silent('exhausted');
      }
      const ctx = contextFromTitle(req.hint, rng) ?? fakeContext(rng);
      if (ctx.category === 'blank') return silent('nothing-notable', ctx);

      // Mostly quick universal reactions, sometimes one that nods at what's on screen.
      const mine = MOCK_LINES.filter((l) => l.persona === req.persona && (l.category === ctx.category || l.category === 'any'));
      const others = MOCK_LINES.filter((l) => l.persona !== req.persona && (l.category === ctx.category || l.category === 'any'));
      const ordered = [...shuffle(mine, rng), ...shuffle(others, rng)];
      for (const tpl of ordered) {
        const res = postFilter(renderLine(tpl.text, ctx), req.recent);
        if (res.ok) {
          return {
            speak: true,
            line: res.line,
            reason: 'ok',
            mode: 'mock',
            context: { category: ctx.category, subject: ctx.subject, source: ctx.source },
          };
        }
      }
      return silent('exhausted', ctx);
    },
  };
}

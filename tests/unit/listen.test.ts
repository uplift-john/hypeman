import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { createMockGenerator } from '../../server/generators/mock';
import { createRealGenerator } from '../../server/generators/real';
import type { Generator } from '../../server/generators/types';
import { userPrompt } from '../../server/prompt';
import { talkVibe } from '../../shared/mockLines';
import { isSensitiveTalk } from '../../shared/sensitive';
import { LIMITS_LISTEN, MOMENT_MIN_INTERVAL_MS } from '../../src/session/engine';
import { MIN_NEW_WORDS, PAUSE_MS, TranscriptBuffer } from '../../src/listen/transcript';
import { assertSpacing } from './invariants';
import { MIN, makeHarness, seeded, uniqueLine } from './harness';

describe('transcript buffer & pause detection', () => {
  it('keeps only the last ~45 s, oldest first', () => {
    const b = new TranscriptBuffer();
    b.addFinal('first thing', 0);
    b.addFinal('second thing', 30_000);
    b.addFinal('third thing', 60_000);
    expect(b.text(60_000)).toBe('second thing third thing');
  });

  it('fires one moment per natural pause, only after enough new words, never mid-sentence', () => {
    const b = new TranscriptBuffer();
    b.addFinal('so we finally shipped the new app today', 1_000);
    expect(b.takeMoment(1_000 + PAUSE_MS - 1)).toBe(false); // still talking
    b.setInterim('and the', 1_500);
    expect(b.takeMoment(1_500 + PAUSE_MS + 10)).toBe(false); // someone is mid-sentence
    b.setInterim('', 1_600);
    b.addFinal('and the team loved it', 2_000);
    expect(b.takeMoment(2_000 + PAUSE_MS)).toBe(true);
    expect(b.takeMoment(2_000 + PAUSE_MS + 5_000)).toBe(false); // consumed
    b.addFinal('yeah', 9_000);
    expect(b.takeMoment(9_000 + PAUSE_MS)).toBe(false); // too few new words
    expect(MIN_NEW_WORDS).toBeGreaterThan(1);
  });

  it('clear() forgets everything (used while Hypeman is speaking)', () => {
    const b = new TranscriptBuffer();
    b.addFinal('yesssir hype man in the house', 0);
    b.clear();
    expect(b.text(0)).toBe('');
    expect(b.takeMoment(10_000)).toBe(false);
  });
});

describe('listen-mode content', () => {
  it('reads the vibe of the latest words', () => {
    expect(talkVibe('haha that is so funny')).toBe('funny');
    expect(talkVibe('I think you are right, that makes sense')).toBe('agree');
    expect(talkVibe('guess what, I got promoted today')).toBe('win');
    expect(talkVibe('we went to the store')).toBe('any');
  });

  it('sensitive conversations get silence and are never forwarded', async () => {
    expect(isSensitiveTalk('my mom passed away last week')).toBe(true);
    expect(isSensitiveTalk('what is your password again')).toBe(true);
    expect(isSensitiveTalk('this pizza is amazing')).toBe(false);
    const gen: Generator = { mode: 'real', model: 'm', generate: vi.fn() };
    const app = createApp({ generator: gen, allowedOrigins: [], log: () => {} });
    const res = await app.request('/api/hype', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'the biopsy results came back' }),
    });
    expect(await res.json()).toMatchObject({ speak: false, reason: 'sensitive' });
    expect(gen.generate).not.toHaveBeenCalled();
  });

  it('mock mode reacts to what was said, in persona', async () => {
    const gen = createMockGenerator(seeded(2));
    const r = await gen.generate({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'haha no way, that is hilarious' });
    expect(r.speak).toBe(true);
    expect(["That's hilarious!", 'Stop, I can’t.', 'Comedy gold.', 'Okay, that got me.']).toContain(r.line);
    expect((await gen.generate({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'ok' })).speak).toBe(false);
  });

  it('server accepts the moment trigger and trims long transcripts to the most recent part', async () => {
    const seen: string[] = [];
    const gen: Generator = { mode: 'mock', model: null, generate: async (req) => (seen.push(req.transcript ?? ''), { speak: false, line: '', reason: 'x', mode: 'mock' }) };
    const app = createApp({ generator: gen, allowedOrigins: [], log: () => {} });
    const long = 'a'.repeat(1_500) + ' END';
    const ok = await app.request('/api/hype', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'b'.repeat(1_000) + long }) });
    expect(ok.status).toBe(200);
    expect(seen[0].length).toBeLessThanOrEqual(2_000);
    expect(seen[0].endsWith('END')).toBe(true);
  });

  it('real mode sends text only (no image) for listen-only, with the listening instructions', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: '{"speak":true,"line":"Facts.","reason":"ok"}' }], stop_reason: 'end_turn' }));
    const gen = createRealGenerator({ beta: { messages: { create } } } as never);
    const r = await gen.generate({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'honestly the second album is way better' });
    expect(r).toMatchObject({ speak: true, line: 'Facts.' });
    const params = (create.mock.calls[0] as unknown as [{ messages: Array<{ content: Array<{ type: string; text?: string }> }> }])[0];
    const content = params.messages[0].content;
    expect(content.map((c) => c.type)).toEqual(['text']);
    expect(content[0].text).toContain('<conversation>');
    expect(content[0].text).toContain('never take sides');
    expect(userPrompt({ recent: [], trigger: 'moment', transcript: 'x', hasImage: false })).toContain('conversation just paused');
  });
});

describe('engine in listen mode', () => {
  it('no screen share, no timer, no sampling: only conversation moments trigger comments', async () => {
    const h = makeHarness();
    h.engine.setKind('listen');
    h.engine.setTranscriptSource(() => 'we just won the whole tournament');
    await h.engine.start();
    expect(h.engine.nextAttemptAt).toBeNull();
    await h.time.advance(30 * MIN);
    expect(h.calls).toHaveLength(0);
    expect(h.capture.thumbs).toBe(0);
    await h.engine.moment();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ trigger: 'moment', transcript: 'we just won the whole tournament', image: undefined });
  });

  it('a chatty room can’t spam the model (30 s floor) or break the listen limits (4 per 10 min, ≥ 60 s apart)', async () => {
    const h = makeHarness();
    h.setResponder(() => ({ speak: true, line: uniqueLine(), reason: 'ok', mode: 'mock' }));
    h.engine.setKind('listen');
    h.engine.setTranscriptSource(() => 'haha that is so funny');
    await h.engine.start();
    for (let i = 0; i < 600; i++) {
      await h.engine.moment();
      await h.time.advance(2_000); // a pause every 2 s for 20 minutes
    }
    expect(h.calls.length).toBeLessThanOrEqual((20 * MIN) / MOMENT_MIN_INTERVAL_MS + 1);
    const spoken = h.spoken;
    for (let i = 1; i < spoken.length; i++) expect(spoken[i] - spoken[i - 1]).toBeGreaterThanOrEqual(LIMITS_LISTEN.minGapMs);
    for (let i = LIMITS_LISTEN.maxInWindow; i < spoken.length; i++) expect(spoken[i] - spoken[i - LIMITS_LISTEN.maxInWindow]).toBeGreaterThan(600_000);
    expect(h.engine.getState().maxInWindow).toBe(4);
  });

  it('switching modes carries recent comments over (can’t reset the limit by toggling)', async () => {
    const h = makeHarness();
    await h.engine.start();
    await h.engine.hypeNow();
    await h.time.advance(95_000);
    await h.engine.hypeNow();
    h.engine.stop();
    h.engine.setKind('listen');
    expect(h.engine.getState().usedInWindow).toBe(2);
    h.engine.setKind('watch');
    expect(h.engine.getState().usedInWindow).toBe(2);
    assertSpacing(h.spoken);
  });

  it('pause stops moments', async () => {
    const h = makeHarness();
    h.engine.setKind('listen');
    h.engine.setTranscriptSource(() => 'nice one');
    await h.engine.start();
    h.engine.pause();
    expect(await h.engine.moment()).toBeNull();
    expect(h.calls).toHaveLength(0);
  });
});

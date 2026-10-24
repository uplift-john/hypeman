import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMockGenerator } from '../../server/generators/mock';
import { createRealGenerator } from '../../server/generators/real';
import { CLIPS, greetingClip, hasClips, pickClip, type Clip } from '../../shared/clips';
import { makeHarness, seeded } from './harness';

const pack: Clip[] = [
  { id: 'a', src: '/clips/a.mp3', text: 'Yesssir!', vibe: 'win', durationMs: 900 },
  { id: 'b', src: '/clips/b.mp3', text: "That's hilarious!", vibe: 'funny', durationMs: 900 },
  { id: 'c', src: '/clips/c.mp3', text: "You're spot on!", vibe: 'agree', durationMs: 900 },
  { id: 'd', src: '/clips/d.mp3', text: 'Hype man in the house!', vibe: 'greeting', durationMs: 900 },
  { id: 'e', src: '/clips/e.mp3', text: 'Okay, I see you!', vibe: 'any', durationMs: 900 },
];

describe('clip pack', () => {
  it('the recorded pack is imported, normalised and every file exists', () => {
    expect(hasClips).toBe(true);
    expect(CLIPS.length).toBe(9);
    for (const c of CLIPS) {
      expect(existsSync(`public${c.src}`), c.src).toBe(true);
      expect(c.durationMs).toBeGreaterThan(500);
      expect(c.durationMs).toBeLessThan(6000);
    }
    expect(greetingClip()).toBeDefined();
  });

  it('picks an exact text match, else the vibe, else any; never a greeting mid-session', () => {
    const rng = seeded(1);
    expect(pickClip({ line: 'yesssssir', recent: [], rng, clips: pack })?.id).toBe('a');
    expect(pickClip({ vibe: 'funny', recent: [], rng, clips: pack })?.id).toBe('b');
    expect(pickClip({ vibe: 'unknown', recent: [], rng, clips: pack })?.id).toBe('e');
    for (let i = 0; i < 50; i++) expect(pickClip({ vibe: 'any', recent: [], rng, clips: pack })?.vibe).not.toBe('greeting');
  });

  it('never repeats a recent clip while others are available', () => {
    const rng = seeded(3);
    let recent: string[] = [];
    for (let i = 0; i < 40; i++) {
      const c = pickClip({ vibe: 'any', recent, rng, clips: pack })!;
      expect(recent.slice(-3)).not.toContain(c.id);
      recent = [...recent, c.id].slice(-10);
    }
  });

  it('mock mode speaks with a clip when asked to', async () => {
    const r = await createMockGenerator(seeded(1)).generate({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'haha that is so funny, honestly the best joke all week', useClips: true });
    expect(r.speak).toBe(true);
    expect(CLIPS.map((c) => c.id)).toContain(r.clipId);
  });

  it('real mode: Claude decides whether and what vibe; a matching clip is played', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: '{"speak":true,"line":"Lets go","vibe":"win","reason":"good news"}' }], stop_reason: 'end_turn' }));
    const gen = createRealGenerator({ beta: { messages: { create } } } as never);
    const r = await gen.generate({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'I got the job', useClips: true, recentClips: [] });
    expect(r.speak).toBe(true);
    expect(r.clipId).toBeDefined();
    const silent = vi.fn(async () => ({ content: [{ type: 'text', text: '{"speak":false,"line":"","vibe":"any","reason":"nothing"}' }], stop_reason: 'end_turn' }));
    const r2 = await createRealGenerator({ beta: { messages: { create: silent } } } as never).generate({ persona: 'hype', trigger: 'moment', recent: [], transcript: 'meh', useClips: true });
    expect(r2.speak).toBe(false);
    expect(r2.clipId).toBeUndefined();
  });

  it('engine accepts clip reactions without text, sends recent clip ids, and won’t replay one immediately', async () => {
    const h = makeHarness({ settings: { useClips: true } });
    let n = 0;
    h.setResponder(() => ({ speak: true, line: '', clipId: n++ < 2 ? 'clip01' : 'clip02', reason: 'ok', mode: 'mock' }));
    await h.engine.start();
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
    await h.time.advance(100_000);
    expect(await h.engine.hypeNow()).toEqual({ kind: 'silent', reason: 'duplicate' });
    expect(h.calls.at(-1)).toMatchObject({ useClips: true, recentClips: ['clip01'] });
    await h.time.advance(100_000);
    const third = await h.engine.hypeNow();
    expect(third.kind).toBe('spoke');
    expect(h.engine.getState().feed.map((f) => f.clipId)).toEqual(['clip02', 'clip01']);
  });
});

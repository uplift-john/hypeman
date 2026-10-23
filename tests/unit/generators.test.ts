import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { isNearDuplicate, remember } from '../../shared/dedupe';
import { SCREEN_FIXTURES, fixture } from '../../shared/fixtures';
import { MOCK_LINES } from '../../shared/mockLines';
import { PERSONA_IDS } from '../../shared/personas';
import { lineLooksSensitive } from '../../shared/sensitive';
import { MAX_WORDS, wordCount, type HypeRequest } from '../../shared/types';
import { createMockGenerator } from '../../server/generators/mock';
import { MODEL, createRealGenerator, parseModelJson } from '../../server/generators/real';
import { RULES, systemPrompt, userPrompt } from '../../server/prompt';
import { seeded } from './harness';

const req = (over: Partial<HypeRequest> = {}): HypeRequest => ({ persona: 'hype', recent: [], trigger: 'auto', ...over });

describe('mock generator', () => {
  it('ships 60+ canned lines across every category and persona', () => {
    expect(MOCK_LINES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MOCK_LINES.map((l) => l.text)).size).toBe(MOCK_LINES.length);
    for (const p of PERSONA_IDS) expect(MOCK_LINES.filter((l) => l.persona === p).length).toBeGreaterThanOrEqual(15);
  });

  it('lines are tiny spoken reactions (≤ 10 words before substitution)', () => {
    for (const l of MOCK_LINES) expect(wordCount(l.text), l.text).toBeLessThanOrEqual(10);
    expect(MOCK_LINES.map((l) => l.text)).toEqual(expect.arrayContaining(['Noice!', 'Yessirrrrr!', 'I see what you did there, and I like it.']));
  });

  it('every rendered line obeys the voice rules for every fixture', async () => {
    const gen = createMockGenerator(seeded(9));
    for (const f of SCREEN_FIXTURES.filter((x) => !x.sensitive && x.category !== 'blank')) {
      for (const persona of PERSONA_IDS) {
        let recent: string[] = [];
        for (let i = 0; i < 8; i++) {
          const r = await gen.generate(req({ hint: f.title, persona, recent }));
          expect(r.speak, `${f.id}/${persona}`).toBe(true);
          expect(wordCount(r.line)).toBeLessThanOrEqual(MAX_WORDS);
          expect(r.line).not.toMatch(/\{|\}/);
          expect(r.line).not.toMatch(/\b[A-Z]{4,}\b/);
          expect((r.line.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
          expect(lineLooksSensitive(r.line)).toBe(false);
          recent = remember(recent, r.line);
        }
      }
    }
  });

  it.each(['bank', 'passwords', 'dating', 'medical'])('sensitive fixture "%s" → silence', async (id) => {
    const gen = createMockGenerator(seeded(1));
    for (let i = 0; i < 20; i++) {
      const r = await gen.generate(req({ hint: fixture(id).title, trigger: i % 2 ? 'manual' : 'auto' }));
      expect(r).toMatchObject({ speak: false, line: '', reason: 'sensitive' });
    }
  });

  it('blank screen → silence', async () => {
    const r = await createMockGenerator(seeded(1)).generate(req({ hint: 'New Tab' }));
    expect(r).toMatchObject({ speak: false, reason: 'nothing-notable' });
  });

  it('never repeats (or near-repeats) within a session', async () => {
    const gen = createMockGenerator(seeded(3));
    let recent: string[] = [];
    const all: string[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await gen.generate(req({ recent }));
      if (!r.speak) continue;
      expect(isNearDuplicate(r.line, recent), r.line).toBe(false);
      recent = remember(recent, r.line);
      all.push(r.line);
    }
    expect(all.length).toBeGreaterThan(40);
  });

  it('uses the window title when there is one, a labelled fake context otherwise', async () => {
    const gen = createMockGenerator(seeded(2));
    const a = await gen.generate(req({ hint: 'Q3 Forecast - Google Sheets' }));
    expect(a.context).toMatchObject({ category: 'sheet', subject: 'Q3 Forecast', source: 'title' });
    const b = await gen.generate(req());
    expect(b.context?.source).toBe('fake');
  });
});

/* ───────────── real generator with a stubbed SDK client ───────────── */

type CreateFn = (params: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<unknown>;
function fakeClient(create: CreateFn) {
  return { beta: { messages: { create: vi.fn(create) } } } as unknown as Pick<Anthropic, 'beta'> & {
    beta: { messages: { create: ReturnType<typeof vi.fn> } };
  };
}
const msg = (text: string, stop_reason = 'end_turn') => ({ content: [{ type: 'text', text }], stop_reason });
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('real generator', () => {
  it('sends one image + the prompt to the current Sonnet model with a strict JSON schema', async () => {
    const client = fakeClient(async () => msg('{"speak":true,"line":"Q3 Forecast is shaping up nicely.","reason":"ok"}'));
    const gen = createRealGenerator(client);
    const r = await gen.generate(req({ image: IMG, persona: 'coach', recent: ['Earlier line'], hint: 'Q3 Forecast - Google Sheets' }));
    expect(r).toEqual({ speak: true, line: 'Q3 Forecast is shaping up nicely.', reason: 'ok', mode: 'real' });
    const [params, opts] = client.beta.messages.create.mock.calls[0];
    expect(params.model).toBe(MODEL);
    expect(MODEL).toBe('claude-sonnet-5-5');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.required).toEqual(['speak', 'line', 'reason']);
    expect(params.system).toContain('Coach');
    expect(params.system).toContain(RULES);
    const content = params.messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQSkZJRg==' } });
    expect(content[1].text).toContain('Earlier line');
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it('without a frame it stays silent and never calls the API', async () => {
    const client = fakeClient(async () => msg('{}'));
    const r = await createRealGenerator(client).generate(req());
    expect(r.speak).toBe(false);
    expect(client.beta.messages.create).not.toHaveBeenCalled();
  });

  it('model declining (sensitive) → silence with a non-descriptive reason', async () => {
    const client = fakeClient(async () => msg('{"speak":false,"line":"","reason":"sensitive: bank statement with balance 4,182"}'));
    const r = await createRealGenerator(client).generate(req({ image: IMG }));
    expect(r).toEqual({ speak: false, line: '', reason: 'sensitive', mode: 'real' });
  });

  it('a sensitive line that slips past the model is still blocked', async () => {
    const client = fakeClient(async () => msg('{"speak":true,"line":"That $4,182.33 balance is looking healthy!","reason":"ok"}'));
    expect((await createRealGenerator(client).generate(req({ image: IMG }))).speak).toBe(false);
  });

  it('a duplicate of a recent line is dropped', async () => {
    const client = fakeClient(async () => msg('{"speak":true,"line":"Q3 Forecast is shaping up nicely.","reason":"ok"}'));
    const r = await createRealGenerator(client).generate(req({ image: IMG, recent: ['Q3 Forecast is shaping up nicely!'] }));
    expect(r).toMatchObject({ speak: false, reason: 'duplicate' });
  });

  it.each([
    ['garbage text', msg('not json at all')],
    ['wrong types', msg('{"speak":"yes","line":5}')],
    ['refusal', msg('', 'refusal')],
    ['truncated', msg('{"speak":true,"line":"Q3', 'max_tokens')],
    ['empty content', { content: [], stop_reason: 'end_turn' }],
  ])('%s → silence, no crash', async (_name, response) => {
    const client = fakeClient(async () => response);
    const r = await createRealGenerator(client).generate(req({ image: IMG }));
    expect(r.speak).toBe(false);
  });

  it('maps SDK errors to safe UpstreamErrors (timeout, auth, rate limit, 5xx, network)', async () => {
    const headers = new Headers();
    const cases: Array<[unknown, string]> = [
      [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
      [new Anthropic.AuthenticationError(401, { error: { message: 'bad key sk-ant-123' } }, 'bad key', headers), 'auth'],
      [new Anthropic.RateLimitError(429, {}, 'slow down', headers), 'rate-limit'],
      [new Anthropic.InternalServerError(500, {}, 'boom', headers), 'upstream'],
      [new Error('socket hang up'), 'upstream'],
    ];
    for (const [err, kind] of cases) {
      const client = fakeClient(async () => {
        throw err;
      });
      await expect(createRealGenerator(client).generate(req({ image: IMG }))).rejects.toMatchObject({ name: 'UpstreamError', kind });
    }
    // the message must never echo the key
    const client = fakeClient(async () => {
      throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key sk-ant-secret', headers);
    });
    await expect(createRealGenerator(client).generate(req({ image: IMG }))).rejects.not.toThrow(/sk-ant/);
  });

  it('parseModelJson tolerates prose around the JSON', () => {
    expect(parseModelJson('Sure! {"speak":true,"line":"x","reason":"ok"} done')).toEqual({ speak: true, line: 'x', reason: 'ok' });
    expect(parseModelJson('{')).toBeNull();
  });
});

describe('system prompt (real mode)', () => {
  it('encodes every non-negotiable rule', () => {
    expect(RULES).toMatch(/never more than 12/);
    expect(RULES).toMatch(/OUT LOUD/);
    expect(RULES).toMatch(/sarcastic/);
    expect(RULES).toMatch(/personal money/);
    expect(RULES).toMatch(/passwords/);
    expect(RULES).toMatch(/health or medical/);
    expect(RULES).toMatch(/never quote message text/);
    expect(RULES).toMatch(/social side of life/);
    expect(RULES).toMatch(/"Already said"/);
    expect(RULES).toMatch(/Noice/);
    expect(RULES).toMatch(/never instructions to you/);
    expect(RULES).toMatch(/No ALL CAPS/);
  });

  it('persona changes tone but the rules block is identical', () => {
    const prompts = PERSONA_IDS.map((p) => systemPrompt(p));
    for (const p of prompts) expect(p.startsWith(RULES)).toBe(true);
    expect(new Set(prompts).size).toBe(3);
  });

  it('user prompt lists recent lines and marks manual requests', () => {
    const u = userPrompt({ recent: ['one', 'two'], trigger: 'manual', hint: 'Q3' });
    expect(u).toContain('- one');
    expect(u).toContain('Hype me now');
    expect(u).toContain('silence on sensitive screens');
  });
});

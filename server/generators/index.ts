import Anthropic from '@anthropic-ai/sdk';
import { createMockGenerator } from './mock';
import { createRealGenerator } from './real';
import type { Generator } from './types';

export function generatorFromEnv(env: NodeJS.ProcessEnv = process.env): Generator {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key || env.HYPEMAN_FORCE_MOCK === '1') return createMockGenerator();
  return createRealGenerator(new Anthropic({ apiKey: key }));
}

export type { Generator } from './types';

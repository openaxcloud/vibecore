import { describe, expect, it } from 'vitest';
import {
  clampGatewayOutputBudget,
  estimateGatewayOutputBudget,
  GATEWAY_OUTPUT_BUDGET,
} from './gateway-output-budget.js';
import { resolveMaxOutputTokens, type AiChatRequest } from './gateway.js';

/** The old flat default the adaptive budget replaces — proves we never under-size below it. */
const OLD_FLAT_DEFAULT = 4096;

describe('estimateGatewayOutputBudget', () => {
  it('classifies a from-scratch scaffold ask as the largest class', () => {
    expect(estimateGatewayOutputBudget({ lastUserMessage: 'Build a full-stack dashboard from scratch' })).toBe(
      GATEWAY_OUTPUT_BUDGET.scaffold,
    );
  });

  it('classifies a long prompt as a scaffold', () => {
    expect(estimateGatewayOutputBudget({ lastUserMessage: 'x'.repeat(400) })).toBe(GATEWAY_OUTPUT_BUDGET.scaffold);
  });

  it('classifies a short explain/plan turn as discuss', () => {
    expect(estimateGatewayOutputBudget({ lastUserMessage: 'explain what this function does' })).toBe(
      GATEWAY_OUTPUT_BUDGET.discuss,
    );
    expect(estimateGatewayOutputBudget({ lastUserMessage: 'anything', mode: 'plan' })).toBe(
      GATEWAY_OUTPUT_BUDGET.discuss,
    );
  });

  it('defaults an ordinary turn to the normal build class (biased up)', () => {
    expect(estimateGatewayOutputBudget({ lastUserMessage: 'add a submit button to the form' })).toBe(
      GATEWAY_OUTPUT_BUDGET.normal,
    );
  });

  it('never estimates below the old flat 4096 default', () => {
    for (const message of ['explain x', 'add a button', 'build a full app', 'x'.repeat(500), '']) {
      expect(estimateGatewayOutputBudget({ lastUserMessage: message })).toBeGreaterThanOrEqual(OLD_FLAT_DEFAULT);
    }
  });
});

describe('clampGatewayOutputBudget', () => {
  it('never exceeds the model ceiling', () => {
    expect(clampGatewayOutputBudget(GATEWAY_OUTPUT_BUDGET.scaffold, 8192)).toBe(8192);
  });

  it('floors a pathologically small ceiling to the ceiling', () => {
    expect(clampGatewayOutputBudget(4096, 1000)).toBe(1000);
  });
});

describe('resolveMaxOutputTokens (P1-a wiring)', () => {
  const req = (over: Partial<AiChatRequest>): AiChatRequest => ({
    messages: [{ role: 'user', content: 'add a submit button' }],
    ...over,
  });

  it('honours an explicit maxTokens, clamped to the ceiling (unchanged)', () => {
    // gpt-4o ceiling is 16384.
    expect(resolveMaxOutputTokens(req({ maxTokens: 1000 }), 'gpt-4o')).toBe(1000);
    expect(resolveMaxOutputTokens(req({ maxTokens: 999999 }), 'gpt-4o')).toBe(16384);
  });

  it('sizes a scaffold turn UP toward the ceiling when maxTokens is unset', () => {
    const budget = resolveMaxOutputTokens(
      req({ messages: [{ role: 'user', content: 'build a full-stack dashboard from scratch' }] }),
      'gpt-4o',
    );
    expect(budget).toBe(16384); // scaffold 16384 clamped to gpt-4o ceiling 16384
    expect(budget).toBeGreaterThan(OLD_FLAT_DEFAULT);
  });

  it('sizes a discuss turn smaller than a build turn', () => {
    const discuss = resolveMaxOutputTokens(
      req({ messages: [{ role: 'user', content: 'explain what this does' }] }),
      'gpt-4o',
    );
    const build = resolveMaxOutputTokens(
      req({ messages: [{ role: 'user', content: 'add a submit button' }] }),
      'gpt-4o',
    );
    expect(discuss).toBeLessThan(build);
    expect(discuss).toBeGreaterThanOrEqual(OLD_FLAT_DEFAULT);
  });

  it('never exceeds the model ceiling / HARD_MAX for an unset maxTokens', () => {
    // gpt-4-turbo ceiling is 4096.
    expect(resolveMaxOutputTokens(req({}), 'gpt-4-turbo')).toBe(4096);
  });
});

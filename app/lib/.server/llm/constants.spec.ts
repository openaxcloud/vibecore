import { describe, expect, it } from 'vitest';
import { isReasoningModel, modelDisallowsTemperature, temperatureOptionsForModel } from './constants';

describe('LLM model parameter compatibility', () => {
  it('omits deprecated temperature for Claude Opus 4.7 variants', () => {
    expect(modelDisallowsTemperature('claude-opus-4-7', 'Anthropic')).toBe(true);
    expect(modelDisallowsTemperature('anthropic/claude-opus-4.7', 'OpenRouter')).toBe(true);
    expect(temperatureOptionsForModel('claude-opus-4-7', 'Anthropic')).toEqual({});
  });

  it('keeps temperature for standard chat models', () => {
    expect(modelDisallowsTemperature('claude-sonnet-4-5-20250929', 'Anthropic')).toBe(false);
    expect(temperatureOptionsForModel('claude-sonnet-4-5-20250929', 'Anthropic')).toEqual({ temperature: 0 });
  });

  it('uses the required temperature for OpenAI reasoning models', () => {
    expect(isReasoningModel('gpt-5.1')).toBe(true);
    expect(temperatureOptionsForModel('gpt-5.1', 'OpenAI')).toEqual({ temperature: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { isReasoningModel, modelDisallowsTemperature, temperatureOptionsForModel } from './constants';

describe('LLM model parameter compatibility', () => {
  it('omits temperature by default for provider compatibility', () => {
    expect(modelDisallowsTemperature('claude-opus-4-7', 'Anthropic')).toBe(true);
    expect(modelDisallowsTemperature('anthropic/claude-opus-4.7', 'OpenRouter')).toBe(true);
    expect(temperatureOptionsForModel('claude-opus-4-7', 'Anthropic')).toEqual({});
    expect(temperatureOptionsForModel('gpt-4.1', 'OpenAI')).toEqual({});
    expect(temperatureOptionsForModel('gemini-2.0-flash', 'Google')).toEqual({});
    expect(temperatureOptionsForModel('mistral-large-latest', 'Mistral')).toEqual({});
  });

  it('detects reasoning models without injecting temperature', () => {
    expect(isReasoningModel('gpt-5.1')).toBe(true);
    expect(temperatureOptionsForModel('gpt-5.1', 'OpenAI')).toEqual({});
  });
});

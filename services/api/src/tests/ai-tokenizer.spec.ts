import { describe, expect, it } from 'vitest';
import { estimateAiTokens } from '../app.js';

describe('AI token counting', () => {
  it('uses the BPE tokenizer for quota preflight instead of length/4 estimates', async () => {
    await expect(estimateAiTokens('hello world')).resolves.toBe(2);
    await expect(estimateAiTokens('antidisestablishmentarianism')).resolves.toBe(6);
  });
});

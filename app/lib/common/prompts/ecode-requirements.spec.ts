import { describe, expect, it } from 'vitest';
import optimizedPrompt from './optimized';
import { ECODE_AGENT_REQUIREMENTS, ECODE_PROJECT_REQUIREMENT_LINES } from './ecode-requirements';
import { getFineTunedPrompt } from './new-prompt';
import { getSystemPrompt } from './prompts';

const requiredPhrases = [
  'ZERO placeholder code',
  'Use TypeScript everywhere',
  'Loading skeletons',
  'Error boundaries',
  'WebSocket connections must auto-reconnect with exponential backoff',
  'Mobile-first responsive design',
  'Dark mode by default',
  'Multi-agent strategy',
];

describe('E-Code prompt requirements', () => {
  it('keeps the critical E-Code requirements in the shared prompt block', () => {
    for (const phrase of requiredPhrases) {
      expect(ECODE_AGENT_REQUIREMENTS).toContain(phrase);
    }
  });

  it('injects E-Code requirements into all active chat system prompts', () => {
    const prompts = [
      getSystemPrompt(),
      getFineTunedPrompt(),
      optimizedPrompt({ cwd: '/home/project', allowedHtmlElements: ['a', 'p'], modificationTagName: 'bolt_file' }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('<ecode_vibe_coding_agent>');
      expect(prompt).toContain('ZERO placeholder code');
      expect(prompt).toContain('WebSocket connections must auto-reconnect with exponential backoff');
      expect(prompt).toContain('Dark mode by default');
    }
  });

  it('keeps project creation prompts aligned with the same production rules', () => {
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('ZERO placeholder code');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('preview would be blank');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('phones, tablets, and desktop');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('exponential backoff');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('./Chat.client.tsx', import.meta.url), 'utf8');
const baseChatSource = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const constantsSource = readFileSync(new URL('../../utils/constants.ts', import.meta.url), 'utf8');

describe('Prompt creation starts from a blank project', () => {
  it('never selects or imports a hidden framework starter before Agent generation', () => {
    for (const source of [chatSource, baseChatSource, constantsSource]) {
      expect(source).not.toContain('selectStarterTemplate');
      expect(source).not.toContain('STARTER_TEMPLATES');
      expect(source).not.toContain('autoSelectTemplate');
    }

    expect(chatSource).toContain('blank workspace + Agent generation');
  });

  it('removes the obsolete starter-template surface and proxy route', () => {
    expect(existsSync(new URL('./StarterTemplates.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../routes/api.github-template.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../utils/selectStarterTemplate.ts', import.meta.url))).toBe(false);
  });
});

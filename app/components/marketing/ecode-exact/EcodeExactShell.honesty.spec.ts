import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MARKETING_SHELL_COPY } from './marketing-shell.copy';

const source = readFileSync(new URL('./EcodeExactShell.tsx', import.meta.url), 'utf8');
const localizedCopy = JSON.stringify(MARKETING_SHELL_COPY);

describe('E-Code public marketing shell honesty and touch targets', () => {
  it('does not publish unsupported customer, reliability, speed, or certification claims', () => {
    const unsupportedClaims = [
      'Fortune 500',
      '99.99%',
      '4,500+',
      '18 global regions',
      '10x faster',
      'SOC2',
      'ISO 27001',
      'HIPAA',
    ];

    for (const claim of unsupportedClaims) {
      expect(`${source}\n${localizedCopy}`).not.toContain(claim);
    }
  });

  it('uses semantic E-Code tokens and 44px controls for the shared interactive chrome', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(source).not.toMatch(/purple|violet/i);
    expect(source).toContain('!min-h-11 !min-w-11 xl:hidden');
    expect(source).toContain('className="!min-h-11 !min-w-11 gap-2"');
    expect(source).toContain('className="inline-flex min-h-11 items-center"');
    expect(source).toContain('var(--ecode-accent)');

    /*
     * `--ecode-accent-text` a remplacé `--status-info-text` sur les trois
     * surfaces décoratives du shell (puce de bannière, accroche du pied, icône
     * des garanties). L'intention de ce test — des tokens SÉMANTIQUES plutôt que
     * des valeurs codées en dur — est intacte : c'est justement le token prévu
     * pour du texte accentué. `--status-info-text` était détourné de son sens
     * (statut « info ») et faisait ressortir en bleu des éléments de marque sur
     * des pages entièrement orange.
     */
    expect(source).toContain('var(--ecode-accent-text)');
  });
});

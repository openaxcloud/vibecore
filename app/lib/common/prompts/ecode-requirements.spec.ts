import { describe, expect, it } from 'vitest';
import { ECODE_AGENT_REQUIREMENTS, ECODE_PROJECT_REQUIREMENT_LINES } from './ecode-requirements';
import { getFineTunedPrompt } from './new-prompt';
import optimizedPrompt from './optimized';
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
  'External service behavior must use real typed local/offline adapters',

  /*
   * BUG-GEN-BACKEND-UNSERVED-001: a trivial "local counter" prompt produced a
   * fetch('/api/counter') frontend with an unserved backend. Lock the two
   * guardrails: right-sized architecture (no invented backend for client-only
   * tools) and the src/api handler convention the dev-server middleware mounts.
   */
  'RIGHT-SIZED ARCHITECTURE (simplest solution that works)',
  'DEV API CONVENTION',
  'src/api/<route>.ts',
];

/*
 * Le panneau Agent rend deja, pour chaque etape, le fichier touche en lien
 * cliquable, la commande executee et son statut. Ce qu'il ne peut PAS rendre,
 * c'est le raisonnement : pourquoi ce changement, pourquoi ainsi plutot
 * qu'autrement, ce qui a ete verifie et comment. Cela ne vient pas de
 * l'interface, cela vient du prompt systeme — donc ces exigences doivent
 * atteindre CHAQUE variante de prompt, pas seulement celle par defaut.
 */
/*
 * Le prompt est coupé en lignes à la main : une phrase peut donc chevaucher un
 * retour à la ligne, et une simple recherche de sous-chaîne casserait au premier
 * reformatage sans que l'exigence ait bougé. On compare sur une copie dont les
 * blancs sont normalisés.
 */
const unwrap = (value: string) => value.replace(/\s+/g, ' ');

const explanationPhrases = [
  '<progress_reporting_instructions>',
  'WHICH FILES',
  'THE RESULT',
  'Do not spend prose restating them.',
  'why THIS way rather than the obvious alternative',
  'Name the check behind any claim of success',
  '"It works" with nothing behind it is a claim, not a result',
  "ANSWER IN THE USER'S LANGUAGE",
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
      expect(prompt).toContain('never report a successful external workflow');

      for (const phrase of explanationPhrases) {
        expect(unwrap(prompt), `exigence d’explication absente d’un prompt actif : ${phrase}`).toContain(phrase);
      }
      expect(prompt).not.toMatch(/\bsimulate the workflow locally\b/i);
      expect(prompt).not.toMatch(/\blocal simulated workflow\b/i);
    }
  });

  it('keeps project creation prompts aligned with the same production rules', () => {
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('ZERO placeholder code');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('preview would be blank');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('phones, tablets, and desktop');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('exponential backoff');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('Never report successful external-service behavior');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('Right-size the architecture');
    expect(ECODE_PROJECT_REQUIREMENT_LINES.join('\n')).toContain('src/api/<route>.ts');
  });

  it('requires the agent to explain what, why and with what result — in the shared block', () => {
    for (const phrase of explanationPhrases) {
      expect(unwrap(ECODE_AGENT_REQUIREMENTS), `exigence absente du bloc partagé : ${phrase}`).toContain(phrase);
    }
  });

  it('carries the same explanation rules into the project-creation prompt lines', () => {
    const lines = ECODE_PROJECT_REQUIREMENT_LINES.join('\n');

    expect(lines).toContain('WHY this way rather than the obvious alternative');
    expect(lines).toContain('what you verified and how');
    expect(lines).toContain('answer in the language the user writes in');
  });
});

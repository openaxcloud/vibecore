import { describe, expect, it } from 'vitest';

import { consignePremierProjet, REGLES_PREMIER_PROJET } from './premier-projet';
import { stripInternalAgentScaffolding } from '~/lib/chat/agent-message-scaffolding';

/*
 * BUG-QA0930-PREMIER-PROJET-TOUR-COUPE — mesuré en production le 2026-09-30 :
 * « un compteur avec deux boutons » donnait 22 fichiers en 6 minutes, point
 * d'entrée écrit 16e/17e, aperçu mort. La consigne exigeait une finition
 * « Fortune 500 » sans condition.
 */
const IDEE = 'Une page unique avec un compteur et deux boutons plus et moins';

const WEB = {
  label: 'Web app',
  framework: 'React + Vite + TypeScript',
  generationHint: 'Build this as a React/Vite web application.',
};

describe('la consigne du premier projet', () => {
  it('une fois NOTRE bloc retiré, il reste exactement l’idée de l’utilisateur (affichage et décision des sous-agents)', () => {
    expect(stripInternalAgentScaffolding(consignePremierProjet(IDEE, WEB)).trim()).toBe(IDEE);
  });

  it('dit d’écrire la chaîne de démarrage d’abord, dans l’ordre', () => {
    const regle = REGLES_PREMIER_PROJET.find((r) => r.startsWith('WRITE THE STARTABLE CHAIN FIRST')) ?? '';
    const positions = ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx'].map((f) => regle.indexOf(f));

    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('ne conditionne jamais l’aperçu aux tests', () => {
    expect(consignePremierProjet(IDEE, WEB)).toContain('Never chain the dev server behind tests');
  });

  it('n’impose plus les extras universels qui faisaient 22 fichiers pour un compteur', () => {
    const consigne = consignePremierProjet(IDEE, WEB);

    for (const ancien of ['Fortune 500', 'derived metrics', 'charts/tables', 'around every panel', 'lazy-load']) {
      expect(consigne, ancien).not.toContain(ancien);
    }
  });

  it('garde la barre HAUTE pour une idée ambitieuse — les exigences s’adaptent, elles ne disparaissent pas', () => {
    const consigne = consignePremierProjet('Un tableau de bord SaaS de suivi des ventes', WEB);

    expect(consigne).toContain('AN AMBITIOUS IDEA');
    expect(consigne).toContain('loading / empty / error / success states');
    expect(consigne).toContain('tests for that workflow');
  });
});

/**
 * Dette `@ts-nocheck` de `BaseChat.tsx` — mesurée, pas estimée.
 *
 * `app/components/chat/BaseChat.tsx` (≈23 000 lignes, le monolithe de l'IDE) porte
 * un `// @ts-nocheck` en tête de fichier. Mesure du 2026-08-09, `tsc --noEmit -p
 * tsconfig.json` avec la directive retirée : **24 erreurs** masquées, dont
 * **trois familles qui cassent réellement à l'exécution** :
 *
 *  1. `TS2304 Cannot find name 'language'` ×9 — `ProjectMonitoringPanel` et
 *     `ProjectIntegrationsPanel` appelaient `formatBaseChatAstNumber(language, …)`
 *     et `formatBaseChatAstDateTime(language, …)` sans jamais déclarer `language`
 *     (les autres panneaux font `const language = resolvedBaseChatLanguage(i18n)`).
 *     À l'exécution : `ReferenceError: language is not defined` → les deux
 *     panneaux tombent au rendu.
 *
 *  2. `TS2345` sur `conflict.involvedRoles.map(consensusLaneLabel)` —
 *     `consensusLaneLabel(t, roleId)` passé nu à `.map` reçoit `(roleId, index)`,
 *     donc `t` vaut une chaîne. À l'exécution : `TypeError: t is not a function`
 *     → la liste des conflits de consensus tombe.
 *
 *  3. `TS2367` ×2 sur `runtimeWorkspaceStatus === 'STARTING' | 'PENDING'` —
 *     `runtimeWorkspaceStatus` est une `WorkspaceSession`, pas une chaîne : les
 *     deux comparaisons étaient TOUJOURS fausses. Conséquence : pendant tout le
 *     cold start la barre de statut annonçait « Connected » alors que le
 *     workspace démarrait — un statut malhonnête, exactement la classe de défaut
 *     que l'audit traque.
 *
 * Ce spec verrouille les trois correctifs. Il ne prétend PAS que la dette est
 * soldée : 12 erreurs de typage structurel subsistent (variance de `Record<>`,
 * `ProjectIdePaneTab[]`, `Dispatch<SetStateAction>` vs callback nu, `unknown`
 * issu de `response.json()`, contexte `this`). Elles n'ont pas d'effet runtime
 * connu, et le `@ts-nocheck` ne pourra être retiré qu'une fois celles-ci closes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

/** Corps des deux composants qui plantaient, isolé pour éviter les faux positifs. */
function componentBody(name: string) {
  const start = SOURCE.indexOf(`function ${name}({`);

  expect(start, `composant ${name} introuvable`).toBeGreaterThan(-1);

  // Jusqu'à la déclaration de composant suivante — suffisant pour ces deux panneaux.
  const next = SOURCE.indexOf('\nfunction ', start + 1);

  return SOURCE.slice(start, next === -1 ? undefined : next);
}

describe('BaseChat — ReferenceError « language is not defined » (TS2304 ×9)', () => {
  for (const panel of ['ProjectMonitoringPanel', 'ProjectIntegrationsPanel']) {
    it(`${panel} déclare « language » avant de l'utiliser`, () => {
      const body = componentBody(panel);

      // Le panneau utilise bien `language` (sinon le test ne prouverait rien).
      expect(body).toMatch(/format(?:BaseChatAstNumber|BaseChatAstDateTime)\(\s*language\b/);

      // …et il le dérive de i18n, comme tous les autres panneaux du fichier.
      expect(body).toContain('const language = resolvedBaseChatLanguage(i18n)');
      expect(body).toMatch(/const \{ t, i18n \} = useTranslation\(\)/);
    });
  }
});

describe('BaseChat — « t is not a function » sur les libellés de lane (TS2345)', () => {
  it('consensusLaneLabel n’est jamais passé nu à .map', () => {
    expect(SOURCE).not.toContain('.map(consensusLaneLabel)');
    expect(SOURCE).toContain('.map((roleId: string) => consensusLaneLabel(t, roleId))');
  });
});

describe('BaseChat — statut « Connected » malhonnête pendant le démarrage (TS2367 ×2)', () => {
  it('ne compare plus la WorkspaceSession à une chaîne de statut', () => {
    expect(SOURCE).not.toMatch(/runtimeWorkspaceStatus === '(?:STARTING|PENDING)'/);
  });

  it('lit le champ status en minuscules, comme workspaceUiState', () => {
    expect(SOURCE).toContain(
      "['starting', 'booting', 'pending'].includes(runtimeWorkspaceStatus?.status?.toLowerCase()",
    );
  });
});

describe('BaseChat — la directive @ts-nocheck reste tracée', () => {
  it('est encore présente, et documentée comme dette ouverte', () => {
    /*
     * Garde volontairement inversée : le jour où les 12 erreurs résiduelles sont
     * closes et la directive retirée, CE test échoue — ce qui force à venir ici
     * clore la dette explicitement plutôt qu'à la laisser pourrir.
     */
    expect(SOURCE.split('\n').slice(0, 5).join('\n')).toContain('@ts-nocheck');
  });
});

/*
 * BUG-PUBLISH-ONSUBMIT-FORMDATA-001 — la moitié qui lit le VRAI code.
 *
 * `gestes-publication.spec.ts` EXÉCUTE une copie réduite du gestionnaire : elle
 * prouve pourquoi un `FormData` mourait sur `event.preventDefault()`. Mais une
 * copie ne garde pas l'original. Ce fichier-ci vérifie que `BaseChat.tsx` ne
 * porte plus le défaut — et il tourne en environnement `node`, où lire un
 * fichier est fiable.
 *
 * Il lit la source COMMENTAIRES RETIRÉS : la prose de ce dépôt cite
 * `event.preventDefault()` et `onSubmit: any` en toutes lettres (règle 5).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('et le VRAI gestionnaire, dans BaseChat.tsx', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  const debut = SOURCE.indexOf('async function submit(');
  const CORPS = debut === -1 ? '' : SOURCE.slice(debut, debut + 900);

  it('a bien été trouvé — sinon tout ce bloc ne mesure rien', () => {
    // Contrôle positif (règle 14) : un « rien trouvé » n'est pas un « rien à redire ».
    expect(debut).toBeGreaterThan(0);
    expect(CORPS).toContain('projectId');
  });

  it('accepte les DEUX entrées : un événement de formulaire ou un FormData', () => {
    expect(CORPS).toMatch(/async function submit\([^)]*React\.FormEvent<HTMLFormElement>\s*\|\s*FormData/u);
  });

  it('n’appelle jamais preventDefault sans avoir vérifié qu’il y a un formulaire', () => {
    const avantLePreventDefault = CORPS.slice(0, CORPS.indexOf('preventDefault'));

    expect(CORPS).toContain('preventDefault');
    expect(avantLePreventDefault).toContain('instanceof FormData');
    expect(avantLePreventDefault).toMatch(/if \(formulaire\) \{/u);
  });

  it('ne réinitialise un formulaire que s’il en existe un', () => {
    expect(SOURCE).toMatch(/if \(formulaire && shouldResetIdePanelFormAfterSubmit\(/u);
  });

  it('ne déclare plus la prop `onSubmit` du panneau Déploiements en `any`', () => {
    // Le `any` éteignait la seule vérification qui aurait attrapé l'écart à la construction.
    const panneau = SOURCE.slice(SOURCE.indexOf('function ProjectDeploymentsPanel('));

    expect(panneau.slice(0, 1400)).not.toMatch(/onSubmit:\s*any/u);
    expect(panneau.slice(0, 1400)).toMatch(
      /onSubmit:\s*\(entree:\s*React\.FormEvent<HTMLFormElement>\s*\|\s*FormData\)/u,
    );
  });
});

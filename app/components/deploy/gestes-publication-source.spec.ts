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

const SOURCE = readFileSync(join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('et le VRAI gestionnaire, dans BaseChat.tsx', () => {
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

/*
 * L'AUTRE MOITIÉ DU MÊME DÉFAUT : un `onSubmit` qui accepte un `FormData` ne
 * sert à rien si PERSONNE ne lui en passe. `publication-republier.spec.ts` tient
 * déjà ce câblage pour `onRepublier` ; « Annuler » et les gestes de « Gérer
 * votre application » n'étaient tenus par AUCUN test.
 *
 * ⚠️ CETTE GARDE LIT LA SOURCE NETTOYÉE, et c'est essentiel : `onAnnuler`
 * apparaît TROIS fois dans `BaseChat.tsx`, dont DEUX dans des commentaires — le
 * récit du défaut le cite en toutes lettres. Une garde posée sur la source
 * BRUTE resterait verte alors que la prop a disparu : elle lirait l'histoire du
 * bug au lieu du correctif (règle 5).
 *
 * Les deux props échouent différemment, et les DEUX échouent EN SILENCE :
 *   — sans `onAnnuler`, le composant n'insère même pas le bouton
 *     (`enCours && dernier.id && onAnnuler`) : bouton ABSENT, pas bouton mort ;
 *   — sans `onAction`, les trois boutons de « Gérer votre application » restent
 *     à l'écran et ne font RIEN (`onAction?.(…)`) — « aucun bouton ne marche ».
 */
describe('les gestes de publication sont CÂBLÉS jusqu’au réseau', () => {
  const debutDeLAppel = SOURCE.indexOf('<PublicationReplit');
  const APPEL = SOURCE.slice(debutDeLAppel, debutDeLAppel + 2000);

  it('témoin positif : le point de montage du panneau est bien lu (règle 14)', () => {
    expect(debutDeLAppel, '<PublicationReplit introuvable dans la source nettoyée').toBeGreaterThan(-1);
    expect(APPEL).toContain('onRepublier=');
  });

  it.each(['onAnnuler', 'onAction'])('%s est PASSÉ au panneau par l’hôte', (prop) => {
    expect(APPEL, `${prop} n’est plus câblé : le geste est mort à l’écran`).toContain(`${prop}=`);
  });

  it.each(['onAnnuler', 'onAction'])('%s construit bien un FormData', (prop) => {
    const debut = APPEL.indexOf(`${prop}=`);
    const corps = APPEL.slice(debut, debut + 600);

    /*
     * C'est le FormData qui distingue un geste vivant d'un geste mort : le
     * défaut d'origine appelait `preventDefault` sur un objet qui n'en a pas,
     * et l'exception mourait dans une promesse rejetée que personne n'attend.
     */
    expect(corps, `${prop} ne construit plus de FormData`).toContain('new FormData()');
  });
});

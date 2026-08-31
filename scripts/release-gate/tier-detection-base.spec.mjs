/**
 * La base du calcul des tiers doit être CE QUI EST DÉPLOYÉ.
 *
 * Défaut mesuré en production le 2026-08-30. Douze PR mergées coup sur coup ;
 * chaque nouveau push remplace le déploiement précédent, si bien que seul le
 * dernier run survit. Il comparait au push d'avant — donc au diff d'UNE PR — et
 * a conclu `runtime=false` alors que trois PR de `services/api` venaient de
 * lander (#266, #268, #270).
 *
 * Le tier n'a pas été construit, l'image API a été reprise telle quelle, et du
 * code mergé n'est JAMAIS arrivé en production. Aucune porte ne s'en est
 * aperçue : le déploiement, lui, a réussi.
 *
 * Le fichier est lu COMMENTAIRES RETIRÉS. La prose qui explique le défaut cite
 * `HEAD~1` et `BEFORE_SHA` ; un test qui lit ses propres commentaires ne prouve
 * rien — piège rencontré deux fois aujourd'hui.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = path.join(process.cwd(), '.github/workflows/deploy-main.yml');
const SOURCE = fs.readFileSync(WORKFLOW, 'utf8');

/** Le step « Detect changed tiers », sans ses commentaires. */
function detectionCode() {
  const start = SOURCE.indexOf('- name: Detect changed tiers');
  expect(start, 'le step de détection est introuvable').toBeGreaterThan(-1);

  const end = SOURCE.indexOf('\n      - name: ', start + 10);
  expect(end).toBeGreaterThan(start);

  return SOURCE.slice(start, end)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('détection des tiers — la base est le dernier déploiement réussi', () => {
  it('interroge le dernier run RÉUSSI de ce workflow', () => {
    const code = detectionCode();

    expect(code).toMatch(/status=success/);
    expect(code).toMatch(/head_sha/);
  });

  it('exige que cette base soit un ancêtre de HEAD', () => {
    // Sans cette garde, un sha issu d'une autre branche produirait un diff
    // absurde — potentiellement vide, donc « rien à reconstruire ».
    expect(detectionCode()).toMatch(/merge-base --is-ancestor/);
  });

  it('ne retombe plus sur HEAD~1, la fenêtre qui a causé le défaut', () => {
    const code = detectionCode();

    expect(code).not.toMatch(/rev-parse HEAD~1/);
  });

  it('avertit bruyamment quand il doit se replier sur le push précédent', () => {
    const code = detectionCode();
    const fallback = code.slice(code.indexOf('BEFORE_SHA'));

    expect(fallback).toMatch(/::warning::/);
  });

  it('construit TOUS les tiers quand aucune base fiable n’existe', () => {
    // Un build de trop coûte des minutes ; un tier manqué coûte une régression
    // invisible en production.
    const code = detectionCode();
    const withoutBase = code.slice(code.indexOf('No resolvable base SHA'));

    expect(code).toMatch(/No resolvable base SHA/);
    // RUNTIME/WEB/WSAGENT restent à leur valeur initiale `true` dans cette
    // branche : rien ne doit les remettre à false.
    expect(withoutBase).not.toMatch(/RUNTIME=false/);
  });

  it('dispose du jeton et de la permission nécessaires à cette lecture', () => {
    expect(SOURCE).toMatch(/GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
    expect(SOURCE).toMatch(/^permissions:[\s\S]{0,400}?actions: read/m);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * UN COMMIT DOCUMENTAIRE PEUT FAIRE DISPARAÎTRE LE DÉPLOIEMENT DU CODE FUSIONNÉ
 * JUSTE AVANT — ET LE SEUL CHEMIN DE REPRISE EST `workflow_dispatch`.
 *
 * Le mécanisme, mesuré le 2026-09-30 :
 *   1. du code est fusionné ; son déploiement prend sa place dans la file du
 *      groupe de concurrence, qui ne garde qu'UN passage en attente ;
 *   2. un commit documentaire avance `main` et ÉCARTE ce déploiement ;
 *   3. `paths-ignore` fait SAUTER le sien.
 * Résultat : plus aucun déploiement ne porte le code, et rien n'alerte.
 *
 * Ce garde n'empêche pas le mauvais ordre de fusion — aucun test ne peut le
 * faire, c'est un geste humain. Il épingle les deux FAITS dont dépend la
 * procédure écrite dans CLAUDE.md, pour qu'elle ne devienne pas une prose
 * périmée (règle 22) :
 *
 *   A. le filtre existe vraiment, donc le piège existe vraiment ;
 *   B. `workflow_dispatch` existe, donc la reprise à la main est possible.
 *
 * Le jour où quelqu'un retire `workflow_dispatch`, la procédure de reprise
 * devient un mensonge et CE test rougit — au lieu de le découvrir un soir de
 * livraison, avec un correctif bloquant qui n'arrive pas.
 */
const WORKFLOW_BRUT = readFileSync(join(__dirname, '..', '..', '.github/workflows/deploy-main.yml'), 'utf8');
const workflow = parse(WORKFLOW_BRUT) as {
  on?: { push?: { 'paths-ignore'?: string[] }; workflow_dispatch?: unknown };
};

/* `on:` est interprété par YAML 1.1 comme le booléen `true`. */
const declencheurs = (workflow.on ?? (workflow as Record<string, unknown>)[true as unknown as string]) as
  | { push?: { 'paths-ignore'?: string[] }; workflow_dispatch?: unknown }
  | undefined;

describe('le déploiement sauté par un commit documentaire', () => {
  it('TÉMOIN — les déclencheurs du workflow sont bien lus', () => {
    expect(declencheurs, 'bloc `on:` introuvable : la garde ne mesure rien').toBeDefined();
    expect(declencheurs?.push, 'le déclencheur `push` a disparu').toBeDefined();
  });

  it('A — le filtre `paths-ignore` existe, donc le piège existe', () => {
    const motifs = declencheurs?.push?.['paths-ignore'] ?? [];

    expect(
      motifs.length,
      'sans `paths-ignore`, ce garde et la règle de CLAUDE.md décrivent un piège qui n’existe plus : les relire',
    ).toBeGreaterThan(0);

    expect(
      motifs,
      'un commit purement Markdown est le cas nominal du piège ; s’il ne l’est plus, la règle est à réécrire',
    ).toContain('**/*.md');
  });

  it('B — `workflow_dispatch` existe : la reprise à la main reste possible', () => {
    expect(
      'workflow_dispatch' in (declencheurs ?? {}),
      'sans `workflow_dispatch`, un déploiement écarté puis sauté ne peut PLUS être relancé : ' +
        'c’est le seul chemin qui ignore `paths-ignore`',
    ).toBe(true);
  });

  it('C — `paths-ignore` passe AVANT la détection de tiers, et le même chemin est dans les deux listes', () => {
    /*
     * L'erreur que ce cas épingle est la mienne, du 2026-10-01 : j'ai annoncé
     * par écrit que cette proposition reconstruirait LES QUATRE TIERS, parce
     * que `deploy-main.yml` est dans le motif de base partagée. C'est vrai, et
     * sans effet : `paths-ignore` est un filtre de DÉCLENCHEUR, il décide s'il
     * y a un déploiement DU TOUT, donc il passe avant. Coût réel : zéro.
     *
     * Le jour où `.github/**` sort de `paths-ignore`, l'estimation change du
     * tout au tout — et c'est CE test qui doit le dire.
     */
    const motifs = declencheurs?.push?.['paths-ignore'] ?? [];

    expect(
      motifs,
      'sans `.github/**` ignoré, toute proposition touchant un workflow DÉPLOIE — et celle qui touche ' +
        '`deploy-main.yml` reconstruit les quatre tiers. La règle de CLAUDE.md et mes estimations sont à refaire.',
    ).toContain('.github/**');

    // L'autre moitié du couple : le motif de base partagée contient bien ce
    // même fichier. Sans elle, le cas ci-dessus n'épinglerait qu'une liste.
    const motifBasePartagee = /grep -Eq '\^\((?<corps>[^']*deploy-main[^']*)\)'/u.exec(WORKFLOW_BRUT);

    expect(
      motifBasePartagee,
      'le motif de base partagée ne nomme plus `deploy-main.yml` : le piège d’estimation a disparu, ' +
        'ou il a changé de forme — relire la règle avant de supposer',
    ).not.toBeNull();

    const regexBase = new RegExp(`^(${motifBasePartagee!.groups!.corps})`, 'u');

    expect(
      regexBase.test('.github/workflows/deploy-main.yml'),
      'le fichier est censé matcher la base partagée : c’est ce qui rend l’estimation naïve tentante',
    ).toBe(true);

    expect(
      regexBase.test('app/lib/stores/workbench.ts'),
      'CONTRÔLE NÉGATIF — du code produit ne doit PAS matcher la base partagée, sinon le motif extrait ' +
        'est trop large et le cas ci-dessus passerait au vert pour une mauvaise raison',
    ).toBe(false);
  });

  it('et le piège est expliqué là où on le rencontre, pas seulement dans CLAUDE.md', () => {
    /*
     * Volontairement ancré sur une CHAÎNE DU WORKFLOW, pas sur de la prose de
     * documentation (règle 5) : c'est ce fichier-ci que lit quelqu'un qui
     * s'apprête à toucher `paths-ignore`.
     */
    expect(
      WORKFLOW_BRUT.includes('deploiement-docs-saute.spec.ts'),
      'le renvoi vers ce garde a disparu du workflow : le prochain lecteur ne saura pas que le piège existe',
    ).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Gardes sur le CODE RÉEL des trois défauts remontés par la QA. Les tests
 * voisins prouvent la mécanique ; ceux-ci empêchent la réintroduction du motif
 * exact dans les fichiers concernés.
 */

const APP = join(__dirname, '..', '..');

const dbWorkbench = readFileSync(join(APP, 'components', 'database', 'DatabaseWorkbench.tsx'), 'utf8');
const baseChat = readFileSync(join(APP, 'components', 'chat', 'BaseChat.tsx'), 'utf8');

/** Retire les commentaires pour ne juger que du code exécuté. */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('BUG-QA-DB-REFETCH-LOOP-001 — le panneau DB ne peut plus boucler', () => {
  const code = codeOnly(dbWorkbench);

  it('aucun useEffect ne prend `fetcher` en dépendance', () => {
    /*
     * `useFetcher()` renvoie un objet neuf à chaque rendu : le mettre en
     * dépendance relance l'effet indéfiniment. C'est la cause mesurée des
     * ~110 requêtes / 30 s.
     */
    /*
     * Le motif dangereux est l'identifiant NU `fetcher`. Dépendre de
     * `fetcher.data` ou `fetcher.state` est légitime : ce sont des valeurs.
     */
    expect(code).not.toMatch(/\}, \[(?:[^\]]*,\s*)?fetcher\s*(?:,[^\]]*)?\]\)/);
  });

  it('la garde `!fetcher.data` n_est plus utilisée pour décider du chargement', () => {
    expect(code).not.toMatch(/if \(fetcher\.state === 'idle' && !fetcher\.data\)/);
  });

  it('le chargement initial est gardé par une ref stable sur `base`', () => {
    expect(code).toMatch(/loadedBaseRef\s*=\s*useRef/);
    expect(code).toMatch(/if \(loadedBaseRef\.current === base\)/);
  });

  it('le rechargement post-provisionnement est gardé contre la répétition', () => {
    expect(code).toMatch(/handledProvisionRef\s*=\s*useRef/);
    expect(code).toMatch(/handledProvisionRef\.current === data/);
  });
});

describe('BUG-QA-DB-IDE-BRICK-001 — un provisionnement échoué ne bloque plus l_IDE', () => {
  const code = codeOnly(dbWorkbench);

  it('un chargement terminé SANS donnée compte comme un échec affichable', () => {
    expect(code).toMatch(/loadAttempted && fetcher\.data === undefined/);
  });

  it('une réponse portant une erreur reste affichée dès le premier rendu', () => {
    /*
     * Régression que le spec i18n existant a rattrapée : gater TOUT l'échec sur
     * `loadAttempted` masquait une erreur déjà présente au premier rendu. Seul
     * le cas « aucune donnée » doit être gardé.
     */
    const failure = code.slice(code.indexOf('const loadFailed'), code.indexOf('const loadFailed') + 400);
    expect(failure).not.toMatch(/idle' &&\s*loadAttempted &&/);
  });

  it("l'état d'échec reste relié au bouton Réessayer déjà présent", () => {
    expect(code).toMatch(/loadFailed/);
    expect(dbWorkbench).toMatch(/databaseWorkbench\.retry/);
  });
});

describe('BUG-QA-MONITORING-CRASH-001 — le panneau Supervision ne plante plus', () => {
  /** Corps de `ProjectMonitoringPanel`, isolé du reste du fichier. */
  const panel = (() => {
    const start = baseChat.indexOf('function ProjectMonitoringPanel({');
    expect(start).toBeGreaterThan(-1);

    const end = baseChat.indexOf('function ProjectMonitoringDeploymentTimeline(', start);
    expect(end).toBeGreaterThan(start);

    return baseChat.slice(start, end);
  })();

  it('le composant déclare `language` avant de s_en servir', () => {
    /*
     * Il l'utilisait dans cinq appels de formatage sans jamais le définir :
     * `ReferenceError: language is not defined` à chaque rendu.
     */
    expect(panel).toMatch(/const \{ t, i18n \} = useTranslation\(\)/);
    expect(panel).toMatch(/const language = resolvedBaseChatLanguage\(i18n\)/);
  });

  it('toute utilisation de `language` y est bien précédée de sa déclaration', () => {
    // Sur le CODE seul : le commentaire du correctif cite lui-même ces appels.
    const panelCode = codeOnly(panel);
    const declaration = panelCode.indexOf('const language =');
    const firstUse = panelCode.search(/formatBaseChatAst\w+\(language/);

    expect(declaration).toBeGreaterThan(-1);
    expect(firstUse).toBeGreaterThan(-1);
    expect(declaration).toBeLessThan(firstUse);
  });
});

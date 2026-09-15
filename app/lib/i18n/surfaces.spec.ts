import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RESOURCES } from './runtime-resources';
import {
  estCheminPublic,
  PREFIXES_PUBLICS,
  prefixeDeLaCle,
  repartirParSurface,
  SEGMENTS_PUBLICS,
  surfaceDeLaCle,
  surfacesRequises,
  SURFACES,
} from './surfaces';

/**
 * BUG-PERF-I18N-SURFACE-001 — la garde qui empêche le catalogue COMPLET de
 * revenir sur le chemin public, et la classification de dériver en silence.
 *
 * `PREFIXES_PUBLICS` n'est pas une liste d'opinion : elle est RECALCULÉE ici
 * depuis les sources, à chaque exécution. Deux critères, et le second vient
 * d'une erreur commise pendant la mise au point :
 *
 *   1. un préfixe cité littéralement par un module du chemin public est public ;
 *   2. un FICHIER DE CATALOGUE importé par un module public rend publics tous
 *      ses préfixes. Sans cette règle, `surfaceDynamic` partait dans la tranche
 *      `app` alors que `EcodeSurfacePages.tsx` (marketing) le consomme — ses
 *      clés ne sont construites que par `t(`${prefix}.title`)`, et le seul
 *      littéral vit dans le fichier de catalogue lui-même.
 *
 * Contre-épreuve dans les deux sens (règle 6) : ajouter à la liste un préfixe
 * que personne ne cite en public rougit ; en retirer un qui est cité rougit
 * aussi. Les deux moitiés sont donc bien couplées.
 */

const RACINE = process.cwd();
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

function lire(chemin: string): string | null {
  try {
    return readFileSync(join(RACINE, chemin), 'utf8');
  } catch {
    return null;
  }
}

function sansCommentaires(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
}

function sousArbre(dossier: string, resultat: string[] = []): string[] {
  for (const entree of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = `${dossier}/${entree.name}`;

    if (entree.isDirectory()) {
      sousArbre(chemin, resultat);
    } else if (/\.tsx?$/.test(entree.name) && !/\.spec\.tsx?$/.test(entree.name)) {
      resultat.push(chemin);
    }
  }

  return resultat;
}

function resoudre(specificateur: string, depuis: string): string | null {
  let base: string;

  if (specificateur.startsWith('~/')) {
    base = `app/${specificateur.slice(2)}`;
  } else if (specificateur.startsWith('.')) {
    const segments = depuis.split('/').slice(0, -1);

    for (const segment of specificateur.split('/')) {
      if (segment === '.') {
        continue;
      }

      if (segment === '..') {
        segments.pop();
      } else {
        segments.push(segment);
      }
    }

    base = segments.join('/');
  } else {
    return null;
  }

  for (const extension of EXTENSIONS) {
    const candidat = base + extension;
    const absolu = join(RACINE, candidat);

    if (existsSync(absolu) && statSync(absolu).isFile()) {
      return candidat;
    }
  }

  return null;
}

/** Les modules atteignables depuis les racines — imports statiques ET dynamiques. */
function fermeture(racines: string[]): Set<string> {
  const vus = new Set<string>();
  const pile = [...racines];

  while (pile.length > 0) {
    const fichier = pile.pop()!;

    if (vus.has(fichier) || /\.spec\.tsx?$/.test(fichier)) {
      continue;
    }

    const source = lire(fichier);

    if (source === null) {
      continue;
    }

    vus.add(fichier);

    const motif = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

    let trouve: RegExpExecArray | null;

    while ((trouve = motif.exec(source))) {
      const resolu = resoudre(trouve[1], fichier);

      if (resolu && !vus.has(resolu)) {
        pile.push(resolu);
      }
    }
  }

  return vus;
}

const ROUTES_PUBLIQUES =
  /^(_index|about|blog|careers|changelog|community|contact|contact-sales|docs|enterprise|features|gallery|help|help-center|languages|legal|login|marketing|pricing|privacy|register|signup|solutions|terms|status|auth)\b/;

const racinesPubliques = [
  'app/root.tsx',
  'app/entry.client.tsx',
  ...sousArbre('app/components/marketing'),
  ...sousArbre('app/components/auth'),
  ...readdirSync(join(RACINE, 'app/routes'))
    .filter((nom) => /\.tsx?$/.test(nom) && !/\.spec\./.test(nom) && ROUTES_PUBLIQUES.test(nom))
    .map((nom) => `app/routes/${nom}`),
];

const cheminPublic = fermeture(racinesPubliques);
const prefixesConnus = new Set(Object.keys(RESOURCES.en.translation).map(prefixeDeLaCle));

function prefixesCitesEnPublic(): Set<string> {
  const cites = new Set<string>();
  const motif = /['"`]([A-Za-z][A-Za-z0-9_]*)\.[A-Za-z0-9_]/g;

  for (const fichier of cheminPublic) {
    const source = lire(fichier);

    if (source === null) {
      continue;
    }

    /*
     * Un seul critère, appliqué uniformément : tout module ATTEINT depuis le
     * chemin public rend publics les préfixes qu'il cite. Un fichier de
     * catalogue compte donc aussi — c'est ce qui rattrape les clés construites
     * par `t(`${prefix}.title`)`, et c'est aussi pour cela que
     * `app/lib/i18n/messages/en.ts`, importé par `runtime.ts`, tire ses propres
     * préfixes dans la tranche publique. Ce surcoût est assumé : il va dans le
     * sens sûr — du poids, jamais un libellé manquant.
     */
    const net = sansCommentaires(source);

    let trouve: RegExpExecArray | null;

    motif.lastIndex = 0;

    while ((trouve = motif.exec(net))) {
      if (prefixesConnus.has(trouve[1])) {
        cites.add(trouve[1]);
      }
    }
  }

  return cites;
}

describe('la classification des clés par surface', () => {
  const cites = prefixesCitesEnPublic();

  it('mesure bien quelque chose : la fermeture publique et le catalogue ne sont pas vides', () => {
    // Règle 4 : une fermeture vide rendrait « aucun préfixe public » — un vert creux.
    expect(cheminPublic.size).toBeGreaterThan(200);
    expect(prefixesConnus.size).toBeGreaterThan(300);
    expect(cites.size).toBeGreaterThan(20);
  });

  it('PREFIXES_PUBLICS est EXACTEMENT ce que le chemin public cite — recalculé, pas recopié', () => {
    const declares = [...PREFIXES_PUBLICS].sort();
    const calcules = [...cites].sort();

    const declaresSansCitation = declares.filter((prefixe) => !cites.has(prefixe));
    const citesNonDeclares = calcules.filter((prefixe) => !PREFIXES_PUBLICS.includes(prefixe));

    expect(
      citesNonDeclares,
      'cités depuis le chemin public mais absents de la liste : ils seront « Unavailable »',
    ).toEqual([]);
    expect(declaresSansCitation, 'déclarés publics sans qu’aucun module public ne les cite : poids inutile').toEqual(
      [],
    );
    expect(declares).toEqual(calcules);
  });

  it('découpe tout le catalogue, sans perte ni doublon', () => {
    const complet = RESOURCES.en.translation;
    const tranches = repartirParSurface(complet);

    expect({ ...tranches.public, ...tranches.app }).toEqual(complet);
    expect(Object.keys(tranches.public).length + Object.keys(tranches.app).length).toBe(Object.keys(complet).length);

    const enDouble = Object.keys(tranches.public).filter((cle) => cle in tranches.app);
    expect(enDouble).toEqual([]);
  });

  it('sort du chemin public la copie d’IDE qui motivait le découpage', () => {
    for (const prefixe of ['chat', 'settings', 'baseChatAst']) {
      expect(prefixesConnus.has(prefixe), `${prefixe} doit exister dans le catalogue`).toBe(true);
      expect(surfaceDeLaCle(`${prefixe}.quelque.chose`), prefixe).toBe('app');
    }

    // Et la tranche publique reste minoritaire — c'est tout l'objet du lot.
    const tranches = repartirParSurface(RESOURCES.en.translation);
    const poids = (catalogue: Record<string, string>) => JSON.stringify(catalogue).length;

    expect(poids(tranches.public)).toBeLessThan(poids(tranches.app) / 2);
  });
});

describe('les surfaces requises par une URL', () => {
  it('sont FERMÉES PAR DÉFAUT — une route inconnue charge les deux tranches', () => {
    for (const chemin of [
      '/ide/42',
      '/chat/42',
      '/projects/1/ide',
      '/admin',
      '/une-route-qui-n-existe-pas',
      '/settings',
    ]) {
      expect(surfacesRequises(chemin), chemin).toEqual(['public', 'app']);
      expect(estCheminPublic(chemin), chemin).toBe(false);
    }
  });

  it('allègent la page d’accueil et les pages marketing, elles seules', () => {
    for (const chemin of ['/', '/pricing', '/blog/un-article', '/solutions/app-builder', '/login']) {
      expect(surfacesRequises(chemin), chemin).toEqual(['public']);
    }
  });

  it('ne confondent pas un segment public avec un préfixe de segment', () => {
    // `/enterprise` est public ; `/enterprise-sso-settings` est une page de réglages.
    expect(estCheminPublic('/enterprise')).toBe(true);
    expect(estCheminPublic('/enterprise-sso-settings')).toBe(false);
  });

  it('couvrent chaque segment déclaré, et n’en inventent aucun', () => {
    for (const segment of SEGMENTS_PUBLICS) {
      expect(estCheminPublic(`/${segment}`), segment).toBe(true);
    }

    expect(SURFACES).toEqual(['public', 'app']);
  });
});

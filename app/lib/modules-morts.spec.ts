import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  estSpec,
  lireSources,
  modulesImportesSeulementParLeurSpec,
  specificateursImportes,
  type Fichier,
} from './modules-morts';

const RACINE = join(__dirname, '..', '..');

/**
 * L'INVENTAIRE DES MODULES MORTS CONNUS, au 2026-09-10.
 *
 * Ce n'est pas une liste de choses acceptées : c'est une LIGNE DE BASE, comme
 * celle du scanner i18n. Elle existe pour que le prochain module mort se voie
 * le jour où il apparaît, au lieu d'être découvert six semaines plus tard par
 * un utilisateur à qui la garde n'a pas servi.
 *
 * Deux façons de faire rougir ce test, et les deux sont voulues :
 *
 *   - un module REJOINT la liste -> quelqu'un vient d'écrire une règle que
 *     rien n'appelle, et il l'apprend tout de suite ;
 *   - un module QUITTE la liste -> il vient d'être câblé, et on retire sa
 *     ligne DÉLIBÉRÉMENT, ce qui interdit à la liste de se périmer en silence.
 *
 * Chaque ligne porte ce qu'on sait d'elle. Une ligne sans explication est une
 * ligne que personne ne retirera jamais.
 */
const MORTS_CONNUS = [
  /* Crochet React de découpage de message : écrit pour le panneau Agent, jamais monté. */
  'app/lib/hooks/useMessageBlocks.ts',

  /* Verrou relâchable : écrit pour la boucle de génération, jamais branché. */
  'app/lib/hooks/useReleasableLatch.ts',

  /* Catalogue i18n admin : les autres catalogues passent par un registre, celui-ci non. */
  'app/lib/i18n/catalogs/admin.ts',

  /* Heuristiques d'audit live : outil de campagne, jamais rattaché au produit. */
  'app/lib/i18n/catalogs/live-audit-heuristics.ts',

  /* Fusion secrets/variables (#522, 2026-09-10) : la décision existe, la surface ne l'appelle pas. */
  'app/lib/ide/secrets-unifies.ts',

  /* Mise en forme des erreurs d'import : la surface d'import affiche encore la sienne. */
  'app/lib/import-action-error.ts',

  /* Routes du sitemap : la route `sitemap[.]xml` construit sa propre liste. */
  'app/lib/marketing/sitemap-routes.ts',

  /* Support du cache par fournisseur : `stream-text` décide encore sans lui. */
  'app/lib/modules/llm/provider-cache-support.ts',

  /* Densité des panneaux IDE : jeton de mise en page jamais consommé. */
  'app/lib/ui/ide-panel-density.ts',

  /* Acceptation automatique des actions de l'agent : décision écrite, chemin non branché. */
  'app/utils/agent-auto-accept.ts',

  /* Progression de l'agent : la route de chat écrit ses annotations à la main. */
  'app/utils/agent-progress.ts',
] as const;

describe('la règle : un module que seul son spec importe', () => {
  it('reconnaît un spec, et ne prend pas un module ordinaire pour un spec', () => {
    expect(estSpec('app/lib/x.spec.ts')).toBe(true);
    expect(estSpec('app/lib/x.test.ts')).toBe(true);
    expect(estSpec('app/lib/x.ts')).toBe(false);

    /* Le piège : un module dont le NOM contient « spec » sans en être un. */
    expect(estSpec('app/lib/specification.ts')).toBe(false);
  });

  it('lit les imports statiques, les ré-exports ET les imports dynamiques', () => {
    /*
     * Oublier le dynamique déclarerait mort un module chargé paresseusement —
     * un faux positif qui enverrait câbler du code déjà câblé.
     */
    const contenu = ["import { a } from './a';", "export { b } from './b';", "const c = await import('./c');"].join(
      '\n',
    );

    expect(specificateursImportes(contenu).sort()).toEqual(['./a', './b', './c']);
  });

  it('un module appelé par du VRAI code n’est pas mort', () => {
    const fichiers: Fichier[] = [
      { chemin: 'app/lib/regle.ts', contenu: 'export const x = 1;' },
      { chemin: 'app/lib/regle.spec.ts', contenu: "import { x } from './regle';" },
      { chemin: 'app/routes/api.chat.ts', contenu: "import { x } from '~/lib/regle';" },
    ];

    expect(modulesImportesSeulementParLeurSpec(fichiers)).toEqual([]);
  });

  it('un module que SEUL son spec appelle est mort', () => {
    const fichiers: Fichier[] = [
      { chemin: 'app/lib/regle.ts', contenu: 'export const x = 1;' },
      { chemin: 'app/lib/regle.spec.ts', contenu: "import { x } from './regle';" },
    ];

    expect(modulesImportesSeulementParLeurSpec(fichiers)).toEqual(['app/lib/regle.ts']);
  });

  it('un module que PERSONNE n’importe est une AUTRE classe, et n’est pas rendu ici', () => {
    /*
     * Point d'entrée, module chargé par convention : confondre les deux causes
     * sous un seul chiffre rendrait le chiffre inutilisable.
     */
    const fichiers: Fichier[] = [{ chemin: 'app/lib/orphelin.ts', contenu: 'export const x = 1;' }];

    expect(modulesImportesSeulementParLeurSpec(fichiers)).toEqual([]);
  });

  it('les routes et les composants sont HORS PORTÉE, délibérément', () => {
    /*
     * Une route est montée par le routeur sans jamais être importée. Un garde
     * qui l'accuse accuse 200 fichiers sains — leçon déjà payée par
     * BUG-BUILD-ROUTE-EXPORT-001, où une garde statique a dû être retirée.
     */
    const fichiers: Fichier[] = [
      { chemin: 'app/routes/login.tsx', contenu: 'export default function L() {}' },
      { chemin: 'app/routes/login.spec.ts', contenu: "import L from './login';" },
      { chemin: 'app/components/chat/X.tsx', contenu: 'export function X() {}' },
      { chemin: 'app/components/chat/X.spec.tsx', contenu: "import { X } from './X';" },
    ];

    expect(modulesImportesSeulementParLeurSpec(fichiers)).toEqual([]);
  });

  it('un harnais de test n’est pas un module mort : c’est sa raison d’être', () => {
    const fichiers: Fichier[] = [
      { chemin: 'app/lib/test/rr7-data.ts', contenu: 'export const h = 1;' },
      { chemin: 'app/routes/x.spec.ts', contenu: "import { h } from '~/lib/test/rr7-data';" },
    ];

    expect(modulesImportesSeulementParLeurSpec(fichiers)).toEqual([]);
  });
});

describe('LA LIGNE DE BASE du dépôt', () => {
  const morts = modulesImportesSeulementParLeurSpec(lireSources(RACINE));

  it('témoin positif : le balayage a bien lu le dépôt', () => {
    /*
     * Sans ce témoin, un chemin de racine faux rendrait une liste VIDE, et le
     * vide se lirait comme « aucun module mort » — un zéro qui ne prouve rien.
     */
    const sources = lireSources(RACINE);
    expect(sources.length).toBeGreaterThan(1000);
    expect(sources.some((f) => f.chemin === 'app/routes/api.chat.ts')).toBe(true);
  });

  it('AUCUN module mort NOUVEAU — sinon quelqu’un vient d’écrire une règle que rien n’appelle', () => {
    const nouveaux = morts.filter((m) => !MORTS_CONNUS.includes(m as (typeof MORTS_CONNUS)[number]));

    expect(
      nouveaux,
      `Module(s) importé(s) uniquement par leur propre spec :\n  ${nouveaux.join('\n  ')}\n` +
        'Soit la règle est appelée par le produit, soit elle ne sert à rien. ' +
        "Câblez-la, ou supprimez-la — et si l'exception est légitime, ajoutez-la à MORTS_CONNUS AVEC sa raison.",
    ).toEqual([]);
  });

  it('la ligne de base ne se PÉRIME pas : un module câblé doit en sortir', () => {
    const disparus = MORTS_CONNUS.filter((m) => !morts.includes(m));

    expect(
      disparus,
      `Ce(s) module(s) ne sont plus morts — bravo. Retirez leur ligne de MORTS_CONNUS :\n  ${disparus.join('\n  ')}`,
    ).toEqual([]);
  });
});

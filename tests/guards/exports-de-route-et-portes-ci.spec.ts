import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

/*
 * BUG-BUILD-ROUTE-EXPORT-001 — une construction cassée par un `export` de trop
 * dans un module de ROUTE.
 *
 * Le mécanisme : un module de route qui EXPORTE une fonction laquelle référence
 * un binding importé d'un module `*.server` fait entrer ce binding serveur dans
 * le graphe client. Le correctif a déplacé les deux fonctions hors de la route
 * (`app/lib/ide/panneau-stockage-objets.ts` et
 * `app/lib/ide/message-echec-installation.ts`), qui les IMPORTE désormais.
 *
 * Rien n'épinglait ce correctif — ni le geste qui a cassé, ni les portes censées
 * l'attraper. Ce fichier tient les deux.
 *
 * ⚠️ LA RÈGLE GLOBALE SERAIT FAUSSE, et c'est le piège de ce point. « Aucun
 * module de route n'exporte quoi que ce soit qui touche à un binding serveur »
 * produit quinze faux positifs mesurés sur des fichiers sains. La garde est donc
 * posée à la maille DU FICHIER qui a cassé : elle rougit sur le geste exact,
 * sans accuser les autres.
 */

const RACINE = join(__dirname, '..', '..');

const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

/** Toutes les valeurs `run:` d'un workflow, commentaires retirés (règle 5). */
function etapesRun(chemin: string): string[] {
  const runs: string[] = [];

  const parcourir = (valeur: unknown) => {
    if (Array.isArray(valeur)) {
      valeur.forEach(parcourir);
      return;
    }

    if (!valeur || typeof valeur !== 'object') {
      return;
    }

    const objet = valeur as Record<string, unknown>;

    if (typeof objet.run === 'string') {
      runs.push(
        objet.run
          .split('\n')
          .filter((ligne) => !ligne.trimStart().startsWith('#'))
          .join('\n'),
      );
    }

    Object.values(objet).forEach(parcourir);
  };

  parcourir(parseDocument(lire(chemin)).toJS());

  return runs;
}

describe('les cinq portes restent dans la CI', () => {
  const CI = '.github/workflows/ci.yml';
  const PORTES = ['pnpm run lint', 'pnpm run i18n:check', 'pnpm run typecheck', 'pnpm run test', 'pnpm run build'];

  it('la lecture du workflow a bien lu quelque chose (règle 14)', () => {
    expect(etapesRun(CI).length).toBeGreaterThan(5);
  });

  it.each(PORTES)('« %s » est toujours une étape de la CI', (porte) => {
    const etapes = etapesRun(CI);

    expect(etapes.some((run) => run.includes(porte))).toBe(true);
  });

  it('la CI se déclenche bien sur les pull requests ET sur main', () => {
    const document = parseDocument(lire(CI)).toJS() as {
      on?: { pull_request?: unknown; push?: { branches?: string[] } };
    };

    expect(document.on?.pull_request, 'plus de déclenchement sur pull_request').toBeDefined();
    expect(document.on?.push?.branches ?? []).toContain('main');
  });
});

describe('la porte de livraison pointe toujours sur des jobs qui EXISTENT', () => {
  /*
   * L'autre moitié, sans laquelle la première ne vaut rien : renommer un job
   * dans le workflow décâblerait silencieusement `required-checks.json`, et la
   * livraison passerait sur une porte qui ne contrôle plus rien.
   */
  const politique = JSON.parse(lire('scripts/release-gate/required-checks.json')) as {
    requiredWorkflows: Array<{ path: string; requiredJobs: string[] }>;
  };

  const APPARIABLES = ['.github/workflows/ci.yml', '.github/workflows/e2e.yml'];

  it('la politique est lisible et non vide (règle 14)', () => {
    expect(politique.requiredWorkflows.length).toBeGreaterThan(0);
  });

  it.each(APPARIABLES)('chaque job exigé de %s porte ce nom dans le workflow', (chemin) => {
    const exige = politique.requiredWorkflows.find((entree) => entree.path === chemin);

    expect(exige, `${chemin} n’est plus dans la politique de livraison`).toBeDefined();

    const noms = new Set<string>();
    const jobs = (parseDocument(lire(chemin)).toJS() as { jobs?: Record<string, { name?: string }> }).jobs ?? {};

    for (const [cle, job] of Object.entries(jobs)) {
      noms.add(job?.name ?? cle);
    }

    for (const requis of exige!.requiredJobs) {
      expect(noms, `le job « ${requis} » exigé par la porte n’existe plus dans ${chemin}`).toContain(requis);
    }
  });
});

describe('BUG-BUILD-ROUTE-EXPORT-001 — le geste EXACT qui avait cassé la construction', () => {
  const ROUTE = 'app/routes/api.projects.$projectId.ide-panel.$panel.ts';
  const source = lire(ROUTE);

  it('témoin positif : le fichier lu est bien celui qu’on croit', () => {
    expect(source).toContain('ide-panel');
    expect(source.length).toBeGreaterThan(1000);
  });

  it.each(['objectStorageResultOrDisabled', 'messageDEchecDInstallation'])(
    '`%s` est IMPORTÉE par la route, jamais réexportée par elle',
    (symbole) => {
      expect(source, `${symbole} n’est plus importée — le correctif a peut-être été défait`).toMatch(
        new RegExp(`import \\{[^}]*${symbole}`),
      );

      /* C'est le RÉEXPORT qui faisait entrer un binding serveur dans le graphe client. */
      expect(source).not.toMatch(new RegExp(`export (async )?function ${symbole}\\b`));
      expect(source).not.toMatch(new RegExp(`export \\{[^}]*${symbole}`));
    },
  );

  it('les deux fonctions vivent bien hors de la route', () => {
    expect(lire('app/lib/ide/panneau-stockage-objets.ts')).toMatch(
      /export async function objectStorageResultOrDisabled/,
    );
    expect(lire('app/lib/ide/message-echec-installation.ts')).toMatch(/export function messageDEchecDInstallation/);
  });
});

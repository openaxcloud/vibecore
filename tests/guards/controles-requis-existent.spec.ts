import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * CHAQUE CONTRÔLE REQUIS DOIT ÊTRE PRODUIT PAR UN JOB QUI EXISTE.
 *
 * La protection de branche exige trois noms. Un contrôle requis qui ne se
 * présente jamais n'est pas ignoré : il reste EN ATTENTE, pour toujours, et
 * plus aucune proposition ne peut fusionner — sans message d'erreur et sans
 * rien de rouge à regarder.
 *
 * On a failli tomber dedans le 2026-09-30 en découpant la suite E2E : le job
 * qui portait « Playwright local stack » disparaissait. Et on y retouche à
 * chaque fois qu'on retire un workflow — d'où ce garde, écrit en retirant
 * « Deploy Preview ».
 *
 * ⚠️ Il vérifie qu'un job PORTE le nom, pas qu'il réussit. C'est déjà ce qui
 * manquait : un nom qui n'existe plus bloque tout, un nom qui échoue se voit.
 */

const RACINE = join(__dirname, '..', '..');
const DOSSIER = join(RACINE, '.github/workflows');

/* Les trois contextes exigés par la protection de branche de `main`. */
const REQUIS = ['Install, test, build, scan', 'Playwright local stack', 'Quality Gates'];

function nomsDeJobs(): string[] {
  const noms: string[] = [];

  for (const fichier of readdirSync(DOSSIER).filter((f) => /\.ya?ml$/u.test(f))) {
    let doc: { jobs?: Record<string, { name?: string }> };

    try {
      doc = parse(readFileSync(join(DOSSIER, fichier), 'utf8')) as typeof doc;
    } catch {
      continue;
    }

    for (const [cle, job] of Object.entries(doc?.jobs ?? {})) {
      noms.push(job?.name ?? cle);
    }
  }

  return noms;
}

describe('les contrôles requis par la protection de branche existent', () => {
  it('la sonde lit bien les workflows — sinon les cas suivants ne mesurent rien', () => {
    const noms = nomsDeJobs();

    expect(noms.length, 'aucun job trouvé : la recherche a échoué').toBeGreaterThan(10);
  });

  it.each(REQUIS)('« %s » est porté par un job', (requis) => {
    const noms = nomsDeJobs();

    expect(
      noms,
      `aucun job ne porte « ${requis} ». La protection de branche l'exige : il restera EN ATTENTE ` +
        'pour toujours et plus aucune proposition ne pourra fusionner.',
    ).toContain(requis);
  });

  it('CONTRE-ÉPREUVE — un nom inventé n’est PAS trouvé', () => {
    /* Sans ce cas, les précédents passeraient au vert même si la recherche était cassée. */
    expect(nomsDeJobs()).not.toContain('Contrôle qui n’existe pas');
  });
});

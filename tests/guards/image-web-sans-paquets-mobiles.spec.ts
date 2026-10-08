import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * LES PAQUETS DE L'APPLICATION MOBILE NE DOIVENT PAS ENTRER DANS LES IMAGES DE
 * SERVEUR : ILS Y PORTAIENT UNE FAILLE CRITIQUE ET N'Y SERVAIENT À RIEN.
 *
 * Mesuré le 2026-10-08 sur l'image web réellement construite (run 37817627051),
 * refusée par la porte de vulnérabilité :
 *
 *     Total: 2 (CRITICAL: 2)
 *     @capacitor/android 8.3.1  CVE-2026-103922  CRITICAL  fixed  -> 8.5.1
 *     @capacitor/ios            idem
 *
 * Deux moitiés à tenir, et il faut LES DEUX :
 *   1. l'installation de l'image de dépendances exclut `@vibecore/mobile` ;
 *   2. aucun manifeste autre que `apps/mobile/package.json` ne déclare de paquet
 *      `@capacitor/*` — sinon l'exclusion ci-dessus ne protège plus de rien.
 */

const RACINE = process.cwd();

describe('les paquets mobiles restent hors des images de serveur', () => {
  const deps = readFileSync(join(RACINE, 'infra/docker/deps.Dockerfile'), 'utf8');

  it('TÉMOIN — l’étape d’installation est bien trouvée, sinon ce garde ne mesure rien', () => {
    expect(deps, 'plus aucun `pnpm install --frozen-lockfile` dans deps.Dockerfile').toMatch(
      /RUN pnpm install --frozen-lockfile/u,
    );
  });

  it('l’image de dépendances n’installe PAS l’application mobile', () => {
    /*
     * Le `COPY apps/mobile/package.json` reste volontairement : `--frozen-lockfile`
     * valide le lockfile entier, qui déclare ce projet. C'est l'INSTALLATION qui
     * doit l'exclure, pas la copie du manifeste.
     */
    const ligne = /RUN pnpm install --frozen-lockfile([^\n]*)/u.exec(deps);

    expect(ligne, 'la ligne d’installation n’est plus reconnaissable').not.toBeNull();
    expect(
      ligne![1],
      'sans `--filter \'!@vibecore/mobile\'`, les 13 paquets @capacitor/* reviennent dans l’image web ' +
        'et la porte de vulnérabilité refuse le déploiement sur CVE-2026-103922 (CRITIQUE)',
    ).toMatch(/--filter\s+'!@vibecore\/mobile'/u);
  });

  it('aucun manifeste hors apps/mobile ne déclare de paquet @capacitor/*', () => {
    /*
     * L'autre moitié. Exclure le projet mobile ne protège que si personne ne
     * déclare Capacitor ailleurs — en particulier pas dans le manifeste RACINE,
     * qui est celui de l'application web.
     */
    const manifestes: string[] = ['package.json'];

    for (const groupe of ['apps', 'services', 'packages']) {
      let entrees: string[] = [];

      try {
        entrees = readdirSync(join(RACINE, groupe), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => `${groupe}/${e.name}/package.json`);
      } catch {
        entrees = [];
      }

      manifestes.push(...entrees);
    }

    const fautifs: string[] = [];

    for (const chemin of manifestes) {
      if (chemin === 'apps/mobile/package.json') {
        continue;
      }

      let manifeste: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

      try {
        manifeste = JSON.parse(readFileSync(join(RACINE, chemin), 'utf8'));
      } catch {
        continue;
      }

      const noms = [...Object.keys(manifeste.dependencies ?? {}), ...Object.keys(manifeste.devDependencies ?? {})];
      const caps = noms.filter((n) => n.startsWith('@capacitor/'));

      if (caps.length > 0) {
        fautifs.push(`${chemin} → ${caps.join(', ')}`);
      }
    }

    expect(manifestes.length, 'témoin : des manifestes ont bien été lus').toBeGreaterThan(5);
    expect(fautifs, 'un manifeste hors apps/mobile déclare Capacitor').toEqual([]);
  });

  it('CONTRÔLE POSITIF — apps/mobile déclare bien Capacitor, donc la recherche fonctionne', () => {
    /*
     * Sans ce cas, les deux tests ci-dessus passeraient au vert si le motif
     * `@capacitor/` cessait de correspondre à quoi que ce soit — un « 0 résultat »
     * qui vient d'une recherche cassée se lit comme une absence.
     */
    const mobile = JSON.parse(readFileSync(join(RACINE, 'apps/mobile/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const caps = Object.keys(mobile.dependencies ?? {}).filter((n) => n.startsWith('@capacitor/'));

    expect(caps.length, 'apps/mobile doit déclarer Capacitor — sinon le motif de recherche est mort').toBeGreaterThan(5);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * LES PAQUETS SYSTÈME DE L'IMAGE DE BASE DOIVENT ÊTRE MIS À JOUR, SINON ILS
 * RESTENT FIGÉS À LA VERSION QU'AVAIT L'IMAGE AU MOMENT DE SA PUBLICATION.
 *
 * Mesuré le 2026-10-06 : la porte de vulnérabilité a refusé le déploiement sur
 * `perl-base` 5.36.0-7+deb12u3 (CVE-2026-13221, CRITIQUE). Sondé dans l'image :
 *
 *   installé                      : 5.36.0-7+deb12u3
 *   publié dans bookworm-security : 5.36.0-7+deb12u4   (index Debian, vérifié)
 *   `bookworm-security` dans les sources apt de l'image : OUI
 *
 * Le correctif était donc disponible et n'arrivait pas, parce que
 * `apt-get install curl` n'installe que `curl` — il ne met pas à jour ce qui est
 * déjà là.
 *
 * ⚠️ Ce garde ne couvre PAS l'épinglage de l'image de base par empreinte, qui
 * est un sujet distinct : voir `docs/bugs/DETTE-IMAGE-DE-BASE-NON-FIGEE-001.md`.
 */

const RACINE = process.cwd();

type Etage = { nom: string; fichier: string; marqueur: string };

const ETAGES: Etage[] = [
  { nom: 'image web', fichier: 'Dockerfile', marqueur: 'AS bolt-ai-production' },
  { nom: 'images admin et services', fichier: 'infra/docker/node-service.Dockerfile', marqueur: 'AS runtime' },
];

describe('les paquets système des images d’exécution sont mis à jour', () => {
  for (const etage of ETAGES) {
    describe(etage.nom, () => {
      const source = readFileSync(join(RACINE, etage.fichier), 'utf8');
      const debutEtage = source.indexOf(etage.marqueur);
      const etageTexte = debutEtage === -1 ? '' : source.slice(debutEtage);

      it('TÉMOIN — l’étage d’exécution est bien trouvé, sinon ce garde ne mesure rien', () => {
        expect(debutEtage, `« ${etage.marqueur} » a disparu de ${etage.fichier}`).toBeGreaterThan(-1);
      });

      it('met à jour les paquets système', () => {
        expect(
          etageTexte,
          `${etage.fichier} n’exécute plus \`apt-get upgrade\` dans son étage d’exécution : ` +
            'tout ce que l’image de base embarque resterait figé à sa version de publication, ' +
            'failles comprises — c’est exactement ce qui a refusé le déploiement du 2026-10-06.',
        ).toMatch(/apt-get upgrade -y/u);
      });

      it('fait la mise à jour AVANT l’installation, et dans la MÊME couche que `apt-get update`', () => {
        /*
         * Trois façons de casser ça sans que rien ne rougisse ailleurs :
         *   — mettre `upgrade` après `install` : les paquets installés le sont
         *     depuis l'index, donc à jour, mais les préexistants ne bougent pas ;
         *   — mettre `upgrade` dans un `RUN` séparé : l'index a été effacé par le
         *     `rm -rf /var/lib/apt/lists/*` de la couche précédente ;
         *   — garder `upgrade` et retirer `update` : l'index est celui de l'image
         *     de base, donc périmé d'autant que l'image.
         */
        const bloc = /RUN apt-get update[\s\S]*?rm -rf \/var\/lib\/apt\/lists/u.exec(etageTexte);

        expect(bloc, 'le bloc `apt-get update … rm -rf lists` n’est plus reconnaissable').not.toBeNull();

        const texte = bloc![0];
        const update = texte.indexOf('apt-get update');
        const upgrade = texte.indexOf('apt-get upgrade');
        const install = texte.indexOf('apt-get install');

        expect(upgrade, '`apt-get upgrade` n’est pas dans la même couche que `apt-get update`').toBeGreaterThan(-1);
        expect(upgrade, '`apt-get upgrade` doit venir APRÈS `apt-get update` : sans index frais il ne voit rien').toBeGreaterThan(
          update,
        );
        expect(
          install,
          '`apt-get install` doit venir APRÈS `apt-get upgrade` — sinon les paquets déjà présents ne sont jamais corrigés',
        ).toBeGreaterThan(upgrade);
      });
    });
  }

  it('la dette de l’image non épinglée est consignée, pas oubliée', () => {
    /*
     * Le correctif ci-dessus met à jour les paquets ; il ne FIGE pas l'image de
     * base. Tant qu'elle est désignée par un tag mobile, deux constructions du
     * même commit peuvent servir des paquets différents — un état qui bouge sans
     * trace. Ce cas tient la consignation, pas la correction.
     */
    const fiche = join(RACINE, 'docs/bugs/DETTE-IMAGE-DE-BASE-NON-FIGEE-001.md');

    expect(() => readFileSync(fiche, 'utf8'), 'la fiche de dette a disparu : le sujet redeviendrait invisible').not.toThrow();

    const texte = readFileSync(fiche, 'utf8');

    expect(texte, 'la fiche doit nommer le tag mobile en cause').toMatch(/node:22-bookworm-slim/u);
    expect(texte, 'la fiche doit porter un en-tête YAML, sinon elle entre dans l’index comme « undefined »').toMatch(
      /^---\nid: DETTE-IMAGE-DE-BASE-NON-FIGEE-001/u,
    );
  });
});

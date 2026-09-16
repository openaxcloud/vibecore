import { describe, expect, it } from 'vitest';

import { SEGMENTS_PUBLICS, surfaceDeLaCle, surfacesRequises } from './surfaces';
import { canonicalProjectPath, projectIdePath } from '~/utils/project-url';

/*
 * LE PIÈGE QUE CE FICHIER GARDE.
 *
 * Depuis que `idePanels` est sorti de la tranche publique, les libellés des
 * panneaux vivent dans la tranche `app`. Une route qui ouvre un panneau SANS
 * charger `app` n'échangerait pas du poids contre de la vitesse : elle
 * échangerait du poids contre un flash de clés brutes à l'ouverture d'un
 * panneau — un défaut pire que celui qu'on corrige.
 *
 * Une seule chose empêche ça aujourd'hui, et ce n'est écrit nulle part : le
 * chemin canonique d'un projet porte un `@` devant le slug d'organisation.
 * Sans lui, une organisation qui s'appelle `blog`, `docs` ou `pricing` ferait
 * commencer l'URL de son IDE par un SEGMENT PUBLIC, et la route ne chargerait
 * que la tranche publique.
 *
 * Mesuré le 2026-09-16, avant d'écrire ce fichier :
 *   /blog/mon-projet/ide   -> ["public"]           <- le trou, s'il existait
 *   /@blog/mon-projet      -> ["public","app"]     <- ce que le `@` donne
 *
 * Le trou n'est pas atteignable : `$accountSlug.$projectSlug.ide.tsx` REDIRIGE
 * toujours (son composant rend `null`) vers le chemin canonique. Mais rien ne
 * tenait cette protection. C'est ce que ce fichier fait.
 */

/** Des slugs d'organisation qui sont AUSSI des segments publics. Le pire cas. */
const SLUGS_PIEGEUX = SEGMENTS_PUBLICS.slice(0, 6);

describe("aucune URL d'IDE ne charge la seule tranche publique", () => {
  it('la mesure discrimine : un vrai segment public ne charge QUE la tranche publique', () => {
    /*
     * Sans ce contrôle, les assertions suivantes passeraient même si
     * `surfacesRequises` rendait toujours les deux tranches.
     */
    expect(SLUGS_PIEGEUX.length).toBeGreaterThan(3);
    expect(surfacesRequises(`/${SLUGS_PIEGEUX[0]}`)).toEqual(['public']);
    expect(surfacesRequises(`/${SLUGS_PIEGEUX[0]}/mon-projet/ide`)).toEqual(['public']);
  });

  it('les libellés de panneaux sont bien dans la tranche `app` — sinon ce fichier ne garde rien', () => {
    expect(surfaceDeLaCle('idePanels.terminal.title')).toBe('app');
  });

  it("le chemin canonique charge `app`, même quand l'organisation porte un nom de segment public", () => {
    for (const slug of SLUGS_PIEGEUX) {
      const chemin = canonicalProjectPath({ id: 'p1', slug: 'mon-projet', organizationSlug: slug });

      expect(surfacesRequises(chemin), `${chemin} doit charger la tranche app`).toContain('app');
      expect(surfacesRequises(projectIdePath({ id: 'p1', slug: 'mon-projet', organizationSlug: slug }))).toContain(
        'app',
      );
    }
  });

  it("c'est le `@` qui tient : le même chemin sans lui tomberait dans le trou", () => {
    for (const slug of SLUGS_PIEGEUX) {
      const canonique = canonicalProjectPath({ id: 'p1', slug: 'mon-projet', organizationSlug: slug });

      expect(canonique.startsWith(`/@${slug}`), `${canonique} doit porter le @`).toBe(true);

      // Retirer le sigle rouvre le trou — la preuve que la protection est bien là.
      expect(surfacesRequises(canonique.replace('/@', '/'))).toEqual(['public']);
    }
  });

  it('le repli par identifiant, lui, ne dépend d’aucun slug', () => {
    expect(surfacesRequises(projectIdePath({ id: 'p1', slug: '', organizationSlug: '' }))).toContain('app');
  });
});

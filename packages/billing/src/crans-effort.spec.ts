/*
 * Le curseur d'effort lit les crans du MODÈLE, jamais un nombre figé.
 *
 * La maquette d'Avi montre cinq crans. Mesuré le 2026-09-16 : cinq est vrai
 * pour les modèles Anthropic les plus récents, faux pour Sonnet 4.6 (quatre) et
 * faux pour Haiku 4.5 (aucun). Un curseur figé proposerait un réglage que le
 * modèle refuse — l'erreur ne se verrait qu'au premier envoi, chez l'utilisateur.
 */
import { describe, expect, it } from 'vitest';

import { CRANS_CONNUS, cranAdmissible, cransPour, curseurActif, type CranEffort } from './crans-effort.js';

describe('les crans dépendent du modèle', () => {
  it('cinq crans sur les modèles qui les déclarent', () => {
    expect(cransPour('claude-opus-5').crans).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(cransPour('claude-sonnet-5').crans).toHaveLength(5);
  });

  it('quatre crans sur Sonnet 4.6 — un curseur figé à cinq proposerait xhigh, refusé', () => {
    expect(cransPour('claude-sonnet-4-6').crans).toEqual(['low', 'medium', 'high', 'max']);
    expect(cransPour('claude-sonnet-4-6').crans).not.toContain('xhigh');
  });

  it('aucun cran sur Haiku 4.5 : le curseur se désactive', () => {
    expect(cransPour('claude-haiku-4-5').crans).toEqual([]);
    expect(curseurActif('claude-haiku-4-5')).toBe(false);
  });

  it('un modèle inconnu désactive le curseur au lieu d’inventer une échelle', () => {
    expect(cransPour('modele-jamais-vu').crans).toEqual([]);
    expect(curseurActif('modele-jamais-vu')).toBe(false);
  });
});

describe('changer de modèle ne laisse jamais un cran refusé', () => {
  it('xhigh sur Opus 5 retombe sur high en passant à Sonnet 4.6', () => {
    expect(cranAdmissible('claude-opus-5', 'xhigh')).toBe('xhigh');
    expect(cranAdmissible('claude-sonnet-4-6', 'xhigh')).toBe('high');
  });

  it('on descend, jamais on ne monte — un effort non demandé ne se facture pas', () => {
    for (const modele of ['claude-sonnet-4-6', 'gpt-5.6-luna', 'claude-opus-5']) {
      const { crans } = cransPour(modele);

      for (const souhaite of CRANS_CONNUS) {
        const retenu = cranAdmissible(modele, souhaite);

        expect(retenu, `${modele} / ${souhaite}`).toBeDefined();
        expect(crans, `${modele} rend un cran qu’il ne supporte pas`).toContain(retenu as CranEffort);

        if (!crans.includes(souhaite)) {
          /*
           * On descend — SAUF quand il n'y a rien en dessous. Demander
           * `minimal` à Sonnet 4.6, dont l'échelle commence à `low`, ne peut
           * pas rendre plus bas que `low` : le plancher du modèle est la
           * réponse honnête. La règle est donc « jamais de montée tant qu'une
           * descente existe », et le cas plancher est vérifié à part.
           */
          const existeEnDessous = crans.some((cran) => CRANS_CONNUS.indexOf(cran) < CRANS_CONNUS.indexOf(souhaite));

          if (existeEnDessous) {
            const plusBas = CRANS_CONNUS.indexOf(retenu as CranEffort) <= CRANS_CONNUS.indexOf(souhaite);
            expect(plusBas, `${modele} : ${souhaite} → ${retenu} est une MONTÉE`).toBe(true);
          } else {
            expect(retenu, `${modele} : sous le plancher, on prend le plus bas cran`).toBe(crans[0]);
          }
        }
      }
    }
  });

  it('un modèle sans cran ne rend aucun cran', () => {
    expect(cranAdmissible('claude-haiku-4-5', 'high')).toBeUndefined();
  });
});

describe('le tableau est daté et sourcé', () => {
  /*
   * Ce que l'API déclare est vérifiable ; ce que la documentation dit ne l'est
   * pas. La distinction doit rester visible dans les données elles-mêmes, sinon
   * on oublie laquelle des deux moitiés peut se périmer en silence.
   */
  it('chaque entrée porte sa source et sa date de relève', () => {
    for (const modele of ['claude-opus-5', 'claude-sonnet-4-6', 'gpt-5.6-sol', 'gpt-6-astra']) {
      const entree = cransPour(modele);

      expect(['api-anthropic', 'documentation-openai']).toContain(entree.source);
      expect(entree.releve, `${modele} sans date de relève`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('les crans déclarés font tous partie de l’échelle connue', () => {
    for (const modele of ['claude-opus-5', 'claude-sonnet-4-6', 'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-6-astra']) {
      for (const cran of cransPour(modele).crans) {
        expect(CRANS_CONNUS).toContain(cran);
      }
    }
  });
});

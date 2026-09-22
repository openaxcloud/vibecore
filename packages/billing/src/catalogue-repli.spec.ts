/*
 * Le repli : un seul saut, visible, et jamais à perte.
 *
 * Règle d'Avi : « utilise le modèle Opus si le modèle Fable n'est plus
 * disponible ». Elle est ici une ligne de catalogue, pas un cas particulier —
 * et ce fichier vérifie les trois promesses qui l'entourent.
 */
import { describe, expect, it } from 'vitest';

import { BUILTIN_AGENT_ROUTING_CARD } from './agent-routing.js';
import { margesDuCatalogue, type CatalogueDuMode } from './catalogue-de-modeles.js';
import { CATALOGUE_INTEGRE } from './catalogue-integre.js';
import { replisInvalides, resoudreAvecRepli, type SondeFournisseur } from './disponibilite-des-modeles.js';

const parMode = (mode: string) => CATALOGUE_INTEGRE.find((c) => c.mode === mode)!;

const TOUT_VA_BIEN: SondeFournisseur[] = [
  { fournisseur: 'openai', etat: 'joignable' },
  { fournisseur: 'google', etat: 'joignable' },
  { fournisseur: 'anthropic', etat: 'joignable' },
  { fournisseur: 'moonshot', etat: 'joignable' },
];

/** La marge réelle, calculée sur la carte — pas une constante recopiée. */
const margeNegative = (mode: string, model: string, serviceTier?: 'fast') => {
  const catalogue = CATALOGUE_INTEGRE.find((c) => c.mode === mode);

  if (!catalogue) {
    return true;
  }

  const modeles = catalogue.modeles.filter((m) => m.model === model && m.serviceTier === serviceTier);
  const marges = margesDuCatalogue(BUILTIN_AGENT_ROUTING_CARD, [{ ...catalogue, modeles }]);

  return marges.some((m) => m.negative);
};

describe('la règle d’Avi, appliquée', () => {
  it('Fable 5.1 indisponible → Opus 5 est servi', () => {
    const anthropicPartiel: SondeFournisseur[] = TOUT_VA_BIEN.map((s) => ({ ...s }));

    /*
     * On simule une panne PROPRE AU MODÈLE en retirant Fable du catalogue
     * disponible : la sonde est par fournisseur, donc on la contourne avec un
     * catalogue où seul Fable pointe vers un fournisseur en panne.
     */
    const catalogue: CatalogueDuMode = {
      ...parMode('max'),
      modeles: parMode('max').modeles.map((m) =>
        m.model === 'claude-fable-5-1' ? { ...m, provider: 'moonshot' as const } : m,
      ),
    };

    const sondes = anthropicPartiel.map((s) =>
      s.fournisseur === 'moonshot' ? { ...s, etat: 'sans-credit' as const } : s,
    );

    const resolution = resoudreAvecRepli(catalogue, sondes, { model: 'claude-fable-5-1' });

    expect(resolution.repliApplique).toBe(true);
    expect(resolution.servi!.model).toBe('claude-opus-5');
    expect(resolution.raison, 'la cause du repli reste lisible').toBe('credit-fournisseur');
  });

  it('le repli de Fable est déclaré en DONNÉE, pas en dur', () => {
    const fable = parMode('max').modeles.find((m) => m.model === 'claude-fable-5-1')!;

    expect(fable.repli).toEqual({ model: 'claude-opus-5' });
  });
});

describe('un seul saut, jamais une cascade', () => {
  it('quand le modèle répond, rien ne se replie', () => {
    const resolution = resoudreAvecRepli(parMode('max'), TOUT_VA_BIEN, { model: 'claude-fable-5-1' });

    expect(resolution.repliApplique).toBe(false);
    expect(resolution.servi!.model).toBe('claude-fable-5-1');
  });

  it('si le repli est en panne lui aussi, on le dit — on ne suit pas SON repli', () => {
    const anthropicASec: SondeFournisseur[] = TOUT_VA_BIEN.map((s) =>
      s.fournisseur === 'anthropic' ? { ...s, etat: 'sans-credit' } : s,
    );

    // Fable et Opus 5 sont tous deux chez Anthropic : le saut unique échoue.
    const resolution = resoudreAvecRepli(parMode('max'), anthropicASec, { model: 'claude-fable-5-1' });

    expect(resolution.repliApplique).toBe(false);
    expect(resolution.servi, 'aucun modèle servi : l’indisponibilité est annoncée').toBeUndefined();
    expect(resolution.raison).toBe('credit-fournisseur');
  });

  it('deux entrées qui se désignent l’une l’autre ne bouclent pas', () => {
    const boucle: CatalogueDuMode = {
      mode: 'power',
      automatique: { politique: 'moins-cher' },
      modeles: [
        {
          model: 'a',
          provider: 'anthropic',
          costInCentsPerM: 10,
          costOutCentsPerM: 10,
          repli: { model: 'b' },
        },
        { model: 'b', provider: 'anthropic', costInCentsPerM: 10, costOutCentsPerM: 10, repli: { model: 'a' } },
      ],
    };

    const enPanne: SondeFournisseur[] = [{ fournisseur: 'anthropic', etat: 'sans-credit' }];

    const resolution = resoudreAvecRepli(boucle, enPanne, { model: 'a' });

    expect(resolution.servi).toBeUndefined();
    expect(resolution.repliApplique).toBe(false);
  });
});

describe('le repli est VISIBLE', () => {
  it('la résolution dit ce qui a été demandé et ce qui sera servi', () => {
    const moonshotASec: SondeFournisseur[] = TOUT_VA_BIEN.map((s) =>
      s.fournisseur === 'moonshot' ? { ...s, etat: 'sans-credit' } : s,
    );

    const resolution = resoudreAvecRepli(parMode('max'), moonshotASec, { model: 'kimi-k3' });

    expect(resolution.demande.model).toBe('kimi-k3');
    expect(resolution.servi!.model).toBe('gpt-5.6-sol');
    expect(resolution.repliApplique, 'la surface doit pouvoir l’annoncer').toBe(true);
  });
});

describe('aucun repli ne pointe à côté', () => {
  it('le catalogue intégré ne déclare que des replis valides', () => {
    const fautes = replisInvalides(CATALOGUE_INTEGRE, margeNegative);

    expect(
      fautes,
      `replis fautifs : ${fautes.map((f) => `${f.mode}/${f.model}→${f.repli} (${f.faute})`).join(', ')}`,
    ).toEqual([]);
  });

  it('CONTRÔLE POSITIF — un repli vers un modèle absent est nommé', () => {
    const casse: CatalogueDuMode[] = [
      {
        ...parMode('max'),
        modeles: [{ ...parMode('max').modeles[0], repli: { model: 'modele-qui-nexiste-pas' } }],
      },
    ];

    const fautes = replisInvalides(casse, margeNegative);

    expect(fautes).toHaveLength(1);
    expect(fautes[0].faute).toBe('absent-du-catalogue');
  });

  it('CONTRÔLE POSITIF — un repli vers une marge négative est nommé', () => {
    /*
     * Un modèle à 1000/5000 en mode Power (×1, prix 650/3250) se vend 54 % sous
     * son prix d'achat. Le proposer comme repli serait pire que l'indisponibilité.
     */
    const aPerte: CatalogueDuMode[] = [
      {
        mode: 'power',
        automatique: { politique: 'moins-cher' },
        modeles: [
          {
            model: 'claude-sonnet-5',
            provider: 'anthropic',
            costInCentsPerM: 200,
            costOutCentsPerM: 1000,
            repli: { model: 'gpt-6-astra' },
          },
          { model: 'gpt-6-astra', provider: 'openai', costInCentsPerM: 1000, costOutCentsPerM: 5000 },
        ],
      },
    ];

    const margeReelle = (_mode: string, model: string) => model === 'gpt-6-astra';
    const fautes = replisInvalides(aPerte, margeReelle);

    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toMatchObject({ model: 'claude-sonnet-5', repli: 'gpt-6-astra', faute: 'marge-negative' });
  });

  it('chaque modèle du catalogue déclare un repli', () => {
    const sansRepli = CATALOGUE_INTEGRE.flatMap((c) =>
      c.modeles.filter((m) => !m.repli).map((m) => `${c.mode}/${m.model}`),
    );

    expect(sansRepli, `sans repli déclaré : ${sansRepli.join(', ')}`).toEqual([]);
  });
});

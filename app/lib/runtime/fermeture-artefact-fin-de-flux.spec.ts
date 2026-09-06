import { describe, expect, it, vi } from 'vitest';
import { StreamingMessageParser, type ArtifactCallbackData } from './message-parser';

/*
 * `onArtifactClose` n'était émis QUE sur une balise `</boltArtifact>` trouvée
 * dans le flux — unique site du dépôt qui pose `closed: true`, sans aucun repli.
 *
 * Un flux tronqué (limite de jetons, erreur de fournisseur, abandon) laissait
 * donc l'artefact ouvert POUR TOUJOURS, et tout ce qui pend à sa fermeture ne
 * s'exécutait jamais — d'abord la PERSISTANCE des fichiers vers le stockage
 * durable : du code produit, affiché, et perdu. Puis la réparation du manifeste
 * d'aperçu (193 projets sur 289 avaient perdu leur épinglage de port en
 * production), la validation des imports, le redémarrage de l'aperçu.
 *
 * Même mécanisme que le défaut de juillet sur `</boltAction>` — une balise plus
 * haut, jamais vérifiée quand celle du dessous a été corrigée.
 */
const OUVERTURE = '<boltArtifact id="a1" title="Application"><boltAction type="file" filePath="src/App.tsx">const x = 1;</boltAction>';

function sonde() {
  const fermetures: ArtifactCallbackData[] = [];
  const parser = new StreamingMessageParser({
    callbacks: { onArtifactClose: (d) => fermetures.push(d) },
  });

  return { parser, fermetures };
}

describe('filet de fin de flux', () => {
  it('TÉMOIN — un flux COMPLET ferme par sa balise, sans filet', () => {
    const { parser, fermetures } = sonde();
    parser.parse('m1', `${OUVERTURE}</boltArtifact>`);

    expect(fermetures, 'la balise doit suffire').toHaveLength(1);
    expect(fermetures[0].fermetureDeSecours, 'et ce n’est PAS une fermeture de secours').toBeFalsy();
  });

  it('un flux TRONQUÉ ne ferme rien tout seul — c’est le défaut', () => {
    const { parser, fermetures } = sonde();
    parser.parse('m1', OUVERTURE);

    expect(fermetures, "sans balise, aucune fermeture n'est émise").toHaveLength(0);
  });

  it('le filet ferme l’artefact resté ouvert, et le MARQUE', () => {
    const { parser, fermetures } = sonde();
    parser.parse('m1', OUVERTURE);

    expect(parser.fermerArtefactsOuverts('m1')).toBe(true);
    expect(fermetures).toHaveLength(1);

    /*
     * L'identifiant est celui que l'analyseur GÉNÈRE (`<messageId>-<n>`), pas
     * l'attribut `id` de la balise — vérifié par la mesure, ma première
     * attente était fausse. On l'ancre donc sur le message, ce qui est le
     * contrat qui compte ici : la fermeture porte sur le bon message.
     */
    expect(fermetures[0].artifactId).toContain('m1');
    expect(fermetures[0].fermetureDeSecours, 'le marqueur rend la fréquence mesurable').toBe(true);
  });

  /*
   * L'idempotence est ce qui permet d'appeler le filet à chaque passe de
   * `parseMessages` sans risque : un message déjà clos ne doit rien déclencher.
   */
  it('ne fait RIEN sur un flux déjà fermé par sa balise', () => {
    const { parser, fermetures } = sonde();
    parser.parse('m1', `${OUVERTURE}</boltArtifact>`);

    expect(parser.fermerArtefactsOuverts('m1'), 'rien à fermer').toBe(false);
    expect(fermetures, 'et aucune fermeture supplémentaire').toHaveLength(1);
  });

  it('ne fait RIEN deux fois de suite', () => {
    const { parser, fermetures } = sonde();
    parser.parse('m1', OUVERTURE);

    expect(parser.fermerArtefactsOuverts('m1')).toBe(true);
    expect(parser.fermerArtefactsOuverts('m1'), 'le second appel est un no-op').toBe(false);
    expect(fermetures).toHaveLength(1);
  });

  it('ne fait RIEN sur un message inconnu ou sans artefact', () => {
    const { parser, fermetures } = sonde();

    expect(parser.fermerArtefactsOuverts('jamais-vu')).toBe(false);

    parser.parse('m2', 'du texte sans le moindre artefact');
    expect(parser.fermerArtefactsOuverts('m2')).toBe(false);
    expect(fermetures).toHaveLength(0);
  });

  it('n’affecte pas les AUTRES messages en vol', () => {
    const { parser, fermetures } = sonde();
    parser.parse('m1', OUVERTURE);
    parser.parse('m2', OUVERTURE);

    parser.fermerArtefactsOuverts('m1');

    expect(fermetures).toHaveLength(1);
    expect(fermetures[0].artifactId, 'seul m1 a été fermé').toContain('m1');
    expect(parser.fermerArtefactsOuverts('m2'), 'm2 reste fermable séparément').toBe(true);
  });
});

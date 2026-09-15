import { describe, expect, it } from 'vitest';
import { StreamingMessageParser } from './message-parser';

/*
 * LE FILET DE FIN DE FLUX DOIT FERMER L'ACTION, PAS SEULEMENT L'ARTEFACT.
 *
 * MESURÉ sur le parseur réel avant correctif, flux coupé au milieu du second
 * fichier :
 *
 *   actions OUVERTES ..  src/App.tsx  et  src/main.tsx
 *   actions FERMÉES ...  src/App.tsx  — seulement
 *
 * `onActionClose` est ce qui déclenche l'exécution NON streamée de l'action
 * (`workbenchStore.runAction(data)`). Le fichier en cours au moment de la
 * coupure — le dernier écrit, donc très souvent le point d'entrée — n'était
 * jamais finalisé. C'est la mécanique derrière la mesure de production
 * « l'index.html réclame /src/main.tsx qui n'existe pas » : le fichier ne
 * manque pas au plan du modèle, c'est sa fermeture qui manquait au nôtre.
 */

interface Trace {
  ouvertes: string[];
  fermees: string[];
  contenus: Record<string, string>;
  artefactFerme: boolean;
  fermetureDeSecours: boolean;
}

function tracer(flux: string): { trace: Trace; ferme: boolean } {
  const trace: Trace = { ouvertes: [], fermees: [], contenus: {}, artefactFerme: false, fermetureDeSecours: false };

  const parseur = new StreamingMessageParser({
    callbacks: {
      onArtifactOpen: () => undefined,
      onArtifactClose: (d: any) => {
        trace.artefactFerme = true;
        trace.fermetureDeSecours = Boolean(d.fermetureDeSecours);
      },
      onActionOpen: (d: any) => trace.ouvertes.push(d.action.filePath ?? d.action.type),
      onActionStream: () => undefined,
      onActionClose: (d: any) => {
        const cle = d.action.filePath ?? d.action.type;
        trace.fermees.push(cle);
        trace.contenus[cle] = d.action.content;
      },
    },
  });

  parseur.parse('m1', flux);

  return { trace, ferme: parseur.fermerArtefactsOuverts('m1') };
}

const COUPE =
  '<boltArtifact id="a" title="t">' +
  '<boltAction type="file" filePath="src/App.tsx">export const App = () => null;\n</boltAction>' +
  '<boltAction type="file" filePath="src/main.tsx">import { App } from "./App";\nconst r = ';

describe('le filet de fin de flux ferme AUSSI l’action restée ouverte', () => {
  it('toute action ouverte finit fermée — le point d’entrée compris', () => {
    const { trace, ferme } = tracer(COUPE);

    expect(ferme).toBe(true);
    expect(trace.ouvertes).toEqual(['src/App.tsx', 'src/main.tsx']);
    expect(trace.fermees).toEqual(['src/App.tsx', 'src/main.tsx']);
  });

  it('le contenu partiel est CONSERVÉ, pas jeté : c’est le travail de l’utilisateur', () => {
    const { trace } = tracer(COUPE);

    expect(trace.contenus['src/main.tsx']).toContain('import { App }');
  });

  it('le contenu reçoit le même traitement que sur une fermeture normale', () => {
    const { trace } = tracer(COUPE);

    /*
     * Un fichier finalisé par le filet doit être indiscernable d'un fichier
     * finalisé par une balise reçue : même trim, même saut de ligne final.
     */
    expect(trace.contenus['src/main.tsx'].endsWith('\n')).toBe(true);
    expect(trace.contenus['src/main.tsx'].startsWith('import')).toBe(true);
  });

  it('l’ordre est action PUIS artefact : l’artefact ne se ferme pas avant son contenu', () => {
    const ordre: string[] = [];

    const parseur = new StreamingMessageParser({
      callbacks: {
        onArtifactOpen: () => undefined,
        onArtifactClose: () => ordre.push('artefact'),
        onActionOpen: () => undefined,
        onActionStream: () => undefined,
        onActionClose: () => ordre.push('action'),
      },
    });

    parseur.parse('m2', COUPE);
    parseur.fermerArtefactsOuverts('m2');

    expect(ordre.slice(-2)).toEqual(['action', 'artefact']);
  });

  it('un flux COMPLET n’est pas touché : le filet ne ferme rien et n’émet rien de plus', () => {
    /*
     * Témoin négatif indispensable : sans lui, un « correctif » qui fermerait
     * une action à chaque appel passerait au vert tout en émettant des
     * fermetures fantômes sur les flux sains.
     */
    const complet = COUPE + '</boltAction></boltArtifact>';
    const { trace, ferme } = tracer(complet);

    expect(ferme).toBe(false);
    expect(trace.fermees).toEqual(['src/App.tsx', 'src/main.tsx']);
    expect(trace.fermetureDeSecours).toBe(false);
  });

  it('un artefact ouvert SANS action en cours ferme l’artefact seul', () => {
    const { trace, ferme } = tracer('<boltArtifact id="a" title="t">du texte');

    expect(ferme).toBe(true);
    expect(trace.fermees).toEqual([]);
    expect(trace.fermetureDeSecours).toBe(true);
  });
});

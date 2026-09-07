import { describe, expect, it } from 'vitest';
import { ArbitreDesLanes, cleDeChemin } from './agent-lane-arbiter';

describe('ArbitreDesLanes', () => {
  it('attribue un fichier libre au premier demandeur', () => {
    const arbitre = new ArbitreDesLanes();
    expect(arbitre.peutEcrire('src/App.tsx', 2).autorisee).toBe(true);
  });

  /*
   * LE TEST QUI TIENT LA RÈGLE. Les deux moitiés sont mesurées : le rôle
   * prioritaire l'emporte quand il arrive EN PREMIER comme quand il arrive EN
   * DERNIER. Sans la seconde, un arbitre « premier arrivé, premier servi »
   * passerait au vert — et rendrait une application différente à chaque
   * exécution pour le même prompt.
   */
  it("rend le meme verdict quel que soit l'ordre d'arrivee des lanes", () => {
    const prioritaireDAbord = new ArbitreDesLanes();
    expect(prioritaireDAbord.peutEcrire('src/App.tsx', 1).autorisee).toBe(true);
    expect(prioritaireDAbord.peutEcrire('src/App.tsx', 4).autorisee).toBe(false);

    const prioritaireEnDernier = new ArbitreDesLanes();
    expect(prioritaireEnDernier.peutEcrire('src/App.tsx', 4).autorisee).toBe(true);
    expect(prioritaireEnDernier.peutEcrire('src/App.tsx', 1).autorisee).toBe(true);

    // Dans les deux cas, le rang 1 detient le fichier a la fin.
    expect(prioritaireDAbord.attributions().get('src/app.tsx')).toBe(1);
    expect(prioritaireEnDernier.attributions().get('src/app.tsx')).toBe(1);
  });

  it('nomme le detenteur quand il refuse', () => {
    const arbitre = new ArbitreDesLanes();
    arbitre.peutEcrire('src/App.tsx', 1);
    expect(arbitre.peutEcrire('src/App.tsx', 3)).toEqual({ autorisee: false, detenuPar: 1 });
  });

  /*
   * L'ÉCRITURE D'UN FICHIER EST FRAGMENTÉE. Le parseur émet `onActionStream`
   * plusieurs fois puis `onActionClose` pour un seul fichier. Un arbitre qui
   * changerait d'avis entre deux fragments couperait le fichier en son milieu —
   * exactement la troncature qu'on passe la semaine à réparer ailleurs.
   */
  it('est idempotent pour un meme couple (chemin, rang)', () => {
    const arbitre = new ArbitreDesLanes();

    for (let fragment = 0; fragment < 5; fragment += 1) {
      expect(arbitre.peutEcrire('src/App.tsx', 2).autorisee).toBe(true);
    }

    expect(arbitre.attributions().size).toBe(1);
  });

  it('laisse passer des chemins distincts sans arbitrage', () => {
    const arbitre = new ArbitreDesLanes();
    expect(arbitre.peutEcrire('src/A.tsx', 1).autorisee).toBe(true);
    expect(arbitre.peutEcrire('src/B.tsx', 4).autorisee).toBe(true);
    expect(arbitre.attributions().size).toBe(2);
  });

  it('refuse un chemin vide plutot que de lui attribuer un proprietaire', () => {
    const arbitre = new ArbitreDesLanes();
    expect(arbitre.peutEcrire('   ', 1).autorisee).toBe(false);
    expect(arbitre.attributions().size).toBe(0);
  });
});

/*
 * ACCORD AVEC LA PASSERELLE.
 *
 * `cleDeChemin` doit reduire exactement comme `normalizeFilePath`
 * (services/ai-gateway/src/consensus/voting.ts). Si les deux divergent, la
 * passerelle signale un conflit que l'arbitre ne voit pas — ou l'inverse — et
 * le panneau se met a mentir sur ce qui s'est reellement passe.
 *
 * Ces cas sont ceux qui distinguent les deux implementations possibles.
 */
describe('cleDeChemin — accord avec normalizeFilePath de la passerelle', () => {
  const cas: Array<[string, string]> = [
    ['./src/App.tsx', 'src/app.tsx'],
    ['/src//App.tsx', 'src/app.tsx'],
    ['  src/App.tsx  ', 'src/app.tsx'],
    ['src/App.tsx', 'src/app.tsx'],
    ['.//a//b//c.ts', 'a/b/c.ts'],
  ];

  for (const [entree, attendu] of cas) {
    it(`reduit ${JSON.stringify(entree)}`, () => {
      expect(cleDeChemin(entree)).toBe(attendu);
    });
  }
});

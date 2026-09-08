import { describe, expect, it } from 'vitest';
import { creerSuiviDeChaine } from './chaine-de-generation';

const tic = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('creerSuiviDeChaine', () => {
  it('une génération seule : on rend la main quand elle se termine', async () => {
    const suivi = creerSuiviDeChaine(5_000);
    suivi.debut();
    setTimeout(() => suivi.fin(), 30);
    await expect(suivi.attendre()).resolves.toBe(false);
  });

  /*
   * LE TEST QUI TIENT LE CORRECTIF.
   *
   * C'est la forme exacte de la continuation : le segment 2 se compte AVANT que
   * le segment 1 ne se solde. Le compteur ne doit jamais retomber à zéro entre
   * les deux — sinon `execute` rend la main, le SDK ferme, et tout ce qui suit
   * est avalé en silence. C'est le défaut mesuré le 2026-09-07.
   */
  it('ne rend PAS la main entre deux segments enchaînés', async () => {
    const suivi = creerSuiviDeChaine(5_000);

    let rendu = false;
    suivi.debut();

    const attente = suivi.attendre().then((d) => {
      rendu = true;
      return d;
    });

    await tic(20);
    suivi.debut(); // le segment 2 se compte avant que le 1 ne se solde
    suivi.fin(); // fin du segment 1
    await tic(40);

    expect(rendu, 'la chaîne ne doit pas être rendue entre les segments').toBe(false);
    expect(suivi.enVol()).toBe(1);

    suivi.fin(); // fin du segment 2
    await expect(attente).resolves.toBe(false);
  });

  /*
   * LA MOITIÉ INVERSE (règle 6) : un `onFinish` qui ne vient JAMAIS doit rendre
   * la main sur le délai, pas laisser la requête ouverte indéfiniment. Sans
   * cette assertion, « attendre la chaîne » remplacerait un écran figé par une
   * requête qui ne se termine pas — ce serait pire.
   */
  it('rend la main sur le délai quand un segment ne se solde jamais', async () => {
    const suivi = creerSuiviDeChaine(60);
    suivi.debut(); // aucune fin() ne viendra
    await expect(suivi.attendre()).resolves.toBe(true);
  });

  it('reste rendu une fois la chaîne terminée', async () => {
    const suivi = creerSuiviDeChaine(5_000);
    suivi.debut();
    suivi.fin();
    await expect(suivi.attendre()).resolves.toBe(false);
    await expect(suivi.attendre()).resolves.toBe(false);
  });

  /*
   * LE CHEMIN D'ABANDON. Sur `STREAM_ABORTED`, c'est `onError` qui s'exécute et
   * jamais `onFinish` — donc le `finally` qui solde le compteur ne tourne pas.
   *
   * Chronologie mesurée le 2026-09-07 :
   *   23:50:47  Client disconnected
   *   23:50:49  stream onError code=STREAM_ABORTED
   *   00:02:49  chat.chaine.delai-depasse  enVol: 1   (12 min plus tard)
   *
   * Un client parti ne doit pas coûter douze minutes de connexion retenue.
   */
  it("rend la main tout de suite quand la génération se solde sur le chemin d'erreur", async () => {
    const suivi = creerSuiviDeChaine(60_000);
    suivi.debut();
    setTimeout(() => suivi.fin(), 20); // onError, pas onFinish
    await expect(suivi.attendre()).resolves.toBe(false);
  });

  /*
   * L'IDEMPOTENCE QUE LE COMMENTAIRE DU CORRECTIF AFFIRME.
   *
   * Si `onError` ET `onFinish` se soldent tous deux pour un même segment, le
   * compteur passe sous zéro. La garde est `<= 0`, pas `=== 0` : le second
   * appel ne doit rien casser ni rouvrir quoi que ce soit.
   */
  it('supporte un solde de trop sans rien casser', async () => {
    const suivi = creerSuiviDeChaine(60_000);
    suivi.debut();
    suivi.fin();
    suivi.fin();

    expect(suivi.enVol()).toBe(-1);
    await expect(suivi.attendre()).resolves.toBe(false);
  });

  /*
   * `premierDebutMs` DÉPARTAGE LES DEUX DERNIÈRES EXPLICATIONS.
   *
   * Si aucune génération ne s'est comptée, `execute` a attendu une chaîne qui
   * n'avait pas commencé — l'attente est alors correcte et INOPÉRANTE, et le
   * SDK ferme sur un compteur à zéro. `undefined` est donc une réponse en soi,
   * pas une absence de mesure.
   */
  it('reste indéfini tant qu aucune génération ne s est comptée', () => {
    expect(creerSuiviDeChaine(60_000).premierDebutMs()).toBeUndefined();
  });

  it('retient le PREMIER début, pas le dernier', async () => {
    const suivi = creerSuiviDeChaine(60_000);
    await tic(30);
    suivi.debut();

    const premier = suivi.premierDebutMs();

    await tic(40);
    suivi.debut();

    expect(premier).toBeGreaterThanOrEqual(25);
    expect(suivi.premierDebutMs(), 'un second début ne doit pas écraser le premier').toBe(premier);
  });
});

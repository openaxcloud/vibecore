import { describe, expect, it } from 'vitest';
import { creerGardeDeRestauration } from './project-ide-restore-guard';

describe('garde de restauration de l’état IDE', () => {
  it('laisse relancer après une tentative ANNULÉE', () => {
    /*
     * Le défaut vécu : l'effet se rejoue quand les fichiers du projet arrivent.
     * Le nettoyage annule la tentative en vol ; si le garde restait posé, la
     * relance sortait sur « déjà restauré » et plus rien n'appliquait l'état.
     */
    const garde = creerGardeDeRestauration();

    expect(garde.peutLancer('proj_1')).toBe(true);

    const jeton = garde.lancer('proj_1');

    expect(garde.peutLancer('proj_1'), 'une tentative est en vol : pas de doublon').toBe(false);

    garde.liberer(jeton); // annulation par le nettoyage de l'effet

    expect(garde.peutLancer('proj_1'), 'une tentative annulée doit pouvoir être relancée').toBe(true);
  });

  it('ne ferme la porte qu’après un succès CONSTATÉ', () => {
    const garde = creerGardeDeRestauration();
    const jeton = garde.lancer('proj_1');
    garde.reussir('proj_1');
    garde.liberer(jeton);

    expect(garde.peutLancer('proj_1'), 'une restauration réussie ne doit pas être refaite').toBe(false);
  });

  it('la fin d’une tentative annulée ne libère pas la tentative suivante', () => {
    /*
     * Les deux tentatives portent le même projet ; seul le jeton les distingue.
     * Sans lui, le `finally` de la première (annulée) rouvrait la porte alors
     * qu'une seconde était déjà en vol, et on repartait en boucle.
     */
    const garde = creerGardeDeRestauration();
    const premier = garde.lancer('proj_1');
    garde.liberer(premier);

    const second = garde.lancer('proj_1');

    garde.liberer(premier); // arrivée tardive du `finally` de la PREMIÈRE

    expect(garde.peutLancer('proj_1'), 'la seconde tentative est toujours en vol').toBe(false);

    garde.liberer(second);

    expect(garde.peutLancer('proj_1')).toBe(true);
  });

  it('oublier repart de zéro, y compris après un succès', () => {
    const garde = creerGardeDeRestauration();
    garde.lancer('proj_1');
    garde.reussir('proj_1');
    garde.oublier();

    expect(garde.peutLancer('proj_1')).toBe(true);
  });

  it('deux projets différents ne se bloquent pas', () => {
    const garde = creerGardeDeRestauration();
    garde.lancer('proj_1');

    expect(garde.peutLancer('proj_2')).toBe(true);
  });
});

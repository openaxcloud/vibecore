import { describe, expect, it } from 'vitest';
import {
  fautIlArmerLAppuiLong,
  leDeplacementAnnuleLAppui,
  placerLeMenu,
  TOLERANCE_DEPLACEMENT_PX,
} from './message-context-menu';

const depart = { x: 100, y: 200, pointerId: 1 };

describe('menu contextuel d’un message', () => {
  it('un défilement du fil n’ouvre pas le menu', () => {
    expect(leDeplacementAnnuleLAppui(depart, 100, 200 + TOLERANCE_DEPLACEMENT_PX + 1)).toBe(true);
  });

  it('un doigt qui tremble ouvre quand même le menu', () => {
    expect(leDeplacementAnnuleLAppui(depart, 103, 204)).toBe(false);
  });

  it('n’arme l’appui long que pour le doigt et le stylet', () => {
    expect(fautIlArmerLAppuiLong({ pointerType: 'touch', button: 0, isPrimary: true })).toBe(true);
    expect(fautIlArmerLAppuiLong({ pointerType: 'pen', button: 0, isPrimary: true })).toBe(true);

    /* La souris a le clic droit : immédiat, sans ambiguïté, et déjà attendu. */
    expect(fautIlArmerLAppuiLong({ pointerType: 'mouse', button: 0, isPrimary: true })).toBe(false);
  });

  it('ignore un second doigt et les boutons secondaires', () => {
    expect(fautIlArmerLAppuiLong({ pointerType: 'touch', button: 0, isPrimary: false })).toBe(false);
    expect(fautIlArmerLAppuiLong({ pointerType: 'touch', button: 2, isPrimary: true })).toBe(false);
  });

  it('retourne le menu quand il déborderait en bas', () => {
    /*
     * C'est le défaut qu'Avi photographie ailleurs : une surface qui sort de
     * l'écran par le bas et passe sous la barre du navigateur.
     */
    const place = placerLeMenu({ x: 40, y: 600 }, { largeur: 220, hauteur: 240 }, { largeur: 393, hauteur: 659 });

    expect(place.y, 'le menu doit remonter au-dessus du point de contact').toBe(360);
    expect(place.y + 240, 'et tenir dans l’écran').toBeLessThanOrEqual(659);
  });

  it('ramène le menu dans l’écran quand le doigt touche près du bord droit', () => {
    const place = placerLeMenu({ x: 380, y: 100 }, { largeur: 220, hauteur: 240 }, { largeur: 393, hauteur: 659 });

    expect(place.x).toBe(161);
    expect(place.x + 220).toBeLessThanOrEqual(393 - 12 + 1);
  });

  it('n’écrase pas le menu contre le bord quand l’écran est plus étroit que lui', () => {
    const place = placerLeMenu({ x: 10, y: 100 }, { largeur: 400, hauteur: 200 }, { largeur: 320, hauteur: 659 });

    expect(place.x, 'la marge gauche reste respectée').toBe(12);
  });
});

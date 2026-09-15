import { describe, expect, it } from 'vitest';
import { FENETRE_FOCUS_APRES_TOUCHER_MS, infobulleAutoriseeAuFocus, pointeurSansSurvol } from './infobulle-tactile';

describe('infobulles et toucher', () => {
  it('un pointeur tactile ou stylet ne survole rien', () => {
    expect(pointeurSansSurvol('touch')).toBe(true);
    expect(pointeurSansSurvol('pen')).toBe(true);
    expect(pointeurSansSurvol('mouse')).toBe(false);
  });

  it('un focus qui suit un toucher ne montre pas d’infobulle', () => {
    expect(infobulleAutoriseeAuFocus({ sansSurvol: false, dernierToucherIlYA: 120 })).toBe(false);
    expect(
      infobulleAutoriseeAuFocus({ sansSurvol: false, dernierToucherIlYA: FENETRE_FOCUS_APRES_TOUCHER_MS + 1 }),
    ).toBe(true);
    expect(infobulleAutoriseeAuFocus({ sansSurvol: false, dernierToucherIlYA: null })).toBe(true);
  });

  it('sur un appareil sans survol, aucun focus ne montre d’infobulle', () => {
    expect(infobulleAutoriseeAuFocus({ sansSurvol: true, dernierToucherIlYA: null })).toBe(false);
  });
});

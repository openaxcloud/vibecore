import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { platformStateLabel } from './platform-state-label';

const t = ((key: string) => `[${key}]`) as unknown as TFunction;

describe('libellé d’état de plateforme', () => {
  it('traduit les états du cycle de vie d’un déploiement, QUEUED et BUILDING compris', () => {
    /*
     * Mesuré le 06/09 : « QUEUED » en capitales anglaises sur la carte
     * « Gérer » pendant qu'« Échec » était traduit. Un état du cycle normal
     * ne doit jamais retomber sur la valeur brute.
     */
    expect(platformStateLabel(t, 'QUEUED')).toBe('[baseChatAst.status.queued]');
    expect(platformStateLabel(t, 'BUILDING')).toBe('[baseChatAst.status.building]');
    expect(platformStateLabel(t, 'READY')).toBe('[baseChatAst.status.ready]');
    expect(platformStateLabel(t, 'FAILED')).toBe('[baseChatAst.status.failed]');
    expect(platformStateLabel(t, 'CANCELED')).toBe('[baseChatAst.status.cancelled]');
  });

  it('garde la valeur brute pour un état inconnu, et « inconnu » pour un état vide', () => {
    expect(platformStateLabel(t, 'WEIRD_STATE')).toBe('WEIRD_STATE');
    expect(platformStateLabel(t, undefined)).toBe('[baseChatAst.status.unknown]');
  });

  it('traduit l’état littéral « unknown » (UIB-13)', () => {
    /*
     * Mesuré le 01/10, panneau Paquets à 1440 : la carte « Environnement
     * d'exécution » affichait « unknown ». L'appelant passe `status ?? 'unknown'`.
     */
    expect(platformStateLabel(t, 'unknown')).toBe('[baseChatAst.status.unknown]');
    expect(platformStateLabel(t, 'UNKNOWN')).toBe('[baseChatAst.status.unknown]');
  });
});

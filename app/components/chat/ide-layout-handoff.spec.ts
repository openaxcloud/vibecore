import { beforeEach, describe, expect, it } from 'vitest';
import {
  VALIDITE_DISPOSITION_TRANSMISE_MS,
  consommerDispositionTransmise,
  deposerDisposition,
  lireDispositionTransmise,
  oublierDispositionTransmise,
  porteeDisposition,
} from './ide-layout-handoff';

const partage = { paneTree: { type: 'split', children: ['a', 'b'] }, activePaneId: 'b', floatingPanes: [] };

beforeEach(() => oublierDispositionTransmise());

describe('passe-plat de la disposition des panneaux (BUG-IDE-SPLIT-EFFACE-001)', () => {
  it('rend la disposition déposée à la même portée, sans la consommer, puis la consomme', () => {
    deposerDisposition('p1:window-main', partage);

    expect(lireDispositionTransmise('p1:window-main')).toEqual(partage);
    expect(lireDispositionTransmise('p1:window-main'), 'une lecture ne consomme pas').toEqual(partage);

    consommerDispositionTransmise('p1:window-main');
    expect(lireDispositionTransmise('p1:window-main')).toBeNull();
  });

  it('ne livre pas la disposition d’une autre portée — et ne la détruit pas', () => {
    deposerDisposition('p1:window-main', partage);

    expect(lireDispositionTransmise('p2:window-main')).toBeNull();
    consommerDispositionTransmise('p2:window-main');

    expect(lireDispositionTransmise('p1:window-main'), 'elle attend toujours son destinataire').toEqual(partage);
  });

  it('distingue les fenêtres d’édition d’un même projet', () => {
    expect(porteeDisposition('p1', 'window-main')).not.toBe(porteeDisposition('p1', 'window-2'));
    expect(porteeDisposition(undefined, 'window-main')).toBe(':window-main');
  });

  it('se périme : une bascule dure des dixièmes de seconde, un retour sur le projet non', () => {
    deposerDisposition('p1:window-main', partage, 1_000);

    expect(lireDispositionTransmise('p1:window-main', 1_000 + VALIDITE_DISPOSITION_TRANSMISE_MS)).toEqual(partage);
    expect(lireDispositionTransmise('p1:window-main', 1_001 + VALIDITE_DISPOSITION_TRANSMISE_MS)).toBeNull();
  });
});

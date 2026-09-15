import { describe, expect, it, vi } from 'vitest';
import { partagerLaCreation } from './creation-partagee';

function differee<T>() {
  let resoudre!: (valeur: T) => void;
  let rejeter!: (raison: unknown) => void;

  const promesse = new Promise<T>((res, rej) => {
    resoudre = res;
    rejeter = rej;
  });

  return { promesse, resoudre, rejeter };
}

describe('partagerLaCreation — un seul POST à la fois', () => {
  it('deux appelants concurrents partagent la MÊME création', async () => {
    /*
     * Mesuré le 14/09 en local (2,5 s de retard réseau) : l'effacement du fil
     * et la boucle de persistance demandaient chacun une conversation, deux
     * `POST` partaient, deux conversations naissaient, et l'identifiant courant
     * était celui de la dernière réponse. Une des deux restait orpheline.
     */
    const porte = { current: null as Promise<string> | null };
    const attente = differee<string>();
    const creer = vi.fn(() => attente.promesse);

    const premier = partagerLaCreation(porte, creer);
    const second = partagerLaCreation(porte, creer);

    expect(creer).toHaveBeenCalledTimes(1);
    expect(second).toBe(premier);

    attente.resoudre('conv-1');
    await expect(premier).resolves.toBe('conv-1');
    await expect(second).resolves.toBe('conv-1');
  });

  it('une fois la création terminée, la porte se rouvre', async () => {
    const porte = { current: null as Promise<string> | null };
    const creer = vi.fn(async () => 'conv-1');

    await partagerLaCreation(porte, creer);
    expect(porte.current).toBeNull();

    await partagerLaCreation(porte, creer);
    expect(creer).toHaveBeenCalledTimes(2);
  });

  it('une création qui ÉCHOUE libère la porte pour le prochain essai', async () => {
    const porte = { current: null as Promise<string> | null };

    const creer = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce('conv-2');

    await expect(partagerLaCreation(porte, creer)).rejects.toThrow('503');
    expect(porte.current).toBeNull();
    await expect(partagerLaCreation(porte, creer)).resolves.toBe('conv-2');
  });
});

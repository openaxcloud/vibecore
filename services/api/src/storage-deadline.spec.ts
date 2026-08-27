import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageDeadlineError, withStorageDeadline } from './storage-deadline.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withStorageDeadline', () => {
  it('rend la valeur quand l’appel répond avant l’échéance', async () => {
    await expect(withStorageDeadline(Promise.resolve({ objects: [] }), 50)).resolves.toEqual({ objects: [] });
  });

  it('laisse remonter l’erreur d’origine plutôt que de la masquer en délai', async () => {
    const panne = new Error('bucket introuvable');

    await expect(withStorageDeadline(Promise.reject(panne), 50)).rejects.toBe(panne);
  });

  it('lève StorageDeadlineError quand l’appel ne rend jamais la main', async () => {
    /* Le cas réel : le client GCS réessaie sans fin sur un bucket injoignable. */
    const jamais = new Promise<never>(() => {
      /* volontairement sans issue */
    });

    await expect(withStorageDeadline(jamais, 20)).rejects.toBeInstanceOf(StorageDeadlineError);
  });

  it('n’émet pas de rejet non géré quand l’appel échoue APRÈS le délai', async () => {
    const rejetsNonGeres: unknown[] = [];
    const capter = (raison: unknown) => rejetsNonGeres.push(raison);

    process.on('unhandledRejection', capter);

    const tardif = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('trop tard')), 30);
    });

    await expect(withStorageDeadline(tardif, 10)).rejects.toBeInstanceOf(StorageDeadlineError);

    await new Promise((resolve) => setTimeout(resolve, 60));

    process.off('unhandledRejection', capter);

    expect(rejetsNonGeres).toEqual([]);
  });
});

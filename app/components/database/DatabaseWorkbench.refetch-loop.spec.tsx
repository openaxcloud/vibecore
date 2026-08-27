/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/*
 * BUG-QA-DB-REFETCH-LOOP-001 (P1) — boucle de rechargement infinie du panneau
 * Base de données : ~110 requêtes / 30 s depuis UN SEUL onglet, CPU de l'API à
 * 212 %, HPA de 2 à 10 réplicas.
 *
 * Cause : `useFetcher()` renvoie un objet d'identité NOUVELLE à chaque rendu.
 * Le mettre en dépendance d'un `useEffect` relance l'effet à chaque rendu, et la
 * garde `!fetcher.data` ne retient rien tant que le chargement n'aboutit à
 * aucune donnée — exactement le cas d'un provisionnement échoué.
 *
 * Ces tests reproduisent la mécanique du hook (identité changeante + données
 * absentes) sur les DEUX effets du composant, sans monter tout l'IDE.
 */

/** Imite `useFetcher()` : nouvel objet à chaque rendu, `data` piloté par le test. */
function useUnstableFetcher(data: unknown, load: (base: string) => void) {
  return { state: 'idle' as const, data, load };
}

describe('BUG-QA-DB-REFETCH-LOOP-001 — chargement initial', () => {
  it('AVANT : dépendre du fetcher + garder sur !data recharge à chaque rendu', async () => {
    const load = vi.fn();

    function Buggy({ tick }: { tick: number }) {
      // `data` reste undefined : le chargement n'aboutit jamais (provision échouée).
      const fetcher = useUnstableFetcher(undefined, load);

      useEffect(() => {
        if (fetcher.state === 'idle' && !fetcher.data) {
          fetcher.load('/base');
        }
      }, [fetcher, tick]);

      return <span>{tick}</span>;
    }

    const { rerender } = render(<Buggy tick={0} />);

    for (let i = 1; i <= 5; i += 1) {
      rerender(<Buggy tick={i} />);
    }

    // Un rechargement par rendu : c'est la boucle observée en production.
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(3));
  });

  it('APRÈS : la garde par ref ne charge QU_UNE fois, même sans données', async () => {
    const load = vi.fn();

    function Fixed({ tick }: { tick: number }) {
      const fetcher = useUnstableFetcher(undefined, load);
      const loadedBaseRef = useRef<string | null>(null);

      useEffect(() => {
        if (loadedBaseRef.current === '/base') {
          return;
        }

        loadedBaseRef.current = '/base';
        fetcher.load('/base');
      }, []);

      return <span>{tick}</span>;
    }

    const { rerender } = render(<Fixed tick={0} />);

    for (let i = 1; i <= 20; i += 1) {
      rerender(<Fixed tick={i} />);
    }

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('APRÈS : un changement de projet (base) déclenche bien UN nouveau chargement', async () => {
    const load = vi.fn();

    function Fixed({ base }: { base: string }) {
      const fetcher = useUnstableFetcher(undefined, load);
      const loadedBaseRef = useRef<string | null>(null);

      useEffect(() => {
        if (loadedBaseRef.current === base) {
          return;
        }

        loadedBaseRef.current = base;
        fetcher.load(base);
      }, [base]);

      return <span>{base}</span>;
    }

    const { rerender } = render(<Fixed base="/a" />);
    rerender(<Fixed base="/a" />);
    rerender(<Fixed base="/b" />);
    rerender(<Fixed base="/b" />);

    expect(load.mock.calls.map((c) => c[0])).toEqual(['/a', '/b']);
  });
});

describe('BUG-QA-DB-REFETCH-LOOP-001 — rechargement après provisionnement', () => {
  it('AVANT : provisionFetcher.data.ok reste vrai, donc on recharge à chaque rendu', async () => {
    const load = vi.fn();
    const provisionData = { ok: true };

    function Buggy({ tick }: { tick: number }) {
      const fetcher = useUnstableFetcher({ environments: [] }, load);

      useEffect(() => {
        if (provisionData.ok) {
          fetcher.load('/base');
        }
      }, [fetcher, tick]);

      return <span>{tick}</span>;
    }

    const { rerender } = render(<Buggy tick={0} />);

    for (let i = 1; i <= 5; i += 1) {
      rerender(<Buggy tick={i} />);
    }

    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(3));
  });

  it('APRÈS : un provisionnement réussi ne recharge QU_UNE fois', async () => {
    const load = vi.fn();
    const provisionData = { ok: true };

    function Fixed({ tick }: { tick: number }) {
      const fetcher = useUnstableFetcher({ environments: [] }, load);
      const handledRef = useRef<unknown>(null);

      useEffect(() => {
        if (!provisionData.ok || handledRef.current === provisionData) {
          return;
        }

        handledRef.current = provisionData;
        fetcher.load('/base');
      }, [tick]);

      return <span>{tick}</span>;
    }

    const { rerender } = render(<Fixed tick={0} />);

    for (let i = 1; i <= 20; i += 1) {
      rerender(<Fixed tick={i} />);
    }

    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-QA-DB-IDE-BRICK-001 — un chargement sans données doit être une ERREUR affichée', () => {
  /** Reproduit la condition `loadFailed` du composant, avant et après. */
  const loadFailedBefore = (state: string, data: unknown, envCount: number) =>
    state === 'idle' && Boolean(data) && typeof (data as any)?.error === 'string' && envCount === 0;

  const loadFailedAfter = (state: string, data: unknown, envCount: number, attempted: boolean) =>
    state === 'idle' &&
    attempted &&
    ((Boolean(data) && typeof (data as any)?.error === 'string' && envCount === 0) || data === undefined);

  it('AVANT : un chargement idle SANS donnée n_est pas vu comme un échec (squelette perpétuel)', () => {
    expect(loadFailedBefore('idle', undefined, 0)).toBe(false);
  });

  it('APRÈS : il est vu comme un échec, donc erreur + Réessayer sont rendus', () => {
    expect(loadFailedAfter('idle', undefined, 0, true)).toBe(true);
  });

  it('APRÈS : aucun faux échec avant la première tentative', () => {
    expect(loadFailedAfter('idle', undefined, 0, false)).toBe(false);
  });

  it('APRÈS : une réponse portant une erreur reste un échec, un succès reste un succès', () => {
    expect(loadFailedAfter('idle', { error: 'boom' }, 0, true)).toBe(true);
    expect(loadFailedAfter('idle', { environments: [{}] }, 1, true)).toBe(false);
  });
});

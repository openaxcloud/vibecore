/** @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStickToBottom } from './useStickToBottom';

/**
 * BUG-WEBKIT-SCROLL-FIL-001 — l'ordre de mise en page que WebKit produit et
 * que Chromium ne produit pas, rejoué dans jsdom.
 *
 * Mesuré sur le canari WebKit iPhone (run 1945 sur `main`, mobile 390, deux
 * essais de suite) : `scrollTop=0 scrollHeight=2563 clientHeight=599` et aucune
 * pilule — le hook se croyait en bas. Le premier redimensionnement du CONTENU
 * arrive alors que le conteneur n'est pas encore contraint (clientHeight =
 * scrollHeight) : la cible de défilement vaut 0, le collage « instantané » se
 * termine aussitôt, puis le conteneur se contracte et plus rien ne rejoue le
 * collage. Ce test reproduit exactement cette séquence ; sans l'observation du
 * conteneur il reste rouge (scrollTop = 0).
 *
 * jsdom n'a pas de mise en page : les dimensions sont posées à la main, avec un
 * `scrollTop` borné comme le fait un navigateur (jamais au-delà de
 * scrollHeight − clientHeight) — c'est précisément cette borne qui perd
 * l'écriture quand le conteneur n'est pas encore défilant.
 */

type Rappel = (entries: Array<{ contentRect: { height: number } }>) => void;

const observations = new Map<Element, Rappel>();

class ResizeObserverFactice {
  private readonly _rappel: Rappel;

  constructor(rappel: Rappel) {
    this._rappel = rappel;
  }

  observe(element: Element) {
    observations.set(element, this._rappel);
  }

  unobserve(element: Element) {
    observations.delete(element);
  }

  disconnect() {
    for (const [element, rappel] of observations) {
      if (rappel === this._rappel) {
        observations.delete(element);
      }
    }
  }
}

function poserLesDimensions(element: HTMLElement, dims: { scrollHeight: number; clientHeight: number }) {
  let scrollTop = 0;

  const etat = { ...dims };

  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => etat.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => etat.clientHeight });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (valeur: number) => {
      // La borne du navigateur : on ne défile jamais au-delà du contenu.
      scrollTop = Math.max(0, Math.min(valeur, etat.scrollHeight - etat.clientHeight));
    },
  });

  return etat;
}

function Fil() {
  const { scrollRef, contentRef } = useStickToBottom({ initial: 'instant', resize: 'instant' });

  return (
    <div ref={scrollRef} data-testid="conteneur" style={{ overflow: 'auto' }}>
      <div ref={contentRef} data-testid="contenu" />
    </div>
  );
}

async function laisserLesImagesPasser(nombre = 6) {
  for (let i = 0; i < nombre; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

describe('useStickToBottom — le conteneur contraint APRÈS le premier calcul (ordre WebKit)', () => {
  beforeEach(() => {
    observations.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverFactice);

    if (typeof globalThis.requestAnimationFrame !== 'function') {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 8));
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('recolle en bas quand le conteneur se contracte alors que le fil est censé y être', async () => {
    const { getByTestId } = render(<Fil />);
    const conteneur = getByTestId('conteneur');
    const contenu = getByTestId('contenu');

    // Séquence WebKit : le contenu mesure 2 563 px, le conteneur n'est PAS encore contraint.
    const dims = poserLesDimensions(conteneur, { scrollHeight: 2563, clientHeight: 2563 });
    expect(observations.has(contenu), 'le contenu doit être observé').toBe(true);
    expect(observations.has(conteneur), 'le conteneur doit être observé').toBe(true);

    await act(async () => {
      observations.get(contenu)!([{ contentRect: { height: 2563 } }]);
    });
    await laisserLesImagesPasser();

    // Rien à défiler : la cible vaut 0. C'est l'état où le hook « se croit en bas ».
    expect(conteneur.scrollTop).toBe(0);

    // La mise en page contraint enfin le conteneur à 599 px de haut.
    dims.clientHeight = 599;

    await act(async () => {
      observations.get(conteneur)!([{ contentRect: { height: 599 } }]);
    });
    await laisserLesImagesPasser();

    // Cible du hook : scrollHeight − 1 − clientHeight.
    expect(conteneur.scrollTop).toBeGreaterThanOrEqual(2563 - 1 - 599);
  });

  it('ne ramène JAMAIS de force un utilisateur qui a remonté le fil', async () => {
    const { getByTestId } = render(<Fil />);
    const conteneur = getByTestId('conteneur');
    const contenu = getByTestId('contenu');
    const dims = poserLesDimensions(conteneur, { scrollHeight: 2563, clientHeight: 599 });

    await act(async () => {
      observations.get(contenu)!([{ contentRect: { height: 2563 } }]);
    });
    await laisserLesImagesPasser();
    expect(conteneur.scrollTop).toBeGreaterThanOrEqual(2563 - 1 - 599);

    // L'utilisateur remonte à la molette : le hook s'échappe du collage.
    await act(async () => {
      conteneur.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
    });
    conteneur.scrollTop = 400;
    await act(async () => {
      conteneur.dispatchEvent(new Event('scroll'));
    });
    await laisserLesImagesPasser();

    // Le conteneur change de hauteur (clavier, barre d'adresse…) : on ne le ramène pas.
    dims.clientHeight = 420;

    await act(async () => {
      observations.get(conteneur)!([{ contentRect: { height: 420 } }]);
    });
    await laisserLesImagesPasser();

    expect(conteneur.scrollTop).toBe(400);
  });
});

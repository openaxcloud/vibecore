import { describe, expect, it } from 'vitest';

import { readPointerCapabilities, shouldAutoFocusCommandPalette } from './command-palette-focus';

describe('BUG-MOB-PALETTE-KEYBOARD-001 — auto-focus de la palette Commandes', () => {
  it('garde l’auto-focus sur un poste à pointeur fin (souris/trackpad)', () => {
    expect(shouldAutoFocusCommandPalette({ coarsePointer: false, finePointer: true })).toBe(true);
  });

  it('garde l’auto-focus sur une tablette AVEC clavier/trackpad (SCR-006)', () => {
    expect(shouldAutoFocusCommandPalette({ coarsePointer: true, finePointer: true })).toBe(true);
  });

  /*
   * Le cas d'Avi : iPhone, aucun pointeur fin. L'auto-focus y lève le clavier
   * logiciel, qui masque la moitié de la liste et déplace la mise en page entre
   * le toucher et le `click` — la sélection part alors sur une autre cible.
   */
  it('coupe l’auto-focus sur un appareil purement tactile', () => {
    expect(shouldAutoFocusCommandPalette({ coarsePointer: true, finePointer: false })).toBe(false);
  });

  it('reste conservateur quand aucune capacité n’est mesurable (SSR)', () => {
    const previous = Reflect.get(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'window');

    try {
      expect(readPointerCapabilities()).toEqual({ coarsePointer: false, finePointer: true });
      expect(shouldAutoFocusCommandPalette(readPointerCapabilities())).toBe(true);
    } finally {
      if (previous !== undefined) {
        Reflect.set(globalThis, 'window', previous);
      }
    }
  });

  it('lit les deux media queries quand elles sont disponibles', () => {
    const previous = Reflect.get(globalThis, 'window');
    const asked: string[] = [];

    Reflect.set(globalThis, 'window', {
      matchMedia: (query: string) => {
        asked.push(query);
        return { matches: query === '(pointer: coarse)' } as MediaQueryList;
      },
    });

    try {
      expect(readPointerCapabilities()).toEqual({ coarsePointer: true, finePointer: false });
      expect(asked).toEqual(['(pointer: coarse)', '(any-pointer: fine)']);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'window');
      } else {
        Reflect.set(globalThis, 'window', previous);
      }
    }
  });
});

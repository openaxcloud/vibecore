import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConstatDeGeneration } from '~/lib/runtime/generation-incomplete';

const appels: { rendu: unknown; options: Record<string, unknown> }[] = [];

vi.mock('react-toastify', () => {
  const toast = Object.assign(
    (rendu: unknown, options: Record<string, unknown>) => {
      appels.push({ rendu, options });
    },
    {
      isActive: () => false,
      dismiss: vi.fn(),
      update: vi.fn(),
      success: (rendu: unknown, options: Record<string, unknown>) => {
        appels.push({ rendu, options });
      },
    },
  );

  return { toast };
});

const { showCoalescedAppliedToast } = await import('./AppliedFilesToast');

const CASSE: ConstatDeGeneration = { tronquee: true, entreesManquantes: ['src/main.tsx'], aucunFichier: false };
const SAIN: ConstatDeGeneration = { tronquee: false, entreesManquantes: [], aucunFichier: false };

function props(): Record<string, unknown> {
  return (appels.at(-1)?.rendu as { props: Record<string, unknown> }).props;
}

/**
 * LA MOITIÉ VISIBLE DE LA GARDE D'HONNÊTETÉ.
 *
 * `AppliedFilesToast` acceptait déjà une prop `constat` et savait afficher le
 * message honnête — c'était du code mort : RIEN ne la lui passait. Le bandeau
 * continuait d'annoncer « les patchs ont bien été appliqués » sur une
 * application sans point d'entrée. Ces tests tiennent le RELAIS, pas le
 * rendu (déjà couvert par AppliedFilesToast.i18n.spec.tsx).
 */
describe('le bandeau « patchs appliqués » consulte le constat', () => {
  beforeEach(() => {
    appels.length = 0;
  });

  it('sans constat : succès, fermeture automatique — le cas normal est intact', () => {
    showCoalescedAppliedToast(['src/App.tsx'], { onUndoAll: vi.fn() });

    expect(appels).toHaveLength(1);
    expect(appels[0].options.type).toBe('success');
    expect(appels[0].options.autoClose).toBe(4000);
    expect(props().constat).toBeUndefined();
  });

  it('constat SAIN : succès aussi — ce n’est pas la présence du constat qui alarme', () => {
    showCoalescedAppliedToast(['src/App.tsx'], { onUndoAll: vi.fn() }, SAIN);

    expect(appels[0].options.type).toBe('success');
    expect(props().constat).toEqual(SAIN);
  });

  it('constat MALHONNÊTE : le constat est transmis au composant', () => {
    showCoalescedAppliedToast(['src/App.tsx'], { onUndoAll: vi.fn() }, CASSE);

    expect(props().constat).toEqual(CASSE);
  });

  it('constat MALHONNÊTE : plus de coche verte, et le bandeau ne se ferme pas tout seul', () => {
    /*
     * Le ton compte autant que le texte : une coche verte sur un projet qui ne
     * démarre pas est exactement le mensonge que cette garde existe pour
     * empêcher. Et un bandeau qui disparaît en quatre secondes ne laisse pas
     * le temps de lire QUEL module manque.
     */
    showCoalescedAppliedToast(['src/App.tsx'], { onUndoAll: vi.fn() }, CASSE);

    expect(appels[0].options.type).toBe('warning');
    expect(appels[0].options.autoClose).toBe(false);
  });
});

describe('le relais entre le calcul du constat et son affichage existe vraiment', () => {
  const RACINE = join(__dirname, '..', '..', '..');
  const SOURCE_HOOK = readFileSync(join(RACINE, 'app/lib/hooks/useMessageParser.ts'), 'utf8');
  const SOURCE_BASE = readFileSync(join(RACINE, 'app/components/chat/BaseChat.tsx'), 'utf8');

  it('témoin positif : les deux fichiers lus sont bien ceux qu’on croit', () => {
    expect(SOURCE_HOOK.includes('fermetureDeSecours')).toBe(true);
    expect(SOURCE_BASE.includes('showCoalescedAppliedToast(')).toBe(true);
  });

  it('le hook PUBLIE le constat qu’il vient de calculer', () => {
    expect(SOURCE_HOOK.includes('constatDeGenerationStore.set(constat);')).toBe(true);
  });

  it('le hook REMET À ZÉRO à l’ouverture d’un artefact : pas de constat périmé', () => {
    /*
     * Sans cette remise à zéro, une génération tronquée teindrait le bandeau du
     * tour SUIVANT, qui s'est peut-être très bien passé. Un faux négatif est un
     * mensonge dans l'autre sens et coûte autant.
     */
    expect(SOURCE_HOOK.includes('constatDeGenerationStore.set(undefined);')).toBe(true);

    const ouverture = SOURCE_HOOK.split('onArtifactOpen: (data) => {')[1] ?? '';
    expect(ouverture.length).toBeGreaterThan(50);
    expect(ouverture.slice(0, 800).includes('constatDeGenerationStore.set(undefined);')).toBe(true);
  });

  it('le bandeau LIT le constat au moment de l’afficher', () => {
    const appel = SOURCE_BASE.split('showCoalescedAppliedToast(')[1] ?? '';
    expect(appel.length).toBeGreaterThan(100);
    expect(appel.slice(0, 2000).includes('constatDeGenerationStore.get(),')).toBe(true);
  });
});

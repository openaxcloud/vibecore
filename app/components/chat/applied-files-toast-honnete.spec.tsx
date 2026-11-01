import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { revertAgentPatchProposal: vi.fn() },
}));

const { scheduleAppliedFilesToast } = await import('./schedule-applied-files-toast');
const { constatDeGenerationStore } = await import('~/lib/stores/constat-de-generation');

const { workbenchStore } = await import('~/lib/stores/workbench');

const CASSE: ConstatDeGeneration = {
  tronquee: true,
  entreesManquantes: ['src/main.tsx'],
  aucunFichier: false,
};
const SAIN: ConstatDeGeneration = {
  tronquee: false,
  entreesManquantes: [],
  aucunFichier: false,
};

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

describe('le relais différé conserve le constat et Undo', () => {
  beforeEach(() => {
    appels.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    constatDeGenerationStore.set(undefined);
  });

  afterEach(async () => {
    const dernier = appels.at(-1)?.rendu as { props: { onDismissAll?: () => void } } | undefined;
    dernier?.props.onDismissAll?.();
    await vi.runAllTimersAsync();
    constatDeGenerationStore.set(undefined);
    vi.useRealTimers();
  });

  it('lit le constat au flush et conserve les identités initiale et reprise pour Undo', async () => {
    scheduleAppliedFilesToast('initial.ts', 'initial');
    scheduleAppliedFilesToast('retry.ts', 'retry');
    scheduleAppliedFilesToast('retry.ts', 'retry');
    expect(appels).toHaveLength(0);

    // Le parseur peut terminer entre la confirmation d’écriture et le bandeau.
    constatDeGenerationStore.set(CASSE);
    vi.advanceTimersByTime(80);
    expect(appels).toHaveLength(1);
    expect(props().constat).toEqual(CASSE);
    expect(appels[0].options).toMatchObject({
      type: 'warning',
      autoClose: false,
    });
    (props().onUndoAll as () => void)();
    await vi.runAllTimersAsync();
    expect(vi.mocked(workbenchStore.revertAgentPatchProposal).mock.calls).toEqual([['initial'], ['retry']]);
  });

  it.each([SAIN, undefined])('ne réutilise pas un constat périmé après remise à zéro (%j)', (constat) => {
    constatDeGenerationStore.set(CASSE);
    scheduleAppliedFilesToast('next.ts', 'next');
    constatDeGenerationStore.set(constat);
    vi.advanceTimersByTime(80);
    expect(props().constat).toEqual(constat);
    expect(appels[0].options).toMatchObject({
      type: 'success',
      autoClose: 4000,
    });
  });
});

describe('le relais entre le calcul du constat et son affichage existe vraiment', () => {
  const RACINE = join(__dirname, '..', '..', '..');

  const SOURCE_HOOK = readFileSync(join(RACINE, 'app/lib/hooks/useMessageParser.ts'), 'utf8');
  const SOURCE_BASE = readFileSync(join(RACINE, 'app/components/chat/BaseChat.tsx'), 'utf8');
  const SOURCE_SCHEDULER = readFileSync(join(RACINE, 'app/components/chat/schedule-applied-files-toast.ts'), 'utf8');

  function appelsAuBandeau(source: string) {
    const fichier = ts.createSourceFile('caller.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const appels: ts.CallExpression[] = [];

    const visiter = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(fichier) === 'showCoalescedAppliedToast') {
        appels.push(node);
      }

      ts.forEachChild(node, visiter);
    };
    visiter(fichier);

    return appels.map((appel) => appel.arguments.map((argument) => argument.getText(fichier)));
  }

  it('témoin positif : le parseur, le chat et son relais sont bien raccordés', () => {
    expect(SOURCE_HOOK.includes('fermetureDeSecours')).toBe(true);
    expect(SOURCE_BASE).toContain('scheduleAppliedFilesToast(filePath, proposalId)');
    expect(SOURCE_BASE).toContain("if (result === 'accepted')");
    expect(appelsAuBandeau(SOURCE_SCHEDULER)).toHaveLength(1);
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
    expect(appelsAuBandeau(SOURCE_SCHEDULER)[0][2]).toBe('constatDeGenerationStore.get()');
  });

  /*
   * BUG-AGENT-TOAST-HONNETE-001 — cette garde-ci ne visait qu'UN appelant, et
   * c'est par l'autre que le défaut passait. `app/utils/toast-batcher.ts`
   * peignait le même bandeau SANS le constat : coche verte et « les patchs ont
   * bien été appliqués » sur une génération sans point d'entrée.
   *
   * On vise donc la RÈGLE (règle 7) : TOUT appelant de production passe le
   * constat. Un troisième point d'entrée rougira ici avant d'atteindre l'écran.
   */
  const FICHIERS_DE_PRODUCTION = [
    'app/components/chat/schedule-applied-files-toast.ts',
    'app/utils/toast-batcher.ts',
  ] as const;

  it('témoin positif : la recherche des appelants trouve bien les fichiers attendus (règle 14)', () => {
    for (const chemin of FICHIERS_DE_PRODUCTION) {
      expect(readFileSync(join(RACINE, chemin), 'utf8')).toContain('showCoalescedAppliedToast(');
    }
  });

  it.each(FICHIERS_DE_PRODUCTION)('%s passe le constat au bandeau', (chemin) => {
    const source = readFileSync(join(RACINE, chemin), 'utf8');
    const appels = appelsAuBandeau(source);
    expect(appels.length, 'appel introuvable — la garde ne mesure rien').toBeGreaterThan(0);

    for (const argumentsDeLAppel of appels) {
      expect(argumentsDeLAppel[2]).toBe('constatDeGenerationStore.get()');
    }
  });

  it('aucun appelant de production n’a été oublié dans la liste ci-dessus', () => {
    /*
     * La liste est écrite à la main ; ce cas la confronte au dépôt. Sans lui,
     * ajouter un appelant sans l'inscrire ici rendrait la garde muette — la
     * façon la plus courante de faire mentir un test de câblage.
     */
    const sortie = execFileSync(
      'grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', 'showCoalescedAppliedToast(', 'app'],
      { cwd: RACINE, encoding: 'utf8' },
    );

    const appelants = sortie
      .split('\n')
      .filter(Boolean)
      .filter((chemin) => !chemin.includes('.spec.'))
      .filter((chemin) => !chemin.endsWith('AppliedFilesToast.tsx'))
      .sort();

    expect(appelants).toEqual([...FICHIERS_DE_PRODUCTION].sort());
  });

  it('le chat initial et la reprise de la file utilisent le même relais différé', () => {
    const sortie = execFileSync(
      'grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', 'scheduleAppliedFilesToast(', 'app'],
      { cwd: RACINE, encoding: 'utf8' },
    );
    const appelants = sortie
      .split('\n')
      .filter(Boolean)
      .filter((chemin) => !chemin.includes('.spec.'))
      .filter((chemin) => !chemin.endsWith('schedule-applied-files-toast.ts'))
      .sort();
    expect(appelants).toEqual(['app/components/chat/AgentPatchReviewQueue.tsx', 'app/components/chat/BaseChat.tsx']);
  });
});

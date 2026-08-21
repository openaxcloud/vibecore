import type { ActionState } from '~/lib/runtime/action-runner';

/**
 * The three terminal-or-in-progress states a bundled "Creating Project…" artifact
 * card can be in. A `start` action that is still `running` counts as finished
 * (the dev server stays up), so it does not keep the card spinning.
 */
export type BundledArtifactState = 'running' | 'complete' | 'failed';

/**
 * Derive the display state for a bundled artifact (the primary "agent is building
 * your app" surface for new-project creation and snapshot restore).
 *
 * Previously the card had only two states — spinner or green check — computed from
 * `!actions.find(a => a.status !== 'complete' && !(start && running))`. A `failed`
 * or `aborted` action (an interrupted `npm install`, a Ctrl+C between actions, or a
 * failed file write) kept that predicate truthy forever, so the card spun on
 * "Creating Project…" indefinitely with no indication the setup actually failed.
 *
 * This folds the action list into an explicit tri-state:
 *  - `failed`   — at least one action is `failed` or `aborted`.
 *  - `complete` — no failures and every action is `complete` (a still-`running`
 *                 `start` action does not block completion).
 *  - `running`  — otherwise (something is still pending/running).
 */
export function deriveBundledArtifactState(actions: ActionState[]): BundledArtifactState {
  if (actions.some((action) => action.status === 'failed' || action.status === 'aborted')) {
    return 'failed';
  }

  const stillWorking = actions.some(
    (action) => action.status !== 'complete' && !(action.type === 'start' && action.status === 'running'),
  );

  return stillWorking ? 'running' : 'complete';
}

/**
 * The first failure reason in a bundled artifact, if any. `aborted` actions carry
 * no `error` field (only `failed` does), so they fall back to a generic message so
 * the card can still explain that setup stopped.
 */
export function firstBundledFailureReason(actions: ActionState[]): string | undefined {
  for (const action of actions) {
    if (action.status === 'failed') {
      return action.error || 'Project setup failed.';
    }

    if (action.status === 'aborted') {
      return 'Setup was stopped before it finished.';
    }
  }

  return undefined;
}

/**
 * BUG-AGENT-003 — l'issue de l'orchestration doit peser sur le statut affiché.
 *
 * La ligne de statut du run (« Agent · Terminé · 100 % ») se calcule à partir
 * des seules annotations `progress`, qui décrivent les ACTIONS. Un run dont les
 * cinq voies parallèles échouent et dont le consensus est rejeté à 0 % voit donc
 * ses écritures de fichiers réussir et s'affiche « Terminé 100 % » — alors que
 * le panneau Agent, lui, affiche honnêtement « Plan 0/5 » et « Rejeté ».
 *
 * Deux surfaces, deux vérités contradictoires sur le même run. Ce prédicat
 * fournit la moitié manquante, pour que la ligne de statut ne puisse plus
 * annoncer un succès complet quand l'orchestration a échoué.
 *
 * Volontairement étroit : seuls un `status: 'failed'` explicite et un consensus
 * `REJECTED` comptent. Un run `partial` reste `partial` — le dégrader en échec
 * serait aussi mensonger, dans l'autre sens.
 */
export function isAgentRunFailed(annotations: unknown): boolean {
  if (!Array.isArray(annotations)) {
    return false;
  }

  for (const entry of annotations) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const annotation = entry as {
      type?: unknown;
      status?: unknown;
      consensus?: { outcome?: unknown } | null;
    };

    if (annotation.type !== 'agentExecution') {
      continue;
    }

    if (annotation.status === 'failed') {
      return true;
    }

    if (annotation.consensus && annotation.consensus.outcome === 'REJECTED') {
      return true;
    }
  }

  return false;
}

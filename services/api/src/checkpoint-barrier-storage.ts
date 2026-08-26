/**
 * Application de la barrière de checkpoint AU POINT D'ÉTRANGLEMENT du stockage
 * (P0-V3-09).
 *
 * Pourquoi ici et pas sur les routes : la barrière n'était vérifiée que sur 2
 * handlers, alors que ~35 routes mutent l'arbre projet — et plusieurs écritures
 * partent de handlers **GET** (`listProjectFilesIncludingIdeState` appelle
 * `restoreSnapshot`/`writeFiles` pour resynchroniser depuis l'état IDE). Un
 * garde posé route par route est condamné à laisser passer les prochaines.
 *
 * En enveloppant `ProjectStorage`, TOUT appelant du processus API — route,
 * helper, tick de tâche planifiée, worker — se heurte à la même vérification,
 * qu'il ait pensé à la barrière ou non.
 *
 * Ce que ça ne règle PAS, et qui reste déclaré dans le manifeste : les écrivains
 * qui n'ont jamais traversé ce module, à savoir les processus DANS le pod
 * workspace (dev server, terminal) qui écrivent leur propre volume
 * `pvc-<workspaceId>`. Le gel côté pod est un chantier séparé.
 */
import type { ProjectStorage } from './project-storage.js';

/**
 * Méthodes qui mutent l'ARBRE d'un projet. `createSnapshot` en est
 * volontairement absent : il écrit sous `_objects/`, pas dans l'arbre, et c'est
 * l'écriture que le checkpoint lui-même doit pouvoir faire sous sa barrière.
 * `deleteFiles` figure ici bien qu'absent de l'interface : des implémentations
 * l'exposent, et le proxy doit le garder si elle apparaît.
 */
const TREE_MUTATORS = new Set(['writeFiles', 'importZip', 'restoreSnapshot', 'deleteFiles', 'deleteProjectFiles']);

export class CheckpointBarrierError extends Error {
  readonly statusCode = 423;
  readonly code = 'CHECKPOINT_BARRIER_ACTIVE';

  constructor(readonly barrierId: string) {
    super('Project is quiesced for a coordinated checkpoint — retry after the barrier lifts.');
    this.name = 'CheckpointBarrierError';
  }
}

export interface BarrierLookup {
  (projectId: string): Promise<{ barrierId: string } | undefined>;
}

/**
 * Renvoie un `ProjectStorage` qui refuse toute mutation de l'arbre d'un projet
 * sous barrière. Les lectures passent (elles ne cassent pas l'instant du
 * snapshot) ; `createSnapshot` passe aussi, car il écrit dans `_objects/` et non
 * dans l'arbre projet — c'est l'opération que le checkpoint lui-même exécute.
 *
 * L'orchestrateur de checkpoint garde une référence au stockage NON enveloppé :
 * il doit pouvoir restaurer pendant que sa propre barrière tient.
 */
export function withCheckpointBarrier(inner: ProjectStorage, activeBarrier: BarrierLookup): ProjectStorage {
  const refuseIfFrozen = async (projectId: string) => {
    const barrier = await activeBarrier(projectId);

    if (barrier) {
      throw new CheckpointBarrierError(barrier.barrierId);
    }
  };

  /*
   * Délégation par proxy plutôt que par sous-classe : `ProjectStorage` gagnera
   * d'autres méthodes, et un proxy relaie les nouvelles telles quelles au lieu
   * de les oublier silencieusement. Seules les mutations d'arbre sont gardées.
   */
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original !== 'function') {
        return original;
      }

      /*
       * Forward variadique : les signatures évoluent (`writeFiles` a déjà un
       * 3e paramètre `workspaceId`), et une ré-déclaration manuelle finirait par
       * avaler un argument en silence. On n'extrait que le projectId.
       */
      if (TREE_MUTATORS.has(prop as string)) {
        return async (...args: unknown[]) => {
          const projectId =
            prop === 'restoreSnapshot' ? (args[0] as { projectId: string }).projectId : (args[0] as string);
          await refuseIfFrozen(projectId);

          return (original as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      return original.bind(target);
    },
  });
}

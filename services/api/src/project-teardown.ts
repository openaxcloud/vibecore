import { appPublicEnglish } from './app-public-copy.js';
import type { DatabaseProvisioner } from './database-provisioner.js';
import type { ObjectStorage } from './object-storage.js';

/*
 * AUDX-171 — supprimer un projet doit supprimer ce que ce projet a créé HORS de
 * PostgreSQL.
 *
 * Les LIGNES sont propres : 24 des 25 relations vers `Project` sont en
 * `onDelete: Cascade` (la 25ᵉ, `AiConversation`, est un `SetNull` délibéré). Ce
 * qui survivait, ce sont les ressources EXTERNES — celles qu'aucune contrainte
 * de base ne peut atteindre :
 *
 *   - le `Cluster` CNPG du projet (dev ET prod), qui continue de tourner ;
 *   - la CR `Database` du tier partagé ;
 *   - le `ScheduledBackup` ;
 *   - les sauvegardes dans `gs://<bucket>/db/<projectId>` ;
 *   - le seau d'object storage `vc-<projectId>` ;
 *   - le PVC `pvc-<org>-<slug>`.
 *
 * ⚠️ La cause n'était pas un démontage incomplet : `DatabaseProvisioner.teardown()`
 * existait, son commentaire promettait « so deleting a project leaves no orphaned
 * production database behind » — et RIEN NE L'APPELAIT. Déclaré, implémenté deux
 * fois, invoqué uniquement par des specs. La route
 * `DELETE /projects/:projectId/permanent` faisait `hardDeleteProject` + un audit,
 * point final.
 *
 * ⚠️ Et la « politique de conservation » aggrave le cas des sauvegardes plutôt
 * qu'elle ne le règle : `spec.backup.retentionPolicy` est appliquée par l'opérateur
 * CNPG À TRAVERS le `Cluster`. Une fois le `Cluster` supprimé, plus personne
 * n'élague — les sauvegardes du projet supprimé restent indéfiniment. La rétention
 * ne protège que tant que la ressource vit ; elle ne survit pas à son propriétaire.
 */

/** Ce qu'un projet laisse derrière lui, et comment on l'enlève. */
export interface ProjectExternalResource {
  /** Identifiant stable, utilisé dans l'audit et par le réconciliateur. */
  readonly id: string;
  /** Ce que c'est, en clair, pour l'opérateur qui lira une ligne d'audit. */
  readonly describes: string;
  /**
   * Supprime la ressource. DOIT être idempotent : un démontage rejoué après un
   * échec partiel ne doit pas échouer sur ce qui est déjà parti.
   */
  remove(deps: TeardownDeps, project: TeardownTarget): Promise<void>;
}

export interface TeardownTarget {
  readonly id: string;
  readonly organizationId: string;
  readonly persistentVolumeClaim?: string;

  /*
   * Identifiants LUS SUR LES LIGNES avant que la suppression ne les emporte.
   * Jamais reconstruits : ce sont les seules poignées fiables vers les ressources
   * vivantes, et elles disparaissent avec les lignes.
   */
  readonly workspaceIds?: readonly string[];
  readonly deploymentIds?: readonly string[];
}

export interface TeardownDeps {
  readonly databaseProvisioner?: Pick<DatabaseProvisioner, 'teardown'>;
  readonly objectStorage?: Pick<ObjectStorage, 'deleteBucket'>;

  /*
   * TROIS CAPACITÉS QUI EXISTAIENT DÉJÀ, ET QUE PERSONNE N'APPELAIT.
   *
   * C'est la forme exacte d'AUDX-171, une couche plus bas : le démontage était
   * écrit, correct et testé — il n'était simplement jamais invoqué à la
   * suppression d'un projet. Mesuré le 2026-09-07 en démontant à la main ce que
   * le produit aurait laissé : 5 volumes de workspace (500 Gi), 28 déploiements
   * et 30 services d'applications publiées, 428 arbres de fichiers et 208
   * charges d'instantanés (2,1 Go).
   *
   * Les deux premières passent par le workspace-manager, qui POSSÈDE ces
   * ressources. L'API n'a délibérément pas d'accès Kubernetes au namespace
   * `workspaces` : son port est restreint par `dbResourceGuard` au namespace des
   * bases et à cinq types CNPG. Élargir cette garde pour supprimer des volumes
   * serait une régression — la bonne réponse est de demander au propriétaire,
   * pas de s'octroyer sa clé.
   */

  /** `DELETE /workspaces/:id` du manager — Pod, Service, Secret ET le PVC. */
  readonly demonterWorkspace?: (workspaceId: string) => Promise<void>;

  /** `POST /server-deployments/:id/stop` — Ingress, Service, Deployment, Secret. */
  readonly demonterApplicationPubliee?: (deploymentId: string) => Promise<void>;

  /** Arbres de fichiers du projet sur le volume partagé (local à l'API). */
  readonly supprimerFichiersDuProjet?: (projectId: string) => Promise<void>;
  /** Supprime un PVC via le plan de contrôle workspace-manager (l'api n'a pas le RBAC). */
}

/**
 * L'inventaire. Une ressource externe qui n'y figure pas ne sera jamais
 * supprimée — c'est pourquoi il est ici, greppable, et non éparpillé dans la
 * route qui supprime.
 */
export const PROJECT_EXTERNAL_RESOURCES: readonly ProjectExternalResource[] = [
  {
    id: 'database',
    describes: 'CNPG Cluster / Database / ScheduledBackup du projet (dev + prod)',
    async remove(deps, project) {
      if (!deps.databaseProvisioner) {
        return;
      }

      await deps.databaseProvisioner.teardown({ projectId: project.id });
    },
  },
  {
    id: 'object-storage-bucket',
    describes: 'seau GCS vc-<projectId> et son contenu',
    async remove(deps, project) {
      if (!deps.objectStorage) {
        return;
      }

      // deleteBucket purge les objets puis supprime le seau ; absent = no-op.
      await deps.objectStorage.deleteBucket(project.id);
    },
  },
  {
    id: 'workspace-runtime',
    describes: 'Pod, Service, Secret et VOLUME de chaque workspace du projet',
    async remove(deps, project) {
      if (!deps.demonterWorkspace || !project.workspaceIds?.length) {
        return;
      }

      for (const workspaceId of project.workspaceIds) {
        /*
         * La poignée vient de la ligne, mais sa FORME est vérifiée quand même : un
         * identifiant vide ou hors motif ferait viser un objet arbitraire du
         * namespace. On LÈVE plutôt que de tenter — supprimer le mauvais volume est
         * la seule faute pire que d'en laisser un.
         */
        if (!/^ws-[a-z0-9]+$/.test(workspaceId)) {
          throw new Error(`${appPublicEnglish('TEARDOWN_WORKSPACE_ID_INVALID')} (${JSON.stringify(workspaceId)})`);
        }

        await deps.demonterWorkspace(workspaceId);
      }
    },
  },
  {
    id: 'published-app',
    describes: 'Ingress, Service, Deployment et Secret de chaque application publiée',
    async remove(deps, project) {
      if (!deps.demonterApplicationPubliee || !project.deploymentIds?.length) {
        return;
      }

      for (const deploymentId of project.deploymentIds) {
        /*
         * Même garde. Les objets s'appellent `app-<deploymentId>` : un identifiant
         * hors motif viserait un voisin partageant ce préfixe — exactement le risque
         * qu'on refuse de courir.
         */
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(deploymentId)) {
          throw new Error(`${appPublicEnglish('TEARDOWN_DEPLOYMENT_ID_INVALID')} (${JSON.stringify(deploymentId)})`);
        }

        await deps.demonterApplicationPubliee(deploymentId);
      }
    },
  },
  {
    id: 'project-files',
    describes: "arbre des fichiers du projet et ses archives d'instantanés",
    async remove(deps, project) {
      if (!deps.supprimerFichiersDuProjet) {
        return;
      }

      await deps.supprimerFichiersDuProjet(project.id);
    },
  },
] as const;

/**
 * Ressources per-projet AUDITÉES et NON couvertes par ce démontage.
 *
 * Écrites ici plutôt que tues : une ressource oubliée en silence est exactement
 * ce qui a produit les orphelines. Une entrée d'inventaire dont le `remove` ne
 * ferait rien serait pire — elle rapporterait `removed: true` sur une ressource
 * toujours vivante.
 */
export const KNOWN_UNCOVERED_PROJECT_RESOURCES: ReadonlyArray<{ id: string; why: string }> = [
  {
    id: 'cnpg-backups-gcs',
    why:
      'Les sauvegardes barman de `gs://<backupBucket>/db/<projectId>` survivent. ' +
      '`teardown()` supprime les CR (Cluster / Database / ScheduledBackup), pas les octets. ' +
      'La `spec.backup.retentionPolicy` ne les élague QUE tant que le Cluster vit : ' +
      'supprimer le Cluster gèle les sauvegardes pour toujours. ' +
      "Il n'existe aujourd'hui aucun accès en suppression au seau de sauvegarde depuis l'api " +
      '(`ObjectStorage` ne parle que du seau `vc-<projectId>` du projet). ' +
      'À traiter par une règle de cycle de vie sur le seau de sauvegarde, ou un accès dédié.',
  },
] as const;

export interface ResourceOutcome {
  resource: string;
  describes: string;
  removed: boolean;
  /** Message d'erreur quand `removed` est faux — jamais avalé. */
  error?: string;
}

export interface TeardownReport {
  outcomes: ResourceOutcome[];
  /** Ressources qui ont RÉSISTÉ : ce sont les orphelines de demain. */
  failed: string[];
  complete: boolean;
}

/**
 * Démonte toutes les ressources externes d'un projet.
 *
 * ⚠️ Ne jette JAMAIS : la suppression demandée par l'utilisateur doit aboutir même
 * si GCS ou l'API Kubernetes hoquette. Mais chaque échec est CAPTURÉ et RENDU,
 * jamais avalé — c'est toute la différence avec le `.catch(() => {})` d'origine,
 * qui rendait un démontage raté indiscernable d'un démontage réussi. Un appelant
 * qui reçoit `complete: false` sait qu'il reste une orpheline, et laquelle.
 *
 * Chaque ressource est tentée indépendamment : une base qui refuse de partir ne
 * doit pas empêcher le seau d'être supprimé.
 */
export async function teardownProjectExternalResources(
  deps: TeardownDeps,
  project: TeardownTarget,
  resources: readonly ProjectExternalResource[] = PROJECT_EXTERNAL_RESOURCES,
): Promise<TeardownReport> {
  const outcomes: ResourceOutcome[] = [];

  for (const resource of resources) {
    try {
      await resource.remove(deps, project);
      // Marqué supprimé seulement APRÈS que `remove` a résolu.
      outcomes.push({ resource: resource.id, describes: resource.describes, removed: true });
    } catch (error) {
      outcomes.push({
        resource: resource.id,
        describes: resource.describes,
        removed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = outcomes.filter((outcome) => !outcome.removed).map((outcome) => outcome.resource);

  return { outcomes, failed, complete: failed.length === 0 };
}

# D3.3 — Test de perte de zone (2026-07-20, prod live)

Méthode : **cordon** de tous les nodes sandbox de europe-west9-a (perte de
zone au sens scheduling pour tout NOUVEAU pod, sans éviction des utilisateurs
en cours — un drain aurait tué des workspaces vivants pour la même valeur de
preuve). Multi-zone activé en live : rev 871 (`--set nixStorePvcZones` +
`nixGenerationHash`), manager rollout-restarté ; projet de test
`cmrsrzixn000f0nbfltqpabf4` ajouté à l'allowlist (rev 872, api restarté).

## Phase « zone-a perdue » — TOUT PROUVÉ ✅

| Étape | Preuve |
|---|---|
| Workspace Python neuf provisionne en zone-b | pod `workspace-ws-78616a4f6f85bf0a` sur node `…955824db-jnp7`, zone `europe-west9-b` ; nodeSelector `topology.kubernetes.io/zone=europe-west9-b` |
| Monte le CLONE zone-b | volume PVC `nix-store-v2-b-pvc` |
| Garde de génération exécutée en vrai | initContainer `nix-store-guard` exit 0, log : `nix store generation verified (sha256:3029b581…)` |
| python depuis le store | `Python 3.12.13` (`…-ecode-env-python-3.12/bin/python3`) |
| **uv** depuis le store | `uv 0.11.21` (`fva0z0j2…-uv-0.11.21/bin/uv`) ; `uv venv .venv --python <store-python>` → venv fonctionnel (`.venv/bin/python` = 3.12.13) |
| **Preview** | serveur Python sur 5173 → `https://ws-78616a4f6f85bf0a-5173.preview.e-code.ai/` = **HTTP 200** « ZONE-LOSS-PROOF python 3.12.13 from zone-b clone » |
| **Publish** | deploy server `cmrss9eb000040n7bcxjqrzs5` → READY, digest retenu `sha256:6bf078f4…` ; `https://d-cmrss9eb…preview.e-code.ai/` = **HTTP 200** même body ; pod app en zone-b, monte `nix-store-v2-b-pvc`, guard exit 0 |

## Phase « restauration zone-a » — bug RÉEL trouvé par le test, corrigé

Après uncordon, la recréation du pod (delete + reprovision) est restée
**Unschedulable** : le PVC de données RWO du workspace avait été provisionné
en zone-b (WaitForFirstConsumer pendant la panne), mais le chooser préférait
zone-a (égalité de capacité → zone préférée) → pin zone-a + disque data
zone-b = deadlock d'affinités (`didn't match PersistentVolume's node
affinity`), `workspace.start.failed` (échec bruyant, aucun mensonge d'état).

**Fix `59dfdec9` (poussé)** : `resolveNixStorePlacement` reçoit la zone du
disque de données existant (lue sur la nodeAffinity du PV lié) et **épingle**
le clone du store sur cette zone ; un workspace neuf (PVC pas encore lié)
garde le choix par capacité. Spec 7/7 (dont le cas deadlock et le
fallthrough zone-épinglée-sans-clone).

## Jambe « restauration » — RE-PROUVÉE (2026-07-20, manager `390e55ff1c`, release rev 878)

Deux couches du fix se sont révélées nécessaires, chacune découverte par le
test live (les tests unitaires passaient) :
- v1 (lecture nodeAffinity du PV) était INERTE : le SA du manager n'a pas
  `get persistentvolumes` — Forbidden avalé par le catch. v2 lit l'annotation
  `volume.kubernetes.io/selected-node` du PVC (autorisé) → zone du node ; PV
  en repli, grant posé hors chart (`infra/k8s-manual/nix-pv-reader-rbac.yaml`
  — un ClusterRole géré par le chart fait échouer le CD : le SA CI n'a pas
  `container.clusterRoles.update`, prouvé rev 874 failed + rollback atomique).

| Preuve | Résultat |
|---|---|
| 1. Workspace au disque data né en zone-b (pendant la panne), re-provisionné post-restauration | pod **zone-b** (pin annotation), monte `nix-store-v2-b-pvc`, guard exit 0 : `nix store generation verified (sha256:3029b581…)` — le deadlock d'affinités est mort |
| 2. Workspace FRAIS post-restauration (data PVC supprimé, projet jetable) | pod **zone-a** (zone préférée à capacité égale), monte le disque ORIGINAL `nix-store-v2-pvc`, guard : **même hash** `3029b581…` |

**Sans split-brain de génération : PROUVÉ** — chaque montage, dans chaque
zone, avant/pendant/après la panne, a été validé par le guard contre le même
contentHash.

## Split-brain de génération

Impossible par construction ET vérifié : les deux clones sont RO
(mutation impossible en place), issus du même snapshot, et CHAQUE démarrage
de pod re-vérifie sha256(catalog) == `3029b581…` (guard). Pendant tout le
test, aucune divergence : le guard a validé la même génération en zone-b
(phase panne) — la validation zone-a post-restauration est incluse dans la
re-preuve ci-dessus.

## Verdict FINAL — D3.3 VERT ✅ (2026-07-20)

Perte de zone : prouvée bout en bout (provision → uv/python → Preview →
Publish, tout en zone-b, génération vérifiée). Restauration : re-prouvée dans
les deux sens, sans split-brain. Le prérequis technique de Python-par-défaut
est rempli ; **l'activation de l'allowlist `'*'` reste une décision à
prendre explicitement (GO d'Avi), pas un automatisme.**

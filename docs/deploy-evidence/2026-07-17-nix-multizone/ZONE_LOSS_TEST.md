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

La re-preuve de la jambe « restauration » (workspace data-b re-schedule en
zone-b post-restauration + workspace NEUF post-restauration → zone-a, même
génération vérifiée par le guard) suit le déploiement du fix — voir la
section suivante quand elle est remplie.

## Split-brain de génération

Impossible par construction ET vérifié : les deux clones sont RO
(mutation impossible en place), issus du même snapshot, et CHAQUE démarrage
de pod re-vérifie sha256(catalog) == `3029b581…` (guard). Pendant tout le
test, aucune divergence : le guard a validé la même génération en zone-b
(phase panne) — la validation zone-a post-restauration est incluse dans la
re-preuve ci-dessus.

## Verdict provisoire

Perte de zone : **prouvée de bout en bout** (provision → uv/python → Preview
→ Publish, tout en zone-b, génération vérifiée). Restauration : fix déployé,
re-preuve en cours. **Python-par-défaut / allowlist `'*'` : toujours
INTERDIT** tant que la jambe restauration n'est pas re-prouvée verte.

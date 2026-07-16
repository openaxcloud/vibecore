# APP_STORAGE_CONTRACT — Object Storage per-projet (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat du stockage objet applicatif (buckets, secrets, env vars).

## Faits (cf. mémoire object-storage-gcs + azaz-storage-secrets)

- Object Storage RÉEL per-projet : bucket `vc-<projid>` (create/PUT/list live via
  Workload Identity). `OBJECT_STORAGE_ENABLED` = literal configmap.
- **Secrets vs env vars** : `ProjectSecret` (chiffré AES-GCM `valueEncrypted` via
  `@vibecore/security` encryptJson/decryptJson) ≠ `ProjectEnvVar` (plaintext
  `value`). Les secrets synchronisent vers l'app publiée.
- Ajout d'un secret sur pod running = recréation de pod (delete+wait+apply) SEULE-
  ment sur rejet immuable ; reopen inchangé = no-op ; PVC intact (certifié).

## Invariants

- **I-APS-1 (isolation par tenant)** : un projet n'accède qu'à `vc-<SON-projid>`
  (I-IAM-1) ; pas d'accès transverse.
- **I-APS-2 (secret chiffré au repos)** : un `ProjectSecret` n'est jamais stocké
  ni loggé en clair ; la valeur ne transite pas en query string.
- **I-APS-3 (secret jamais dans un clone)** : au remix, la valeur du secret est
  détachée avant le clone (I-RMX-1).
- **I-APS-4 (env apply sûr)** : appliquer un env/secret sur un pod running ne perd
  jamais le PVC ; recréation contrôlée uniquement si champ immuable.

## 🟡

Débit/quotas de stockage par plan = non chiffrés ici (billing séparé).

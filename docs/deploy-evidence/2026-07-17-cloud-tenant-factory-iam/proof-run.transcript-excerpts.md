# Extraits verbatim des journaux de preuve du 2026-07-17 (reconstitués)

⚠️ **Provenance** : les fichiers JSONL originaux (`cloud-governance-proof.jsonl`,
`restore-proof.jsonl`, `folder-ratelimit-results.jsonl`) ont été perdus avec le
worktree purgé avant commit. Les lignes ci-dessous sont des copies VERBATIM
telles qu'affichées dans le transcript de la session du 17/07 (sorties d'outils
horodatées). Chaque fait clé est recoupé par des données primaires
indépendantes : `audit-logs-folder-scope.json` (logs de Google) et
`db-rows.jsonl` (ré-export 21/07 de la base de preuve survivante).

## P1 — mesure du rate limit folders (table complète des 32 requêtes)

```
  rl-burst-1 +   0.0s http=200      rl-burst-11 +  30.0s http=200
  rl-burst-2 +   3.2s http=200      rl-burst-12 +  31.5s http=429
  rl-burst-3 +   5.4s http=200      rl-burst-13 +  33.3s http=429
  rl-burst-4 +   8.1s http=200      rl-burst-14 +  35.0s http=429
  rl-burst-5 +  10.1s http=200      rl-burst-15 +  35.7s http=200
  rl-burst-6 +  13.5s http=200      rl-burst-16 +  37.2s http=429
  rl-burst-7 +  15.7s http=200      rl-burst-17 +  39.0s http=200
  rl-burst-8 +  18.0s http=200      rl-burst-18 +  41.1s http=200
  rl-burst-9 +  22.3s http=200      rl-burst-19 +  43.5s http=429
  rl-burst-10 + 28.5s http=429      rl-burst-20 +  44.8s http=429

  refill (10s d'intervalle): 1:200 2:429 3:200 4:200 5:200 6:200
                             7:429 8:200 9:200 10:200 11:200 12:200

  burst: 13/20 OK sur 46.4s => 0.280 req/s effectif
  refill(10s spacing): 10/12 OK
  TOTAL: 23 créations OK en 236.3s => débit soutenu 0.097 folders/s (5.8/min)
  premier 429 à la requête #10, t=+28.5s ; body: {"error":{"code":429,
  "message":"Quota exceeded for quota metric 'Folder V3 create requests' and
  limit 'Folder V3 create requests per minute' of service
  'cloudresourcemanager.googleapis.co…"}}
```

## Preuves P2→P4 (journal cloud-governance-proof.jsonl)

```json
{"at":"2026-07-17T11:06:36.845Z","step":"start"}
{"at":"2026-07-17T11:06:45.350Z","step":"p2.bound","tenantA":"cmrou1vey00000slnkmtvlvsf","binding":"cmrou21ir00020slndmmqw7cm","projectId":"ecode-proof-b906ss"}
{"at":"2026-07-17T11:06:45.623Z","step":"p2.proven","serviceRefusal":{"code":"TENANT_PROJECT_CONFLICT","message":"Project ecode-proof-b906ss is already bound to another CloudTenant — a GCP project is never shared between two tenants (I-TEN-1)"},"dbRefusal":{"prismaCode":"P2002","message":"Invalid `prisma.cloudProjectBinding.create()` invocation…"}}
{"at":"2026-07-17T11:10:43.368Z","step":"factory.advanced","state":"BILLING_LINKED","gcpProjectNumber":"859076086179"}
{"at":"2026-07-17T11:12:14.285Z","step":"factory.advanced","state":"APIS_ENABLING","gcpProjectNumber":"859076086179"}
{"at":"2026-07-17T11:13:01.769Z","step":"factory.advanced","state":"SERVICE_AGENTS_READY","gcpProjectNumber":"859076086179"}
{"at":"2026-07-17T11:17:10.638Z","step":"factory.advanced","state":"ACTIVE","gcpProjectNumber":"859076086179"}
{"at":"2026-07-17T11:17:46.019Z","step":"factory.active","liveProject":{"projectId":"ecode-proof-b906ss","state":"ACTIVE","projectNumber":"859076086179","parent":"folders/780512954993","displayName":"ecode-proof-b906ss"}}
{"at":"2026-07-17T11:19:50.694Z","step":"p5.proven","identity":"rt-demo-app-7b60706b99f4@ecode-proof-b906ss.iam.gserviceaccount.com","revision1Created":true,"revision2Created":false,"revisionsServed":2,"serviceAccountsBefore":["proof-owner-old-b906ss@…","proof-owner-new-b906ss@…"],"serviceAccountsAfter":["rt-demo-app-7b60706b99f4@…","proof-owner-old-b906ss@…","…"]}
{"at":"2026-07-17T11:23:03.021Z","step":"p3.before","oldPrincipal":"serviceAccount:proof-owner-old-b906ss@ecode-proof-b906ss.iam.gserviceaccount.com","heldPermissions":["resourcemanager.projects.get","storage.buckets.list"]}
{"at":"2026-07-17T11:26:20.980Z","step":"p3.transferred","transferId":"cmroun1t6000c0slnq55juiho","state":"COMPLETED","revokeEvidence":[{"gcpProjectId":"ecode-proof-b906ss","removedRoles":["roles/storage.admin","roles/viewer"]}],"regrantEvidence":[{"gcpProjectId":"ecode-proof-b906ss","grantedRoles":["roles/viewer"]}],"ownerAfter":"serviceAccount:proof-owner-new-b906ss@ecode-proof-b906ss.iam.gservi…"}
{"at":"2026-07-17T11:26:51.432Z","step":"p3.proven","afterPermissions":[],"revocationLatencySeconds":215,"oldPrincipalInPolicyAfter":false,"newOwnerGrantedRoles":["roles/viewer"]}
{"at":"2026-07-17T11:29:12.691Z","step":"p4.inventory","teardownId":"cmrouus9o000d0slnd7b258uy","inventory":[{"kind":"bucket","name":"ecode-proof-data-b906ss"},{"kind":"serviceAccount","name":"rt-demo-app-7b60706b99f4@…"},{"kind":"serviceAccount","name":"proof-owner-old-b906ss@…"},{"kind":"serviceAccount","name":"proof-owner-new-b906ss@…"},{"kind":"enabledService","name":"cl…"}]}
{"at":"2026-07-17T11:30:17.474Z","step":"p4.orphans_detected","status":"ORPHANS_DETECTED","orphans":[{"kind":"bucket","name":"ecode-proof-data-b906ss"},{"kind":"serviceAccount","name":"rt-demo-app-7b60706b99f4@…"},{"kind":"serviceAccount","name":"proof-owner-old-b906ss@…"},{"kind":"serviceAccount","name":"proof-owner-new-b906ss@…"}],"projectState":"ACTIVE"}
{"at":"2026-07-17T11:32:23.300Z","step":"p4.executed","state":"RECOVERY_WINDOW","recoveryWindowEndsAt":"2026-08-16T11:32:06.332Z"}
{"at":"2026-07-17T11:32:52.992Z","step":"p4.proven","status":"COMPLETE","erasureProof":{"checkedAt":"2026-07-17T11:32:51.731Z","orphanCount":0,"gcpProjectId":"ecode-proof-b906ss","projectState":"DELETE_REQUESTED","projectErased":true,"inventoryCount":9},"projectState":"DELETE_REQUESTED"}
{"at":"2026-07-17T11:32:53.040Z","step":"done","summary":{"p2_sharedProjectRefused":true,"factory_activeReached":true,"p5_runtimeIdentityReused":true,"p3_oldOwnerDeniedAfterTransfer":true,"p3_revocationLatencySeconds":215,"p4_orphanDetectedThenErasureProven":true,"gcpProjectId":"ecode-proof-b906ss"}}
```

## GCP-07 — restauration (journal restore-proof.jsonl)

```json
{"at":"2026-07-17T12:12:59.673Z","step":"restore.before","bindingState":"RECOVERY_WINDOW","recoveryWindowEndsAt":"2026-08-16T11:32:06.332Z","gcpState":"DELETE_REQUESTED"}
{"at":"2026-07-17T12:13:51.157Z","step":"restore.proven","bindingState":"ACTIVE","gcpState":"ACTIVE","recoveryWindowEndsAt":"2026-08-16T11:32:06.332Z","lastTransitions":["DELETE_REQUESTED→RECOVERY_WINDOW","RECOVERY_WINDOW→RESTORING","RESTORING→ACTIVE"]}
```

## Recoupement avec les données primaires (indépendantes du transcript)

| Fait (transcript) | Donnée primaire qui le confirme |
|---|---|
| DeleteProject à 11:32 | Audit log Google `2026-07-17T11:32:05.096Z DeleteProject` (`audit-logs-folder-scope.json`) |
| CreateProject à 11:07 | Audit log Google `11:07:15.436Z / 11:07:17.742Z CreateProject` |
| Restauration 12:12→12:13 | Audit log Google `12:13:17.066Z UndeleteProject` |
| Tentatives ID-reuse (409) | Audit logs Google `12:11:29Z` et `12:19:39Z CreateProject` sous le folder (refusées) |
| transfert COMPLETED + évidences | Ligne DB réelle `CloudTenantTransfer cmroun1t6…` (`db-rows.jsonl`) |
| teardown COMPLETE + inventaire 9 items | Ligne DB réelle `CloudTeardownRecord cmrouus9o…` |
| revisionsServed=2, 1 seule SA rt-* | Ligne DB réelle `PlatformIamIdentity` + IAM du projet restauré |
| 11 transitions de factory | 11 lignes DB réelles `CloudProjectFactoryEvent` |

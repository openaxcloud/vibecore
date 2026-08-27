# AUTH_ACCESS_CONTRACT — authentification & accès aux déploiements (audit v4 I)

schemaVersion: 2
repoBase: 70afddf7e034658cacb498bb4876619d567881f4
implementationRef: commit containing this schema version

Contrat d'accès d'une app publiée. Ancré sur `RPL-23` (source hashée
`SRC-LLMS-FULL-TXT`, l. 8501/8545/8560/14927). L'accès est porté par une
**politique versionnée** (`accessPolicyVersion`) référencée dans la
`ReleaseManifest` (cf. DOMAIN_MODEL §5) — changer le mode d'accès = **nouvelle
version de politique**, jamais une mutation silencieuse.

## Modes d'accès (parité RPL-23)

| mode                 | qui peut ouvrir l'app                | privé ?                           | sign-in Replit forcé |
| -------------------- | ------------------------------------ | --------------------------------- | -------------------- |
| `PUBLIC`             | tout le monde                        | non                               | non                  |
| `PASSWORD_PROTECTED` | quiconque a le mot de passe          | oui                               | non (mot de passe)   |
| `WORKSPACE_ONLY`     | membres du workspace                 | oui (Private)                     | oui                  |
| `INVITE_ONLY`        | owner, admins, users/groupes invités | oui (Private, le plus restrictif) | oui                  |

- Fait vérifié : avec les deux options **Private**, un visiteur sans accès est
  invité à **se connecter via Replit** avant de voir l'app. Dans un workspace
  personnel solo, `WORKSPACE_ONLY` et `INVITE_ONLY` se comportent pareil ; la
  distinction compte en workspace partagé.
- Gouvernance admin (RPL-23, l. 14927) : exiger des déploiements privés, bannir
  les apps publiques, imposer des scans de sécurité, épingler des géographies.

## Invariants

- **I-AUTH-1 (politique versionnée)** : tout changement de mode d'accès crée une
  nouvelle `accessPolicyVersion` ; la `ReleaseManifest` épingle la version en
  vigueur. Un rollback d'image re-déploie la release AVEC sa politique d'accès
  d'origine — jamais un downgrade d'accès implicite.
- **I-AUTH-2 (fail-closed)** : un mode d'accès inconnu/absent = traité comme le
  plus restrictif (`INVITE_ONLY`), jamais `PUBLIC` par défaut. Un doute sur
  l'accès ne rend jamais l'app publique.
- **I-AUTH-3 (sign-in avant contenu)** : sur les modes Private, la vérification
  d'identité précède TOUT rendu de contenu applicatif (pas de flash de contenu
  protégé avant redirection login).
- **I-AUTH-4 (séparation owner/editor)** : cf. RPL-22 — un editor répond aux
  questions ROUTINE de l'Agent ; les étapes sensibles (intégration, secret,
  changement d'accès) restent réservées à l'owner/admin.

## Architecture E-Code livrée

- `DeploymentAccessPolicy` est append-only, monotone par
  `(projectId, environment)` ; `Deployment.accessPolicyVersion` et
  `ReleaseManifest.accessPolicyVersion` pointent la version exacte.
- Les deux origines dédiées `s-<deploymentId>` et `d-<deploymentId>` interrogent
  la même autorité avant tout fetch d'artefact/workload. API indisponible,
  verdict mal formé, politique absente/corrompue ou release non-READY donnent une
  page verrouillée `503` avec `no-store` : aucun octet applicatif n'est lu.
- `PASSWORD_PROTECTED` utilise un cookie HttpOnly host-only dédié par
  déploiement, HMAC signé et lié à `(deploymentId, policyVersion, revision)`.
  Le mot de passe n'est persisté que sous forme de hash ; une rotation de
  politique invalide immédiatement les anciens cookies.
- Les modes privés transfèrent l'identité avec un ticket opaque de 90 secondes,
  stocké uniquement sous forme hashée et consommé atomiquement une fois. Le
  ticket passe dans un body POST avec `Referrer-Policy: no-referrer`, jamais dans
  URL, bearer, redirect ou clé de cache. Le cookie utilisateur dure 15 minutes
  et l'edge revalide membership/grant à chaque requête.
- `WORKSPACE_ONLY` exige un `OrganizationMember.state=ACTIVE`.
  `INVITE_ONLY` accepte owner/admin actif, `ProjectCollaborator` non expiré ou
  `ResourceAccessGrant` actif (USER/GROUP, PROJECT/DEPLOYMENT), tenant-fencé.
- Le proxy ne transmet à l'API que le cookie de preuve attendu. Il retire ce
  cookie avant le workload serveur, conserve les cookies applicatifs, et retire
  tous les cookies sur le chemin statique.

## Rollout mixte obligatoire

1. Générer/provisionner `DEPLOYMENT_ACCESS_TOKEN_SECRET` (valeur dédiée, au moins
   32 octets aléatoires) et garder `DEPLOYMENT_ACCESS_ACTIVATION_ENABLED=false`.
2. Déployer la migration `0096`, l'API et **tous** les preview-proxy avec
   `DEPLOYMENT_ACCESS_ENFORCEMENT=true`. Vérifier que les replicas anciens sont à
   zéro et que `s-*`/`d-*` servent encore les politiques `PUBLIC` backfillées.
3. Exécuter les probes PUBLIC/PASSWORD/WORKSPACE/INVITE, statique+serveur, puis
   basculer avec `--set-string platformEnv.deploymentAccessActivationEnabled=true`
   (`DEPLOYMENT_ACCESS_ACTIVATION_ENABLED=true` sur l'API). Avant cette
   bascule, toute tentative de créer un mode protégé répond `503`, donc un vieux
   proxy ne peut jamais contourner une nouvelle politique privée.
4. Pour rotation de clé, mettre les anciennes valeurs séparées par virgules dans
   `DEPLOYMENT_ACCESS_TOKEN_PREVIOUS_SECRETS`, déployer, remplacer la primaire,
   puis retirer les anciennes après le TTL maximal (12 h).

## État de preuve

🟠 **CODÉ / validation locale requise, non prouvé live** : le vertical complet
est intégré et couvert par tests ciblés, mais aucun mode n'est déclaré
`CONFIRMED` avant la preuve stage `publish`/`observe` réelle sur web, tablette et
mobile, pour `s-*` et `d-*`. `UNK-AUTH-ACCESS-LIVE` reste donc ouvert jusqu'à ce
test live.

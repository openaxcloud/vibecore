# AUTH_ACCESS_CONTRACT — authentification & accès aux déploiements (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat d'accès d'une app publiée. Ancré sur `RPL-23` (source hashée
`SRC-LLMS-FULL-TXT`, l. 8501/8545/8560/14927). L'accès est porté par une
**politique versionnée** (`accessPolicyVersion`) référencée dans la
`ReleaseManifest` (cf. DOMAIN_MODEL §5) — changer le mode d'accès = **nouvelle
version de politique**, jamais une mutation silencieuse.

## Modes d'accès (parité RPL-23)

| mode | qui peut ouvrir l'app | privé ? | sign-in Replit forcé |
|---|---|---|---|
| `PUBLIC` | tout le monde | non | non |
| `PASSWORD_PROTECTED` | quiconque a le mot de passe | oui | non (mot de passe) |
| `WORKSPACE_ONLY` | membres du workspace | oui (Private) | oui |
| `INVITE_ONLY` | owner, admins, users/groupes invités | oui (Private, le plus restrictif) | oui |

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

## État d'implémentation E-Code

🟡 **UNKNOWN / non prouvé live** : le mécanisme d'accès des déploiements E-Code
(les 4 modes, le sign-in forcé, la gouvernance admin) n'est **pas** prouvé en
réel — voir `UNK-AUTH-ACCESS-LIVE`. Ce fichier fixe le contrat cible + les
invariants ; l'implémentation et la preuve live sont un follow-up. Aucun de ces
modes n'est marqué CONFIRMED côté E-Code tant qu'il n'y a pas de preuve e2e
(stage `publish`/`observe` du vertical d'approbation).

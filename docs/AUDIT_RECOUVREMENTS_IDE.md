# Recensement des recouvrements — un écran, combien d'implémentations ?

**Date** : 2026-09-02 · **Commit mesuré** : `c3d0d18d9` (`origin/main`, arbre propre)
**Origine** : point d'Avi sur le doublon « Domaines », puis sa demande de pousser
le recensement jusqu'au bout.

Trois axes comparés systématiquement :

1. la **grille des outils** (`PROJECT_EDITOR_TOOLS`, 29 outils) ;
2. les **onglets internes** de chaque panneau (`PanelToolTabs` + jeux ad hoc) ;
3. les **routes de la zone utilisateur** (`app/routes/projects.$projectId.*`).

---

## Ce que le recensement a changé dans le diagnostic

L'hypothèse de départ était du rangement : « le même écran est offert deux fois ».
Elle est fausse dans les deux sens, et c'est le résultat le plus utile :

- **Domaines** (BUG-IDE-014) : ce n'étaient PAS deux implémentations, mais un même
  composant monté deux fois. Coût réel : nul. Corrigé, PR #379.
- **Terminal → Environment / Connections** (R-2, R-3) : c'étaient bien deux
  implémentations, et elles **divergeaient** — dont une perte de données
  silencieuse. Coût réel : élevé. Corrigé, PR #384.
- **Domaines, en profondeur** (R-1) : quatre écrans décrivent une fonctionnalité
  que la plateforme **ne rend pas**, pendant qu'ils pilotent une fonctionnalité
  **de sécurité** qu'ils ne nomment jamais. Coût réel : à trancher par Avi.

La duplication n'est donc pas le défaut : elle est le **symptôme** qui permet de
le trouver. Deux implémentations d'un écran finissent toujours par diverger, et
c'est la divergence qui produit les bugs.

---

## R-1 — « Domaines personnalisés » : cinq surfaces, et aucune ne fait ce qu'elle annonce

### La mesure

`VerifiedDomain` (table `packages/database/prisma/schema.prisma:1364`) a
**exactement deux consommateurs** dans tout le dépôt :

| Consommateur | Fichier | Ce qu'il fait |
|---|---|---|
| SAML ACS | `services/api/src/app.ts:10737` | refuse une assertion dont le domaine d'e-mail n'est pas vérifié (403 `SAML_EMAIL_DOMAIN_NOT_VERIFIED`) |
| SCIM | `services/api/src/app.ts:37331` | refuse d'enrôler un utilisateur dont le domaine n'est pas vérifié (403 `SCIM_EMAIL_DOMAIN_NOT_VERIFIED`) |

**Aucun consommateur d'hébergement.** Vérifié dans les deux sens :

- les hôtes d'ingress viennent de valeurs Helm statiques
  (`infra/helm/platform/templates/ingress.yaml` : `appDomain`, `previewDomain`,
  listes figées) — jamais de `VerifiedDomain` ;
- rien dans `services/workspace-manager`, `services/preview-proxy` ni `infra/`
  ne lit un domaine vérifié ;
- `Deployment.customDomain` (`schema.prisma:812`) est une **chaîne libre saisie
  dans l'assistant Publier**, seulement validée, stockée, recopiée au clone et
  au rollback, puis réaffichée. Aucun lecteur opérationnel. Elle n'est reliée à
  `VerifiedDomain` par aucune jointure.

### Les cinq surfaces

| # | Surface | Cadrage | Exact ? |
|---|---|---|---|
| 1 | `/organization-domains`, atteinte depuis **Réglages de sécurité** (aux côtés de SSO, SCIM, rôles, journaux d'audit, SIEM) | sécurité d'entreprise | ✅ **oui** |
| 2 | `ProjectDomainsPanel` (IDE) — « Production routing, DNS verification and managed TLS », « Use this host as the CNAME or ALIAS target » | hébergement | ❌ |
| 3 | `projects.$projectId.domains.tsx` — « Map project deployments to verified domains with TLS readiness » | hébergement | ❌ |
| 4 | `DeployDomainsView` — « point your domain's DNS (CNAME) at the deployment ; managed TLS coming soon » | hébergement | ❌ |
| 5 | Champ « Domaine personnalisé » de l'assistant Publier | hébergement | ❌ (écrit une chaîne inerte) |

### Les deux conséquences, et la seconde est la sérieuse

1. **Rien n'est hébergé.** Qui suit les instructions n'obtient ni routage ni TLS.
2. **Autre chose se produit à la place.** Vérifier un domaine pour « héberger son
   app » **autorise silencieusement les assertions SAML et l'enrôlement SCIM**
   pour toute identité de ce domaine dans l'organisation. Aucun des quatre écrans
   d'hébergement ne le dit.

### Pourquoi je n'ai pas tranché

L'arbitrage « laquelle des implémentations survit » **dépend d'une décision
produit** que je ne peux pas prendre : l'hébergement sur domaine personnalisé
est-il censé exister ?

- **s'il doit exister** → il manque tout le back-end (routage, émission TLS,
  jointure déploiement↔domaine) ; supprimer des écrans serait supprimer la seule
  trace de la fonctionnalité attendue ;
- **s'il ne doit pas exister** → les quatre écrans d'hébergement doivent
  disparaître au profit du seul cadrage exact (n° 1), et le champ de l'assistant
  Publier avec eux.

Les deux chemins sont de gros changements de produit dans des directions
opposées. **C'est le blocage, et il est chiffré** : 5 surfaces, 2 consommateurs
réels, 0 consommateur d'hébergement.

### Ce que j'ai livré malgré le blocage

- Le commentaire de `organization-domains.tsx` affirmait que la page par projet
  était « distincte » : **c'était faux**, elle appelle les mêmes endpoints.
  Corrigé, avec la mesure ci-dessus consignée sur place.
- Le contrôle SAML n'avait **aucun test discriminant** : le test SAML existant
  vérifie `example.com` avant d'asserter, donc il reste vert si l'on retire le
  contrôle. Ajouté dans `services/api/src/tests/api.spec.ts` — assertion signée
  valide, domaine non vérifié → 403, **plus la contre-épreuve inverse** (le même
  flux réussit une fois le domaine vérifié, sinon une route qui refuse tout
  passerait le test). Contre-épreuve exécutée : contrôle retiré → rouge.

⚠️ `projects.$projectId.domains.tsx` n'est PAS touché : la session « Livraisons »
y corrige le défaut d'écriture (dériver l'organisation du projet). Non refait ici.

---

## Recouvrements traités

| # | Recouvrement | Verdict | État |
|---|---|---|---|
| **BUG-IDE-014** | Carte « Domaines » de la grille ↔ onglet Deploy → Domaines | même composant, deux portes | ✅ corrigé — PR #379 |
| **R-2** | Terminal → « Environment » ↔ outils `Env vars` + `Secrets` | **deux implémentations divergentes** : le Terminal n'envoyait pas de `scope`, le magasin retombe sur `production` ; supprimer une variable `preview` supprimait celle de production | ✅ corrigé — PR #384 |
| **R-3** | Terminal → « Connections » ↔ outil `Ports` | même helper, second rendu appauvri (ni port primaire ni public/privé) | ✅ corrigé — PR #384 |
| **R-4** | Cartes `Env vars` et `Secrets` | même clé de description → indiscernables dans la grille | ✅ corrigé — PR #384 |

## Recouvrements ouverts

| # | Recouvrement | Gravité | Pourquoi non corrigé |
|---|---|---|---|
| **R-1** | 5 surfaces « domaines », 0 consommateur d'hébergement | **à trancher** | décision produit — voir ci-dessus |
| **R-8** | **Troisième écrivain de variables d'env sans `scope`** : le panneau `database` (`ide-panel.$panel.ts:1979` `delete-env`, et un `PUT` de repli sur `DATABASE_URL`). Même classe que R-2 | moyenne | hors périmètre R-2 ; toucher au câblage `DATABASE_URL` sans mesurer le flux de provisioning serait exactement l'erreur que la règle 1 interdit |
| **R-9** | **Zone utilisateur ↔ panneaux IDE** : 12 routes `projects.$projectId.*` ont un panneau IDE homonyme, avec des composants entièrement séparés sur les **mêmes** endpoints — `collaborators`, `deployments`, `env`, `secrets`, `snapshots`, `logs`, `database`, `activity`, `git`, `settings`, `preview`, `domains` | **haute** | c'est le plus gros gisement du dépôt et le même axe que R-2 : chaque paire est une divergence en puissance. À traiter paire par paire, en commençant par celles qui **écrivent** (`env`, `secrets`, `collaborators`, `deployments`) |

## Non-défauts établis (à ne pas fusionner)

| # | Ressemblance | Pourquoi ce n'est pas un doublon |
|---|---|---|
| R-5 | Deploy → « Overview » / « Logs » ↔ outils `Overview` / `Logs` | recouvrement de **nom** seulement : état du déploiement vs résumé projet ; journaux de build vs flux runtime |
| R-6 | Object Storage → « Settings » ↔ outil `Settings` | réglages du bucket vs réglages du projet |
| R-7 | Integrations → « API keys » ↔ outil `Secrets` | magasins distincts — `state.apiKeys` du panneau, pas `/projects/:id/secrets` |

**Déjà alias, pour mémoire** : `checkpoints` → `snapshots`, `kv-store` →
`database`, `storage` → `object-storage` ne produisent aucune carte de grille.
C'est le précédent sur lequel s'appuie le correctif de BUG-IDE-014.

---

## Ordre recommandé pour la suite

1. **R-1** — décision d'Avi (hébergement : oui ou non). Rien d'autre ne peut avancer dessus.
2. **R-9**, paires écrivantes d'abord (`env`, `secrets`, `collaborators`, `deployments`) : c'est là que se cachent les prochaines divergences du type R-2.
3. **R-8** — après avoir mesuré le flux de provisioning `DATABASE_URL`.

⚠️ **Aucun point de ce document n'est ✅ « Testé live »** : les correctifs sont
en PR, non mergés, non déployés. La preuve prod datée revient à la session
« Livraisons + preuves prod ».

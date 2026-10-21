# Recette serveur des panneaux — 21 octobre 2026

Base : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f` (#745), vérifiée par fetch Git et lecture GitHub. Branche distincte, aucune fusion ni opération de production. Le reçu JSON adjacent contient les empreintes des deux sources effectivement testées.

## Frontière réelle

`fetch` HTTP sur socket localhost → Fastify → authentification par sessions persistées → Prisma → PostgreSQL 16 avec pgvector. Deux utilisateurs, deux organisations et un projet synthétiques sont créés par le store réel. Les sessions sont semées en base, sans simuler le middleware ; le parcours connexion/mot de passe n'est pas testé. Aucun fournisseur injecté, aucun TestApiStore et aucun mock dans la recette. Les tests de contrat préexistants sont comptés séparément.

Chaque reconnexion ferme le serveur et le client Prisma puis instancie un autre serveur et un autre client. Cela prouve la persistance hors instance applicative ; ce n'est ni un redémarrage physique de PostgreSQL ni une reconnexion navigateur. Les six tests forment un parcours ordonné ; exécuter le fichier entier, sans sélection d'un seul cas.

| Action | Attendu et observé après correction |
|---|---|
| Paramètres : nom/description avec slug `!!!`, deux tentatives | Deux 400 `PROJECT_SLUG_INVALID`, puis projet strictement identique après reconnexion, timestamps compris. Avant correction : les valeurs refusées étaient persistées ; 1 échec/5 succès. |
| Paramètres : éditer et répéter | Deux 200 ; nom et description exacts après reconnexion. Autre organisation : lecture et écriture 404. Nom vide : 400 sans écraser le résultat. |
| Variables : créer puis modifier deux fois la même clé en dev/prod | Identifiant stable, exactement deux lignes aux valeurs attendues après reconnexion. Lecture/écriture/suppression étrangère : 404 ; scope invalide : 400 ; données intactes. |
| Variables : supprimer dev puis répéter après reconnexion | 200 puis 404 `PROJECT_ENV_NOT_FOUND` ; seule la ligne production reste avec sa valeur exacte. |
| Préférences : langue, timezone, fusion partielle et répétition | `fr`, timezone remise à null, thème conservé et taille ajoutée après reconnexion. Langue invalide : 400. Préférences de l'autre compte inchangées. |
| Activité : filtrer, relire, isoler | Six upserts et une suppression, acteur et clé exacts, aucune valeur de variable dans les métadonnées ; réponse identique à la répétition. Organisation étrangère 404, limite invalide 400. |

## Rejouer

Utiliser une base locale jetable **nommée `panel_proof`**. Le test refuse un autre nom ou hôte. Ne jamais pointer vers des données réelles. Un exemple de banc isolé est un conteneur `pgvector/pgvector:pg16`, port `127.0.0.1:55438`, avec authentification trust uniquement dans ce conteneur de test. Appliquer les migrations du dépôt, sans reset.

Depuis `packages/database` :

```sh
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/panel_proof node_modules/.bin/prisma migrate deploy
```

Depuis `services/api` :

```sh
PANEL_POSTGRES_PROOF=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55438/panel_proof \
  ../../node_modules/.bin/vitest run src/panel-persistence.integration.spec.ts \
  src/tests/env-var-scope-routes.spec.ts src/tests/project-slug-rename-redirect.spec.ts
../../node_modules/.bin/tsc --noEmit -p tsconfig.json
```

L'activation explicite fait échouer une base inaccessible, sans saut silencieux. Sans activation, le fichier est ignoré : ce saut n'est pas une validation. Le nettoyage supprime uniquement les IDs synthétiques créés par le parcours ; aucun reset, aucune suppression de rôles partagés. Les binaires déjà installés ont été utilisés : le wrapper pnpm disponible tentait une installation hors workspace et a échoué, sans changement de dépendances.

## Limites et intégration

Ces preuves couvrent des actions serveur ciblées des surfaces env/settings/activity et les paramètres de projet. Elles ne certifient aucun panneau complet : pas de clic UI/BFF, responsive, cloud, déploiement, connexion utilisateur, fournisseur, stockage objet, exécution de tâches ni ressources runtime. Les erreurs composées liées à une collision de slug et la concurrence entre éditions de préférences restent hors de cette recette.

L'orchestrateur de restauration #745, Monaco/layout/BaseChat, Intégrations/Security/commandes et l'UX sont exclus. Seule dépendance de coordination : `app.ts` est partagé par plusieurs lots ; intégrer par hunks puis relancer les recettes combinées. Aucun changement de politique d'autorisation.

Le commit historique `8edd7e4d` n'est ni un objet local ni un commit résolu par le connecteur GitHub (422). Aucun des cinq checkouts historiques n'était présent dans ce workspace ; ils n'ont pas été modifiés. Les 22 PR ouvertes ont été inventoriées avant édition ; aucune n'avait ce correctif ciblé dans son objet déclaré.

Lint : le nouveau test doit passer sans exemption. `app.ts` conserve les 366 erreurs et 13 avertissements présents sur la base ; comparaison des messages/règles, sans nouveau diagnostic. Ce lint global rouge empêche de déclarer le lot entièrement validé selon AGENTS.md ; livraison en PR brouillon uniquement.

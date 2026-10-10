# Audit de préparation au lancement — 2026-09-22

> Mesuré, pas supposé. Chaque ligne porte la commande ou la requête qui l'établit.
> Page lisible : https://claude.ai/artifact/RNvPrgNJMQSynBbWkPRTJG
>
> **Environnement de la mesure** (règle 11) : SHA servi en production `45038413a2`,
> `main` à `af6423d6ac`, cluster `vibecore-prod-app` (europe-west9, projet
> `vibecore-495216`), namespace `vibecore`. Arbre de travail propre, worktree
> `.worktrees/wt-cls2`.

Ce document remplace `docs/PRODUCTION_READINESS.md` (daté du 2026-05-26) comme
état des lieux courant. Il ne le supprime pas : l'ancien garde la trace des
34 domaines revus à l'époque.

## Verdict

**Non lançable en l'état.** Trois blocages ne demandent aucune décision, seulement
du travail : la clé Stripe de production est expirée, aucune publication
d'application n'a jamais réussi, et la page de statut publique affirme des
disponibilités qu'elle n'a jamais mesurées.

## Bloquant pour lancer

| # | Point | Mesure |
|---|---|---|
| 1 | Clé Stripe de production **expirée** | `GET api.stripe.com/v1/prices` → `HTTP 401 "Expired API Key provided"`. Mode `live`. `STRIPE_PUBLISHABLE_KEY` et les 4 `STRIPE_PRICE_*` absents. `LedgerEntry` = 0 ligne. |
| 2 | **0 publication réussie**, 4 échecs | `Deployment` : 4 lignes, `FAILED` ×4, dernière le 2026-09-09. Les 4 journaux portent `[prepare] cp: can't preserve ownership of '.vibecore-deploy-<id>/lost+found'` puis `build failed`. Le dernier ajoute `Cannot find name 'process'` dans le `vite.config.ts` de l'app **générée**. |
| 3 | Page de statut **écrite en dur** | `app/lib/marketing/ecode-public-runtime.server.ts:130` — table figée `status:'operational', uptime:99.99`. `incidents` et `maintenance` rendent `[]` inconditionnellement. `lastChecked: new Date()` donne l'apparence du direct. Annonce 99,99 % pour le déploiement qui n'a jamais réussi. |
| 4 | Repli IA sur **un seul** fournisseur | anthropic `400 credit balance is too low` · moonshot `429 account suspended` · openai `200` (`gpt-4.1`, 1er repli) · google et openrouter **sans clé**, donc le 2e repli déclaré n'existe pas. La génération marche (sonde d'un jeton dans `stream-text.ts:523` puis `resolveRuntimeProvider`), mais sans second filet. |
| 5 | Restauration **jamais** essayée | `gcloud sql operations list` : 57 × `BACKUP_VOLUME`, 3 × `MAINTENANCE`, **0** `RESTORE`, **0** `CLONE`. Sauvegardes et PITR actifs, 5 nuits vérifiées `SUCCESSFUL`. `docs/BACKUP_RESTORE.md` exige un exercice mensuel. |
| 6 | Parcours d'un inconnu **non prouvé** | Surfaces mesurées : `/` `register` `pricing` → 200, largeur du document = 390 px exactement, 0 erreur console. `POST /auth/register` valide sa charge. **Non mesuré** : créer un compte (interdit), obtenir une app qui tourne. `POST /api/chat` sur 24 h = **0**. |

## À corriger dans le mois

| # | Point | Mesure |
|---|---|---|
| 7 | Personne n'est réveillé la nuit | 3 règles d'alerte actives (5xx fast-burn, uptime, error budget), 2 contrôles de disponibilité, **1 seul canal actif** : un e-mail à Avi. Aucun canal sonnant, aucune astreinte. |
| 8 | Quota `fail-open` | `app/lib/.server/ai-usage.ts:181` — « The surrounding try/catch already fails open on error ». Avec `LedgerEntry` = 0, rien ne plafonne la dépense IA si le service de quota hoquette. |
| 9 | Scan de sécurité muet depuis 12 jours | Dernier run `Security Analysis` **terminé** sur `main` : 2026-09-10 19:30 (`91d6fac2fc`). Depuis : `queued` / `cancelled`. Donc **aucune mesure à jour** sur les secrets en clair. |
| 10 | Deux pages légales manquantes | `/terms` `/privacy` `/legal` `/dpa` `/security` `/robots.txt` `/sitemap.xml` → 200. `/cookies` et `/mentions-legales` → **404**. Export RGPD (`/account/data-export`) et suppression (`DELETE MY ACCOUNT`) présents en code, non exercés en réel. |
| 11 | Nouveau panneau agent non servi | `FeuilleDesModes.tsx` sur `main` depuis #566, importé par **rien** ; #573 le monte. Aucun drapeau : `ChatBox.tsx:585` passe `variant="compact"` en dur. |
| 12 | 144 défauts déclarés non vérifiés | Critère : la case `☐` dans la section « ✅ Testé live » de chaque fiche. P0 13/20 · P1 53/73 · P2 61/91 · P3 17/25. ⚠️ Le registre **sur-déclare** : sur deux P0 recoupés avec le réel, un est périmé, l'autre confirmé. |
| 13 | 8 propositions en conflit | Fusionnées ce jour : #385 #351 #422 #558 #552 #557 #386. En conflit : #352 #424 #337 #559 #125 #52 #362 #423. #337 = 3224 lignes dont 5 fichiers encore absents de `main` ; #423 remplacée par #558 sauf 2 specs. |

## Peut attendre

| # | Point | Mesure |
|---|---|---|
| 14 | Tenue en charge : **inconnue** | 5 scripts k6 dans `tests/load/`, **aucun rapport d'exécution**. `docs/PRODUCTION_READINESS.md` : « 1,000 users — Not approved ». État réel : 300 comptes, 28 projets, 1 espace de travail actif. |
| 15 | Réception d'e-mail en échec | Resend `GET /domains` → 200 · `e-code.ai` `partially_failed`, `sending: enabled`, DKIM **verified**, SPF **verified**, `Receiving` **failed**. L'envoi transactionnel part ; une réponse d'utilisateur tombe dans le vide. |
| 16 | Ce qui tient déjà | `/auth/login` : 10 requêtes puis `429` avec `x-ratelimit-limit: 10` et `retry-after`. `/admin*` → 302, `/api/configured-providers` → 401, `/api/admin/users` → 404. 390 px propre sur les 3 pages d'entrée. 8 services sur le même SHA, zéro-downtime actif. |

## Non mesuré, et pourquoi

* **Parcours de bout en bout d'un inconnu** — créer un compte m'est interdit, et je ne
  me sers pas de l'espace de travail d'Avi comme cobaye. Il faut un humain, une fois.
* **Un paiement réel** — entrer un moyen de paiement m'est interdit. Une clé expirée
  suffit néanmoins à conclure.
* **Les messages vus par l'utilisateur quand ça casse** — traduits et épinglés par
  `app/components/chat/quota-rejet-visible.spec.ts` (5 tests verts), mais jamais vus à
  l'écran en production.
* **Secrets en clair dans le dépôt** — pas de verdict de CI depuis le 2026-09-10 ; je ne
  lance pas un scanner d'une autre version pour conclure sur des écarts qui ne seraient
  pas ceux de la CI (voir la note sur l'écart de version de gitleaks).
* **Tenue en charge** — jamais exécutée.

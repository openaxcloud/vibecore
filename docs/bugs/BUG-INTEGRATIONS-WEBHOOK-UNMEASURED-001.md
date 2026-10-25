---
id: BUG-INTEGRATIONS-WEBHOOK-UNMEASURED-001
section: "Intégrations — contrat fonctionnel"
---

## Bug

Défaut source distinct vérifié sur `e40edf3e04217e2d0e96ea1385c0420e18374bac` : dans `app/routes/api.projects.$projectId.ide-panel.$panel.ts`, l’action `create-webhook` enregistre `successRate: 100` sans livraison ni mesure. `ProjectIntegrationsPanel` dans `app/components/chat/BaseChat.tsx` affiche cette valeur avec un repli `webhook.successRate ?? 100`, suivi du libellé de succès. Une configuration persistée n’est pas une preuve de transport ni de réussite de livraison.

## 📤 Dispatché

Oui — complément borné du lot d’honnêteté des intégrations du 20 octobre 2026, branche `codex/integration-sync-honesty-20261020`.

## 💻 Codé

Correctif présent sur main `941d7d7fc`, vérifié le 25 octobre 2026 (commit `c98845221`) : `create-webhook` n’enregistre plus de taux. Le GET expose `webhookDeliveryMetrics.available=false` ; les anciennes valeurs ne sont pas réécrites. Le panneau indique en français/anglais que les mesures de livraison sont indisponibles, sans interpréter un ancien taux ou son absence. La configuration enregistrée est explicitement distinguée d’une livraison vérifiée. Les chemins de configuration, d’activation, de suppression, de secrets et de permissions sont conservés.

## ✅ Testé live

Non. Aucun webhook fournisseur créé/envoyé, aucun secret, ressource ou donnée client modifié. Aucun transport ajouté ni webhook fonctionnel revendiqué.

## Preuves locales

- Sources produit exactes de `e40edf3e04217e2d0e96ea1385c0420e18374bac` : 12 échecs ciblés attendus et 2 témoins verts, à un worker. La création invente un taux, le GET ne qualifie pas la mesure et le rendu affiche des taux absents ou historiques comme mesurés en EN/FR. Les témoins vérifient le refus de permission et l’activation de configuration.
- BFF et `apiRequest` réels vers une API de configuration HTTP loopback explicitement simulée ; aucune requête vers l’URL du webhook ou un fournisseur. UI réelle extraite par AST avec données et dépendance d’authentification en fixtures.
- Validation du candidat consignée dans le relevé local du lot. Typecheck, build, navigateur et livraison restent des preuves distinctes.

## Validation du candidat, 20 octobre

[Relevé structuré des sources et preuves locales](../reprise/mesures/2026-10-20-integration-honesty-local.json) : 96 tests ciblés sur sept fichiers, zéro échec, un worker ; lint ciblé zéro diagnostic sur quatre sources produit et trois specs ; build standard `pnpm run build` terminé avec code 0. Le typecheck/lint globaux du hook sont des contrôles séparés, non déduits de ces tests.

Recette réelle locale sur web compilé, API et PostgreSQL, avec identité/projet QA synthétiques propres : EN 1440, FR 820 et FR 390. Configuration relue puis retrouvée après reload, Sync désactivé et POST503 sans mutation, création par formulaire d’une configuration webhook sans taux inventé. Toutes les destinations navigateur non-loopback sont bloquées ; aucun transport ni fournisseur testé. Projet supprimé avec réponse 200, aucun processus actif possédé restant ; l’identité QA créée est conservée explicitement. Le build utilise le mode WebContainer par défaut et aucune commande runtime n’est lancée. La première tentative a échoué sur un sélecteur mobile utilisé sur desktop, corrigé sans changer produit, délai ou assertion. Six captures ciblées après scroll réel ont ensuite été inspectées sur les trois formats : messages et boutons lisibles, aucune valeur secrète ni donnée client. Ce second projet QA a aussi été supprimé avec réponse 200 ; zéro processus actif ou zombie possédé restant.

## Routeur et portée de la recherche

Sur le SHA de référence, `git grep` des clés `VIBECORE_INTEGRATIONS_STATE` et `INTEGRATION_WEBHOOK_SECRET_` dans `app`, `services` et `packages` ne trouve que le BFF de ce panneau. Aucun consommateur de ces configurations pour livrer les événements ou calculer un taux n’a été identifié. Cette recherche source bornée ne prouve pas l’absence de toute intégration externe déployée.

Des chemins réels distincts sont présents dans `services/api/src/app.ts` : `POST /webhooks/github` (ligne 14301, réception signée et audit), `POST /webhooks/resend` (ligne 14412, réception d’événements de mail), `deliverSiemAbuseSignal` (ligne 8896, émission signée depuis `listSiemWebhooks`) et `POST /orgs/:orgId/siem-webhooks/:webhookId/test` (ligne 22410, livraison HTTP). Ils ne consomment pas l’état de ce panneau. Leur présence dans le code et leurs tests dédiés ne constituent aucune preuve de livraison externe dans cette recette.

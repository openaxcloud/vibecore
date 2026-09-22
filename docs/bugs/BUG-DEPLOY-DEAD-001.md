---
id: BUG-DEPLOY-DEAD-001
---

## Bug

**P1 — Le déploiement ne marche pour AUCUN fournisseur ni AUCUN environnement** (Avi, 08/09 20:50, capture iPhone du panneau Déploiements → onglet « Gérer ») : bandeau rouge « Le service du panneau est temporairement indisponible. Veuillez réessayer. » au-dessus de l'assistant (Fournisseur = Google Cloud Run, Environnement = Fabrication, `npm run build`, `dist`). Ce message est `apiRuntime.panel.backendUnavailable`, rendu quand l'API répond **≥ 500 ou ne répond pas** — donc un échec côté service, pas une saisie invalide. À MESURER (règle 1), et les deux moitiés séparément : (a) le CHARGEMENT du panneau — `GET /projects/:id/deployments` n'est pas rattrapé dans le chargeur, il fait donc échouer tout le panneau alors que ses deux voisins (`databases`, `git/graph`) sont en `.catch()` ; (b) l'ACTION de déploiement, fournisseur par fournisseur et environnement par environnement — « aucun » est à vérifier, pas à croire sur parole.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 — **MESURÉ, les huit fournisseurs un par un** : `static` **202 QUEUED (fonctionne)** ; server, vercel, netlify, github-pages, cloudflare-pages, google-cloud-run **400 `PROVIDER_NOT_CONFIGURED`** en nommant très exactement les variables absentes ; `docker` **403** (offre Enterprise). **L'API disait donc la vérité — TROIS couches la perdaient en route** : (1) en production, la garde jumelle sort en 503, et le gestionnaire d'erreurs de l'API remplace le message de toute erreur ≥ 500 par un texte générique, sauf `publicMessage` ; (2) `apiRequest` ne relayait que `error` et `code`, or ces routes mettent le JETON dans `error` et la PHRASE dans `message` — la seule phrase utile était jetée là ; (3) `ACTIONABLE_PANEL_CODES` ignorait ces codes, donc tout retombait sur « temporairement indisponible, réessayez » — faux (rien n'est temporaire) et inutile (aucun réessai ne peut aboutir). C'est le MÊME défaut que `DATABASE_PROVISION_UNAVAILABLE`, corrigé une fois pour la base de données et jamais généralisé (règle 7). Correctif sur les trois couches. Preuve sur le chemin réel, avant/après, à travers la route web : **avant** « Les données du panneau n'ont pas pu être chargées » pour tous ; **après** chaque fournisseur rend sa phrase localisée (« Le déploiement vers Google Cloud Run nécessite la configuration suivante : CLOUD_RUN_BUILD_TRIGGER_URL, GCP_OAUTH_TOKEN. Contactez votre administrateur. »), `docker` son refus de plan, `static` un `ok: true`. ⚠️ **CE CORRECTIF NE REND AUCUN FOURNISSEUR FONCTIONNEL** : il fait dire au produit ce qui manque. Aucun fournisseur externe n'a ses identifiants — c'est une action d'administration hors dépôt, aucun code ne peut la remplacer.

## ✅ Testé live

☐ live iPhone

## Preuve

contre-épreuve dans les DEUX sens sur les TROIS couches (codes retirés de la liste → 3 rouges ; lecture du seul `code` → 1 rouge ; `publicMessage` retiré → 2 rouges ; substitution retirée → 1 rouge ; jeton non reclassé en code → 1 rouge). Épinglé par `app/lib/enterprise-api.message-lisible.spec.ts` (5), `app/routes/api.projects.$projectId.ide-panel.deploy-provider-error.spec.ts` (5) et `services/api/src/deploy-provider-configure.spec.ts` (3)


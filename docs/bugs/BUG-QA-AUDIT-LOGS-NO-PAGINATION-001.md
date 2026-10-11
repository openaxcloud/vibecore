---
id: BUG-QA-AUDIT-LOGS-NO-PAGINATION-001
---

## Bug

**P1 — `/audit-logs` rend jusqu'à 2000 entrées d'un seul bloc, sans pagination ni virtualisation : sur la production, l'onglet du navigateur se fige.** **Sur la production**, après chargement de `https://app.e-code.ai/audit-logs`, toute évaluation JavaScript dans l'onglet échoue : `CDP sendCommand "Runtime.evaluate" timed out after 45000ms on tab — The renderer may be frozen or unresponsive`, **deux fois de suite**, et la capture d'écran devient impossible. Le rendu du processus est saturé. **Sur l'environnement de test**, où le volume est moindre, la page reste utilisable et permet de **quantifier** : **44 945 nœuds DOM**, **1818 lignes**, **249 379 caractères** de texte, document de **461 480 px** de haut — soit **547 écrans d'iPhone** à faire défiler. `domContentLoaded` à 5030 ms, contenu à 10 161 ms. **Chaîne complète, lue sur `origin/main`** : le loader `app/routes/audit-logs.tsx:175` appelle `apiRequest(request, \`/orgs/${organization.id}/audit-logs\`)` **sans aucun paramètre de limite, d'offset ou de page** ; l'API `services/api/src/app.ts` (`GET /orgs/:orgId/audit-logs`) retourne `{ auditLogs: await store.listAuditLogs(orgId) }` sans filtrage ; le store `services/api/src/prisma-store.ts:5637` plafonne à **`take: 2000`**. Le plafond existe donc **au niveau des données**, mais **pas au niveau du rendu** : la page affiche l'intégralité de ce qu'elle reçoit. À ~25 nœuds par ligne, 2000 lignes approchent les **50 000 nœuds DOM** — ce qui correspond aux 44 945 mesurés pour 1818 lignes. Le commentaire du loader assume le choix (« keeps the loader a single API round-trip »), mais rien ne borne l'affichage. ⚠️ Les boutons « Suivant » / « Plus tard » présents sur la page sont des **raccourcis de plage de dates**, pas une pagination de la liste rendue.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** gel reproduit sur la prod ; volumétrie mesurée sur l'env de test

## Preuve

**Repro production** : ouvrir `https://app.e-code.ai/audit-logs` sur un compte à l'historique fourni, puis tenter n'importe quelle évaluation JS → délai dépassé, renderer figé. **Repro quantifiée (env de test, 390 px)** : `node /tmp/qa-sweep/mob/audit.mjs` → `{noeuds:44945, lignes:1818, longueurTexte:249379, hauteurDoc:461480, ecrans:547, domContentLoaded:5030}`. Capture : `/tmp/qa-sweep/mob/audit-logs-390.png`. ⚠️ **Réserve d'attribution** : une partie des 1818 entrées de l'environnement de test provient de **mes propres balayages** du jour. Cela ne change pas le défaut — l'absence de bornage au rendu — mais le volume de test n'est pas représentatif d'un usage normal. Le gel constaté en **production** l'est, lui. **IMPACT UTILISATEUR, en une phrase** : sur un compte à l'historique fourni, ouvrir « Journaux d'audit » **fige l'onglet du navigateur** — l'utilisateur doit forcer la fermeture de l'onglet, et la page est donc **inutilisable en production**. **CORRECTION RECOMMANDÉE — le plafond côté données ne suffit pas, il faut borner le RENDU.** Trois options, par ordre de simplicité : **(1) Pagination au loader** *(la plus simple, recommandée)* — passer `limit` (25 à 50) et un curseur à `/orgs/:orgId/audit-logs` depuis `app/routes/audit-logs.tsx:175`, et ajouter les contrôles « page précédente / suivante ». Nécessite d'accepter `limit`/`cursor` côté API (`GET /orgs/:orgId/audit-logs`) et dans `listAuditLogs`, qui prend aujourd'hui un `take: 2000` figé. **(2) Virtualisation de la liste** — ne monter que les lignes visibles (fenêtre glissante). Conserve le « single API round-trip » assumé par le commentaire du loader, mais ramène le DOM de ~45 000 nœuds à quelques centaines. Plus de travail côté composant. **(3) Palliatif immédiat** — abaisser le `take: 2000` de `prisma-store.ts:5637` et afficher « affichage des N dernières entrées », en attendant (1) ou (2). Réduit le gel sans le supprimer sur les gros comptes, et **dégrade la fonction** (on ne peut plus consulter l'historique complet) : à ne retenir que comme mesure d'urgence. ⚠️ Ne **pas** se contenter d'abaisser le plafond du store en croyant le problème réglé : c'est le rendu de toutes les lignes reçues qui sature, quel que soit le plafond.


# Lot Solutions — contrat de finalisation

Date de réouverture : 12 août 2026. État vérifié le 13 août 2026.

## Périmètre

`/solutions/app-builder` reste la référence de structure et de densité. Le delta à livrer couvre exactement :

1. `/solutions/website-builder` — Meridian Studio ;
2. `/solutions/game-builder` — TriviaClash ;
3. `/solutions/dashboard-builder` — PipelineIQ ;
4. `/solutions/chatbot-builder` — HelpDesk Copilot ;
5. `/solutions/internal-ai-builder` — PeopleOps ;
6. `/solutions/enterprise` — Northwind Control ;
7. `/solutions/startups` — Launchpad ;
8. `/solutions/freelancers` — Studio Ferro.

L’alias `/solutions/internal-ai` doit continuer à rediriger en `308` vers `/solutions/internal-ai-builder`. Les zones Terminal mobile, header IDE compact et la branche `fix/from-scratch-install-dr-clean` sont hors périmètre.

## Contrat de contenu et i18n

- Gabarit de vente complet : hero, problème, construction, preuve, livrables, capacités, cas d’usage, FAQ et CTA.
- Catalogue structuré EN/FR consommé par un traducteur `t(path)` typé avec repli anglais feuille par feuille.
- Métadonnées title, description, Open Graph et Twitter localisées ; canonical stable entre EN et FR ; alternates `en`, `fr` et `x-default`.
- Vouvoiement français. Aucun témoignage, logo client, résultat commercial ou capacité externe inventés.
- Les données de démonstration visibles dans les captures sont explicitement fictives et locales ; leurs limites sont écrites dans la légende.
- Le toggle FR/EN local aux pages Solutions est supprimé : le sélecteur de langue unique du header global pilote désormais l’index et les pages de détail.
- Scan dédié : index + huit pages, `1 282/1 282` feuilles FR conformes, soit 100 %, avec zéro prose anglaise résiduelle ; les exceptions sont exactes et justifiées.

## Contrat visuel

Chaque page et chaque langue possèdent six captures E-Code propres (`prompt`, `preview`, `webviewOverview`, `iteration`, `webviewIteration`, `files`). Chaque capture existe en :

- thème clair et thème sombre réellement distincts ;
- WebP 720×450 et 1440×900 ;
- `srcset` et `sizes` responsive ;
- alt EN/FR rédigé pour l’image ;
- chargement eager/high uniquement pour le hero, lazy/low ailleurs.

Une capture ne peut être promue que par le harnais E-Code après validation du projet réel, de la Webview non blanche, des interactions, du responsive, de la console et du panneau Problèmes. Aucun fallback App Builder, placeholder, composite ou réutilisation inter-page n’est admis.

État vérifié au 13 août : **0/384 source acceptée**. Les 96 WebP historiques importés sont tous rejetés comme preuve finale : malgré leur intégrité binaire, aucun lot n’a de manifeste de succès et 28 chemins présentent en plus un défaut visuel. Ils ne peuvent donc pas être affichés comme visuels livrés.

## Définition de fini

Les lignes `SOL-02-IMG-REAL` à `SOL-09-IMG-REAL` gardent trois états séparés :

- 📤 Dispatché après affectation ;
- 💻 Codé seulement après commit poussé devenu ancêtre de `origin/main` ;
- ✅ Testé live seulement après déploiement vert et preuve déployée complète.

La preuve finale exclut App Builder des compteurs et exige :

- 96 captures : 8 pages × EN/FR × clair/sombre × 390/768/1440 ;
- 128 lignes de matrice : mêmes dimensions × 390/768/1024/1440 ;
- HTTP 200, contenu non blanc, toutes les images chargées, unicité page/thème, débordement et troncature à zéro, bascule EN↔FR, SEO, console/page/network à zéro ;
- rapport avant/après, inventaire des visuels et scan FR à zéro.

Tant qu’un de ces gates manque, le statut final reste **NON FAIT**.

État live vérifié au 13 août : **0/96 capture finale acceptée** et **0/128 ligne de matrice finale acceptée**. Aucun statut ✅ ne peut être attribué.

## Incidents de production connus

- Webview native vide alors que le runtime est `running`, le port 5173 est `ready` et le proxy sert l’application : `Preview stayed empty`.
- Game EN : requête `ide-state` en HTTP `412`.
- Game FR : `Dependency sync skipped before preview: Remote runtime request failed: 404`.
- Certaines reprises affichent `Reconnecting` ou échouent sur la bascule de thème avec `Timeout 5000ms exceeded` ; aucune capture issue de ces états n’est acceptée.
- Le pilote PeopleOps EN du 13 août a retrouvé le projet réel, ses 7 fichiers et un runtime synchronisé, puis a été rejeté avant capture : le contrôle `More agent actions` n’était pas présent dans la variante du header IDE déployée (timeout 60 s). Aucun asset n’a été promu.

## Commandes de contrôle

```bash
pnpm run solutions:i18n:audit
VERIFY_SOLUTION_PROOF_ASSETS=1 pnpm exec vitest run app/components/marketing/solutions/solution-proof.visuals.spec.ts
SOLUTIONS_PROOF_BASE_URL=https://<déploiement> pnpm run solutions:proof:live
```

---
id: BUG-QA-THUMBNAIL-404-CAPTURE-001
---

## Bug

**P1 — La vignette stockée d'un projet est la capture d'écran d'une page d'erreur JSON 404 : c'est le « rectangle vide » vu sur les cartes du tableau de bord.** Les 3 vignettes qui chargent sur le tableau de bord de production font 1280×800 et sont **visuellement blanches**, avec une seule ligne de texte en haut à gauche. Au zoom, c'est la capture d'une réponse JSON rendue par le visualiseur de Chrome : `{"message":"Route GET:/ not found","error":"Not found","statusCode":404}` — **texte identique sur les 3**, y compris pour un projet dont la carte porte le badge « **Deployed** ». C'est la forme d'un 404 **Fastify** (`Route <MÉTHODE>:<chemin> not found`), et non celle de l'API plateforme (qui ajoute un champ `code`). **Chaîne de déclenchement** : `app/components/workbench/Preview.tsx:1261-1272` — quand `activePreview.ready === true`, le client poste `activePreview.baseUrl` sur `/api/projects/:id/thumbnail/refresh` ; l'API (`services/api/src/app.ts`, route `/projects/:projectId/thumbnail/refresh`) valide l'URL puis fait `thumbnailCapturer.schedule(project.id, body.url)`. Le screenshotter photographie donc **l'URL fournie par le client, telle quelle**. **Deux causes possibles, non départagées à ce stade** : (a) `ready` passe à `true` alors que `GET /` n'est pas encore servi par l'application de l'utilisateur ; (b) `baseUrl` pointe vers un service **Fastify** (agent d'espace de travail) plutôt que vers le serveur de développement du projet. La forme Fastify du 404 rend (b) plus probable, mais je ne l'affirme pas sans l'avoir prouvé. **Aucune garde côté capture** : rien ne vérifie que la page photographiée est bien l'application (statut HTTP de la cible, `content-type` HTML, page non vide) avant de stocker le résultat comme vignette du projet.

## 📤

☑ — porté par #346 (01/09).

## 💻

☑ 01/09 — **corrigé côté capture, là où était le défaut** (`services/screenshotter/src/browser.ts`, arrivé sur cet historique avec #346 `73073359`) : la réponse du document principal rendue par `page.goto` n'est plus ignorée — un statut ≥ 400 fait **refuser la capture** (`PageRenderError('refusing to capture an error page (HTTP 404)', 404)`), avec un code distinct du 502 de panne ; une réponse absente (cache, `about:blank`) reste légitime. Le repli « No preview yet » du tableau de bord, qui fonctionnait déjà, redevient donc ce que l'utilisateur voit à la place d'une photo de JSON. **Épinglé par `services/screenshotter/src/error-pages.spec.ts`** (vert le 16/09).

## ✅

☐ — défaut constaté live le 27/08 ; le correctif reste **à constater en prod** : les vignettes déjà stockées ne se corrigent pas d'elles-mêmes (elles sont des fichiers) — après un `POST /projects/:id/thumbnail/refresh` (ou une nouvelle capture), la carte doit montrer soit l'aperçu réel, soit le repli « No preview yet », jamais une image blanche à une ligne de JSON.

## Preuve

Relevé complet, tableau par projet et commandes de repro : `docs/audit/evidence-2026-08-27/vignettes-tableau-de-bord.md`. ⚠️ **Le constat initial « rectangle vide à la place de la vignette » est à reformuler** : le tableau de bord a bien un état de repli propre (« No preview yet » + « A captured app preview will appear here »), qui fonctionne. Le rectangle blanc n'est **pas** un repli manquant — c'est une vignette **réellement chargée dont le contenu est une page d'erreur**. Le correctif n'est donc pas côté affichage mais côté capture.


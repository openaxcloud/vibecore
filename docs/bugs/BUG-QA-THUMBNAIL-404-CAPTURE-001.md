---
id: BUG-QA-THUMBNAIL-404-CAPTURE-001
---

## Bug

**P1 — La vignette stockée d'un projet est la capture d'écran d'une page d'erreur JSON 404 : c'est le « rectangle vide » vu sur les cartes du tableau de bord.** Les 3 vignettes qui chargent sur le tableau de bord de production font 1280×800 et sont **visuellement blanches**, avec une seule ligne de texte en haut à gauche. Au zoom, c'est la capture d'une réponse JSON rendue par le visualiseur de Chrome : `{"message":"Route GET:/ not found","error":"Not found","statusCode":404}` — **texte identique sur les 3**, y compris pour un projet dont la carte porte le badge « **Deployed** ». C'est la forme d'un 404 **Fastify** (`Route <MÉTHODE>:<chemin> not found`), et non celle de l'API plateforme (qui ajoute un champ `code`). **Chaîne de déclenchement** : `app/components/workbench/Preview.tsx:1261-1272` — quand `activePreview.ready === true`, le client poste `activePreview.baseUrl` sur `/api/projects/:id/thumbnail/refresh` ; l'API (`services/api/src/app.ts`, route `/projects/:projectId/thumbnail/refresh`) valide l'URL puis fait `thumbnailCapturer.schedule(project.id, body.url)`. Le screenshotter photographie donc **l'URL fournie par le client, telle quelle**. **Deux causes possibles, non départagées à ce stade** : (a) `ready` passe à `true` alors que `GET /` n'est pas encore servi par l'application de l'utilisateur ; (b) `baseUrl` pointe vers un service **Fastify** (agent d'espace de travail) plutôt que vers le serveur de développement du projet. La forme Fastify du 404 rend (b) plus probable, mais je ne l'affirme pas sans l'avoir prouvé. **Aucune garde côté capture** : rien ne vérifie que la page photographiée est bien l'application (statut HTTP de la cible, `content-type` HTML, page non vide) avant de stocker le résultat comme vignette du projet.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** reproduit live prod, contenu de la vignette lu au zoom

## Preuve

Relevé complet, tableau par projet et commandes de repro : `docs/audit/evidence-2026-08-27/vignettes-tableau-de-bord.md`. ⚠️ **Le constat initial « rectangle vide à la place de la vignette » est à reformuler** : le tableau de bord a bien un état de repli propre (« No preview yet » + « A captured app preview will appear here »), qui fonctionne. Le rectangle blanc n'est **pas** un repli manquant — c'est une vignette **réellement chargée dont le contenu est une page d'erreur**. Le correctif n'est donc pas côté affichage mais côté capture.


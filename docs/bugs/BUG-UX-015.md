---
id: BUG-UX-015
---

## Bug

**P3 (IA/UX) — deux routes distinctes font la MÊME invitation d'organisation, avec deux verbes différents.** `/invitations` (« Créer l'invitation », chapô « Invitez vos collègues et attribuez-leur le niveau d'accès adapté ») et `/organization-invitations` (« Envoyer l'invitation », chapô « Invitez des personnes dans votre organisation et gérez les invitations en attente ») rendent deux écrans séparés qui appellent **la même API** — `GET /orgs/{id}/invitations` + `/orgs/{id}/roles` dans les deux loaders. `/organization-members` expose EN PLUS son propre « Envoyer l'invitation ». L'utilisateur a donc trois points d'entrée pour une seule action, et le même bouton s'appelle « Créer » ici et « Envoyer » là. Aucun défaut fonctionnel : les trois marchent.

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

Env d'audit `vibecore-audit-test-20260807`, build `1c68880b39`, compte QA isolé, desktop 1440 FR. Contrôles relevés dans `#main-content` (chrome de shell exclu) : `/invitations` → INPUT `personne@entreprise.fr` + BUTTON « Créer l'invitation » ; `/organization-invitations` → même INPUT + BUTTON « Envoyer l'invitation » ; `/organization-members` → INPUT `coequipier@entreprise.fr` + BUTTON « Envoyer l'invitation ». Endpoints identiques vérifiés dans le source sur `origin/main` : `app/routes/invitations.tsx:212` et `app/routes/organization-invitations.tsx:59` appellent tous deux `/orgs/{id}/invitations`, plus `/roles` dans les deux. ⚠️ **Non corrigé délibérément** : consolider ou supprimer une route est une décision d'architecture d'information (quelle route garde l'URL, quelles redirections, quelle navigation) — hors du périmètre « correction sûre à la racine », et susceptible de collisionner avec d'autres sessions. Consigné pour arbitrage.


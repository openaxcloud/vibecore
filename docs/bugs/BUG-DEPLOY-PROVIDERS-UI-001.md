---
id: BUG-DEPLOY-PROVIDERS-UI-001
---

## Bug

**P1 — l'assistant proposait SEPT hébergeurs dont SIX ne pouvaient pas aboutir** (Avi, 09/09 10:32 : « et les fournisseurs ne fonctionnent pas »). Mesuré dans `services/api/src/deployments.ts` : seul `static` n'exige rien ; Vercel, Netlify, GitHub Pages, Cloudflare Pages, Cloud Run et Docker demandent des identifiants d'hébergeur. Sans eux, le choix menait à un 503 — après avoir rempli tout le formulaire.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

Le serveur publie désormais ce qu'il peut tenir (`GET /projects/:id/deployments/providers`, sous `projects:read`) ; l'assistant n'offre que cela et désactive le reste en NOMMANT les variables manquantes — des noms, jamais des valeurs (règle 12), ce qu'une garde vérifie explicitement. Sans relevé, RIEN n'est masqué : cacher un fournisseur qui marche serait pire que le défaut d'origine. épinglé par `services/api/src/deployments-disponibilite.spec.ts` + `app/components/deploy/fournisseurs-disponibles.spec.ts`


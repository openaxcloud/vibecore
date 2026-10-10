---
id: BUG-QA1001-PUBLIER-MET-EN-VEILLE-L-AUTRE-ESPACE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Un client gratuit qui publie un projet pendant qu'un autre de ses projets tient son unique espace actif
est renvoyé fermer ce projet à la main.** Depuis #644, il lit la vraie cause (« votre forfait permet un seul
espace de travail actif à la fois… Arrêtez l'espace de ce projet… ») — mais il reste bloqué.

**Décision d'Avi (2026-10-01)** : la publication met l'autre espace en veille TOUTE SEULE et le dit — « un
gratuit bloqué n'achète pas, il part ». Avec une condition non négociable : ne jamais couper un tour d'agent en
cours, le défaut que #642 vient de réparer.

## Cause

`realBuildStaticInWorkspacePod` (services/api/src/app.ts) rendait le refus de quota sans rien tenter.

Et un obstacle mesuré en lisant #642 : son registre des tours vit **dans la mémoire du pod web** qui exécute le
tour (`app/lib/.server/tours-en-cours.ts`). L'API — qui publie — tourne dans un autre processus, sur d'autres
pods, et chaque réplique web a son propre registre. **Rien de ce que l'API pouvait lire ne disait « ce projet a
un tour en cours ».**

## 📤

☑ 01/10 PR

## 💻

☐

## ✅

☐

## Preuve

**Le registre de #642 recopié là où l'API peut le lire.**
- Chaque tour de chat d'un projet est annoncé dans Redis (`tours-en-cours:<projet>`), sous la même borne de
  quinze minutes, puis retiré à sa fin (`app/lib/.server/tours-partages.server.ts`, branché sur la seule ligne
  `execute:` d'api.chat.ts).
- L'annonce ne bloque ni ne retarde jamais un tour : borne d'une seconde ; sans Redis, le tour se déroule
  normalement.

**La règle en deux temps** (`services/api/src/liberer-creneau.ts`) :

- **autre espace inactif** (aucun tour, aucun build) → mis en veille ; le client lit « Nous avons mis en veille
  votre projet « X » pour publier celui-ci… Ses fichiers sont conservés ; il se rouvre dès que vous y retournez. »
  (EN/FR, traduit par l'API à la lecture, affiché dans le panneau de publication) ;
- **tour en cours** → l'espace n'est **pas** arrêté. Le client le lit, on attend la fin du tour avec une borne
  (`DEPLOY_AUTO_SLEEP_WAIT_MS`, 4 min) ; au-delà : « …a toujours une génération en cours… Nous ne l'avons pas
  interrompue, pour ne rien perdre de ce travail. Publiez de nouveau quand elle sera terminée… » ;
- **état des tours illisible** (Redis absent ou en panne) → rien n'est arrêté : « on ne sait pas » n'est jamais
  « inactif » ; message de quota de #644 ;
- les tours sont **revérifiés sous le verrou de l'organisation** avant l'arrêt, et le créneau libéré est pris
  dans le même verrou (un onglet resté ouvert sur l'autre projet ne le reprend pas) ;
- l'espace réellement injoignable garde son « réessayez ».

Trois défauts trouvés en écrivant les tests, tous corrigés :

1. sonder `/busy` via `agentRequest` **ranimait** l'espace qu'on cherchait à mettre en veille (démarrage
   déclenché par une lecture) → sonde directe, sans effet de bord ;
2. le décompte de quota mis en cache pour la requête relisait « 1 actif » après l'arrêt → invalidation ;
3. le journal final ne gardait pas les lignes émises avant le build → les avis (`warn`) y sont reportés.

**Réversible sans perte — preuve en réel** (`docs/bugs/qa-2026-10-01/preuve-veille-reversible.mjs` + sa sortie `preuve-veille-reversible.txt`).
Banc :
- vrai workspace-manager, vrai Kubernetes (OrbStack, `KUBECONFIG` isolé, jamais la prod) ;
- vraie image de l'agent construite depuis le dépôt (commit 8f62b3637, arbre modifié par ce correctif) ;
- vrai volume `local-path` ;
- l'arrêt est la MÊME requête que la mise en veille automatique (`POST /workspaces/:id/stop`).

Résultats :
- deux fichiers écrits puis relus (empreintes) ;
- veille → pod supprimé, volume `Bound` ;
- réouverture → nouveau pod (4d765307 → 1af1f7a2) ;
- **mêmes empreintes, FICHIERS INTACTS**.

Contre-épreuve de l'instrument (`contre-epreuve-suppression.mjs`, sortie `.txt`) : on SUPPRIME l'espace au lieu de le mettre
en veille → volume DÉTRUIT, la même lecture rend **404**. L'instrument sait voir une perte ; « arrêter » et
« perdre » sont mesurés distincts.

**Épinglé par** :
- `services/api/src/tests/deploiement-refus-quota.spec.ts` — vraie API, vrai chemin de build, Redis réel,
  6 cas : inactif → veille + avis FR ; tour en cours → pas d'arrêt ; tour fini pendant l'attente → veille ;
  illisible → pas d'arrêt ; quota sans Redis ; injoignable → « réessayez ».
- Contre-épreuves de ce fichier :
  - lecture des tours neutralisée → les 2 cas « tour » rougissent ;
  - illisible traité comme inactif → les 2 cas « illisible » rougissent ;
  - libération retirée → les 3 cas « décision » rougissent.
- `services/api/src/tests/liberer-creneau.spec.ts` — tour apparu sous le verrou, build en cours, borne, illisible.
- `app/lib/.server/tours-partages.spec.ts` — CONTRAT web ↔ API sur Redis réel (le vrai code des deux côtés) ;
  clé divergente → rouge.
- `app/components/deploy/avis-publication.spec.tsx` — l'avis est affiché dans le panneau (bloc retiré → rouge).
- `manager.spec.ts` (existant) — `stopWorkspace` ne touche ni au PVC ni au Secret.

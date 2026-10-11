---
id: BUG-QA1011-SECOND-PROJET-GRATUIT-SANS-FICHIERS
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Un client gratuit qui ouvre un DEUXIÈME projet voit son espace refusé, et l'agent y « termine » sans qu'aucun
fichier n'arrive.** Remonté par Avi le 2026-10-11, mesuré en production : le message de quota est juste et le bouton
« Redémarrer l'espace de travail » est là, mais le bandeau de l'agent annonce la fin du travail et l'arbre reste
vide. Le client croit que son application existe.

Cause : le forfait gratuit permet un seul espace actif (`workspaces.active`). `POST /api/runtime/workspaces`
(l'ouverture de l'IDE) refusait le second en `429 QUOTA_EXCEEDED`. La mise en veille automatique de #665 ne
s'appliquait qu'à la PUBLICATION.

## Décision (Avi, 2026-10-11) et correctif (branche `fix/ouvrir-un-second-projet-met-en-veille`)

Ouvrir un second projet met l'autre espace en veille, sans mur ni bouton, avec au plus une mention discrète. Même
mécanisme que #665 (`libererUnCreneauPourPublier`, désormais partagé publication / ouverture) :

- l'autre espace n'est mis en veille que s'il est INACTIF : un tour d'agent en cours n'est jamais coupé (le refus
  reste), un état des tours illisible n'arrête rien ;
- seulement sur l'INTENTION d'ouverture (`metadata.ouverture`, posée par l'IDE au montage), jamais sur
  l'auto-réparation d'un onglet resté ouvert — sinon deux onglets sur deux projets s'endormiraient l'un l'autre ;
- la mise en veille est réversible : le pod part, le volume et ses fichiers restent (épinglé par #665) ;
- mention dans le journal de l'espace : « Votre projet « … » a été mis en veille pour ouvrir celui-ci… », y compris
  à l'ouverture à froid, où l'adaptateur la perdait en sondant `/status`.

La publication (#665) est inchangée : mêmes tests verts. **Touche `services/api/src/app.ts`.**

Épinglé par :
- `services/api/src/tests/ouverture-met-en-veille.spec.ts` (Redis réel) : sur `main`, 2 rouges (`429` à
  l'ouverture, écriture de l'agent jamais arrivée ; aller-retour A → B → A) ; après, 5 verts. Contre-épreuve : retirer
  la garde d'intention fait rougir le cas « auto-réparation » (200 au lieu de 429) ;
- `packages/runtime-remote/src/mention-mise-en-veille.spec.ts` : mention perdue à froid avant, gardée après ;
- `app/lib/runtime/ouverture-met-en-veille-cablage.spec.ts` : le montage envoie l'intention, l'auto-réparation non.

## Reste ouvert

Quand la mise en veille est impossible (tour en cours dans l'autre projet, Redis illisible), le refus reste : il
faut alors que l'agent ne dise pas « Terminé » sans avoir rien écrit (repli demandé par Avi, patrons #644 / #624).
Branche suivante.

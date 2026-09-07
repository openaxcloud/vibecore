# Preuve de génération réelle — protocole

**Objet.** Établir qu'un prompt produit une application **qui démarre**, et non
un décompte de fichiers ou un test unitaire vert.

**Pourquoi ce document.** Le 2026-09-07, une génération a livré 9 fichiers sur
90 annoncés, pour 209 018 jetons de sortie facturés 11,84 €. Les rôles
n'écrivaient rien : la consigne ne leur demandait qu'un rapport. Le correctif
leur fait écrire. Reste à le prouver **en réel**, ce qu'aucun test ne peut faire
à la place.

---

## Ce qu'il faut avant de commencer

* Un compte de production ordinaire (pas d'accès administrateur nécessaire).
* Un projet **neuf** — pas un projet rouvert : un projet existant porte déjà des
  fichiers, et on ne saurait plus distinguer ce que la génération a produit.
* Le SHA déployé, à noter **avant** (règle 11 — une mesure sans son
  environnement consigné n'est pas une mesure) :

```bash
kubectl -n vibecore get deploy vibecore-web -o jsonpath='{.spec.template.spec.containers[0].image}'
```

---

## Le prompt

Un prompt qui exige plusieurs fichiers et plusieurs domaines — sinon un
coordinateur seul suffirait et l'on ne testerait pas les sous-agents :

> Crée une boutique en ligne avec un catalogue de produits, un panier, et une
> page de paiement.

---

## Les trois mesures qui tranchent

Elles sont **indépendantes**. Aucune ne se déduit d'une autre : c'est la règle
qui a fait tomber les six conclusions hâtives de cette campagne.

### Mesure 1 — fichiers écrits contre fichiers annoncés

**À l'écran.** Le panneau « Agents parallèles » liste les rôles. S'il affiche
l'encadré **« Livraison incomplète »**, il nomme les fichiers non écrits : c'est
la mesure, directement lisible.

**En base**, pour le même projet :

```sql
SELECT r."roleId", r.status, jsonb_array_length(r.files) AS annonces
FROM "AgentRunResult" r
JOIN "AgentRun" a ON a.id = r."runId"
WHERE a."projectId" = '<PROJECT_ID>'
ORDER BY r."roleId";
```

Puis le nombre de fichiers réellement présents dans le projet (arborescence de
l'IDE, ou l'API `/files/tree`).

**Verdict.** Écrits ≈ annoncés → succès. Écrits ≪ annoncés **sans** encadré
« Livraison incomplète » → le correctif d'avertissement ne tient pas, et c'est
un défaut à part entière.

### Mesure 2 — l'issue du consensus

```sql
SELECT c.outcome, c."agreementScore", jsonb_array_length(c.conflicts) AS conflits
FROM "ConsensusRecord" c
JOIN "AgentRun" a ON a.id = c."runId"
WHERE a."projectId" = '<PROJECT_ID>';
```

**Verdict.** `ACCEPTED` avec 0 conflit `file-overlap` → les rôles se sont
partagé le travail. Des conflits `file-overlap` ne sont **pas** un échec :
l'arbitre les tranche, priorité à l'ordre canonique
`architect → frontend → backend → devops → qa`. Ce qu'il faut vérifier alors,
c'est que le fichier disputé porte bien la version du rôle prioritaire.

### Mesure 3 — l'aperçu affiche

**C'est la seule qui compte, et elle ne se déduit d'aucune des deux autres.**

Ouvrir l'onglet Aperçu. L'application doit **s'afficher** — pas « Prêt », pas un
cadre blanc, pas un écran de chargement figé.

Contrôles si elle ne s'affiche pas, dans cet ordre :

1. la console du navigateur (une erreur de module manquant nomme le fichier qui
   manque — à recouper avec la mesure 1) ;
2. le terminal du projet (le serveur de développement a-t-il démarré) ;
3. `docs/DEPLOY_RUNBOOK.md` pour les défauts d'infrastructure connus.

**Verdict.** L'application s'affiche → la preuve est faite. Tout le reste est un
indice, pas une preuve.

---

## Ce qui ne prouve rien

* Un test unitaire vert — aucun ne monte un vrai fournisseur de modèle.
* Un décompte de fichiers seul — 90 fichiers qui ne compilent pas ne valent pas
  9 fichiers qui démarrent.
* Un `ConsensusRecord` en `ACCEPTED` — il dit que les rôles se sont accordés,
  pas que le code fonctionne.
* Une génération sur un projet rouvert — les fichiers préexistants masquent ce
  que la génération a réellement produit.

## À consigner

Le SHA déployé, l'identifiant du projet, l'horodatage, et le verdict de chacune
des trois mesures — séparément. Une mesure déduite d'une autre est une mesure
perdue.

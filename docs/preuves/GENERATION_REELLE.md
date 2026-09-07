# Preuve de génération réelle — protocole figé

**Écrit AVANT la mesure, et non modifiable après.** Une seule génération sera
lancée (elle coûte ~11 € de jetons au propriétaire) : elle doit donc tout
mesurer du premier coup, et l'interprétation de chaque issue doit être fixée
d'avance. Un protocole écrit après coup s'ajuste au résultat sans qu'on s'en
aperçoive.

## Environnement (règle 11)

À consigner **avant** de lancer :

```bash
kubectl -n vibecore get deploy vibecore-vibecore-platform-web \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Le SHA doit être celui de la fusion de #496. **Si ce n'est pas le cas, la mesure
ne mesure pas le correctif** — c'est le premier contrôle, avant tout le reste.

## Accès

Session frappée en base sur le compte du **propriétaire**, avec son accord
explicite. Le jeton brut ne transite par aucune sortie : il va du pod vers un
fichier local, et seule son empreinte est affichée. Révocation en fin de mesure,
avec contre-épreuve à 401.

## Le prompt, exact

> Crée une boutique en ligne avec un catalogue de produits, un panier, et une
> page de paiement.

Choisi parce qu'il exige **plusieurs domaines** — sans quoi un coordinateur seul
suffirait et les sous-agents ne seraient pas exercés. C'est aussi le prompt de
la génération du 2026-09-07 08h36, ce qui rend le avant/après comparable.

## État « avant », mesuré le 2026-09-07 (coût nul)

| Projet | Runs | Chemins annoncés | Fichiers sur disque |
|---|---|---|---|
| Boutique en ligne (08h36) | 5 | ~200 | **9** |
| PWA de fitness (11h22) | 2 | 74 | **1** (un README de remplissage) |

Conflits mesurés sur ces deux projets : **35 chevauchements de fichiers**, dont 4
de sévérité haute (`package.json` revendiqué par 3 rôles). `agreementScore` =
**0,25** sur tous les runs.

---

## Les trois mesures

Elles sont **indépendantes**. Aucune ne se déduit d'une autre.

### Mesure 1 — fichiers écrits contre fichiers déclarés

* **Déclarés** : `SELECT "roleId", jsonb_array_length(files) FROM "AgentRunResult"`
  joint sur `AgentRun."projectId"`.
* **Écrits** : l'arborescence réelle du projet (`GET /projects/:id/files`).
* **L'encadré** : le panneau « Agents parallèles » affiche-t-il
  « Livraison incomplète » (`data-testid="agent-lanes-shortfall"`) ?

### Mesure 2 — consensus et arbitrage

```sql
SELECT outcome, "agreementScore", jsonb_array_length(conflicts) FROM "ConsensusRecord" …
```

Des `file-overlap` **ne sont pas un échec** : l'arbitre les tranche, priorité à
l'ordre `architect → frontend → backend → devops → qa`. Ce qu'il faut vérifier,
c'est que le fichier disputé porte la version du rôle prioritaire.

### Mesure 3 — l'aperçu affiche

**La seule qui compte.** L'application doit s'afficher dans l'onglet Aperçu —
pas « Prêt », pas un cadre blanc, pas un chargement figé.

---

## Ce que je fais selon le résultat — fixé d'avance

L'instrument qui départage les cas est la **capture du texte des lanes depuis la
page** : les annotations `agentLaneStream` contiennent-elles `<boltAction` ?
C'est ce qui distingue « le modèle n'a pas suivi la consigne » de « le correctif
n'est pas déployé » de « l'écriture a échoué ».

| Issue | Signature | Verdict, et ce que j'en dis |
|---|---|---|
| **A — succès** | écrits ≈ déclarés, aperçu affiche | Le produit fonctionne. C'est le point final. |
| **B — écrit mais ne démarre pas** | écrits ≈ déclarés, aperçu vide | **Le correctif tient** : les rôles écrivent. L'application ne démarre pour une **autre** raison, que je nomme (console, terminal, dépendances). Deux défauts distincts, annoncés comme tels — je ne présente pas B comme un échec du correctif ni comme un succès du produit. |
| **C — partiel annoncé** | écrits < déclarés, encadré présent | Le correctif tient **et** l'avertissement tient. Je donne le compte exact et les fichiers nommés. C'est un demi-succès honnête, pas un succès. |
| **D — partiel muet** | écrits < déclarés, **pas** d'encadré | **Défaut de mon propre correctif.** Je le dis sans l'atténuer et je le corrige avant toute autre chose. |
| **E — rien écrit** | 0 fichier de rôle | Départage obligatoire avant toute conclusion : (1) le SHA déployé porte-t-il #496 ? (2) le texte des lanes contient-il `<boltAction` ? Si oui aux deux, le défaut est dans le chemin d'écriture ; si non au (2), le modèle n'a pas suivi la consigne et c'est le **contrat** qu'il faut reprendre, pas la plomberie. |

**Règle qui prime sur toutes les autres** : je ne relance pas la génération pour
obtenir un meilleur résultat. Une seconde tentative après un résultat décevant
transforme une mesure en tirage. Si une relance devient nécessaire, elle est
annoncée comme telle et les deux résultats sont rapportés.

## Ce qui ne prouve rien

* Un test unitaire vert — aucun ne monte un vrai fournisseur de modèle.
* Un décompte de fichiers seul — 90 fichiers qui ne compilent pas ne valent pas
  9 fichiers qui démarrent.
* Un `ConsensusRecord` en `ACCEPTED` — les rôles se sont accordés, pas le code.
* Une génération sur un projet rouvert — les fichiers préexistants masquent ce
  que la génération a produit. **Projet neuf, obligatoirement.**

---
id: BUG-AGENT-CONVERSATION-LISIBLE-20261030
section: "Agent et messages"
---

# Séparer la conversation, les fichiers et les détails techniques

## 📤 Dispatché

☑ 30/10 — plainte utilisateur sur une réponse mêlant prose, fichiers et diagnostic fournisseur ; reproductions isolées en cours.

## 💻 Codé

☐ — complément distinct dépendant de #859 ; aucune intégration ni livraison revendiquée.

## ✅ Testé live

☐ — aucune modification du projet utilisateur, aucun appel fournisseur ; recette locale synthétique à distinguer de la production.

## Défauts établis

Le raccord `parsedMessages[i] || message.content` réintroduit le texte brut lorsque
le parseur retourne volontairement une chaîne vide. Le rendu comporte aussi un
repli vers les `parts` brutes, à distinguer d’un contenu simplement absent.
Le parseur exécutable reçoit les messages utilisateur autant que les réponses :
quatre régressions isolées reproduisent le traitement de balises/fences citées
par l’utilisateur comme des actions. Une citation ne doit pas lancer une écriture.

Le composant Artifact ouvre automatiquement les actions dès leur arrivée. La
régression du vrai composant échoue avant correction : les détails sont déjà
ouverts. Leur repli ne doit pas masquer les échecs ou interruptions.

## Contrat de présentation

Conserver la prose et les exemples de code demandés. Les blocs protocolaires de
fichiers et commandes ont une présentation technique volontairement consultable,
sans interprétation du JSX comme une page. Les données originales nécessaires
à l’exécution et à la revue des modifications sont conservées séparément.
Une fin de texte ne prouve ni écriture, ni build, ni aperçu fonctionnel ; le
contrat terminal de #859 reste applicable. Aucun bouton ne déclare un site prêt
à partir du seul chargement d’une iframe.

Le texte collé par l’utilisateur ne prouve pas la représentation originale avant
Markdown : les fixtures de cette correction sont représentatives et synthétiques,
pas une récupération prétendue du flux historique. Aucun contenu privé original
n’est ajouté au dépôt.

## Validation

- 1 692 tests assemblés passent sur 197 suites : conversation, parseur,
  Markdown, récupération du flux et Preview ; 127 tests du service preview-proxy.
- Régressions rouges avant correction : citations utilisateur exécutées (4),
  projection attachée à l’index (1), code demandé transformé en artefact (1),
  messages `parts-only` perdus (3), identifiants importés héritant du prototype (3),
  rendu conversation (8), Markdown utilisateur (6), actions ouvertes (1), blocs
  de code vides absorbant la prose (2), erreurs Preview invisibles (4), reporter
  ne transmettant pas les overlays Vite (3).
- Recette navigateur Chromium avec vrais composants : 390/768/1440 pixels,
  anglais et français, toucher et clavier, aucun débordement horizontal ni erreur
  JavaScript de page. Fixtures locales, réseau externe bloqué.
- Chaîne réelle locale Vite 5.4.21 → reporter → Preview, erreur TSX/HTTP 500 :
  avertissement lisible et accès aux journaux vérifiés aux trois formats.
- Revue indépendante favorable : sous-ensembles conversation et aperçu ; aucun
  contrôle retiré. Lint applicatif : zéro erreur, 52 avertissements préexistants.
- Build officiel client/SSR, typage officiel, lint et contrôle i18n exécutés avant
  publication ; CI distante sur la tête publiée reste nécessaire. Aucun succès
  local ne vaut recette production.

## Limites

Le code reste affiché dans les réponses de discussion et celles annotées sans
écriture ; en construction les blocs techniques sont consultables volontairement.
Une source sans balise ni bloc Markdown n’est pas supprimée par une heuristique
sur les mots : cela risquerait d’avaler une explication. Le transcript original
et les données de revue sont préservés ; les détails ne certifient pas l’écriture.

L’alerte d’aperçu représente une erreur observée. Le retrait d’un overlay HMR ne
suffit pas à certifier que l’application est réparée : l’alerte est réinitialisée
par navigation/actualisation explicite selon le contrat existant. Aucune réparation
IA ni nouvelle dépense n’est déclenchée. Safari et la production ne sont pas
revendiqués comme validés par cette recette locale Chromium.

## Aperçu : erreur de compilation et message utilisateur

Une reproduction locale sur un vrai serveur Vite avec un fichier TSX invalide
confirme : réponse HTTP 500 du module, `vite-error-overlay` présent, racine vide,
et aucun message d’erreur envoyé à l’IDE. Le beacon serveur existant signale
bien l’échec de chargement du script : il ne s’agit donc pas d’une absence totale
de détection. Le raccord manquant concerne le reporter vers le panneau.

Même une erreur `PREVIEW_ERROR` reçue ne produisait pas de bandeau visible dans
la vue normale : le diagnostic pouvait rester dans les journaux fermés. Le lot
ajoute une information simple et un accès aux détails, sans lancement de commande
ni requête IA. L’événement de compilation ne transmet pas le contenu de l’overlay.
Les validations d’origine/source de l’iframe et l’intention Stop sont conservées.
La couleur verte héritée des journaux est neutralisée lorsqu’une erreur est
connue : régression rouge puis 14 tests ciblés verts, couleur calculée vérifiée
sur trois largeurs (événement contrôlé, distinct du test Vite réel).

La preuve production rapportée le 30/10 montre toujours l’ancien code invalide et
le libellé « Preview rendered ». Au moment de ce constat, #859 n’était pas encore
intégré/livré ; ce constat ne contredit donc pas ses tests locaux. La dépendance
a ensuite été intégrée dans main par #862 ; sa présence dans main n’est pas une
preuve de livraison ni de réparation du projet utilisateur. Il ne démontre pas non plus que tous les
événements réseau du cas réel correspondent à la reproduction isolée.

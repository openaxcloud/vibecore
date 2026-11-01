---
id: BUG-PROVIDER-ROUTING-SCOPE-20261101
section: "Agent et routage"
---

# Respecter le repli déclaré et isoler la santé des credentials

## 📤 Dispatché

☑ 01/11 — deux défauts reproduits sans réseau avec fournisseurs synthétiques.

## 💻 Codé

☐ — correctif séparé en validation, pas encore intégré à main.

## ✅ Testé live

☐ — aucun appel fournisseur réel, aucune causalité établie avec la capture utilisateur.

## Défauts reproduits

Le résolveur de credentials choisissait un fournisseur du registre avant que la
carte de routage soit consultée. Une carte sans repli ou désignant un autre
fournisseur pouvait ainsi être ignorée, sans annonce du changement.

Les tables de santé et de sondes étaient indexées par nom de fournisseur. Une
sonde avec une clé personnelle pouvait donc affecter une autre clé personnelle
ou la clé plateforme sur le même processus pendant le TTL. Une sonde réussie
pouvait également dispenser une autre clé d’être vérifiée.

## Contrat attendu

La carte explicite gouverne la résolution initiale et le repli de santé ; une
absence de clé ne permet pas de choisir un fournisseur inattendu. L’annonce
utilisateur doit désigner la décision finale, sans présenter une bascule comme
preuve de réponse utile.

La santé est isolée par une portée opaque dérivée de la résolution réelle des
credentials et de l’endpoint. Aucun secret brut, contenu de réponse ou identifiant
de portée ne doit être sérialisé vers le client ou journalisé. Les sondes restent
bornées, dédupliquées et cohérentes avec les paramètres de l’appel effectif.

Le parcours explicite borné conserve son fournisseur, son modèle et son budget.
Aucun changement de credential, de tarif administrateur ou de plafond n’est requis.

## Correction et validation isolée

Le résolveur refuse un fournisseur inconnu sous carte et ne consulte que les
candidats autorisés. Le résumé, la sélection de contexte et le planificateur
utilisent uniquement le primaire de la carte ; la classification utilise sa
propre ligne déclarée sans repli implicite. Leurs replis locaux existants
(heuristique, contexte complet, liste de rôles) restent disponibles. Sans carte,
le contrat historique des appelants est préservé.

Les scopes HMAC sont éphémères au processus, calculés par le résolveur réel des
credentials ; les caches sont bornés à 512 entrées. Les sondes sont dédupliquées
par scope et modèle. Le scope du tour est effacé avant les opérations auxiliaires
et transmis uniquement au serveur près de l’appel réel ; les erreurs ne peuvent
plus mettre en quarantaine une autre clé. Les diagnostics de santé ne stockent
que la classification, sans corps d’erreur ni credential.

Quatre régressions échouaient avant correction et passent après. La suite locale
assemblée compte 538 tests verts sur 46 fichiers, dont les exports réels de
`streamText`, les auxiliaires et l’action API, avec SDK fournisseur simulé et
réseau interdit. La revue indépendante et ses 113 tests sur neuf suites sont
favorables. Les tests couvrent clés personnelles distinctes/plateforme,
paramètres d’endpoint, cache borné, concurrence des sondes, annulation, primaire
inconnu, carte sans repli, annonce finale unique, absence de fuite du scope,
absence d’appel alternatif auxiliaire et maintien du parcours explicite borné.

Le cache n’est pas distribué entre pods. Une base URL résolue que certains SDK
à endpoint fixe ignorent peut sur-partitionner le cache, sans partager des
credentials distincts. Aucune carte administrateur active n’a été lue en
production et aucune génération payante n’a servi à cette validation.

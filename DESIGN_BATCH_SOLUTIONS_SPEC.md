# DESIGN BATCH SOLUTIONS SPEC — SOL-2026-07

## Périmètre

Refondre les neuf pages Solutions marketing sans toucher au shell IDE, à la preview/webview, à `Chat.client.tsx`, à `BaseChat.tsx`, au LLM, à `workspace-agent`, à `preview-proxy`, au backend, aux migrations ou à l'infrastructure.

Ordre de livraison : SOL-01 App Builder, validation d'Avi, puis SOL-02 à SOL-09. Les huit pages suivantes ne démarrent pas avant cette validation.

Les images de démonstration sont de vraies captures raster issues d'un rendu navigateur déterministe, jamais de simples schémas présentés comme des captures. App Builder fournit quatre écrans distincts en anglais et quatre en français, plus un sélecteur EN/FR persistant et des images Open Graph localisées. Chaque légende précise qu'il s'agit d'une démonstration exécutable avec données fictives ; elle ne prétend pas que la génération E-Code a été vérifiée si ce n'est pas le cas.

App Builder montre aussi une preuve séparée du flux de génération : un véritable workspace E-Code capturé après soumission du prompt, avec l'échange Agent, les fichiers créés et l'application active dans l'onglet Preview. Cette preuve ne peut pas être un composite, une fixture marketing ou une coque IDE vide. Les identités et données métier peuvent être fictives si elles sont signalées ; l'exécution de l'agent, le projet et le runtime Preview doivent être réels et vérifiés.

## Contrat de chaque page

1. Hero avec promesse spécifique, bénéfice concret, CTA principal « Décrivez votre app » et CTA secondaire contextuel.
2. Problème vécu, exprimé dans le langage du client : temps, coût, dépendance à un développeur et plafond du no-code.
3. Section « Un prompt suffit » avec un prompt utilisateur réaliste et le résultat explicite : écrans, données, fonctions et déploiement.
4. Résultat livré : code source réel, base de données, aperçu instantané, déploiement en un clic, URL live et itérations par conversation.
5. Fonctionnalités formulées pour la solution concernée, sans liste générique recopiée.
6. Trois à quatre cas d'usage propres à la page.
7. Quatre à six questions FAQ utiles et des réponses honnêtes.
8. CTA final spécifique.

## Prompts de référence

- SOL-01 : « Crée une app de réservation pour mon salon de coiffure, avec agenda, comptes clients et rappels par email. »
- SOL-02 : « Fais-moi un site vitrine pour mon cabinet d'architecte, avec portfolio, contact et blog. »
- SOL-03 : « Crée un jeu de quiz multijoueur avec score en temps réel et classement. »
- SOL-04 : « Un tableau de bord de mes ventes, connecté à ma base, avec graphiques et filtres. »
- SOL-05 : « Un assistant qui répond aux questions de mes clients à partir de ma documentation. »
- SOL-06 : « Un agent interne qui cherche dans nos procédures RH, réservé à mes équipes. »
- SOL-07 à SOL-09 : prompt réaliste propre au rôle et à ses contraintes, jamais un exemple générique recyclé.

## Règles transverses

- Aucun témoignage, logo client ou chiffre de confiance inventé.
- Aucun ton de spécification : bannir « should be », « can be » et « is designed to ».
- Aucun contenu mutualisé entre les neuf pages. Sans le titre, l'identité de la page reste évidente.
- Illustrations/captures E-Code uniquement ; aucune banque d'images. Chaque page montre plusieurs visuels produit qui démontrent le résultat concret du prompt, pas de simples pictogrammes ou cartes textuelles. Toute image sous la ligne de flottaison porte `loading="lazy"`, `width`, `height` et un texte alternatif réel.
- App Builder montre au minimum le parcours de réservation, l'agenda d'équipe et les comptes clients/rappels, avec un traitement lisible en clair comme en sombre.
- Tokens E-Code uniquement ; orange réservé aux actions ; zéro violet ; IBM Plex ; clair et sombre complets.
- H1 : 28 px à 390 px, 32 px dès 768 px.
- Responsive vérifié à 390, 768, 1024 et 1440 px ; cibles tactiles d'au moins 44 px ; focus visible et sémantique accessible.
- Traductions complètes pour toutes les langues supportées ; title, description, canonical et Open Graph propres à la page.
- Gates obligatoires : typecheck, lint, tests et build. Captures clair/sombre aux quatre largeurs avant le statut « Testé live ».

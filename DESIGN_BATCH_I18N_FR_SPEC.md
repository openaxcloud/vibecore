# DESIGN BATCH I18N-FR-2026-08 — spécification

## Objectif

Rendre toute la plateforme E-Code disponible en français professionnel, sans chaîne anglaise résiduelle visible lorsque la locale active est `fr`, sans régression fonctionnelle, visuelle ou responsive. L'anglais reste la locale canonique et le repli de sécurité.

## Périmètre obligatoire

- Marketing : accueil, tarification, fonctionnalités, Solutions, à propos, contact, blog, mentions légales, CGU, confidentialité et erreurs 404/500.
- Espace utilisateur : dashboard, onboarding, IDE et tous ses panneaux — fichiers, terminal, git, secrets, déploiements, base de données, historique, problèmes, agent et paramètres.
- Authentification : connexion, inscription, mot de passe oublié, vérification e-mail et OAuth/SSO.
- Tous les micro-textes : boutons, libellés, placeholders, validations, tooltips, états vides, toasts, modales, menus, fils d'Ariane et badges.
- Transactionnel : e-mails, factures, alertes, notifications système et erreurs techniques/API présentées à l'écran.
- SEO : titres, descriptions, Open Graph/Twitter, sitemap, URL canonique anglaise, `hreflang` anglais/français et attribut `lang` du document.

## Contrat de locale

1. L'anglais est le défaut et le fallback.
2. Sans choix existant, le premier chargement utilise `Accept-Language` côté serveur puis `navigator.language` côté client ; une préférence française sert `fr` automatiquement.
3. Un sélecteur FR/EN est disponible dans la navigation haute de toutes les surfaces marketing et authentifiées.
4. Le choix manuel est mémorisé dans un cookie, devient prioritaire et neutralise la détection automatique aux visites suivantes.
5. Une clé française absente rend sa valeur anglaise, jamais la clé brute.

## Contrat de contenu

- Toutes les chaînes produit sont externalisées dans des catalogues typés EN/FR.
- Pluriels, interpolation et formats utilisent la locale active.
- En français : dates/nombres/montants respectent `fr-FR`, l'euro, la virgule décimale et les espaces insécables appropriés.
- Ne sont jamais traduits : E-Code, VibeCore, URLs, clés/API, identifiants/variables, extraits de code et contenu utilisateur.
- Les termes techniques consacrés peuvent rester en anglais, notamment `commit`, avec justification dans le rapport de couverture. Les actions et surfaces sont traduites, par exemple `Deployment` → `Déploiement`, `Workspace` → `Espace de travail`.
- Ton professionnel, cohérent et au vouvoiement ; glossaire normatif livré.

## Responsive et accessibilité

- Le texte français, généralement 15 à 30 % plus long, ne doit ni chevaucher, ni déborder, ni disparaître, ni être tronqué sans alternative accessible.
- Validation obligatoire à 390, 768, 1024 et 1440 px, en clair et sombre.
- Les contrôles FR/EN restent accessibles au clavier, correctement labellisés et utilisables avec des cibles tactiles d'au moins 44 px sur les surfaces tactiles.

## Preuves et garde-fous

- Garde CI qui refuse les nouvelles chaînes UI en dur et les clés de catalogue manquantes.
- Scan du DOM en mode français qui échoue sur tout résidu anglais non explicitement autorisé.
- Rapport de couverture avec routes/surfaces, catalogues, pourcentage traduit et exceptions justifiées.
- Captures de toutes les familles de pages aux quatre largeurs et dans les deux thèmes, avec bascule FR↔EN vérifiée.
- Tests, typecheck, lint et build verts avant publication.

## Coordination

- Ne pas écraser les pages Solutions gérées par un autre agent ; intégrer leur contrat de locale et rebaser/coordonner au besoin.
- Ne pas modifier l'onglet Terminal mobile marqué intouchable.
- Livraison sur branche et PR dédiées ; ne pas merger sans validation.

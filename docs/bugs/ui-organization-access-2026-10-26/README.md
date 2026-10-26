# Organisation et équipes : huit routes allouées, audit local

Worktree isolé `/workspace/vibecore-ui-org-next`, base main3eb70894. Dépendances liées en lecture à l’installation existante, aucune installation. Le navigateur avant utilise le build existant autorisé par le parent : **code UI975db321b / base locale52fd + intégration main**, servi depuis safecontent11899, API isolée6299. Ce n’est pas une compilation de main3eb nu ; les huit routes sont identiques à cette base, le wrapper AppShell peut inclure les correctifs précédents. Aucune modification de la tête PR800/safecontent.

## Dénominateur et états réellement exercés

| ID / route | État avant observé | Non exécuté |
| --- | --- | --- |
| enterprise-sso-settings | Formulaires OIDC/SAML non préremplis, enforcement désactivé ; brouillon URL conservé au resize ; GET503/403 et restauration | Sauvegarde, test de connexion, activation enforcement, secrets, IdP réel |
| invitations_.accept | `/invitations/accept?token=synthetic-not-an-access-token`, formulaire affiché | Acceptation, invitation réelle, token fonctionnel, états d’échec de soumission |
| mfa-setup | Statut déjà activé via fixture `mfaEnabled:true` | Loader désactivé appelle POST/setup : branche volontairement non visitée ; aucun enrôlement, QR, secret, code ni reauth |
| recovery-codes | Métadonnées remaining2/total10, alertes et GET503/403 récupérés | Génération, copie, lecture de codes, mot de passe, changement d’accès |
| scim-token-settings | Métadonnées d’un token fictif au nom long, brouillon nom seulement, GET503/403 et restauration | Création/rotation/révocation/copie, secret bearer, serveur SCIM réel |
| teams.$id | Journal d’accès synthétique long, filtres/contrôles présents ; GET503/403 ; lien paramètres et Retour | Export CSV/JSON, droits réels, tous filtres |
| teams.$id.settings | URL visitée mais **parent affiché à tort**, défaut confirmé ; le contenu enfant n’est pas validé avant correction | Fonctionnalités de paramètres non rendues à ce stade |
| teams.new | Alias301 vers `/organization-switcher?create=1`, dialogue, brouillon, resize/Tab/Escape | Création d’organisation/équipe ; aucun vrai ouvreur avant l’entrée directe, pas promesse de restitution du focus à un bouton inexistant |

Huit IDs ne signifient pas huit pages indépendantes : un alias et une route enfant initialement masquée. Domaines organisation exclus. Aucun IDE, hub Intégrations, SSO réel, invitation ou changement de droits.

## Matrice avant et parcours

`before11899/receipt.json` :160 observations =8 entrées ×320×740,390×844,844×390,820×1180,1440×900 ×FR/EN ×clair/sombre. Zéro débordement document ou texte ciblé détecté ; tableaux intentionnellement défilants exclus de ce constat. Les20 observations settings ne sont pas un succès du contenu enfant : elles mesurent la mauvaise page parente.32 groupes de touches/resize enregistrés : SSO/SCIM avec brouillon, teams/new avec dialogue ; pour les autres, simple Tab/Escape observé, pas une validation exhaustive du focus.

`history.json` :16 navigations FR/EN à390, entrée puis navigation programmatique vers une autre page sûre, Retour navigateur retrouve URL/titre. Ce n’est pas un clic sur tous les liens produit. `team-navigation.json` vérifie séparément le vrai lien Team→Settings et Retour en FR/EN ; l’URL change correctement mais le h1 reste celui du parent. La configuration officielle flatRoutes confirme la relation parent/enfant. HTML initial ne fournit pas de h1 dans ce shell client ; la présence de métadonnées Settings dans le HTML ne prouve pas le rendu du contenu.

`recovery.json` :16 cas =4 routes SSO/Recovery/SCIM/TeamOverview ×GET503/403 ×FR/EN à320. Les loaders absorbent ces états et montrent des messages locaux. Réessayer au clavier quand proposé (avec resize du bouton focalisé), sinon rechargement navigateur après restauration de la fixture ; contenu changé/revenu dans16cas. Pas de panne forcée sur MFA/auth globale, ni erreur métier inventée sur le loader local Invitations. Les erreurs Settings ne sont pas comptées séparément du parent masquant.

Zéro erreur JavaScript, aucun nonGET reçu par API6299 ni tenté par le navigateur. Tiers (polices incluses), export et WebSockets bloqués. Aucune donnée réelle ; noms/identifiants synthétiques longs, dates et IPv6 de documentation. Les états de liste vide, autres rôles, MFA désactivé, états de mutation, tous paramètres dynamiques et environnements réels restent non couverts.

## Deux correctifs locaux après reproduction/revue

1. **Settings masqué** : parent `teams.$id.tsx` sans Outlet. `useOutlet` inconditionnel après les autres hooks, retour enfant avant la coque parente ; ni loader ni action modifié, aucune double coque. Deux tests réels `createMemoryRouter` rouges puis verts : entrée directe et lien/Retour, données enfant et coque unique. Les tests i18n existants restent inchangés. Premier essai de harness échouait sur AbortSignal Node/jsdom ; Request node-fetch existant dans les autres suites règle cette incompatibilité, diagnostic conservé séparément du rouge produit.
2. **Deux CTA SSO32px** : malgré min-h44 local, règle globale `body button[data-vc-button][data-size=sm]` impose32px. Quatre contrepreuves FR/EN320/1440, huit boutons32→44 avec minimum!important. Source locale seulement : ajout `!` à min-h-[44px] dans les deux boutons Test connection ; h-auto, wrapping, disabled, labels et actions inchangés. Aucun changement de Button partagé ou CSS global. Les toggles compacts ne sont pas assimilés à ces deux boutons ; aucun verdict global de cible tactile.

31 PR ouvertes et fichiers relus : aucun chevauchement des routes Team/SSO ou du test existant. Revue indépendante final_review favorable pour Outlet ; revue indépendante root favorable pour les deux classes SSO après lecture du patch et des huit mesures. Les avis et patchs proposés sont conservés sous validation/.

26 tests uniques sur5 fichiers réussis : Team navigation2+i18n3 ; SSO21 sur3 fichiers. ESLint ciblé final0. Build isolé terminé code0. Typage web strict réussi ; commande globale arrêtée ensuite sur dépendances de sous-packages absentes du nouveau worktree. Après création de19 liens locaux vers les installations existantes (aucune installation ni modification des cibles), le contrôle `tsc --project tsconfig.scripts.json --noEmit --pretty false` passe0. Les étapes suivantes du script global (IDE, Electron, workspace) ne sont pas revendiquées. Échec initial et reprise conservés dans validation/. Contrepreuves DOM et baseline restent distinctes.

## Processus, preuves et limites

Les origines PID/startTicks app11899/API6299 sont dans before11899, serveurs créés uniquement pour cet audit ; leurs arrêts éventuels seront vérifiés contre ces origines. Les scripts archivés résolvent Playwright depuis le dépôt ; leur base11899 et fichiers/tmp doivent être adaptés uniquement vers une fixture locale équivalente. `fixture.cjs` refuse tous les nonGET405, MFAEnabled true empêche le POST implicite du loader. Aucun secret généré, accès persistant, service payant ou système installé.

Chromium local seulement : pas Safari/WebKit/Firefox, clavier OS, matériel safeareas, lecteur d’écran ou zoom200% dans cette phase. Captures ciblées FRclair320/paysage/1440 ; absence d’inspectionpixel exhaustive. Pas de production authentifiée, de backend métier accepté ni de livraison présumée. Aucun index commun, commit ou push effectué par cette mission.

## Recette compilée après correction —12099

Build local de base3eb70894 avec les deux correctifs ci-dessus : `after12099/receipt.json` contient60 observations =SSO, TeamOverview, TeamSettings ×les cinq formats précédents ×FR/EN ×clair/sombre, plus12 groupes de touches/resize. Les deux boutons SSO atteignent au moins44px dans les20 contextes SSO ; les20 contextes Settings affichent désormais leur titre enfant. Aucune erreur JavaScript ni mutation réseau ; pas de débordement document détecté. Les cinq autres entrées ne sont pas recomptées comme rejouées sur12099.

`after12099/team-navigation.json` : deux parcours FR/EN par le vrai lien parent→enfant, coque unique, focus du lien enfant maintenu après Escape et Retour navigateur restauré. Le harness attend le titre après Retour ; une observation immédiate antérieure, conservée séparément, lisait encore le titre enfant pendant la transition et ne constitue pas un résultat final. Aucun export ni action métier. Les captures ciblées sont FR clair uniquement ; les mesures couvrent FR/EN et les deux thèmes.

Rejeu local : démarrer la fixture GET uniquement et l’application compilée sur les ports indiqués ; adapter uniquement les chemins locaux/baseURL dans les scripts archivés. Scripts après : `after-audit.cjs` (sortie `UI_EVIDENCE_DIR`) et `after-team-navigation.cjs`. Les scripts ne sont pas destinés à une URL distante. Aucun résultat CI, fusion ou livraison production établi par cette recette.

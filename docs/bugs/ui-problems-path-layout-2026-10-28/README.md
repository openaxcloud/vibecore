# Repliement des chemins Problems

Base isolée e71e328ed60d126aa840f62cb1d4318c05441808. Correctif local : cinq propriétés dans `.bolt-project-problem-open`, sans changement de code React, de gestionnaire, de contenu ni de navigation. Aucun correctif Locks.

## Reproduction et contrepreuve avant compilation

Vraie route IDE compilée sur serveur loopback, Chromium FR clair. Fichier et journal synthétiques injectés uniquement dans les atoms frontend du workbench ; tous POST et domaines tiers bloqués. Il ne s’agit ni d’un projet client ni d’un parcours backend réel.

| Largeur fenêtre CSS | Liste client/scroll avant | Après style navigateur |
| ------------------- | ------------------------- | ---------------------- |
| 390                 | 390/1871                  | 390/390                |
| 820                 | 820/1871                  | 820/820                |
| 1280                | 614/1623                  | 614/614                |

Le Range du texte dépasse le bouton avant correction. Après contrepreuve, texte et ligne restent contenus, sans suppression ni ellipse. Le message du diagnostic reste inchangé.

`before/settled-receipt.json` contient les mesures stables390/1280 ; `before/initial-injection-receipt.json` contient820. Attention : dans ce dernier reçu,390 est un nœud détaché rect0, et les essais Locks initiaux expirent pendant le remplacement du store ; ces entrées ne sont PAS des validations. Locks est hors correctif. `dom-counterproof/receipt.json` contient les trois contrepreuves CSS et `harness.cjs` leur procédure. Les deux captures390 représentent avant/après injection CSS, PAS un build corrigé.

Les captures/reçus complets et scripts exploratoires restent dans `/workspace/ui-problems-locks-audit`. Serveurs anciens arrêtés par leurs propriétaires. Aucun nouveau serveur ni navigateur démarré pendant la préparation du correctif.

## Plan de validation avant build (résultats ci-dessous)

Après build commun : recette réelle du CSS compilé390/820/1280 et zoom navigateur natif200%, largeur effective et DPR consignés. Vérifier Range et liste, texte complet, focus clavier et conservation du comportement d’ouverture sans opération backend réelle. Pas de test unitaire regex reproduisant les cinq propriétés CSS. Ce plan était en attente avant build ; son résultat est consigné ci-dessous, sans certification de production, WebKit ou lecteur d’écran.

## Résultat compilé

Build66352 terminé exit0 selon parent. Six cas Chromium FR clair : trois fenêtres390/820/1280×900 normales, puis trois zoom200% natifs via chrome.settingsPrivate.setDefaultZoom(2). Àzoom : outerWidth780/1640/2560, innerWidth390/820/1280, innerHeight556, DPR2, visualViewport.scale1 ; ni CSSzoom ni pinch.

`compiled-after/receipt.json` et `compiled-zoom/receipt.json` : Range contenu dans bouton, liste scrollWidth<=clientWidth, focus exact sur lien puis Entrée sélectionne le chemin synthétique attendu et currentView=code. Aucun style injecté après compilation. Les fichiers/logs restent des états frontend synthétiques injectés dans le vrai bundle ; pas de runtime/backend réel attesté.0erreurJavaScript.

Dix-sept tentatives mutatrices automatiques bloquées :6POST runtime/boot et11PUT ide-state, plus12GETpolices externes bloqués. Aucune action ne traverse vers un backend réel ; pas de prétention zéro tentative. L'ouverture au clavier est vérifiée par l'état frontend, pas par une lecture d'un fichier client.

Revue indépendante des captures390 normale/zoom par final_review : chemin intégral jusqu'à.tsx:27 visible et replié, aucun clipping horizontal apparent. Au zoom, bas du message hors vue ; accessibilité verticale complète non prouvée par l'image. Un toast mémoire de fixture recouvre le premier diagnostic. Le focus photographié est sur le titre ; preuve focus/Entrée dans le reçu uniquement. Pas de verdictWCAG/contraste (icône pâle), WebKit, EN, sombre ou production.

Mes navigateurs sont fermés, profil zoom temporaire supprimé. Stack partagé19999/API8599 préservé pour la recette Settings parallèle ; nettoyage final dépend de son accord et de la provenance PID/startTicks.

Nettoyage final après accord Settings : app71426 et fixture71425 vérifiés par argv exact et startTicks, arrêtés. App a nécessité SIGKILL après SIGTERM (port déjà fermé mais processus encore vivant). États finaux zombie sans exécution ; ports19999/8599 connexion refusée111. Première lecture cwd refusée par permission système avant tout signal ; identité ensuite vérifiée par argv/startTicks, aucun processus tiers touché. Voir cleanup.json.

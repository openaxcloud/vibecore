# Libellés FR et accès clavier au rapport Agent

## Périmètre des preuves

Les libellés ont été exercés sur la source exacte `120490019369ecae1fa5f2f0b05cad3d52a7a924`. Le correctif clavier a ensuite été testé dans un worktree isolé basé sur cette tête, commit `af46fc879abaf228b88bdb0214dbd708149d0cd9`, intégré localement par le parent en `bea1b6a88`. Les empreintes du composant/catalogue et du correctif sont jointes ; ces reçus ne prétendent pas valider le nouveau build intégré du parent.

Harness React isolé : vrais `AssistantMessage`, `AgentLaneSummary`, catalogue, registre de confirmations et abonnement atom. Markdown et intégrations sans rapport avec ces scénarios remplacés par stubs explicites. CSS global, reset et utilitaires issus du build Agent antérieur, avec empreintes ; pas un nouveau build complet de la tête120. Fontes externes bloquées, police de repli locale. Scripts complets et diagnostics intermédiaires restent dans `/workspace/ui819-fr-evidence` ; aucune copie volumineuse de CSS ou dépendance dans ce dossier.

## Libellés — aucune coupe reproduite

[72 observations](labels-72.json) : FR/EN × clair/sombre ×320/390/768 CSSpx ×6états (inconnu, zéro, deux confirmations, invalidation vers une, flux actif, réinitialisation). Range des lignes contenu horizontalement, hauteur du texte contenue, largeur du document égale au viewport. Sous320FR, le texte des deux confirmations occupe quatre lignes,79,5CSSpx de haut en14px. Les confirmations et invalidations proviennent des vraies fonctions du registre, sans rerender manuel du parent ; aucune API réelle n’est appelée.

[18 observations de zoom natif200%](zoom-18.json) : FR/EN ×320/390/768 CSSpx ×inconnu/zéro/deux, thème clair. Méthode Chromium `settingsPrivate.setDefaultZoom(2)`, DPR2, `visualViewport.scale=1`. Fenêtres externes640/780/1536px : il ne s’agit pas de fenêtres physiques320px. Aucun CSSzoom ni pinch. Aucun pageerror dans ces reçus ;12GET externes bloqués sur les72observations et2sur le zoom, aucun POST.

L’état inconnu reste explicitement inconnu ; zéro affiche une livraison non confirmée ; deux confirmations suppriment ce manque ; l’invalidation le réintroduit ; le flux actif diffère l’alerte finale. Les textes ne revendiquent ni sauvegarde cloud, ni compilation, ni validation QA. Les confirmations synthétiques de fixture ne prouvent aucune écriture backend.

Captures représentatives : [FR clair320 confirmé](fr-light-320-confirmed.png), [FR sombre320 sans confirmation](fr-dark-320-zero.png), [zoom natif FR320CSS](zoom-fr-320.png). Pas de certification de contraste ou de rendu IBM Plex téléchargée.

## Défaut clavier distinct, préexistant aux libellés

[Avant](keyboard-before.json), quatre cas FR/EN à320/768 : Entrée cible le `summary`, est annulée (`defaultPrevented=true`), ouvre le menu du message et laisse `details.open=false`. Un clic après Échap ouvre le rapport. `MessageContextMenu.tsx` n’avait pas changé lors de la correction des libellés ; il ne s’agit pas d’une régression de traduction. [Capture avant](keyboard-before-fr-320.png).

Le correctif respecte d’abord `defaultPrevented`, réserve Entrée/Espace à l’ancre directement ciblée et conserve Maj+F10 depuis un descendant qui n’a pas consommé ce raccourci. Aucun changement aux gestes pointeur ou au placement du menu.

- [Avant :25tests composant, dont9rouges](unit-before.txt).
- [Après :41tests verts](unit-after.txt), soit25composant et16helper. Les cas ajoutés couvrent summary/bouton/champ, l’ancre, Maj+F10 et l’événement déjà consommé.
- [Après navigateur :4groupes](keyboard-after.json), FR/EN clair/sombre. Entrée ouvre le rapport intégral ; focus et même nœud conservés lors des redimensionnements320→768→390 et passage à deux confirmations ; Entrée referme. Aucun débordement documentaire. [Capture après](keyboard-after-fr-320.png).
- [Revue indépendante favorable](independent-review.md). Lint/format ciblés et diffcheck locaux : sortie0. Logs copiés avec normalisation des lignes vides finales uniquement.

## Limites et état

Preuves de composant isolé, pas de route IDE complète, navigation entre projets, API réelle ou production. WebKit non exécuté et refus de téléchargement antérieur non retenté. Les64tests du lot Agent n’ont pas été rejoués pour la seule recette des libellés. Premier montage Vite et CSS incomplet corrigés dans le harness avant les reçus finaux ; aucun de ces essais intermédiaires n’est ajouté aux comptes ci-dessus.

Serveur local20499 arrêté après vérification PID/startTicks ; port refusé et navigateurs fermés, [reçu de nettoyage](cleanup.json). Le parent assure le build/typecheck de l’intégration et décide la publication. Aucun état « testé live » revendiqué pour ce correctif.

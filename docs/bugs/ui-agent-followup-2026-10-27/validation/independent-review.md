# Revue indépendante — Agent Escape et restauration initiale

Base examinée : `6de692cf5d58f7e084c117ed8fd58c7c6e74cd6a` (main, #819 livré). Revue finale du diff local le 27 octobre 2026.

**Avis : GO sur le périmètre revu, aucun défaut bloquant identifié.**

- `AgentPowerControls.tsx`, `FeuilleDesModes.tsx`, `useKeybindings.ts` : Escape est laissé au propriétaire uniquement pour les réglages ouverts, leur portail et le retour du focus sur `body` après disparition d’un contrôle. Le gestionnaire respecte `defaultPrevented`, ferme les réglages et rend le focus au déclencheur. Les raccourcis extérieurs et Ctrl+S conservent leur routage ; le marqueur de la racine disparaît à la fermeture. Aucun changement de palette #768.
- `BaseChat.tsx` : retrait ciblé de la restauration tardive du seul champ legacy `ui.mobilePanel`, cohérent avec le contrat Agent par défaut et priorité de l’URL. Le chemin desktop ne passait déjà pas dans cette branche. Aucune modification des autres champs de mémoire.
- `AgentPowerControls.escape.spec.tsx` : vrais composants et hook global ; fermeture du sous-panneau, priorité enfant, retour du focus, absence de Stop, réouverture et cas `body` couverts. Vérification indépendante exécutée : **24 tests réussis dans trois suites** (ce fichier, `useKeybindings.dialog.spec.tsx`, `FeuilleDesModes.spec.tsx`).
- `responsive-ide.spec.ts` : cinq scénarios ajoutés, dont la matrice 320/768/1180/1440. Réponse mémoire explicitement retardée ; attente de la marque applicative `layout-restored` puis de deux frames avant les assertions principales, après rechargement et après sélection pendant la requête. L’URL Preview est opposée à une mémoire Files ; retour/avance et cohérence onglet/corps sont vérifiés. Les assertions antérieures ne sont pas affaiblies.

Limites : les nouveaux E2E nécessitant le backend isolé n’ont pas été exécutés par ce réviseur. La recette navigateur finale, le build et les autres validations sont suivis séparément par le parent ; aucun succès n’est déduit ici de leur simple annonce. Pas de recette production, d’appareil Safari physique ni de certification globale. L’ouverture simultanée de plusieurs instances des réglages n’a pas été exercée ; aucun parcours mono-instance examiné ne présente de défaut bloquant.

Aucune modification produit, publication ou fusion effectuée par le réviseur. Ce fichier est le seul livrable écrit lors de la revue.

## Complément de revue — hauteur du second panneau

GO conservé sur le delta local de `FeuilleDesModes.tsx` : le `maxHeight` tient désormais compte du `top` effectivement calculé et de la marge `MARGE_BORD` déjà partagée par le placement. La borne CSS `max(0px, …)` évite une hauteur maximale négative. La règle existante `.bolt-feuille-second` conserve `overflow-y: auto` et son défilement contenu ; aucun contrôle n’est retiré et la disposition mobile en feuille n’est pas modifiée. La mesure transmise par le parent (bas à906,09px dans un viewport de900px avant complément) est cohérente avec la cause : l’ancien maximum ignorait le décalage vertical réel.

Revue de code uniquement pour ce complément, sans nouvelle suite redondante. Le confinement à1px, l’accès au dernier contrôle par défilement et le zoom natif200% restent à vérifier par la recette navigateur du parent ; ils ne sont pas déclarés acquis dans ce rapport.

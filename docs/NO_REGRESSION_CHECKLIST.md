# Checklist anti-regression Bolt

Cette checklist doit etre utilisee avant et apres toute modification touchant runtime, workbench, chat, parser, providers ou templates.

## Verification automatique

- `pnpm run test`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run lint` si la modification touche du code app.
- `pnpm electron:build:deps` si la modification touche Electron main/preload.
- `pnpm electron:build:renderer` si la modification touche renderer/config Electron.

## Chat IA

- La page `/` charge `Chat`.
- Un nouveau message utilisateur part vers `/api/chat`.
- Le streaming s'affiche progressivement.
- Stop/abort fonctionne.
- Les erreurs provider/API key sont affichees.
- Le mode `build` fonctionne.
- Le mode `discuss` fonctionne.
- Les messages sont persistants dans l'historique.
- La restauration d'un chat existant ne reexecute pas incorrectement les anciens artifacts.
- Les uploads image/screenshot restent utilisables.
- Web search et MCP restent disponibles si configures.

## Parser et actions IA

- Les balises `<boltArtifact>` sont detectees.
- Les balises `<boltAction type="file">` sont streamees dans l'editeur.
- Les actions `file` creent les dossiers parents.
- Les actions `file` sauvegardent le contenu final.
- Les actions `shell` s'executent dans le terminal Bolt.
- Les actions `start` ne bloquent pas la suite du flux.
- Les actions `build` capturent la sortie et le code de sortie.
- Les actions `supabase` gardent leur comportement actuel.
- `EnhancedStreamingMessageParser` continue a wrapper les blocs de code quand necessaire.
- Les fichiers verrouilles ne sont pas modifies par les actions IA.

## Editeur

- Selectionner un fichier dans `FileTree` ouvre le bon document.
- Modifier un fichier marque l'etat unsaved.
- Save ecrit dans le runtime FS.
- Reset restaure le contenu runtime.
- Les fichiers binaires ne cassent pas CodeMirror.
- Les themes clair/sombre restent appliques.
- Les positions de scroll sont conservees.
- Les raccourcis de sauvegarde restent actifs.

## File explorer et FS virtuel

- Les dossiers/fichiers apparaissent apres import/template/action IA.
- Les suppressions fichier/dossier persistent dans l'UI.
- Les locks fichier/dossier s'affichent.
- Les fichiers sous `node_modules`, `.next`, `.astro` restent masques selon les regles actuelles.
- La recherche fonctionne.
- Les breadcrumbs naviguent correctement.
- Les modifications calculees par `getFileModifcations` restent coherentes.
- Export zip contient les fichiers attendus.

## Terminal

- Le terminal Bolt s'attache au runtime au chargement.
- Les terminaux additionnels peuvent etre ouverts et fermes.
- Resize propage cols/rows au process.
- Reset terminal relance une session.
- Les commandes IA attendent la fin de commande.
- Les commandes interactives simples restent utilisables.
- Les sorties ANSI/OSC ne polluent pas les erreurs utilisateur.
- La detection Expo URL continue d'ouvrir le QR modal.

## Preview

- Un serveur dev expose un port dans `PortDropdown`.
- Le preview iframe charge l'URL active.
- Changer de port fonctionne.
- Reload fonctionne.
- Fullscreen fonctionne.
- Device mode fonctionne.
- Screenshot selection fonctionne.
- Inspector/selection element fonctionne.
- Les erreurs preview remontent dans `actionAlert`.
- Les previews se ferment quand le port est ferme.

## Templates projets

- `StarterTemplates` affiche les templates.
- `autoSelectTemplate` peut etre active/desactive.
- `selectStarterTemplate` peut appeler `/api/llmcall`.
- `getTemplates` peut appeler `/api/github-template`.
- Les fichiers du template sont transformes en `boltAction type="file"`.
- Les fichiers `.bolt/ignore` restent respectes.
- Les instructions `.bolt/prompt` restent ajoutees au message utilisateur.
- L'import Git URL fonctionne.
- L'import dossier local fonctionne.

## Providers IA

- `/api/models` retourne providers et modeles.
- `/api/models/$provider` retourne les modeles dynamiques si supportes.
- Les cles API cookies restent lues.
- Les settings providers restent persistants.
- Les providers locaux Ollama/LM Studio/OpenAI-like restent configurables.
- Les providers cloud existants restent enregistres par `LLMManager`.
- Le fallback modele/provider reste coherent.

## Deploy et export

- Netlify deploy lit les fichiers depuis le runtime.
- Vercel deploy lit les fichiers depuis le runtime.
- Build deploy capture les sorties.
- Push GitHub/GitLab depuis `workbenchStore.pushToRepository` fonctionne si configure.
- Sync local via File System Access API fonctionne.

## Electron desktop

- `pnpm electron:dev` demarre le renderer et la fenetre.
- Cookies/settings sont conserves.
- Menu desktop fonctionne.
- Auto-update n'est pas casse.
- Les configs main/preload buildent.
- Le mode runtime choisi ne suppose pas une API navigateur absente dans Electron.

## Vite/Wrangler/Docker

- `pnpm run dev` demarre en local.
- `pnpm run build` produit `build/client`.
- `pnpm run start` sert via Wrangler Pages.
- `pnpm run dockerbuild` construit l'image development.
- `pnpm run dockerbuild:prod` construit l'image production.
- `docker-compose --profile development up` expose le port 5173.
- `docker-compose --profile production up` expose le port 5173.
- Les variables providers restent transmises.

## Runtime replacement

Pour toute future introduction de `RuntimeAdapter` :

- `RUNTIME_MODE=webcontainer` conserve le comportement actuel.
- `RUNTIME_MODE=remote-kubernetes` n'est active que quand l'adapter distant est complet.
- En production commerciale, le defaut est `remote-kubernetes`.
- WebContainer reste disponible uniquement pour local/dev/fallback licencie.
- Le choix runtime est centralise dans une factory.
- Aucun composant IDE n'importe directement l'adapter concret.
- Les prompts deviennent runtime-aware seulement apres disponibilite de l'adapter.

## IDE Bolt a conserver absolument

Ne pas supprimer :

- Workbench, editor, file explorer, terminal, preview, diff, search, locks, inspector.
- Chat, messages, artifacts, model selector, API key manager, starter templates.
- Stores workbench/files/editor/terminal/previews/chat/settings.
- Parser Bolt, enhanced parser et action runner.
- Providers IA existants.
- Templates existants.
- Scripts Electron et configs Vite/Wrangler/Docker.

## Critere de sortie

Une modification est acceptable seulement si :

- Les fichiers modifies sont limites au scope prevu.
- Les tests existants passent ou l'echec est documente avec cause non liee.
- Le typecheck passe ou l'echec est documente avec cause non liee.
- Aucun comportement existant n'est volontairement change sans document de migration.
- Les composants Bolt listes comme a conserver sont toujours presents.

import { generateId, type Message } from 'ai';
import ignore from 'ignore';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import { ClientOnly } from 'remix-utils/client-only';
import { decodeClonedFiles } from './decode-cloned-files';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { LoadingOverlay } from '~/components/ui/LoadingOverlay';
import { useGit } from '~/lib/hooks/useGit';
import { getProjectCommandsCopy } from '~/lib/i18n/catalogs/project-commands';
import { formatRepositorySelectorCopy, getRepositorySelectorCopy } from '~/lib/i18n/catalogs/repository-selector';
import { useChatHistory } from '~/lib/persistence';
import {
  createCommandsMessage,
  detectProjectCommands,
  escapeBoltTags,
  escapeBoltActionAttribute,
} from '~/utils/projectCommands';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.github/**',
  '.vscode/**',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.png',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',

  // Include this so npm install runs much faster '**/*lock.json',
  '**/*lock.yaml',
];

export function GitUrlImport() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getRepositorySelectorCopy(language);
  const projectCopy = getProjectCommandsCopy(language);
  const [searchParams] = useSearchParams();
  const { ready: historyReady, importChat } = useChatHistory();
  const { ready: gitReady, gitClone } = useGit();
  const [imported, setImported] = useState(false);
  const [loading, setLoading] = useState(true);

  const importRepo = useCallback(
    async (repoUrl?: string) => {
      if (!gitReady || !historyReady) {
        return;
      }

      if (repoUrl) {
        const ig = ignore().add(IGNORE_PATTERNS);

        try {
          const { workdir, data } = await gitClone(repoUrl);

          if (importChat) {
            const filePaths = Object.keys(data).filter((filePath) => !ig.ignores(filePath));

            const fileContents = decodeClonedFiles(filePaths, data);

            const commands = await detectProjectCommands(fileContents, language);
            const commandsMessage = createCommandsMessage(commands, language);

            const filesMessage: Message = {
              role: 'assistant',
              content: `${formatRepositorySelectorCopy(copy['repositorySelector.clone.chatCloning'], {
                url: repoUrl,
                workdir,
              })}
<boltArtifact id="imported-files" title="${escapeBoltActionAttribute(copy['repositorySelector.clone.artifactTitle'])}" type="bundled">
${fileContents
  .map(
    (file) =>
      `<boltAction type="file" filePath="${escapeBoltActionAttribute(file.path)}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>`,
              id: generateId(),
              createdAt: new Date(),
            };

            const messages = [filesMessage];

            if (commandsMessage) {
              messages.push({
                role: 'user',
                id: generateId(),
                content: projectCopy['projectCommands.setupPrompt'],
              });
              messages.push(commandsMessage);
            }

            const repositoryName = repoUrl.split('/').filter(Boolean).at(-1) ?? repoUrl;

            await importChat(
              formatRepositorySelectorCopy(copy['repositorySelector.clone.projectTitle'], { name: repositoryName }),
              messages,
              { gitUrl: repoUrl },
            );
          }

          /*
           * This flow renders <Chat /> inline (no navigation away) on success, so the
           * blocking "cloning…" overlay must be cleared here — otherwise it stays mounted
           * forever and permanently obscures the freshly imported project.
           */
          setLoading(false);
        } catch (error) {
          console.error('Error during import:', error);
          toast.error(copy['repositorySelector.clone.failed']);
          setLoading(false);
          window.location.href = '/';

          return;
        }
      }
    },
    [copy, gitClone, gitReady, historyReady, importChat, language, projectCopy],
  );

  useEffect(() => {
    if (!historyReady || !gitReady || imported) {
      return;
    }

    const url = searchParams.get('url');

    if (!url) {
      window.location.href = '/';
      return;
    }

    void importRepo(url).catch((error) => {
      console.error('Error importing repo:', error);
      toast.error(copy['repositorySelector.clone.failed']);
      setLoading(false);
      window.location.href = '/';
    });
    setImported(true);
  }, [copy, gitReady, historyReady, importRepo, imported, searchParams]);

  return (
    <ClientOnly fallback={<BaseChat />}>
      {() => (
        <>
          <Chat />
          {loading && <LoadingOverlay message={copy['repositorySelector.clone.loading']} />}
        </>
      )}
    </ClientOnly>
  );
}

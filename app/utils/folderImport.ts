import type { Message } from 'ai';
import { generateId } from './fileUtils';
import {
  detectProjectCommands,
  createCommandsMessage,
  escapeBoltTags,
  escapeBoltActionAttribute,
} from './projectCommands';
import {
  formatImportFolderButtonCopy,
  formatImportFolderButtonPlural,
  getImportFolderButtonCopy,
} from '~/lib/i18n/catalogs/import-folder-button';
import { getProjectCommandsCopy } from '~/lib/i18n/catalogs/project-commands';

export type FileArtifact = { content: string; path: string };

/**
 * Partition the settled results of reading every selected file into the
 * successfully-read artifacts and the relative paths of the files that failed.
 *
 * A single FileReader error (file moved/deleted between selection and read, a
 * permission/IO error, or a transient abort) must NOT abort the entire import,
 * so the caller uses Promise.allSettled and we simply skip the failed entries.
 */
export const partitionFileReads = (
  files: File[],
  results: PromiseSettledResult<FileArtifact>[],
): { artifacts: FileArtifact[]; skippedPaths: string[] } => {
  const artifacts: FileArtifact[] = [];
  const skippedPaths: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      artifacts.push(result.value);
    } else {
      const file = files[index];

      const relativePath =
        file?.webkitRelativePath?.split('/').slice(1).join('/') || file?.name || `file #${index + 1}`;
      skippedPaths.push(relativePath);
    }
  });

  return { artifacts, skippedPaths };
};

export const createChatFromFolder = async (
  files: File[],
  binaryFiles: string[],
  folderName: string,
  language?: string | null,
): Promise<Message[]> => {
  const copy = getImportFolderButtonCopy(language);
  const projectCopy = getProjectCommandsCopy(language);

  const fileReadResults = await Promise.allSettled(
    files.map(async (file) => {
      return new Promise<FileArtifact>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const content = reader.result as string;
          const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
          resolve({
            content,
            path: relativePath,
          });
        };
        reader.onerror = () => reject(reader.error ?? Object.assign(new Error(), { code: 'FOLDER_FILE_READ_FAILED' }));
        reader.readAsText(file);
      });
    }),
  );

  const { artifacts: fileArtifacts, skippedPaths: unreadablePaths } = partitionFileReads(files, fileReadResults);

  const commands = await detectProjectCommands(fileArtifacts, language);
  const commandsMessage = createCommandsMessage(commands, language);

  const fileList = (paths: string[]) => paths.map((path) => `- ${escapeBoltTags(path)}`).join('\n');

  const binaryFilesMessage =
    binaryFiles.length > 0
      ? `\n\n${formatImportFolderButtonPlural(language, binaryFiles.length, {
          one: copy['importFolderButton.chat.binarySkipped_one'],
          other: copy['importFolderButton.chat.binarySkipped_other'],
        })}\n${fileList(binaryFiles)}`
      : '';

  const unreadableFilesMessage =
    unreadablePaths.length > 0
      ? `\n\n${formatImportFolderButtonPlural(language, unreadablePaths.length, {
          one: copy['importFolderButton.chat.unreadableSkipped_one'],
          other: copy['importFolderButton.chat.unreadableSkipped_other'],
        })}\n${fileList(unreadablePaths)}`
      : '';

  const safeFolderName = escapeBoltTags(folderName);

  const filesMessage: Message = {
    role: 'assistant',
    content: `${formatImportFolderButtonCopy(copy['importFolderButton.chat.imported'], {
      folderName: safeFolderName,
    })}${binaryFilesMessage}${unreadableFilesMessage}

<boltArtifact id="imported-files" title="${copy['importFolderButton.chat.artifactTitle']}" type="bundled" >
${fileArtifacts
  .map(
    (file) => `<boltAction type="file" filePath="${escapeBoltActionAttribute(file.path)}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n\n')}
</boltArtifact>`,
    id: generateId(),
    createdAt: new Date(),
  };

  const userMessage: Message = {
    role: 'user',
    id: generateId(),
    content: formatImportFolderButtonCopy(copy['importFolderButton.chat.userPrompt'], { folderName }),
    createdAt: new Date(),
  };

  const messages = [userMessage, filesMessage];

  if (commandsMessage) {
    messages.push({
      role: 'user',
      id: generateId(),
      content: projectCopy['projectCommands.setupPrompt'],
    });
    messages.push(commandsMessage);
  }

  return messages;
};

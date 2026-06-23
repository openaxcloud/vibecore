import type { Message } from 'ai';
import { generateId } from './fileUtils';
import {
  detectProjectCommands,
  createCommandsMessage,
  escapeBoltTags,
  escapeBoltActionAttribute,
} from './projectCommands';

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
): Promise<Message[]> => {
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
        reader.onerror = () => reject(reader.error ?? new Error(`Failed to read file: ${file.name}`));
        reader.readAsText(file);
      });
    }),
  );

  const { artifacts: fileArtifacts, skippedPaths: unreadablePaths } = partitionFileReads(files, fileReadResults);

  const commands = await detectProjectCommands(fileArtifacts);
  const commandsMessage = createCommandsMessage(commands);

  const binaryFilesMessage =
    binaryFiles.length > 0
      ? `\n\nSkipped ${binaryFiles.length} binary files:\n${binaryFiles.map((f) => `- ${f}`).join('\n')}`
      : '';

  const unreadableFilesMessage =
    unreadablePaths.length > 0
      ? `\n\nSkipped ${unreadablePaths.length} unreadable files:\n${unreadablePaths.map((f) => `- ${f}`).join('\n')}`
      : '';

  const filesMessage: Message = {
    role: 'assistant',
    content: `I've imported the contents of the "${folderName}" folder.${binaryFilesMessage}${unreadableFilesMessage}

<boltArtifact id="imported-files" title="Imported Files" type="bundled" >
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
    content: `Import the "${folderName}" folder`,
    createdAt: new Date(),
  };

  const messages = [userMessage, filesMessage];

  if (commandsMessage) {
    messages.push({
      role: 'user',
      id: generateId(),
      content: 'Setup the codebase and Start the application',
    });
    messages.push(commandsMessage);
  }

  return messages;
};

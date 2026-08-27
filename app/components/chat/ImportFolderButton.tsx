import type { Message } from 'ai';
import { useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { Button } from '~/components/ui/Button';
import {
  formatImportFolderButtonCopy,
  formatImportFolderButtonNumber,
  formatImportFolderButtonPlural,
  getImportFolderButtonCopy,
  getImportFolderButtonSafeError,
} from '~/lib/i18n/catalogs/import-folder-button';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';
import { MAX_FILES, isBinaryFile, shouldIncludeFile } from '~/utils/fileUtils';
import { createChatFromFolder } from '~/utils/folderImport';

interface ImportFolderButtonProps {
  className?: string;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
}

interface DirectoryInputAttributes extends InputHTMLAttributes<HTMLInputElement> {
  directory: string;
  webkitdirectory: string;
}

const directoryInputAttributes: Pick<DirectoryInputAttributes, 'directory' | 'webkitdirectory'> = {
  directory: '',
  webkitdirectory: '',
};

function getRelativeFilePath(file: File): string {
  const browserPath = file.webkitRelativePath;

  if (!browserPath) {
    return file.name;
  }

  const relativePath = browserPath.split('/').slice(1).join('/');

  return relativePath || file.name;
}

function getSelectedFolderName(file: File | undefined): string | undefined {
  if (!file?.webkitRelativePath) {
    return undefined;
  }

  return file.webkitRelativePath.split('/')[0] || undefined;
}

export function ImportFolderButton({ className, importChat }: ImportFolderButtonProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getImportFolderButtonCopy(language);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const unavailableDescriptionId = `${inputId}-unavailable`;
  const [isLoading, setIsLoading] = useState(false);
  const isUnavailable = !importChat;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const allFiles = Array.from(input.files ?? []);

    /* Reset immediately so choosing the same folder again always emits change. */
    input.value = '';

    if (!importChat) {
      toast.error(copy['importFolderButton.unavailable']);

      return;
    }

    const filteredFiles = allFiles.filter((file) => shouldIncludeFile(getRelativeFilePath(file)));

    if (filteredFiles.length === 0) {
      logStore.logError(copy['importFolderButton.noValidFiles'], undefined, {
        folderName: getSelectedFolderName(allFiles[0]),
      });
      toast.error(copy['importFolderButton.noValidFiles']);

      return;
    }

    if (filteredFiles.length > MAX_FILES) {
      const tooManyFilesMessage = formatImportFolderButtonCopy(copy['importFolderButton.tooManyFiles'], {
        count: formatImportFolderButtonNumber(filteredFiles.length, language),
        max: formatImportFolderButtonNumber(MAX_FILES, language),
      });

      logStore.logError(tooManyFilesMessage, undefined, {
        fileCount: filteredFiles.length,
        maxFiles: MAX_FILES,
      });
      toast.error(tooManyFilesMessage);

      return;
    }

    const selectedFolderName = getSelectedFolderName(filteredFiles[0]);
    const folderName = selectedFolderName ?? copy['importFolderButton.folderFallback'];

    setIsLoading(true);

    const loadingToast = toast.loading(
      selectedFolderName
        ? formatImportFolderButtonCopy(copy['importFolderButton.loadingNamed'], { folderName })
        : copy['importFolderButton.loading'],
    );

    try {
      const fileChecks = await Promise.all(
        filteredFiles.map(async (file) => ({
          file,
          isBinary: await isBinaryFile(file),
        })),
      );

      const textFiles = fileChecks.filter(({ isBinary }) => !isBinary).map(({ file }) => file);

      const binaryFilePaths = fileChecks
        .filter(({ isBinary }) => isBinary)
        .map(({ file }) => getRelativeFilePath(file));

      if (textFiles.length === 0) {
        logStore.logError(copy['importFolderButton.noTextFiles'], undefined, { folderName });
        toast.error(copy['importFolderButton.noTextFiles']);

        return;
      }

      if (binaryFilePaths.length > 0) {
        const binarySkippedMessage = formatImportFolderButtonPlural(language, binaryFilePaths.length, {
          one: copy['importFolderButton.binarySkipped_one'],
          other: copy['importFolderButton.binarySkipped_other'],
        });

        logStore.logWarning(binarySkippedMessage, {
          folderName,
          binaryCount: binaryFilePaths.length,
        });
        toast.info(binarySkippedMessage);
      }

      const messages = await createChatFromFolder(textFiles, binaryFilePaths, folderName, language);

      await importChat(folderName, [...messages]);

      const successMessage = selectedFolderName
        ? formatImportFolderButtonCopy(copy['importFolderButton.successNamed'], { folderName })
        : copy['importFolderButton.success'];

      logStore.logSystem(successMessage, {
        folderName,
        textFileCount: textFiles.length,
        binaryFileCount: binaryFilePaths.length,
      });
      toast.success(successMessage);
    } catch (error) {
      logStore.logError(copy['importFolderButton.failed'], undefined, { folderName });
      console.error('Failed to import folder:', error);
      toast.error(getImportFolderButtonSafeError(language, error));
    } finally {
      setIsLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        id={inputId}
        className="hidden"
        aria-label={copy['importFolderButton.selectLabel']}
        disabled={isLoading || isUnavailable}
        onChange={handleFileChange}
        {...directoryInputAttributes}
      />
      <Button
        type="button"
        onClick={() => {
          if (isUnavailable) {
            toast.error(copy['importFolderButton.unavailable']);

            return;
          }

          inputRef.current?.click();
        }}
        title={isUnavailable ? copy['importFolderButton.unavailable'] : copy['importFolderButton.trigger']}
        aria-controls={inputId}
        aria-describedby={isUnavailable ? unavailableDescriptionId : undefined}
        aria-busy={isLoading}
        aria-disabled={isUnavailable || undefined}
        variant="default"
        size="lg"
        className={classNames(
          'gap-2 border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
          'text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
          '!h-auto min-h-11 w-full !min-w-0 max-w-full justify-center px-4 py-2 !whitespace-normal',
          'transition-all duration-200 ease-in-out motion-reduce:transition-none sm:w-auto sm:!min-w-[120px]',
          isUnavailable && 'cursor-not-allowed opacity-50',
          className,
        )}
        disabled={isLoading}
      >
        <span
          className={classNames(
            'h-4 w-4 shrink-0',
            isLoading ? 'i-ph:spinner-gap-bold animate-spin motion-reduce:animate-none' : 'i-ph:upload-simple',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words text-center [overflow-wrap:anywhere]" aria-live="polite">
          {copy[isLoading ? 'importFolderButton.loading' : 'importFolderButton.trigger']}
        </span>
      </Button>
      {isUnavailable ? (
        <span id={unavailableDescriptionId} className="sr-only">
          {copy['importFolderButton.unavailable']}
        </span>
      ) : null}
    </>
  );
}

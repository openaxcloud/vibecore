import type { Message } from 'ai';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { ImportFolderButton } from '~/components/chat/ImportFolderButton';
import { Button } from '~/components/ui/Button';
import {
  formatImportButtonsCopy,
  getImportButtonsCopy,
  getImportButtonsSafeError,
  type ImportButtonsErrorCode,
} from '~/lib/i18n/catalogs/import-buttons';
import { classNames } from '~/utils/classNames';

type ImportChat = (description: string, messages: Message[]) => Promise<void>;

type ChatData = {
  messages: Message[];
  description?: string;
};

type ChatImportParseResult =
  | { ok: true; data: ChatData }
  | { ok: false; errorCode: Extract<ImportButtonsErrorCode, 'invalidFormat' | 'parseFailed'> };

type ImportFeedback = { tone: 'error'; errorCode: ImportButtonsErrorCode } | { tone: 'success'; fileName: string };

interface ImportButtonsSurfaceProps {
  importChat?: ImportChat;
}

/** Parse the standard E-Code export without translating or rewriting any imported values. */
export function parseChatImportJson(content: string): ChatImportParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, errorCode: 'parseFailed' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errorCode: 'invalidFormat' };
  }

  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.messages)) {
    return { ok: false, errorCode: 'invalidFormat' };
  }

  if (record.description !== undefined && typeof record.description !== 'string') {
    return { ok: false, errorCode: 'invalidFormat' };
  }

  return {
    ok: true,
    data: {
      messages: record.messages as Message[],
      ...(typeof record.description === 'string' ? { description: record.description } : {}),
    },
  };
}

export async function readChatImportFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/*
 * BaseChat still calls this legacy render helper as a function. Return a real child component so
 * locale/state hooks belong to a stable React component rather than to BaseChat's hook order.
 */
export function ImportButtons(importChat: ImportChat | undefined) {
  return <ImportButtonsSurface importChat={importChat} />;
}

function ImportButtonsSurface({ importChat }: ImportButtonsSurfaceProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getImportButtonsCopy(language);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const unavailableDescriptionId = `${inputId}-unavailable`;
  const [isImporting, setIsImporting] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const isUnavailable = !importChat;

  const loadingLabel = activeFileName
    ? formatImportButtonsCopy(copy['importButtons.chat.loadingNamed'], { fileName: activeFileName })
    : copy['importButtons.chat.loading'];
  const feedbackMessage =
    feedback?.tone === 'error'
      ? getImportButtonsSafeError(feedback.errorCode, language)
      : feedback?.tone === 'success'
        ? feedback.fileName
          ? formatImportButtonsCopy(copy['importButtons.chat.successNamed'], { fileName: feedback.fileName })
          : copy['importButtons.chat.success']
        : null;

  const showError = (errorCode: ImportButtonsErrorCode, error?: unknown) => {
    const currentLanguage = i18n.resolvedLanguage ?? i18n.language;
    const message = getImportButtonsSafeError(errorCode, currentLanguage, error);

    setFeedback({ errorCode, tone: 'error' });
    toast.error(message);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    /* Reset immediately so selecting the same export again always emits a change event. */
    input.value = '';

    if (!file) {
      return;
    }

    if (!importChat) {
      showError('unavailable');

      return;
    }

    setIsImporting(true);
    setActiveFileName(file.name);
    setFeedback(null);

    try {
      let content: string;

      try {
        content = await readChatImportFile(file);
      } catch (error) {
        showError('readFailed', error);

        return;
      }

      const parsed = parseChatImportJson(content);

      if (!parsed.ok) {
        showError(parsed.errorCode);

        return;
      }

      try {
        const currentCopy = getImportButtonsCopy(i18n.resolvedLanguage ?? i18n.language);

        await importChat(
          parsed.data.description ?? currentCopy['importButtons.chat.defaultDescription'],
          parsed.data.messages,
        );
      } catch (error) {
        showError('importFailed', error);

        return;
      }

      const currentCopy = getImportButtonsCopy(i18n.resolvedLanguage ?? i18n.language);

      const successMessage = file.name
        ? formatImportButtonsCopy(currentCopy['importButtons.chat.successNamed'], { fileName: file.name })
        : currentCopy['importButtons.chat.success'];

      setFeedback({ fileName: file.name, tone: 'success' });
      toast.success(successMessage);
    } finally {
      setIsImporting(false);
      setActiveFileName(null);
    }
  };

  const buttonDescriptionId = feedback ? feedbackId : isUnavailable ? unavailableDescriptionId : undefined;

  return (
    <div className="flex min-w-0 max-w-full flex-1 basis-80 flex-col items-center justify-center">
      <input
        ref={inputRef}
        type="file"
        id={inputId}
        className="hidden"
        accept=".json,application/json"
        aria-label={copy['importButtons.chat.selectLabel']}
        disabled={isImporting || isUnavailable}
        onChange={handleFileChange}
      />

      <div className="flex w-full min-w-0 max-w-2xl flex-col items-center gap-3 text-center">
        <div
          role="group"
          aria-label={copy['importButtons.group.label']}
          className="flex w-full min-w-0 flex-wrap justify-center gap-2"
        >
          <Button
            type="button"
            onClick={() => {
              if (isUnavailable) {
                showError('unavailable');

                return;
              }

              inputRef.current?.click();
            }}
            title={isUnavailable ? copy['importButtons.chat.unavailable'] : copy['importButtons.chat.trigger']}
            aria-controls={inputId}
            aria-describedby={buttonDescriptionId}
            aria-busy={isImporting}
            aria-disabled={isUnavailable || undefined}
            variant="default"
            size="lg"
            className={classNames(
              'gap-2 border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
              'text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
              '!h-auto min-h-[44px] min-w-0 max-w-full flex-1 basis-40 justify-center px-4 py-2 !whitespace-normal',
              'transition-colors duration-200 ease-in-out motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
              isUnavailable && 'cursor-not-allowed opacity-50',
            )}
            disabled={isImporting}
          >
            <span
              className={classNames(
                'h-4 w-4 shrink-0',
                isImporting ? 'i-ph:spinner-gap-bold motion-safe:animate-spin' : 'i-ph:upload-simple',
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 break-words text-center [overflow-wrap:anywhere]" aria-live="polite">
              {isImporting ? loadingLabel : copy['importButtons.chat.trigger']}
            </span>
          </Button>

          <ImportFolderButton
            importChat={importChat}
            className={classNames(
              'min-h-[44px] min-w-0 max-w-full flex-1 basis-40',
              'border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
              'text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
              'transition-colors duration-200 ease-in-out motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
            )}
          />
        </div>

        {feedback ? (
          <p
            id={feedbackId}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={classNames(
              'm-0 max-w-full text-xs leading-5 [overflow-wrap:anywhere]',
              feedback.tone === 'error' ? 'text-bolt-elements-icon-error' : 'text-bolt-elements-icon-success',
            )}
          >
            {feedbackMessage}
          </p>
        ) : isUnavailable ? (
          <span id={unavailableDescriptionId} className="sr-only">
            {copy['importButtons.chat.unavailable']}
          </span>
        ) : null}
      </div>
    </div>
  );
}

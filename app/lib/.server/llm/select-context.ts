import { generateText, type CoreTool, type GenerateTextResult, type Message } from 'ai';
import ignore from 'ignore';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import { removeUnsupportedModelSettings } from './model-compat';
import { resolveUsableProvider } from './provider-credentials';
import { createFilesContext, extractCurrentContext, extractPropertiesFromMessage, simplifyBoltActions } from './utils';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

// Common patterns to ignore, similar to .gitignore

const ig = ignore().add(IGNORE_PATTERNS);
const logger = createScopedLogger('select-context');

/**
 * The `ignore` package throws ("path should be a `path.relative()`d string")
 * when handed an absolute path. File maps are keyed by the workspace root
 * `/home/project/<rel>`, but the bare root `/home/project` (no trailing slash)
 * and a leading `/` both slip past a naive `.replace('/home/project/', '')`,
 * leaving an absolute string that crashed the whole chat stream
 * (code=UNKNOWN). Strip the prefix with or without the trailing slash and any
 * remaining leading slash so `ig.ignores()` always receives a relative path.
 */
function toRelativeProjectPath(absoluteOrRelative: string): string {
  return absoluteOrRelative.replace(/^\/home\/project\/?/, '').replace(/^\/+/, '');
}

/**
 * `ig.ignores('')` (the workspace root itself) is meaningless and some `ignore`
 * versions reject an empty string — treat an empty relative path as "keep".
 */
function isPathAllowed(relPath: string): boolean {
  return relPath.length > 0 && !ig.ignores(relPath);
}

export async function selectContext(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  files: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  summary: string;
  abortSignal?: AbortSignal;
  onFinish?: (
    resp: GenerateTextResult<Record<string, CoreTool<any, any>>, never>,
    identity: { provider: string; model: string },
  ) => void;
  onProviderStart?: () => Promise<void>;
}) {
  const {
    messages,
    env: serverEnv,
    apiKeys,
    files,
    providerSettings,
    summary,
    abortSignal,
    onFinish,
    onProviderStart,
  } = props;

  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;

  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      /*
       * Coerce parts-array content to a string before the string operations
       * below (they'd throw on an array), joining any text parts.
       */
      const rawContent = message.content as unknown;

      let content =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((part: any) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('')
            : '';

      content = simplifyBoltActions(content);

      // Global flag: strip ALL thought/think blocks (a turn can contain several).
      content = content.replace(/<div class="__boltThought__">.*?<\/div>/gs, '');
      content = content.replace(/<think>.*?<\/think>/gs, '');

      return { ...message, content };
    }

    return message;
  });

  // Fall back to a credentialed provider when the requested one has no key (avoids a fatal auth error).
  const resolved = resolveUsableProvider({
    requestedProvider: currentProvider,
    requestedModel: currentModel,
    apiKeys,
    serverEnv: serverEnv as Record<string, string> | undefined,
  });

  const provider = resolved.provider;
  currentModel = resolved.model;

  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);

  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const { codeContext } = extractCurrentContext(processedMessages);

  let filePaths = getFilePaths(files || {});
  filePaths = filePaths.filter((x) => isPathAllowed(toRelativeProjectPath(x)));

  let context = '';

  const currrentFiles: string[] = [];
  const contextFiles: FileMap = {};

  if (codeContext?.type === 'codeContext') {
    const selected = selectContextBufferFiles(files || {}, codeContext.files);
    Object.assign(contextFiles, selected.contextFiles);
    currrentFiles.push(...selected.currentFiles);
    context = createFilesContext(contextFiles);
  }

  const summaryText = `Here is the summary of the chat till now: ${summary}`;

  const extractTextContent = (message: Message) =>
    Array.isArray(message.content)
      ? message.content
          .filter((item) => item.type === 'text')
          .map((item) => (item as { text?: string }).text ?? '')
          .join('\n')
      : message.content;

  const lastUserMessage = processedMessages.filter((x) => x.role == 'user').pop();

  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  // select files from the list of code file from the project that might be useful for the current request from the user
  await onProviderStart?.();

  const resp = await generateText({
    system: `
        You are a software engineer. You are working on a project. You have access to the following files:

        AVAILABLE FILES PATHS
        ---
        ${filePaths.map((path) => `- ${path}`).join('\n')}
        ---

        You have following code loaded in the context buffer that you can refer to:

        CURRENT CONTEXT BUFFER
        ---
        ${context}
        ---

        Now, you are given a task. You need to select the files that are relevant to the task from the list of files above.

        RESPONSE FORMAT:
        your response should be in following format:
---
<updateContextBuffer>
    <includeFile path="path/to/file"/>
    <excludeFile path="path/to/file"/>
</updateContextBuffer>
---
        * Your should start with <updateContextBuffer> and end with </updateContextBuffer>.
        * You can include multiple <includeFile> and <excludeFile> tags in the response.
        * You should not include any other text in the response.
        * You should not include any file that is not in the list of files above.
        * You should not include any file that is already in the context buffer.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        `,
    prompt: `
        ${summaryText}

        Users Question: ${extractTextContent(lastUserMessage)}

        update the context buffer with the files that are relevant to the task from the list of files above.

        CRITICAL RULES:
        * Only include relevant files in the context buffer.
        * context buffer should not include any file that is not in the list of files above.
        * context buffer is extremlly expensive, so only include files that are absolutely necessary.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        * Only 5 files can be placed in the context buffer at a time.
        * if the buffer is full, you need to exclude files that is not needed and include files that is relevent.

        `,
    model: removeUnsupportedModelSettings(
      provider.getModelInstance({
        model: modelDetails.name,
        serverEnv,
        apiKeys,
        providerSettings,
      }),
      modelDetails.name,
      modelDetails.provider,
    ),

    /*
     * Cap output — selectContext only emits a short include/exclude file list, but
     * without a ceiling a reasoning model can run to its full completion limit,
     * burning tokens/latency on every context-optimization pass (matches createSummary).
     */
    maxTokens: Math.min(modelDetails.maxTokenAllowed ?? 4000, 4000),

    // Abortable: clicking Stop must also cancel context selection, not keep burning tokens.
    ...(abortSignal ? { abortSignal } : {}),
  });

  const response = resp.text;

  if (onFinish) {
    onFinish(resp, { provider: provider.name, model: modelDetails.name });
  }

  const updateContextBuffer = response.match(/<updateContextBuffer>([\s\S]*?)<\/updateContextBuffer>/);

  if (!updateContextBuffer) {
    /*
     * The model omitted the <updateContextBuffer> wrapper — a common, recoverable
     * formatting deviation, not a fatal error. Mirror the zero-files fallback below:
     * best-effort context narrowing must not abort the user's chat turn. Returning
     * the existing context buffer keeps the previously-selected files AND lets the
     * caller retain the already-computed chat summary (its catch would discard both).
     */
    logger.warn('Context selection response missing <updateContextBuffer>; falling back to existing context buffer.');
    return contextFiles;
  }

  const includeFiles =
    updateContextBuffer[1]
      .match(/<includeFile path="(.*?)"/gm)
      ?.map((x) => x.replace('<includeFile path="', '').replace('"', '')) || [];
  const excludeFiles =
    updateContextBuffer[1]
      .match(/<excludeFile path="(.*?)"/gm)
      ?.map((x) => x.replace('<excludeFile path="', '').replace('"', '')) || [];

  const filteredFiles: FileMap = {};
  excludeFiles.forEach((path) => {
    /*
     * Normalize like the include loop: the model may echo a `/home/project/`-
     * prefixed path, but contextFiles is keyed by relative path, so deleting the
     * raw prefixed key was a silent no-op. Delete both forms to be safe.
     */
    const relativePath = path.startsWith('/home/project/') ? path.replace('/home/project/', '') : path;
    delete contextFiles[relativePath];
    delete contextFiles[path];
  });
  includeFiles.forEach((path) => {
    let fullPath = path;

    if (!path.startsWith('/home/project/')) {
      fullPath = `/home/project/${path}`;
    }

    if (!filePaths.includes(fullPath)) {
      logger.error(`File ${path} is not in the list of files above.`);
      return;

      // throw new Error(`File ${path} is not in the list of files above.`);
    }

    if (currrentFiles.includes(path)) {
      return;
    }

    /*
     * Store under the relative key (matching contextFiles above) even if the model echoed
     * back a `/home/project/`-prefixed path, so the merged FileMap has consistent keys.
     */
    const relativePath = path.startsWith('/home/project/') ? path.replace('/home/project/', '') : path;
    const dirent = files[fullPath] ?? files[path];

    if (!dirent) {
      /*
       * Membership passed against filePaths but the file content didn't resolve
       * (non-prefixed keys); skip rather than storing an undefined value that
       * silently drops the selected file's content downstream.
       */
      logger.error(`File ${path} resolved to no content; skipping.`);
      return;
    }

    filteredFiles[relativePath] = dirent;
  });

  /*
   * Merge the surviving prior context buffer (contextFiles, already minus the
   * explicit excludes) with the newly included files. Without this, emitting ANY
   * <includeFile> replaced the whole buffer with just the new files — silently
   * dropping all previously-selected context the model still relies on.
   */
  for (const [relativePath, dirent] of Object.entries(contextFiles)) {
    if (!(relativePath in filteredFiles)) {
      filteredFiles[relativePath] = dirent;
    }
  }

  const totalFiles = Object.keys(filteredFiles).length;
  logger.info(`Total files: ${totalFiles}`);

  if (totalFiles == 0) {
    /*
     * Best-effort context narrowing must not abort the user's chat turn on a
     * non-fatal LLM formatting miss — fall back to the existing context buffer.
     */
    logger.warn('Context selection returned no files; falling back to existing context buffer.');
    return contextFiles;
  }

  return filteredFiles;

  // generateText({
}

/**
 * Build the prior context buffer from a persisted `codeContext` annotation.
 *
 * `extractCurrentContext` returns the annotation cast as `any` (it comes from
 * deserialized message annotations), so `codeContext.files` is untrusted: a
 * corrupted or older-shaped annotation can carry `undefined`/a non-array value.
 * Calling `.includes()` on that threw a TypeError that propagated out of
 * `selectContext` and aborted the whole context-optimization pass for the turn.
 * Guard with `Array.isArray` and treat anything else as an empty selection.
 */
export function selectContextBufferFiles(
  files: FileMap,
  codeContextFilesRaw: unknown,
): { contextFiles: FileMap; currentFiles: string[] } {
  const codeContextFiles: string[] = Array.isArray(codeContextFilesRaw) ? codeContextFilesRaw : [];
  const contextFiles: FileMap = {};
  const currentFiles: string[] = [];

  Object.keys(files || {}).forEach((path) => {
    let relativePath = path;

    if (path.startsWith('/home/project/')) {
      relativePath = path.replace('/home/project/', '');
    }

    if (codeContextFiles.includes(relativePath)) {
      contextFiles[relativePath] = files[path];
      currentFiles.push(relativePath);
    }
  });

  return { contextFiles, currentFiles };
}

export function getFilePaths(files: FileMap) {
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => isPathAllowed(toRelativeProjectPath(x)));

  return filePaths;
}

import { type Message } from 'ai';
import ignore from 'ignore';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import type { ContextAnnotation } from '~/types/context';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';

export function extractPropertiesFromMessage(message: Omit<Message, 'id'> | undefined | null): {
  model: string;
  provider: string;
  content: string;
} {
  if (!message) {
    return { model: DEFAULT_MODEL, provider: DEFAULT_PROVIDER.name, content: '' };
  }

  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : message.content;

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = Array.isArray(message.content)
    ? message.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text?.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, ''),
          };
        }

        return item; // Preserve image_url and other types as is
      })
    : textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export function simplifyBoltActions(input: string): string {
  // Using regex to match boltAction tags that have type="file"
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

export function createFilesContext(files: FileMap, useRelativePath?: boolean) {
  const ig = ignore().add(IGNORE_PATTERNS);

  /*
   * Sort the paths deterministically (P0-b). `selectContext` emits files in a
   * relevance/insertion order that varies run-to-run, so an identical file set
   * produced a DIFFERENT byte string each turn — busting the automatic prefix
   * cache of every auto-cacher (OpenAI/Gemini/DeepSeek) AND Anthropic. Sorting by
   * path makes the CONTEXT BUFFER byte-identical whenever the file set is, so the
   * cacheable prefix is stable. Content is unchanged — only ordering.
   */
  let filePaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  filePaths = filePaths.filter((x) => {
    /*
     * Strip the workspace-root prefix with OR without the trailing slash (the
     * bare `/home/project` root slips past a `'/home/project/'` replace) and any
     * leading slash, so the `ignore` package never receives an absolute path —
     * which it rejects with "path should be a `path.relative()`d string",
     * crashing the chat stream (code=UNKNOWN).
     */
    const relPath = x.replace(/^\/home\/project\/?/, '').replace(/^\/+/, '');
    return relPath.length > 0 && !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        // .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      let filePath = path;

      if (useRelativePath) {
        filePath = path.replace('/home/project/', '');
      }

      return `<boltAction type="file" filePath="${filePath}">${codeWithLinesNumbers}</boltAction>`;
    });

  return `<boltArtifact id="code-content" title="Code Content" >\n${fileContexts.join('\n')}\n</boltArtifact>`;
}

export function extractCurrentContext(messages: Message[]) {
  const lastAssistantMessage = messages.filter((x) => x.role == 'assistant').slice(-1)[0];

  if (!lastAssistantMessage) {
    return { summary: undefined, codeContext: undefined };
  }

  let summary: ContextAnnotation | undefined;
  let codeContext: ContextAnnotation | undefined;

  if (!lastAssistantMessage.annotations?.length) {
    return { summary: undefined, codeContext: undefined };
  }

  for (let i = 0; i < lastAssistantMessage.annotations.length; i++) {
    const annotation = lastAssistantMessage.annotations[i];

    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    if (!(annotation as any).type) {
      continue;
    }

    const annotationObject = annotation as any;

    /*
     * Don't break on the first match: codeContext and chatSummary are two
     * separate annotations on the same assistant message, so breaking after one
     * dropped the other (whichever came second) — losing the code-context buffer
     * carry-over or the summary. Collect both.
     */
    if (annotationObject.type === 'codeContext') {
      codeContext = annotationObject;
    } else if (annotationObject.type === 'chatSummary') {
      summary = annotationObject;
    }
  }

  return { summary, codeContext };
}

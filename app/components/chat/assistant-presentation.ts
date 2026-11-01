export type AssistantPresentationPart =
  | { kind: 'prose'; text: string; offset: number }
  | { kind: 'activity'; text: string; offset: number; incomplete: boolean; title?: string };

/** Display projection only. It neither executes actions nor changes the stored/model transcript. */
export function assistantPresentation(
  source: string,
  options: { collapseFencedCode?: boolean } = {},
): AssistantPresentationPart[] {
  const parts: AssistantPresentationPart[] = [];
  const token = /(?:^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n|<bolt(Artifact|Action)(?=[\s>]|$)|<bolt[A-Za-z]*$/g;

  const inlineCode = [...source.matchAll(/(`+)[^`\n]*?\1/g)].map((match) => [
    match.index!,
    match.index! + match[0].length,
  ]);

  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = token.exec(source))) {
    if (!match[1] && inlineCode.some(([start, end]) => match!.index >= start && match!.index < end)) {
      continue;
    }

    let start = match.index;
    let end: number;
    let incomplete: boolean;
    let title: string | undefined;

    if (match[1]) {
      const fence = match[1];
      const closing = new RegExp(`(?:^|\\n)[ \\t]{0,3}${fence[0]}{${fence.length},}[ \\t]*(?=\\n|$)`, 'g');

      // Include the opening fence’s final newline: an empty block closes immediately after it.
      closing.lastIndex = token.lastIndex - 1;

      const close = closing.exec(source);
      end = close ? closing.lastIndex : source.length;
      incomplete = !close;

      const before = source.slice(consumed, start);

      const header =
        /(?:^|\n)((?:(?:create|update|modify|edit|write|add|generate|file|créer|modifier|fichier)\s*:?\s+)?[`'"]?([\w./-]+\.\w+)[`'"]?:?[ \t]*)\n?[ \t]*$/i.exec(
          before,
        );

      // Discussion / explicit no-file responses retain ordinary code examples.
      if (!options.collapseFencedCode) {
        token.lastIndex = Math.max(end, token.lastIndex);
        continue;
      }

      if (header) {
        start = consumed + header.index;
        title = header[2];
      }
    } else if (!match[2]) {
      if (!['<boltArtifact', '<boltAction'].some((tag) => tag.startsWith(match![0]))) {
        continue;
      }

      end = source.length;
      incomplete = true;
    } else {
      const tag = match[2];
      const openingEnd = source.indexOf('>', token.lastIndex);
      const close = new RegExp(`</bolt${tag}\\s*>`, 'g');
      close.lastIndex = token.lastIndex;

      let closing = close.exec(source);

      if (tag === 'Artifact') {
        const boundaries = /<\/?bolt(?:Action|Artifact)\b[^>]*>/g;
        boundaries.lastIndex = token.lastIndex;

        let actionDepth = 0;
        let boundary: RegExpExecArray | null;
        closing = null;

        while ((boundary = boundaries.exec(source))) {
          if (/^<boltAction\b/.test(boundary[0])) {
            actionDepth += 1;
          } else if (/^<\/boltAction\b/.test(boundary[0])) {
            actionDepth = Math.max(0, actionDepth - 1);
          } else if (/^<\/boltArtifact\b/.test(boundary[0]) && actionDepth === 0) {
            closing = boundary;
            close.lastIndex = boundaries.lastIndex;
            break;
          }
        }
      }

      end = closing ? close.lastIndex : source.length;
      incomplete = !closing;

      const opening = openingEnd >= 0 ? source.slice(match.index, openingEnd + 1) : '';
      title = /(?:^|\s)(?:title|filePath)\s*=\s*(["'])(.*?)\1/.exec(opening)?.[2];
    }

    if (start > consumed) {
      parts.push({ kind: 'prose', text: source.slice(consumed, start), offset: consumed });
    }

    parts.push({ kind: 'activity', text: source.slice(start, end), offset: start, incomplete, title });
    consumed = end;
    token.lastIndex = end;
  }

  if (consumed < source.length) {
    parts.push({ kind: 'prose', text: source.slice(consumed), offset: consumed });
  }

  return parts;
}

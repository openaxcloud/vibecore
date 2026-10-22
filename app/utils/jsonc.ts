/** JSONC is supported only for known configuration paths, never package.json. */
export function isJsoncFile(filePath: string): boolean {
  const segments = filePath.replaceAll('\\', '/').split('/');
  const basename = (segments.pop() ?? '').toLowerCase();

  return (
    /^tsconfig(\..+)?\.json$/.test(basename) ||
    /^jsconfig(\..+)?\.json$/.test(basename) ||
    (segments.pop() === '.vscode' && basename.endsWith('.json'))
  );
}

/** Remove comments without joining tokens or changing string contents. */
function withoutComments(input: string): string {
  let output = '';
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inString) {
      output += char;

      if (char === '\\') {
        output += next ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      output += ' ';
      i += 2;

      while (i < input.length && input[i] !== '\n' && input[i] !== '\r') {
        i++;
      }

      if (i < input.length) {
        output += input[i];
      }
    } else if (char === '/' && next === '*') {
      const end = input.indexOf('*/', i + 2);

      if (end === -1) {
        throw new SyntaxError('Unterminated JSONC comment');
      }

      output += ' ';
      i = end + 1;
    } else {
      output += char;
    }
  }

  return output;
}

/**
 * Parse comments and trailing commas while preserving quoted URLs, patterns,
 * commas and escapes. Invalid/truncated documents still fail closed.
 */
export function parseJsonc(content: string): unknown {
  const input = withoutComments(content);

  let normalized = '';
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      normalized += char;

      if (char === '\\') {
        normalized += input[++i] ?? '';
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === ',') {
      let next = i + 1;

      while (/\s/.test(input[next] ?? '') && next < input.length) {
        next++;
      }

      let previousIndex = normalized.length - 1;

      while (previousIndex >= 0 && /\s/.test(normalized[previousIndex])) {
        previousIndex--;
      }

      const previous = normalized[previousIndex];

      if ((input[next] === '}' || input[next] === ']') && previous && !'[{,:'.includes(previous)) {
        continue;
      }
    }

    normalized += char;
  }

  return JSON.parse(normalized);
}

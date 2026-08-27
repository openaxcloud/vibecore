import ignore from 'ignore';
import { clientStoresServicesText } from '~/lib/i18n/catalogs/client-stores-services';

// Common patterns to ignore, similar to .gitignore
export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
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
];

export const MAX_FILES = 1000;
export const ig = ignore().add(IGNORE_PATTERNS);

export const generateId = () => Math.random().toString(36).substring(2, 15);

/*
 * Content-based binary sniff: scan the first 1KB for a NUL byte or a control
 * byte that isn't tab/LF/CR. This is how a real editor decides "binary vs
 * text" — it never trusts the file extension, so source files with uncommon
 * extensions (.py, .go, .rs, .sql, Dockerfile, …) are correctly kept as text.
 */
export const isBinaryContent = (bytes: Uint8Array): boolean => {
  const limit = Math.min(bytes.length, 1024);

  for (let i = 0; i < limit; i++) {
    const byte = bytes[i];

    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      return true;
    }
  }

  return false;
};

export const isBinaryFile = async (file: File): Promise<boolean> => {
  const chunkSize = 1024;
  const buffer = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer());

  return isBinaryContent(buffer);
};

export const shouldIncludeFile = (path: string): boolean => {
  return !ig.ignores(path);
};

const readPackageJson = async (files: File[]): Promise<{ scripts?: Record<string, string> } | null> => {
  const packageJsonFile = files.find((f) => (f.webkitRelativePath.split('/').pop() ?? '') === 'package.json');

  if (!packageJsonFile) {
    return null;
  }

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(packageJsonFile);
    });

    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading package.json:', error);
    return null;
  }
};

export const detectProjectType = async (
  files: File[],
): Promise<{ type: string; setupCommand: string; followupMessage: string }> => {
  const hasFile = (name: string) => files.some((f) => (f.webkitRelativePath.split('/').pop() ?? '') === name);

  if (hasFile('package.json')) {
    const packageJson = await readPackageJson(files);
    const scripts = packageJson?.scripts || {};

    // Check for preferred commands in priority order
    const preferredCommands = ['dev', 'start', 'preview'];
    const availableCommand = preferredCommands.find((cmd) => scripts[cmd]);

    if (availableCommand) {
      return {
        type: 'Node.js',
        setupCommand: `npm install && npm run ${availableCommand}`,
        followupMessage: `Found "${availableCommand}" script in package.json. Running "npm run ${availableCommand}" after installation.`,
      };
    }

    return {
      type: 'Node.js',
      setupCommand: 'npm install',
      followupMessage:
        'Would you like me to inspect package.json to determine the available scripts for running this project?',
    };
  }

  if (hasFile('index.html')) {
    return {
      type: 'Static',
      setupCommand: 'npx --yes serve',
      followupMessage: '',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
};

/*
 * Escape a path for a `filePath="..."` boltAction attribute. Mirrors
 * projectCommands.escapeBoltActionAttribute (inlined to avoid a circular import,
 * since projectCommands already imports from this module). Without it a path
 * containing `"`/`&`/`<`/`>` broke out of the attribute → malformed artifact.
 */
const escapeBoltActionAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/*
 * Escape any literal `<boltArtifact>`/`<boltAction>` tags embedded in file
 * CONTENT so they don't prematurely terminate the synthesized action body.
 * Mirrors projectCommands.escapeBoltTags (inlined to avoid a circular import,
 * since projectCommands already imports `generateId` from this module).
 * Without it, a user-edited file containing the literal text `</boltAction>`
 * (e.g. docs/HTML/JSX fixtures describing the artifact format) would break out
 * of the action and corrupt both the round-tripped content and the LLM's view
 * of the conversation when filesToArtifacts output is appended to a message.
 */
const escapeBoltTags = (input: string): string => {
  const escapeTagPair = (regex: RegExp, text: string): string =>
    text.replace(regex, (_match, openTag: string, content: string, closeTag: string) => {
      const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return `${escapedOpenTag}${content}${escapedCloseTag}`;
    });

  const artifactEscaped = escapeTagPair(/(<boltArtifact[^>]*>)([\s\S]*?)(<\/boltArtifact>)/g, input);

  return escapeTagPair(/(<boltAction[^>]*>)([\s\S]*?)(<\/boltAction>)/g, artifactEscaped);
};

export const filesToArtifacts = (
  files: { [path: string]: { content: string } },
  id: string,
  language?: string | null,
): string => {
  const title = clientStoresServicesText('clientRuntime.artifact.userUpdatedFiles', {}, language);

  return `
<boltArtifact id="${id}" title="${title}">
${Object.keys(files)
  .map(
    (filePath) => `
<boltAction type="file" filePath="${escapeBoltActionAttribute(filePath)}">
${escapeBoltTags(files[filePath].content)}
</boltAction>
`,
  )
  .join('\n')}
</boltArtifact>
  `;
};

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  contentTypeForProjectFile,
  normalizeProjectFilePath,
  readProjectFileFromZipBase64,
} from './project-file-route';

async function archiveBase64(files: Record<string, string>) {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'base64' });
}

describe('project file route helpers', () => {
  it('normalizes nested project file paths', () => {
    expect(normalizeProjectFilePath('src//components/./App.tsx')).toEqual({
      ok: true,
      path: 'src/components/App.tsx',
    });
    expect(normalizeProjectFilePath('src%2Fmain.tsx')).toEqual({ ok: true, path: 'src/main.tsx' });
  });

  it('rejects traversal and invalid paths', () => {
    expect(normalizeProjectFilePath('../.env')).toMatchObject({ ok: false });
    expect(normalizeProjectFilePath('src/../../.env')).toMatchObject({ ok: false });
    expect(normalizeProjectFilePath('src\\..\\.env')).toMatchObject({ ok: false });
    expect(normalizeProjectFilePath('')).toMatchObject({ ok: false });
  });

  it('reads a single file from a project archive without exposing unrelated files', async () => {
    const base64 = await archiveBase64({
      'src/main.tsx': 'import App from "./App";',
      'README.md': '# Demo',
    });

    const file = await readProjectFileFromZipBase64(base64, 'src/main.tsx');

    expect(file?.sizeBytes).toBe('import App from "./App";'.length);
    expect(new TextDecoder().decode(file?.bytes)).toBe('import App from "./App";');
    await expect(readProjectFileFromZipBase64(base64, 'src/App.tsx')).resolves.toBeUndefined();
  });

  it('sets useful content types for common project files', () => {
    expect(contentTypeForProjectFile('src/main.tsx')).toBe('text/typescript; charset=utf-8');
    expect(contentTypeForProjectFile('package.json')).toBe('application/json; charset=utf-8');
    expect(contentTypeForProjectFile('public/logo.png')).toBe('image/png');
  });
});

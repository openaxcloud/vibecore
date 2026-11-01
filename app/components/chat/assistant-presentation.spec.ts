import { describe, expect, it } from 'vitest';
import { assistantPresentation } from './assistant-presentation';

const prose = (source: string) =>
  assistantPresentation(source)
    .filter((part) => part.kind === 'prose')
    .map((part) => part.text)
    .join('');
describe('presentation projection without execution', () => {
  it('retains every character of technical source without exposing it as prose', () => {
    const source =
      'Avant.\n<boltArtifact id="a"><boltAction type="file" filePath="a.js">const end="</boltArtifact>";\nsecret_code</boltAction></boltArtifact>\nAprès.';

    const parts = assistantPresentation(source);
    expect(parts.map((part) => part.text).join('')).toBe(source);
    expect(prose(source)).toBe('Avant.\n\nAprès.');
  });
  it('keeps each truncated protocol prefix out of prose and restores unrelated literal text', () => {
    for (const tag of ['<boltArtifact', '<boltAction']) {
      for (let index = 5; index <= tag.length; index++) {
        const source = 'Avant. ' + tag.slice(0, index);
        expect(prose(source)).toBe('Avant. ');
        expect(
          assistantPresentation(source)
            .map((part) => part.text)
            .join(''),
        ).toBe(source);
      }
    }
    expect(prose('Avant. <bolt incroyable')).toBe('Avant. <bolt incroyable');
    expect(prose('Avant. <boltArchive')).toBe('Avant. <boltArchive');
  });
  it('preserves inline and fenced protocol examples in discussion', () => {
    const source = 'Exemple `<boltAction>` puis\n```xml\n<boltArtifact>exemple</boltArtifact>\n```';
    expect(prose(source)).toBe(source);
  });
  it('keeps interleaved prose and multiple file bodies exactly once', () => {
    const source =
      'Avant.<boltAction type="file">first</boltAction>Entre.<boltAction type="file">second</boltAction>Après.';
    expect(prose(source)).toBe('Avant.Entre.Après.');
    expect(
      assistantPresentation(source)
        .map((part) => part.text)
        .join(''),
    ).toBe(source);
  });
  it('displays build fences in details but does not reinterpret raw unfenced code', () => {
    const source = 'Texte\n```tsx\nimport React from "react";\n';
    expect(
      assistantPresentation(source, { collapseFencedCode: true }).some(
        (part) => part.kind === 'activity' && part.incomplete,
      ),
    ).toBe(true);
    expect(prose('const example = 42;')).toBe('const example = 42;');
  });
  it.each(['```', '~~~'])('preserves prose after an empty %s fence in build and discussion', (fence) => {
    const source = `${fence}js\n${fence}\nExplication.`;
    const build = assistantPresentation(source, { collapseFencedCode: true });
    expect(build).toEqual([
      { kind: 'activity', text: `${fence}js\n${fence}`, offset: 0, incomplete: false, title: undefined },
      { kind: 'prose', text: '\nExplication.', offset: `${fence}js\n${fence}`.length },
    ]);
    expect(assistantPresentation(source)).toEqual([{ kind: 'prose', text: source, offset: 0 }]);
  });
});

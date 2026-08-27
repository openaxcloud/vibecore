import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildSpreadsheetProject, parseDelimited } from './import-spreadsheet';

describe('parseDelimited', () => {
  it('parses CSV with a header and rows', () => {
    const sheet = parseDelimited('name,role\nAda,Engineer\nGrace,Admiral');
    expect(sheet.delimiter).toBe(',');
    expect(sheet.headers).toEqual(['name', 'role']);
    expect(sheet.rows).toEqual([
      ['Ada', 'Engineer'],
      ['Grace', 'Admiral'],
    ]);
  });

  it('honours quoted fields with embedded commas and newlines', () => {
    const sheet = parseDelimited('name,note\n"Doe, John","line1\nline2"\n"a ""quote""",b');
    expect(sheet.headers).toEqual(['name', 'note']);
    expect(sheet.rows[0]).toEqual(['Doe, John', 'line1\nline2']);
    expect(sheet.rows[1]).toEqual(['a "quote"', 'b']);
  });

  it('detects TSV and splits on tabs', () => {
    const sheet = parseDelimited('a\tb\tc\n1\t2\t3');
    expect(sheet.delimiter).toBe('\t');
    expect(sheet.headers).toEqual(['a', 'b', 'c']);
    expect(sheet.rows).toEqual([['1', '2', '3']]);
  });

  it('normalises jagged rows to the header width', () => {
    const sheet = parseDelimited('a,b,c\n1,2\n4,5,6,7');
    expect(sheet.rows).toEqual([
      ['1', '2', ''],
      ['4', '5', '6'],
    ]);
  });

  it('returns empty structure when there is no data', () => {
    expect(parseDelimited('   ')).toEqual({ headers: [], rows: [], delimiter: ',' });
  });

  it('localizes generated fallback column names without changing imported values', () => {
    const sheet = parseDelimited(',ville\nAda,Paris', 'fr-FR');

    expect(sheet.headers).toEqual(['Colonne 1', 'ville']);
    expect(sheet.rows).toEqual([['Ada', 'Paris']]);
  });
});

describe('buildSpreadsheetProject', () => {
  it('produces a zip with a real, data-bearing app', async () => {
    const base64 = await buildSpreadsheetProject({
      name: 'People',
      headers: ['name', 'role'],
      rows: [['Ada', 'Engineer']],
    });

    const zip = await JSZip.loadAsync(base64, { base64: true });
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining(['index.html', 'data.json', 'package.json', 'README.md']));

    const html = await zip.file('index.html')!.async('string');
    expect(html).toContain('People');
    expect(html).toContain('Ada');

    // The generated app is dependency-light and previewable via Vite.
    const pkg = JSON.parse(await zip.file('package.json')!.async('string'));
    expect(pkg.scripts.dev).toBe('vite');
  });

  it('escapes HTML in cell values so imported data cannot inject markup', async () => {
    const base64 = await buildSpreadsheetProject({
      name: 'x',
      headers: ['c'],
      rows: [['<script>alert(1)</script>']],
    });

    const zip = await JSZip.loadAsync(base64, { base64: true });
    const data = JSON.parse(await zip.file('data.json')!.async('string'));

    // Raw value is preserved in data.json; the HTML embeds it JSON-encoded, not as live markup.
    expect(data.rows[0][0]).toBe('<script>alert(1)</script>');

    const html = await zip.file('index.html')!.async('string');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('generates a complete French application while preserving user data and code identifiers', async () => {
    const base64 = await buildSpreadsheetProject({
      name: 'Équipe R&D',
      headers: ['name', 'role'],
      rows: [
        ['Ada', 'Engineer'],
        ['Grace', 'Admiral'],
      ],
      language: 'fr',
    });

    const zip = await JSZip.loadAsync(base64, { base64: true });
    const html = await zip.file('index.html')!.async('string');
    const readme = await zip.file('README.md')!.async('string');
    const data = JSON.parse(await zip.file('data.json')!.async('string'));

    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('2 colonnes · 2 lignes');
    expect(html).toContain('placeholder="Filtrer les lignes…"');
    expect(html).not.toContain('countOther: undefined');
    expect(html).toContain('Équipe R&amp;D');
    expect(readme).toContain('Tableau de données triable généré depuis une feuille de calcul importée');
    expect(data).toMatchObject({ name: 'Équipe R&D', headers: ['name', 'role'] });
    expect(data.rows[0]).toEqual(['Ada', 'Engineer']);
  });
});

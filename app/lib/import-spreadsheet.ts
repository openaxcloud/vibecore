/**
 * Pure helpers for the Spreadsheet import connector (TPL-02.3). Parses pasted
 * CSV/TSV and materialises a REAL, dependency-light Vite app (a sortable data
 * table) whose files are zipped for the proven `import/zip` pipeline. No mock
 * data, no placeholder — the generated app renders exactly the rows the user
 * pasted.
 */
import JSZip from 'jszip';

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  delimiter: ',' | '\t';
}

/** Detect the delimiter from the first non-empty line (tab vs comma). */
function detectDelimiter(text: string): ',' | '\t' {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;

  return tabs > commas ? '\t' : ',';
}

/**
 * RFC-4180-ish parser: honours double-quoted fields (with escaped `""` quotes
 * and embedded delimiters/newlines) for comma data; tab data is split plainly.
 */
export function parseDelimited(text: string): ParsedSheet {
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];

  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();

    // Drop fully-empty trailing records (e.g. final newline).
    if (record.some((cell) => cell.trim().length > 0)) {
      records.push(record);
    }

    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"' && delimiter === ',') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n') {
      pushRecord();
    } else if (char === '\r') {
      // handled by the \n branch; ignore standalone CR
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  if (records.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const [headerRecord, ...dataRecords] = records;
  const headers = headerRecord.map((header, columnIndex) => header.trim() || `Column ${columnIndex + 1}`);
  const width = headers.length;

  // Normalise every row to the header width so the table never jags.
  const rows = dataRecords.map((cells) => {
    const normalised = cells.slice(0, width);

    while (normalised.length < width) {
      normalised.push('');
    }

    return normalised;
  });

  return { headers, rows, delimiter };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Safe inline JSON for a <script> block (prevents premature </script> close). */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

interface SpreadsheetProjectInput {
  name: string;
  headers: string[];
  rows: string[][];
}

/** Build the app files and return the zip as a base64 string for import/zip. */
export async function buildSpreadsheetProject(input: SpreadsheetProjectInput): Promise<string> {
  const zip = new JSZip();
  const safeName = input.name.trim() || 'Spreadsheet app';
  const data = { name: safeName, headers: input.headers, rows: input.rows };

  zip.file('index.html', indexHtml(safeName, data));
  zip.file('data.json', JSON.stringify(data, null, 2));
  zip.file(
    'package.json',
    JSON.stringify(
      {
        name: 'spreadsheet-app',
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        devDependencies: { vite: '^5.4.0' },
      },
      null,
      2,
    ),
  );
  zip.file(
    'README.md',
    `# ${safeName}\n\nA sortable data table generated from an imported spreadsheet ` +
      `(${input.headers.length} columns × ${input.rows.length} rows).\n\n` +
      '```bash\nnpm install\nnpm run dev\n```\n',
  );

  return zip.generateAsync({ type: 'base64' });
}

function indexHtml(title: string, data: { headers: string[]; rows: string[][] }): string {
  const headerCells = data.headers
    .map((header, index) => `<th data-col="${index}"><button type="button">${escapeHtml(header)}</button></th>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0b0d12; color: #e6e9ef; }
  main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.meta { margin: 0 0 20px; color: #8b93a7; font-size: 14px; }
  .toolbar { margin-bottom: 12px; }
  input[type=search] { width: 100%; max-width: 320px; padding: 9px 12px; border-radius: 8px; border: 1px solid #262c3a; background: #12151d; color: inherit; font-size: 14px; }
  .table-wrap { overflow-x: auto; border: 1px solid #262c3a; border-radius: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #1c2130; white-space: nowrap; }
  th { position: sticky; top: 0; background: #12151d; }
  th button { all: unset; cursor: pointer; font-weight: 600; display: inline-flex; gap: 6px; }
  th button::after { content: attr(data-dir); color: #6b7280; }
  tbody tr:hover { background: #12151d; }
  .count { color: #8b93a7; font-size: 13px; margin-top: 10px; }
  @media (prefers-color-scheme: light) {
    body { background: #f7f8fa; color: #1a1f2b; }
    input[type=search], th { background: #fff; }
    .table-wrap { border-color: #e5e7eb; }
    th, td { border-color: #eef0f4; }
    tbody tr:hover { background: #f2f4f8; }
  }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${data.headers.length} columns · ${data.rows.length} rows</p>
  <div class="toolbar"><input type="search" id="q" placeholder="Filter rows…" aria-label="Filter rows" /></div>
  <div class="table-wrap">
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
  <p class="count" id="count"></p>
</main>
<script>
  const DATA = ${safeJson({ headers: data.headers, rows: data.rows })};
  let sortCol = -1, sortDir = 1, filter = '';
  const tbody = document.getElementById('rows');
  const count = document.getElementById('count');
  function render() {
    let rows = DATA.rows.slice();
    if (filter) {
      const f = filter.toLowerCase();
      rows = rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(f)));
    }
    if (sortCol >= 0) {
      rows.sort((a, b) => {
        const x = a[sortCol] ?? '', y = b[sortCol] ?? '';
        const nx = parseFloat(x), ny = parseFloat(y);
        const bothNum = !isNaN(nx) && !isNaN(ny) && x !== '' && y !== '';
        const cmp = bothNum ? nx - ny : String(x).localeCompare(String(y));
        return cmp * sortDir;
      });
    }
    tbody.innerHTML = rows
      .map((r) => '<tr>' + r.map((c) => '<td>' + escapeHtml(String(c)) + '</td>').join('') + '</tr>')
      .join('');
    count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
  document.querySelectorAll('th button').forEach((btn, col) => {
    btn.addEventListener('click', () => {
      if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
      document.querySelectorAll('th button').forEach((b, i) => b.setAttribute('data-dir', i === col ? (sortDir === 1 ? '▲' : '▼') : ''));
      render();
    });
  });
  document.getElementById('q').addEventListener('input', (e) => { filter = e.target.value; render(); });
  render();
</script>
</body>
</html>
`;
}

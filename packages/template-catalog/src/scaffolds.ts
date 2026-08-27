import type { GalleryDemoAppFile } from './types.js';
import { docsCopilotFiles } from './apps/docs-copilot.js';
import { fieldServiceInspectorFiles } from './apps/field-service-inspector.js';
import { incidentPostmortemExplainerFiles } from './apps/incident-postmortem-explainer.js';
import { neonTriviaArenaFiles } from './apps/neon-trivia-arena.js';
import { pipelineCrmFiles } from './apps/pipeline-crm.js';
import { qbrGeneratorFiles } from './apps/qbr-generator.js';
import { revenueCohortExplorerFiles } from './apps/revenue-cohort-explorer.js';
import { storefrontFiles } from './apps/storefront.js';
import { vendorRiskReviewFiles } from './apps/vendor-risk-review.js';
import { warehouseLayoutPlannerFiles } from './apps/warehouse-layout-planner.js';

const lines = (...values: string[]) => values.join('\n') + '\n';
const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

const reactPackage = (name: string) =>
  json({
    name,
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite --host 0.0.0.0',
      build: 'tsc -b && vite build',
      typecheck: 'tsc --noEmit',
    },
    dependencies: { react: '19.2.7', 'react-dom': '19.2.7' },
    devDependencies: {
      '@types/react': '19.2.17',
      '@types/react-dom': '19.2.3',
      '@vitejs/plugin-react': '6.0.3',
      typescript: '7.0.2',
      vite: '8.1.4',
    },
  });

const reactTsConfig = json({
  compilerOptions: {
    target: 'ES2022',
    useDefineForClassFields: true,
    module: 'ESNext',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    skipLibCheck: true,
    moduleResolution: 'Bundler',
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: 'react-jsx',
    types: ['vite/client'],
    noEmit: true,
    strict: true,
  },
  include: ['src'],
});

const reactIndex = (title: string) =>
  lines(
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#09090b"><title>${title}</title></head>`,
    '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>',
    '</html>',
  );

const reactViteConfig = lines(
  "import { defineConfig } from 'vite';",
  "import react from '@vitejs/plugin-react';",
  "export default defineConfig({ base: process.env.GALLERY_PREVIEW_BASE ?? '/', plugins: [react()] });",
);

const reactBootstrap = lines(
  "import { StrictMode } from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import { App } from './App';",
  "import './styles.css';",
  '',
  "createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);",
);

const baseCss = lines(
  ':root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background: #08090b; color: #f5f5f5; font-synthesis: none; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; min-width: 320px; min-height: 100vh; background: #08090b; }',
  'button, input, select, textarea { font: inherit; }',
  'button { cursor: pointer; }',
  'button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }',
  '.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }',
);

const crmFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file('package.json', reactPackage('orbit-crm-demo')),
  file('index.html', reactIndex('Orbit CRM')),
  file('tsconfig.json', reactTsConfig),
  file('vite.config.ts', reactViteConfig),
  file('src/main.tsx', reactBootstrap),
  file(
    'src/App.tsx',
    lines(
      "import { FormEvent, useMemo, useState } from 'react';",
      '',
      "type Stage = 'New' | 'Qualified' | 'Proposal' | 'Won';",
      'type Contact = { id: number; name: string; company: string; value: number; stage: Stage; next: string };',
      'const initialContacts: Contact[] = [',
      "  { id: 1, name: 'Maya Chen', company: 'Acme Labs', value: 18400, stage: 'Proposal', next: 'Today, 14:30' },",
      "  { id: 2, name: 'Jon Bell', company: 'Northwind', value: 9200, stage: 'Qualified', next: 'Tomorrow' },",
      "  { id: 3, name: 'Leila Morgan', company: 'Sonder', value: 24600, stage: 'Won', next: 'Onboarding' },",
      "  { id: 4, name: 'Tomas Reed', company: 'Vertex', value: 12800, stage: 'New', next: 'Friday' },",
      '];',
      "const stages: Stage[] = ['New', 'Qualified', 'Proposal', 'Won'];",
      '',
      'export function App() {',
      '  const [contacts, setContacts] = useState(initialContacts);',
      "  const [query, setQuery] = useState('');",
      '  const [adding, setAdding] = useState(false);',
      "  const [name, setName] = useState('');",
      "  const [company, setCompany] = useState('');",
      '  const visible = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.company}`.toLowerCase().includes(query.toLowerCase())), [contacts, query]);',
      "  const revenue = contacts.filter((contact) => contact.stage === 'Won').reduce((total, contact) => total + contact.value, 0);",
      '  const submit = (event: FormEvent) => {',
      '    event.preventDefault();',
      '    if (!name.trim() || !company.trim()) return;',
      "    setContacts((current) => [{ id: Date.now(), name: name.trim(), company: company.trim(), value: 5000, stage: 'New', next: 'Not scheduled' }, ...current]);",
      "    setName(''); setCompany(''); setAdding(false);",
      '  };',
      '  const move = (id: number, stage: Stage) => setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, stage } : contact));',
      '  return (',
      '    <main data-gallery-app-id="react-saas" className="shell">',
      '      <aside><div className="brand"><span>O</span><strong>Orbit</strong></div><nav aria-label="CRM sections"><b>Overview</b><span>Contacts</span><span>Pipeline</span><span>Tasks</span></nav><div className="team"><i>MC</i><small>Morgan Chen<br />Sales team</small></div></aside>',
      '      <section className="content">',
      '        <header><div><p className="eyebrow">Sales workspace</p><h1>Good morning, Morgan.</h1><p>Here is what needs your attention today.</p></div><button className="primary" onClick={() => setAdding((value) => !value)}>{adding ? \'Close\' : \'+ Add lead\'}</button></header>',
      '        {adding ? <form className="composer" onSubmit={submit}><label>Contact<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required /></label><label>Company<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" required /></label><button className="primary">Save lead</button></form> : null}',
      '        <section className="metrics" aria-label="Pipeline metrics"><article><span>Pipeline value</span><strong>$65,000</strong><em>+12% this month</em></article><article><span>Won revenue</span><strong>${revenue.toLocaleString()}</strong><em>1 account closed</em></article><article><span>Follow-ups</span><strong>7</strong><em>3 due today</em></article></section>',
      '        <section className="panel"><div className="panel-head"><div><h2>Active opportunities</h2><p>{visible.length} contacts in view</p></div><label><span className="sr-only">Search contacts</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts…" /></label></div>',
      '          <div className="table" role="table"><div className="table-head" role="row"><span>Contact</span><span>Value</span><span>Stage</span><span>Next step</span></div>{visible.map((contact) => <div className="contact" role="row" key={contact.id}><span><i>{contact.name.split(\' \').map((part) => part[0]).join(\'\')}</i><b>{contact.name}<small>{contact.company}</small></b></span><strong>${contact.value.toLocaleString()}</strong><select aria-label={`Stage for ${contact.name}`} value={contact.stage} onChange={(event) => move(contact.id, event.target.value as Stage)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select><span>{contact.next}</span></div>)}</div>',
      '          {visible.length === 0 ? <div className="empty">No contacts match “{query}”.</div> : null}',
      '        </section>',
      '      </section>',
      '    </main>',
      '  );',
      '}',
    ),
  ),
  file(
    'src/styles.css',
    baseCss +
      lines(
        ':root { --violet: #8b5cf6; --line: #292b31; }',
        '.shell { min-height: 100vh; display: grid; grid-template-columns: 220px 1fr; background: radial-gradient(circle at 100% 0, #24143e 0, transparent 28%), #0c0d10; }',
        'aside { padding: 26px 18px; border-right: 1px solid var(--line); background: #0a0b0e; display: flex; flex-direction: column; }',
        '.brand { display: flex; gap: 10px; align-items: center; padding: 0 10px; }.brand span { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: var(--violet); font-weight: 900; }.brand strong { font-size: 18px; }',
        'nav { display: grid; gap: 6px; margin-top: 54px; } nav span, nav b { padding: 11px 12px; border-radius: 9px; color: #8b8d95; font-size: 14px; } nav b { background: #1a1722; color: #ddd6fe; }',
        '.team { margin-top: auto; padding: 13px 9px; border-top: 1px solid var(--line); display: flex; gap: 10px; align-items: center; }.team i,.contact i { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: #282330; color: #c4b5fd; font-style: normal; font-size: 11px; font-weight: 800; }.team small { color: #8b8d95; line-height: 1.45; }',
        '.content { padding: 42px clamp(22px, 5vw, 68px); overflow: hidden; }.content > header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }.eyebrow { margin: 0 0 9px; color: #a78bfa!important; text-transform: uppercase; letter-spacing: .14em; font-size: 11px!important; font-weight: 800; }.content h1 { margin: 0; font-size: clamp(30px, 4vw, 46px); letter-spacing: -.045em; }.content header p,.panel p { margin: 9px 0 0; color: #8b8d95; }',
        '.primary { border: 0; border-radius: 10px; padding: 11px 16px; background: var(--violet); color: white; font-weight: 750; box-shadow: 0 8px 24px #8b5cf633; }.composer { margin-top: 20px; padding: 16px; display: flex; gap: 12px; align-items: end; border: 1px solid #4c3b70; background: #17131f; border-radius: 14px; }.composer label { flex: 1; display: grid; gap: 7px; color: #aaa; font-size: 12px; } input,select { border: 1px solid #34363d; border-radius: 9px; padding: 10px 12px; background: #111216; color: #f5f5f5; }',
        '.metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin: 34px 0 18px; }.metrics article { padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: #131419; }.metrics span { color: #8b8d95; font-size: 13px; }.metrics strong { display: block; margin: 12px 0 9px; font-size: 27px; }.metrics em { color: #6ee7b7; font-style: normal; font-size: 12px; }',
        '.panel { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: #111216; }.panel-head { padding: 19px 20px; display: flex; align-items: center; justify-content: space-between; gap: 15px; }.panel h2 { margin: 0; font-size: 17px; }.panel p { font-size: 12px; }.table-head,.contact { display: grid; grid-template-columns: minmax(210px,1.5fr) .7fr .8fr .8fr; gap: 15px; align-items: center; padding: 13px 20px; border-top: 1px solid var(--line); }.table-head { color: #70727b; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; }.contact { color: #c9cad0; font-size: 13px; }.contact > span:first-child { display: flex; align-items: center; gap: 10px; }.contact b small { display: block; margin-top: 4px; color: #757780; font-weight: 500; }.contact select { width: 100%; padding: 8px; }.empty { padding: 36px; text-align: center; color: #8b8d95; border-top: 1px solid var(--line); }',
        '@media (max-width: 760px) { .shell { grid-template-columns: 1fr; } aside { display: none; } .content { padding: 26px 16px; }.content > header { align-items: center; }.metrics { grid-template-columns: 1fr; }.metrics article:nth-child(3) { display: none; }.panel-head { align-items: stretch; flex-direction: column; }.table-head { display: none; }.contact { grid-template-columns: 1fr 1fr; }.contact > span:last-child { text-align: right; }.composer { flex-direction: column; align-items: stretch; } }',
      ),
  ),
]);

const operationsFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    json({
      name: 'northstar-operations-demo',
      private: true,
      version: '1.0.0',
      scripts: {
        dev: 'next dev -H 0.0.0.0',
        build: 'next build',
        start: 'node server.mjs',
        typecheck: 'tsc --noEmit',
      },
      dependencies: { next: '16.2.10', react: '19.2.7', 'react-dom': '19.2.7' },
      devDependencies: {
        '@types/node': '24.13.3',
        '@types/react': '19.2.17',
        '@types/react-dom': '19.2.3',
        typescript: '6.0.3',
      },
    }),
  ),
  file(
    'tsconfig.json',
    json({
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: false,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react-jsx',
        incremental: true,
        plugins: [{ name: 'next' }],
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }),
  ),
  file('next-env.d.ts', '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n'),
  file(
    'server.mjs',
    lines(
      "import { createReadStream } from 'node:fs';",
      "import { stat } from 'node:fs/promises';",
      "import { createServer } from 'node:http';",
      "import { extname, join, resolve, sep } from 'node:path';",
      "const root = resolve('out');",
      "const port = Number.parseInt(process.env.PORT ?? '3000', 10);",
      "const basePath = (process.env.GALLERY_PREVIEW_BASE ?? '').replace(/\\/$/, '');",
      "const types = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };",
      'createServer(async (request, response) => {',
      '  try {',
      "    let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);",
      "    if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) pathname = pathname.slice(basePath.length) || '/';",
      '    let target = resolve(root, `.${pathname}`);',
      "    if (target !== root && !target.startsWith(`${root}${sep}`)) { response.writeHead(403).end('Forbidden'); return; }",
      "    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');",
      "    response.setHeader('content-type', types[extname(target)] ?? 'application/octet-stream');",
      '    createReadStream(target).pipe(response);',
      '  } catch {',
      "    response.writeHead(404).end('Not found');",
      '  }',
      "}).listen(port, '0.0.0.0');",
    ),
  ),
  file(
    'next.config.ts',
    lines(
      "import type { NextConfig } from 'next';",
      "const basePath = (process.env.GALLERY_PREVIEW_BASE ?? '').replace(/\\/$/, '');",
      "const config: NextConfig = { output: 'export', basePath, assetPrefix: basePath || undefined };",
      'export default config;',
    ),
  ),
  file(
    'app/layout.tsx',
    lines(
      "import type { Metadata } from 'next';",
      "import './styles.css';",
      "export const metadata: Metadata = { title: 'Northstar Operations', description: 'Live service operations dashboard' };",
      'export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }',
    ),
  ),
  file(
    'app/page.tsx',
    lines(
      "'use client';",
      "import { useMemo, useState } from 'react';",
      "type Incident = { id: number; service: string; issue: string; severity: 'Critical' | 'Warning'; owner: string; open: boolean };",
      "const seed: Incident[] = [{ id: 1, service: 'Payments API', issue: 'Elevated timeout rate', severity: 'Critical', owner: 'A. Kim', open: true }, { id: 2, service: 'Search index', issue: 'Sync lag above target', severity: 'Warning', owner: 'R. Singh', open: true }, { id: 3, service: 'Email worker', issue: 'Retry queue recovered', severity: 'Warning', owner: 'J. Park', open: false }];",
      'export default function Home() {',
      '  const [incidents, setIncidents] = useState(seed);',
      "  const [filter, setFilter] = useState<'all' | 'open'>('open');",
      "  const [refreshedAt, setRefreshedAt] = useState('just now');",
      "  const visible = useMemo(() => filter === 'open' ? incidents.filter((incident) => incident.open) : incidents, [filter, incidents]);",
      '  const resolve = (id: number) => setIncidents((current) => current.map((incident) => incident.id === id ? { ...incident, open: false } : incident));',
      '  return <main data-gallery-app-id="next-dashboard" className="ops"><aside><div className="logo">▲ <b>Northstar</b></div><nav><strong>Command center</strong><span>Services</span><span>Incidents</span><span>Deployments</span></nav><div className="oncall"><small>On call</small><b>Platform team</b><span>4 engineers online</span></div></aside><section className="workspace">',
      "    <header><div><p className=\"eyebrow\">Operations · Global</p><h1>Command center</h1><p>All systems observed across production regions.</p></div><button onClick={() => setRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}>Refresh data</button></header>",
      '    <div className="refresh">Last refreshed {refreshedAt}</div>',
      '    <section className="health"><article><span className="pulse"></span><div><small>Overall status</small><strong>Operational</strong></div></article><article><small>Availability</small><strong>99.98%</strong><em>30 days</em></article><article><small>P95 latency</small><strong>184 ms</strong><em>−12 ms</em></article><article><small>Open incidents</small><strong>{incidents.filter((item) => item.open).length}</strong><em>Needs attention</em></article></section>',
      '    <section className="chart"><div><h2>Request volume</h2><p>Last 12 hours · 8.4m requests</p></div><div className="bars" aria-label="Request volume chart">{[45,58,52,72,64,81,76,92,85,70,78,88].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></section>',
      "    <section className=\"incidents\"><div className=\"inc-head\"><div><h2>Incidents</h2><p>Ownership and current response state</p></div><div className=\"filters\"><button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button></div></div>{visible.map((incident) => <article key={incident.id}><span className={`severity ${incident.severity.toLowerCase()}`}>{incident.severity}</span><div><b>{incident.service}</b><small>{incident.issue}</small></div><span className=\"owner\">{incident.owner}</span>{incident.open ? <button onClick={() => resolve(incident.id)}>Resolve</button> : <span className=\"resolved\">Resolved</span>}</article>)}{visible.length === 0 ? <div className=\"empty\">No open incidents. Production is clear.</div> : null}</section>",
      '  </section></main>;',
      '}',
    ),
  ),
  file(
    'app/styles.css',
    baseCss +
      lines(
        ':root { --green:#53e0a2; --border:#26292d; } .ops{min-height:100vh;display:grid;grid-template-columns:220px 1fr;background:#0c0e0f}.ops aside{padding:27px 20px;border-right:1px solid var(--border);background:#090b0b;display:flex;flex-direction:column}.logo{color:var(--green);font-size:18px}.logo b{color:#f5f5f5}.ops nav{margin-top:52px;display:grid;gap:6px}.ops nav span,.ops nav strong{padding:11px 12px;color:#747a78;font-size:13px;border-radius:8px}.ops nav strong{background:#12231d;color:#b6f5d7}.oncall{margin-top:auto;padding:14px;border:1px solid #1d3930;border-radius:12px;background:#0d1915;display:grid;gap:5px}.oncall small,.oncall span{color:#78948a;font-size:11px}.workspace{padding:36px clamp(20px,4.5vw,60px)}.workspace>header{display:flex;justify-content:space-between;gap:20px}.eyebrow{margin:0;color:#6ddca8!important;letter-spacing:.14em;text-transform:uppercase;font-size:10px!important;font-weight:800}.workspace h1{margin:8px 0;font-size:38px;letter-spacing:-.04em}.workspace header p,.chart p,.incidents p{margin:0;color:#767c7a;font-size:13px}.workspace button{border:1px solid #35413d;border-radius:9px;padding:9px 13px;background:#171a19;color:#d8dddb}.workspace header button{height:40px}.refresh{text-align:right;margin-top:-10px;color:#565d5a;font-size:10px}.health{display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:12px;margin:27px 0}.health article{min-height:92px;padding:17px;border:1px solid var(--border);border-radius:13px;background:#121415;display:flex;gap:13px;align-items:center}.health article:not(:first-child){display:grid;gap:7px}.health small{color:#737977}.health strong{font-size:23px}.health em{color:#63d6a2;font-style:normal;font-size:11px}.pulse{width:35px;height:35px;border:9px solid #153d2e;border-radius:50%;background:var(--green);box-shadow:0 0 25px #53e0a244}.chart,.incidents{border:1px solid var(--border);border-radius:14px;background:#111314}.chart{padding:18px;height:210px;display:grid;grid-template-columns:180px 1fr;gap:20px}.chart h2,.incidents h2{margin:0 0 5px;font-size:16px}.bars{display:flex;align-items:end;gap:8px;padding-top:20px}.bars i{flex:1;min-width:5px;background:linear-gradient(#65e6ad,#17372b);border-radius:5px 5px 2px 2px}.incidents{margin-top:13px;overflow:hidden}.inc-head{padding:17px;display:flex;justify-content:space-between}.filters{display:flex;gap:5px}.filters button{padding:6px 10px;font-size:11px}.filters button.active{background:#dffbed;color:#0a2c1e;border-color:#dffbed}.incidents article{display:grid;grid-template-columns:75px 1fr 70px 80px;gap:14px;align-items:center;padding:13px 17px;border-top:1px solid var(--border);font-size:12px}.incidents article div{display:grid;gap:4px}.incidents article small{color:#717774}.severity{font-size:10px;padding:5px 7px;text-align:center;border-radius:999px}.severity.critical{background:#401b20;color:#ffadb5}.severity.warning{background:#3a2e14;color:#fbd480}.owner{color:#999}.incidents article button{padding:6px 9px;font-size:11px}.resolved{color:#5fc996}.empty{padding:30px;text-align:center;color:#727976;border-top:1px solid var(--border)}',
        '@media(max-width:800px){.ops{grid-template-columns:1fr}.ops aside{display:none}.workspace{padding:25px 15px}.health{grid-template-columns:1fr 1fr}.health article:first-child{grid-column:1/-1}.chart{grid-template-columns:1fr;height:190px}.chart>div:first-child{display:none}.incidents article{grid-template-columns:70px 1fr 68px}.owner{display:none}.refresh{margin-top:8px}.workspace h1{font-size:31px}}',
      ),
  ),
]);

const apiMonitorHtml = lines(
  '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pulse API Monitor</title><style>',
  ':root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#07090b;color:#f6f7f8;--cyan:#55d9f3}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% -10%,#103447,transparent 35%),#080a0c}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid white;outline-offset:2px}.shell{width:min(1100px,calc(100% - 30px));margin:auto;padding:36px 0}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:11px}.mark{width:34px;height:34px;border:1px solid #2f7180;border-radius:10px;display:grid;place-items:center;color:var(--cyan);background:#0e2229}.top button,.run{border:0;border-radius:9px;padding:10px 15px;background:var(--cyan);color:#05232a;font-weight:800}h1{font-size:clamp(30px,5vw,50px);letter-spacing:-.05em;margin:53px 0 8px}p{color:#7e898f}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:30px 0}.summary article{padding:18px;border:1px solid #252b2f;border-radius:12px;background:#101316}.summary small{color:#778187}.summary strong{display:block;margin-top:12px;font-size:24px}.summary em{font-style:normal;color:#63e6be;font-size:11px}.panel{border:1px solid #252b2f;border-radius:14px;overflow:hidden;background:#0e1113}.panel header{padding:17px;display:flex;justify-content:space-between;align-items:center}.panel h2{margin:0;font-size:16px}.panel header span{color:#697379;font-size:11px}.check{display:grid;grid-template-columns:minmax(210px,1.5fr) 90px 100px 100px;gap:15px;align-items:center;padding:15px 17px;border-top:1px solid #242a2e}.check code{color:#c7cfd2}.check small{display:block;margin-top:5px;color:#647077}.method{color:var(--cyan);font-size:10px;font-weight:900}.status{padding:5px 8px;border-radius:999px;text-align:center;background:#14382e;color:#7af0c9;font-size:11px}.status.pending{background:#2a2d30;color:#9aa3a7}.status.failed{background:#3c1c22;color:#ffabb7}.latency{color:#9ba4a8;font-variant-numeric:tabular-nums}.log{margin-top:12px;padding:17px;border:1px solid #252b2f;border-radius:12px;background:#080a0b;font:12px ui-monospace,monospace;color:#89959a;min-height:72px}.log b{color:#63e6be}@media(max-width:680px){.shell{padding:24px 0}.summary{grid-template-columns:1fr 1fr}h1{margin-top:35px}.check{grid-template-columns:1fr 70px}.check .method,.latency{display:none}.top small{display:none}}',
  '</style></head><body><main data-gallery-app-id="fastify-api" class="shell"><div class="top"><div class="brand"><span class="mark">⌁</span><div><strong>Pulse</strong><small style="display:block;color:#627078">API monitor</small></div></div><button id="run-top">Run checks</button></div><h1>Know before<br>your users do.</h1><p>Run real checks against this Fastify service and inspect every result.</p><section class="summary"><article><small>Uptime</small><strong>99.99%</strong><em>Last 30 days</em></article><article><small>Endpoints</small><strong>3</strong><em>All monitored</em></article><article><small>Avg latency</small><strong id="average">—</strong><em>Latest run</em></article><article><small>Failures</small><strong id="failures">0</strong><em>Latest run</em></article></section><section class="panel"><header><div><h2>Endpoint checks</h2><span id="updated">Ready for first run</span></div><button class="run" id="run-panel">Run all</button></header><div id="checks"></div></section><div class="log" id="log"><b>pulse</b> Waiting to run endpoint checks…</div></main><script>',
  "const endpoints=[{method:'GET',path:'api/health.json',display:'/api/health',label:'Service health'},{method:'GET',path:'api/metrics.json',display:'/api/metrics',label:'Runtime metrics'},{method:'GET',path:'api/releases.json',display:'/api/releases',label:'Release feed'}];const checks=document.querySelector('#checks');function render(results=[]){checks.innerHTML=endpoints.map((item,index)=>{const result=results[index];const state=!result?'pending':result.ok?'':'failed';return `<div class=\"check\"><div><code>${item.display}</code><small>${item.label}</small></div><span class=\"method\">${item.method}</span><span class=\"status ${state}\">${!result?'Not run':result.ok?'Healthy':'Failed'}</span><span class=\"latency\">${result?result.ms+' ms':'—'}</span></div>`}).join('')}async function run(){const buttons=document.querySelectorAll('button');buttons.forEach(button=>{button.disabled=true;button.textContent='Checking…'});document.querySelector('#log').textContent='pulse Running '+endpoints.length+' checks…';const results=[];for(const endpoint of endpoints){const start=performance.now();try{const response=await fetch(endpoint.path,{cache:'no-store'});results.push({ok:response.ok,ms:Math.round(performance.now()-start)})}catch(error){results.push({ok:false,ms:Math.round(performance.now()-start)})}}render(results);const failures=results.filter(result=>!result.ok).length;document.querySelector('#failures').textContent=String(failures);document.querySelector('#average').textContent=Math.round(results.reduce((sum,result)=>sum+result.ms,0)/results.length)+' ms';document.querySelector('#updated').textContent='Updated '+new Date().toLocaleTimeString();document.querySelector('#log').innerHTML='<b>pulse</b> '+(failures===0?'All endpoints are healthy.':'One or more endpoints need attention.');buttons.forEach((button,index)=>{button.disabled=false;button.textContent=index===0?'Run checks':'Run all'})}document.querySelector('#run-top').addEventListener('click',run);document.querySelector('#run-panel').addEventListener('click',run);render();",
  '</script></body></html>',
);

const apiMonitorFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    json({
      name: 'pulse-api-monitor-demo',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { dev: 'tsx watch src/server.ts', start: 'tsx src/server.ts', typecheck: 'tsc --noEmit' },
      dependencies: { fastify: '5.10.0' },
      devDependencies: { '@types/node': '24.13.3', tsx: '4.23.1', typescript: '7.0.2' },
    }),
  ),
  file(
    'tsconfig.json',
    json({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
      },
      include: ['src/**/*.ts'],
    }),
  ),
  file(
    'src/server.ts',
    lines(
      "import Fastify from 'fastify';",
      'const app = Fastify({ logger: true });',
      `const page = ${JSON.stringify(apiMonitorHtml)};`,
      "app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(page));",
      "app.get('/api/health', async () => ({ ok: true, service: 'pulse-monitor', checkedAt: new Date().toISOString() }));",
      "app.get('/api/health.json', async () => ({ ok: true, service: 'pulse-monitor', checkedAt: new Date().toISOString() }));",
      "app.get('/api/metrics', async () => ({ ok: true, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1_048_576) }));",
      "app.get('/api/metrics.json', async () => ({ ok: true, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1_048_576) }));",
      "app.get('/api/releases', async () => ({ ok: true, releases: [{ version: '1.4.2', status: 'stable' }, { version: '1.4.1', status: 'stable' }] }));",
      "app.get('/api/releases.json', async () => ({ ok: true, releases: [{ version: '1.4.2', status: 'stable' }, { version: '1.4.1', status: 'stable' }] }));",
      'const port = Number(process.env.PORT ?? 5173);',
      "await app.listen({ port, host: '0.0.0.0' });",
    ),
  ),
  file('public/index.html', apiMonitorHtml),
  file('public/api/health.json', json({ ok: true, service: 'pulse-monitor', preview: true })),
  file('public/api/metrics.json', json({ ok: true, uptimeSeconds: 86400, memoryMb: 96, preview: true })),
  file(
    'public/api/releases.json',
    json({ ok: true, releases: [{ version: '1.4.2', status: 'stable' }], preview: true }),
  ),
]);

const launchPlannerFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file('package.json', reactPackage('launchline-planner-demo')),
  file('index.html', reactIndex('Launchline Planner')),
  file('tsconfig.json', reactTsConfig),
  file('vite.config.ts', reactViteConfig),
  file('src/main.tsx', reactBootstrap),
  file(
    'src/App.tsx',
    lines(
      "import { FormEvent, useMemo, useState } from 'react';",
      'type Task = { id: number; title: string; owner: string; done: boolean; lane: string };',
      "const seed: Task[] = [{ id:1,title:'Approve release notes',owner:'Nora',done:true,lane:'Product'},{id:2,title:'Verify production analytics',owner:'Sam',done:false,lane:'Engineering'},{id:3,title:'Schedule customer email',owner:'Ivy',done:false,lane:'Marketing'},{id:4,title:'Run rollback drill',owner:'Lee',done:true,lane:'Operations'}];",
      'export function App(){',
      ' const [tasks,setTasks]=useState(seed);',
      " const [title,setTitle]=useState('');",
      ' const complete=tasks.filter((task)=>task.done).length;',
      ' const progress=Math.round((complete/tasks.length)*100);',
      " const days=useMemo(()=>Math.max(1,Math.ceil((new Date('2026-08-04T09:00:00Z').getTime()-Date.now())/86_400_000)),[]);",
      " const add=(event:FormEvent)=>{event.preventDefault();if(!title.trim())return;setTasks((current)=>[...current,{id:Date.now(),title:title.trim(),owner:'You',done:false,lane:'Launch'}]);setTitle('')};",
      ' const toggle=(id:number)=>setTasks((current)=>current.map((task)=>task.id===id?{...task,done:!task.done}:task));',
      ` return <main data-gallery-app-id="ai-agent" className="planner"><aside><div className="brand">↗ <b>Launchline</b></div><nav><strong>Launch plan</strong><span>Timeline</span><span>Assets</span><span>Team</span></nav><div className="launch"><small>Target launch</small><b>August 4</b><span>{days} days remaining</span></div></aside><section className="workspace"><header><div><p className="eyebrow">Project Atlas</p><h1>Launch with clarity.</h1><p>One focused view for every decision before release.</p></div><div className="score"><span>{progress}%</span><small>ready</small></div></header><section className="readiness"><div className="ring" style={{'--progress':progress*3.6+'deg'} as React.CSSProperties}><strong>{progress}%</strong></div><div><h2>Launch readiness</h2><p>{complete} of {tasks.length} critical tasks complete.</p><div className="bar"><i style={{width:progress+'%'}} /></div></div><article><small>Risk level</small><b>{progress>=75?'Low':'Moderate'}</b><span>{progress>=75?'Ready for review':'Complete remaining work'}</span></article></section><section className="board"><div className="board-head"><div><h2>Critical path</h2><p>Toggle tasks as the team completes them.</p></div><span>{tasks.length-complete} remaining</span></div><div className="tasks">{tasks.map((task)=><label key={task.id} className={task.done?'done':''}><input type="checkbox" checked={task.done} onChange={()=>toggle(task.id)} /><i>{task.done?'✓':''}</i><b>{task.title}<small>{task.lane} · {task.owner}</small></b><em>{task.done?'Complete':'In progress'}</em></label>)}</div><form onSubmit={add}><input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="Add a launch task…" aria-label="New launch task" /><button>Add task</button></form></section></section></main>;`,
      '}',
    ),
  ),
  file(
    'src/styles.css',
    baseCss +
      lines(
        ':root{--orange:#ff7a4d;--border:#2b2928}.planner{min-height:100vh;display:grid;grid-template-columns:215px 1fr;background:radial-gradient(circle at 75% -10%,#3b1d14,transparent 33%),#0e0d0c}.planner aside{padding:27px 19px;border-right:1px solid var(--border);background:#0b0a09;display:flex;flex-direction:column}.brand{color:var(--orange);font-size:19px}.brand b{color:#faf6f3}.planner nav{display:grid;gap:6px;margin-top:54px}.planner nav span,.planner nav strong{padding:10px 12px;border-radius:8px;color:#7f7975;font-size:13px}.planner nav strong{background:#281a15;color:#ffc4ae}.launch{margin-top:auto;display:grid;gap:5px;padding:14px;border:1px solid #4a2c22;border-radius:12px;background:#1d110d}.launch small,.launch span{color:#99766a;font-size:10px}.workspace{padding:42px clamp(20px,5vw,70px)}.workspace>header{display:flex;justify-content:space-between}.eyebrow{margin:0;color:#ff956f!important;text-transform:uppercase;letter-spacing:.15em;font-size:10px!important;font-weight:800}.workspace h1{margin:8px 0;font-size:clamp(34px,5vw,52px);letter-spacing:-.055em}.workspace header p,.readiness p,.board p{margin:0;color:#857e79}.score{width:70px;height:70px;border:1px solid #4a332b;border-radius:18px;display:grid;place-items:center;background:#171210}.score span{font-size:20px;font-weight:800;margin-bottom:-14px}.score small{color:#8c746b}.readiness{display:grid;grid-template-columns:85px 1fr 170px;gap:22px;align-items:center;margin:32px 0 14px;padding:20px;border:1px solid var(--border);border-radius:15px;background:#141210}.ring{--progress:180deg;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--orange) var(--progress),#302a27 0);position:relative}.ring:after{content:"";position:absolute;inset:7px;border-radius:50%;background:#141210}.ring strong{z-index:1}.readiness h2,.board h2{margin:0 0 7px;font-size:17px}.readiness p,.board p{font-size:12px}.bar{height:5px;margin-top:14px;border-radius:5px;background:#302a27;overflow:hidden}.bar i{display:block;height:100%;background:var(--orange)}.readiness article{padding-left:20px;border-left:1px solid var(--border);display:grid;gap:5px}.readiness article small,.readiness article span{color:#8c837e;font-size:10px}.readiness article b{color:#77d7a5;font-size:18px}.board{border:1px solid var(--border);border-radius:15px;overflow:hidden;background:#12110f}.board-head{padding:18px;display:flex;justify-content:space-between}.board-head>span{color:#ffa98a;font-size:12px}.tasks label{display:grid;grid-template-columns:24px 1fr 90px;gap:12px;align-items:center;padding:14px 18px;border-top:1px solid var(--border);cursor:pointer}.tasks input{position:absolute;opacity:0}.tasks label>i{width:21px;height:21px;border:1px solid #554a45;border-radius:6px;display:grid;place-items:center;color:#140b07;background:#181513;font-style:normal}.tasks label.done>i{border-color:var(--orange);background:var(--orange)}.tasks label b{font-size:13px}.tasks label b small{display:block;margin-top:4px;color:#77716d;font-weight:500}.tasks label em{font-style:normal;color:#c08d79;font-size:10px;text-align:right}.tasks label.done b{text-decoration:line-through;color:#77716d}.tasks label.done em{color:#6ec99a}.board form{display:flex;gap:8px;padding:14px 18px;border-top:1px solid var(--border)}.board form input{flex:1;border:1px solid #35302d;border-radius:8px;padding:10px;background:#0c0b0a;color:white}.board form button{border:0;border-radius:8px;padding:10px 15px;background:var(--orange);color:#1a0c07;font-weight:800}',
        '@media(max-width:720px){.planner{grid-template-columns:1fr}.planner aside{display:none}.workspace{padding:25px 15px}.score{display:none}.readiness{grid-template-columns:62px 1fr}.ring{width:60px;height:60px}.readiness article{display:none}.tasks label{grid-template-columns:24px 1fr}.tasks label em{display:none}}',
      ),
  ),
]);

const bookingFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    json({
      name: 'kindred-booking-demo',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' },
      devDependencies: { vite: '8.1.4' },
    }),
  ),
  file(
    'vite.config.js',
    "import { defineConfig } from 'vite';\nexport default defineConfig({ base: process.env.GALLERY_PREVIEW_BASE ?? '/' });\n",
  ),
  file(
    'index.html',
    lines(
      '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#204f43"><title>Kindred Booking</title><link rel="stylesheet" href="/styles.css"></head>',
      '<body><main data-gallery-app-id="landing-page"><header><a class="brand" href="#booking">Kindred<span>●</span></a><p>Wellness studio · Brooklyn</p><a class="outline" href="#booking">Book a visit</a></header><section class="hero"><div><p class="eyebrow">Make space for yourself</p><h1>Your next reset,<br><em>thoughtfully booked.</em></h1><p>Choose a private session with one of our specialists. No account required, no phone calls.</p><div class="trust"><span>4.9 ★ client rating</span><span>Free rescheduling</span></div></div><aside><div class="shape one"></div><div class="shape two"></div><b>45 min</b><small>Personal wellness session</small></aside></section><section class="booking" id="booking"><div class="booking-copy"><p class="eyebrow">Book your appointment</p><h2>Find your time.</h2><p>Select a session, then tell us where to send the confirmation.</p><ul><li>Guided 45-minute session</li><li>Private treatment room</li><li>Personal follow-up plan</li></ul></div><form id="booking-form"><fieldset><legend>1. Choose a time</legend><div class="slots" id="slots"></div></fieldset><label>2. Your name<input id="name" autocomplete="name" placeholder="Full name" required></label><label>Email<input id="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><button id="submit" disabled>Confirm booking</button><p class="fine">No payment is taken today.</p></form><section id="confirmation" class="confirmation" hidden aria-live="polite"></section></section></main><script type="module" src="/main.js"></script></body></html>',
    ),
  ),
  file(
    'styles.css',
    lines(
      ':root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17342d;background:#f1ede3;--green:#204f43;--coral:#e17155}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}a{color:inherit}header{height:76px;display:flex;align-items:center;justify-content:space-between;width:min(1180px,calc(100% - 36px));margin:auto;border-bottom:1px solid #c9c3b6}header p{color:#71736b;font-size:12px}.brand{text-decoration:none;font:800 20px Georgia,serif}.brand span{color:var(--coral);font-size:10px;margin-left:4px}.outline{padding:10px 15px;border:1px solid #809087;border-radius:999px;text-decoration:none;font-size:12px}.hero{width:min(1180px,calc(100% - 36px));margin:auto;min-height:560px;display:grid;grid-template-columns:1.1fr .9fr;gap:70px;align-items:center}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#6a756f!important;font-size:10px!important;font-weight:800}.hero h1{margin:13px 0 22px;font:500 clamp(45px,7vw,82px)/.98 Georgia,serif;letter-spacing:-.045em}.hero h1 em{color:var(--coral);font-weight:400}.hero>div>p{max-width:570px;color:#626862;font-size:17px;line-height:1.6}.trust{display:flex;gap:25px;margin-top:30px;color:#38584f;font-size:11px;font-weight:700}.hero aside{position:relative;min-height:390px;border-radius:48% 48% 16px 16px;background:#d9d0bc;overflow:hidden;padding:290px 32px 28px;color:white;box-shadow:0 30px 70px #4d554433}.hero aside:before{content:"";position:absolute;inset:0;background:linear-gradient(160deg,transparent 38%,#234e42 39%)}.shape{position:absolute;border-radius:50%;filter:blur(1px)}.shape.one{width:210px;height:250px;top:35px;left:70px;background:#e4a27f;transform:rotate(-20deg)}.shape.two{width:160px;height:180px;top:90px;right:30px;background:#709081}.hero aside b,.hero aside small{position:relative;display:block}.hero aside b{font:32px Georgia,serif}.booking{padding:76px max(18px,calc((100% - 1120px)/2));display:grid;grid-template-columns:.8fr 1.2fr;gap:70px;background:var(--green);color:#f8f4e9}.booking-copy h2{font:52px Georgia,serif;margin:10px 0}.booking-copy>p{color:#b8cac3;line-height:1.6}.booking-copy .eyebrow{color:#9ec0b5!important}.booking-copy ul{padding:0;list-style:none;margin-top:30px}.booking-copy li{padding:12px 0;border-bottom:1px solid #477066;font-size:13px}.booking form{padding:25px;border-radius:18px;background:#f7f3ea;color:#17342d}fieldset{border:0;padding:0;margin:0 0 18px}legend,label{display:grid;gap:8px;margin-bottom:14px;font-size:12px;font-weight:750}.slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.slots button{border:1px solid #c8c4b9;border-radius:9px;padding:10px;background:white;color:#29473f;cursor:pointer}.slots button.selected{background:var(--green);color:white;border-color:var(--green)}input{border:1px solid #c8c4b9;border-radius:9px;padding:12px;background:white;font:inherit}form>button{width:100%;border:0;border-radius:9px;padding:13px;background:var(--coral);color:white;font-weight:800;cursor:pointer}form>button:disabled{cursor:not-allowed;opacity:.45}.fine{text-align:center;color:#85837b;font-size:10px}.confirmation{grid-column:2;padding:28px;border-radius:18px;background:#f7f3ea;color:#17342d}.confirmation h3{font:34px Georgia,serif;margin:0 0 12px}.confirmation button{border:0;border-radius:9px;padding:11px 15px;background:var(--coral);color:white;cursor:pointer}@media(max-width:700px){header p{display:none}.hero{grid-template-columns:1fr;min-height:auto;padding:60px 0}.hero aside{display:none}.booking{grid-template-columns:1fr;gap:25px}.booking-copy h2{font-size:40px}.confirmation{grid-column:1}.slots{grid-template-columns:repeat(2,1fr)}}',
    ),
  ),
  file(
    'main.js',
    lines(
      "const times = ['09:30', '11:00', '13:30', '15:00', '16:30', '18:00'];",
      "const slots = document.querySelector('#slots');",
      "const form = document.querySelector('#booking-form');",
      "const confirmation = document.querySelector('#confirmation');",
      "const submit = document.querySelector('#submit');",
      'let selected = null;',
      'slots.innerHTML = times.map((time) => `<button type="button" data-time="${time}">${time}</button>`).join(\'\');',
      "slots.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; selected = button.dataset.time; slots.querySelectorAll('button').forEach((item) => item.classList.toggle('selected', item === button)); submit.disabled = false; });",
      "form.addEventListener('submit', (event) => { event.preventDefault(); if (!selected || !form.reportValidity()) return; const name = document.querySelector('#name').value.trim(); const email = document.querySelector('#email').value.trim(); form.hidden = true; confirmation.hidden = false; confirmation.innerHTML = `<p class=\"eyebrow\">Booking confirmed</p><h3>See you at ${selected}, ${name}.</h3><p>We sent the appointment details to <strong>${email}</strong>.</p><button type=\"button\" id=\"again\">Book another time</button>`; confirmation.querySelector('#again').addEventListener('click', () => { confirmation.hidden = true; form.hidden = false; form.reset(); selected = null; submit.disabled = true; slots.querySelectorAll('button').forEach((item) => item.classList.remove('selected')); }); });",
    ),
  ),
]);

const fieldServiceFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file('package.json', reactPackage('relay-field-service-pwa-demo')),
  file(
    'index.html',
    lines(
      '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5b941"><link rel="manifest" href="%BASE_URL%manifest.webmanifest"><link rel="icon" href="%BASE_URL%icon.svg"><title>Relay Field Service</title></head>',
      '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    ),
  ),
  file('tsconfig.json', reactTsConfig),
  file('vite.config.ts', reactViteConfig),
  file(
    'src/main.tsx',
    reactBootstrap +
      "if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js'));\n",
  ),
  file(
    'src/App.tsx',
    lines(
      "import { useEffect, useState } from 'react';",
      "type Status='Scheduled'|'On site'|'Complete';type Job={id:number,time:string,customer:string,address:string,task:string,status:Status};",
      "const seed:Job[]=[{id:1,time:'08:30',customer:'Juniper Market',address:'184 Bedford Ave',task:'Freezer inspection',status:'Complete'},{id:2,time:'11:00',customer:'Harlow Dental',address:'92 Dean Street',task:'HVAC maintenance',status:'Scheduled'},{id:3,time:'14:30',customer:'Aster Hotel',address:'15 Wythe Avenue',task:'Replace control panel',status:'Scheduled'}];",
      "export function App(){const[jobs,setJobs]=useState(seed);const[selected,setSelected]=useState(2);const[notes,setNotes]=useState<Record<number,string>>({});const[online,setOnline]=useState(navigator.onLine);useEffect(()=>{const update=()=>setOnline(navigator.onLine);addEventListener('online',update);addEventListener('offline',update);return()=>{removeEventListener('online',update);removeEventListener('offline',update)}},[]);const active=jobs.find((job)=>job.id===selected)!;const advance=(id:number)=>setJobs((current)=>current.map((job)=>job.id===id?{...job,status:job.status==='Scheduled'?'On site':'Complete'}:job));return <main data-gallery-app-id=\"mobile-starter\" className=\"app\"><header><div className=\"brand\">R<span>Relay</span></div><div className={online?'network online':'network'}><i></i>{online?'Online · synced':'Offline · changes saved'}</div><span className=\"avatar\" aria-label=\"Technician Jordan Davis\">JD</span></header><section className=\"summary\"><div><p>Thursday, July 16</p><h1>Good morning, Jordan.</h1><span>3 jobs · Brooklyn North</span></div><article><small>Today</small><strong>{jobs.filter((job)=>job.status==='Complete').length} / {jobs.length}</strong><span>jobs complete</span></article></section><div className=\"layout\"><section className=\"route\"><div className=\"route-head\"><div><h2>Today’s route</h2><p>26 min drive time remaining</p></div><span>Optimized</span></div>{jobs.map((job)=><button key={job.id} className={`${selected===job.id?'selected ':''}${job.status==='Complete'?'complete':''}`} onClick={()=>setSelected(job.id)}><time>{job.time}</time><i></i><span><b>{job.customer}</b><small>{job.task}</small></span><em>{job.status}</em></button>)}</section><section className=\"job\"><div className=\"job-head\"><span>{active.status}</span><small>JOB #{String(active.id).padStart(4,'0')}</small></div><h2>{active.customer}</h2><p className=\"address\">⌖ {active.address}</p><div className=\"detail\"><small>Service</small><b>{active.task}</b><span>Estimated duration · 60 minutes</span></div><label>Technician notes<textarea value={notes[active.id]??''} onChange={(event)=>setNotes((current)=>({...current,[active.id]:event.target.value}))} placeholder=\"Record work completed, equipment condition…\" /></label>{active.status!=='Complete'?<button className=\"action\" onClick={()=>advance(active.id)}>{active.status==='Scheduled'?'Check in on site':'Mark job complete'}</button>:<div className=\"success\">✓ Work completed and synced</div>}</section></div></main>}",
    ),
  ),
  file(
    'src/styles.css',
    baseCss +
      lines(
        ':root{color-scheme:light;--ink:#18201e;--muted:#6e7774;--yellow:#f5b941;--line:#dfe3df;background:#eef0ec;color:var(--ink)}body{background:#eef0ec}.app{min-height:100vh}.app>header{height:68px;padding:0 max(18px,calc((100% - 1120px)/2));display:flex;align-items:center;border-bottom:1px solid var(--line);background:#f8f9f6}.brand{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:var(--ink);color:var(--yellow);font-weight:900}.brand span{margin-left:40px;position:absolute;color:var(--ink);font-size:17px}.network{margin-left:auto;margin-right:18px;color:#866c2a;font-size:11px}.network i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;background:#e09a2a}.network.online{color:#34735e}.network.online i{background:#49af83}.avatar{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:#d8dcd7;color:#34413d;font-weight:800;font-size:11px}.summary{padding:38px max(18px,calc((100% - 1120px)/2));display:flex;justify-content:space-between;align-items:end;background:#f8f9f6}.summary p{color:#5e6a66;font-size:12px}.summary h1{margin:8px 0;font-size:clamp(30px,4vw,45px);letter-spacing:-.045em}.summary span{color:var(--muted);font-size:12px}.summary article{min-width:145px;padding:15px;border:1px solid #d8dad5;border-radius:13px;background:#eef0ec;display:grid;gap:5px}.summary article small{color:var(--muted)}.summary article strong{font-size:25px}.layout{width:min(1120px,calc(100% - 36px));margin:22px auto;display:grid;grid-template-columns:1fr .8fr;gap:16px}.route,.job{border:1px solid var(--line);border-radius:15px;background:#f8f9f6;overflow:hidden}.route-head{padding:19px;display:flex;justify-content:space-between}.route h2,.job h2{margin:0 0 5px;font-size:18px}.route p{margin:0;color:var(--muted);font-size:11px}.route-head>span{height:max-content;padding:5px 8px;border-radius:999px;background:#dff2e9;color:#33745d;font-size:10px}.route>button{width:100%;display:grid;grid-template-columns:46px 16px 1fr 70px;gap:12px;align-items:center;text-align:left;padding:17px 19px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--ink)}.route>button.selected{background:#fff8e8}.route>button time{color:var(--muted);font-size:11px}.route>button>i{width:11px;height:11px;border:2px solid #9ba49f;border-radius:50%}.route>button.selected>i{border-color:#d9920d;background:var(--yellow);box-shadow:0 0 0 3px #f8e3aa}.route>button.complete>i{border-color:#4b9c7d;background:#4b9c7d}.route button span{display:grid;gap:4px}.route button small{color:var(--muted)}.route button em{font-style:normal;color:#7d8582;font-size:10px;text-align:right}.route button.complete b{text-decoration:line-through;color:#7a827f}.job{padding:21px}.job-head{display:flex;justify-content:space-between}.job-head>span{padding:5px 8px;border-radius:999px;background:#fff0c7;color:#886a1e;font-size:10px}.job-head small{color:var(--muted)}.job h2{margin-top:24px;font-size:26px}.address{color:#5d6b66}.detail{display:grid;gap:6px;margin:22px 0;padding:15px;border-radius:11px;background:#ecefeb}.detail small,.detail span{color:var(--muted);font-size:10px}.job label{display:grid;gap:8px;color:#59645f;font-size:11px;font-weight:700}.job textarea{min-height:95px;resize:vertical;padding:11px;border:1px solid #d6dad5;border-radius:9px;background:white;color:var(--ink)}.action{width:100%;margin-top:14px;padding:12px;border:0;border-radius:9px;background:var(--ink);color:white;font-weight:800}.success{margin-top:14px;padding:12px;border-radius:9px;text-align:center;background:#dff2e9;color:#33745d;font-weight:750;font-size:12px}',
        '@media(max-width:700px){.summary{padding:27px 18px}.summary article{display:none}.layout{grid-template-columns:1fr}.route>button{grid-template-columns:43px 13px 1fr}.route button em{display:none}.job{min-height:380px}.network{font-size:0}.network i{margin:0}}',
      ),
  ),
  file(
    'public/manifest.webmanifest',
    json({
      name: 'Relay Field Service',
      short_name: 'Relay',
      start_url: './',
      display: 'standalone',
      background_color: '#eef0ec',
      theme_color: '#f5b941',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    }),
  ),
  file(
    'public/icon.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="44" fill="#18201e"/><path d="M55 48h45c28 0 43 14 43 37 0 17-9 29-25 34l29 34h-38l-24-31v31H55V48Zm30 25v27h14c9 0 14-5 14-14s-5-13-14-13H85Z" fill="#f5b941"/></svg>\n',
  ),
  file(
    'public/sw.js',
    lines(
      "const CACHE = 'relay-v1';",
      'const BASE = new URL(self.registration.scope).pathname;',
      "const SHELL = [BASE, BASE + 'manifest.webmanifest', BASE + 'icon.svg'];",
      "self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));",
      "self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));",
      "self.addEventListener('fetch', (event) => { if (event.request.method !== 'GET') return; event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request).then((cached) => cached ?? caches.match(BASE)))); });",
    ),
  ),
]);

export const GALLERY_DEMO_APP_FILES = Object.freeze({
  'docs-copilot': docsCopilotFiles,
  'neon-trivia-arena': neonTriviaArenaFiles,
  'vendor-risk-review': vendorRiskReviewFiles,
  'field-service-inspector': fieldServiceInspectorFiles,
  'revenue-cohort-explorer': revenueCohortExplorerFiles,
  'qbr-generator': qbrGeneratorFiles,
  'incident-postmortem-explainer': incidentPostmortemExplainerFiles,
  'warehouse-layout-planner': warehouseLayoutPlannerFiles,
  'pipeline-crm': pipelineCrmFiles,
  storefront: storefrontFiles,
  'react-saas': crmFiles,
  'next-dashboard': operationsFiles,
  'fastify-api': apiMonitorFiles,
  'ai-agent': launchPlannerFiles,
  'landing-page': bookingFiles,
  'mobile-starter': fieldServiceFiles,
});

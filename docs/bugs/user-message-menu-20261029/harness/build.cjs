const fs = require('fs'),
  path = require('path');
const root = process.cwd();
const esbuild = require(root + '/node_modules/esbuild');
const dir = '/tmp/vibecore-user-menu-evidence';
fs.mkdirSync(dir, { recursive: true });
const css = fs
  .readdirSync(root + '/build/client/assets')
  .filter((n) => n.endsWith('.css'))
  .map((n) => fs.readFileSync(root + '/build/client/assets/' + n, 'utf8'))
  .filter((s) => s.includes('.bolt-message-context-menu') || s.includes('pencil-simple'))
  .join('\n');
fs.writeFileSync(dir + '/app.css', css);
for (const file of ['index', 'before'])
  fs.writeFileSync(
    dir + '/' + file + '.html',
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="' +
      (file === 'before' ? 'before' : 'app') +
      '.js"></script></body></html>',
  );
fs.writeFileSync(
  dir + '/entry.tsx',
  `import React from 'react'; import {createRoot} from 'react-dom/client'; import {UserMessage} from '${root}/app/components/chat/UserMessage';
const q=new URLSearchParams(location.search); const mobile=q.has('mobile'); const long=q.has('long');
function App(){ const [id,setId]=React.useState('a'); return <div className="bolt-project-ide-shell"><div data-mobile-panel="chat" className={mobile?'bolt-responsive-ide-mobile':''}><header className="bolt-mobile-ecode-header">Local fixture</header><button id="project" onClick={()=>setId(id==='a'?'b':'a')}>Project</button><main style={{height:'60vh',overflow:'auto'}}><div className="bolt-chat-message-row" tabIndex={0} id="row"><UserMessage key={id} messageId={id} canEdit content={q.has('array')?[{type:'text',text:long?'Un message très long. '.repeat(2000):'Modifier ce message'}]:q.has('empty')?'':long?'Un message très long. '.repeat(2000):'Modifier ce message'} parts={undefined}/></div></main><textarea style={{display:'block'}} className="bolt-project-agent-composer" id="composer"/><button id="next">Next</button></div></div>}; window.addEventListener('vibecore:edit-message',()=>{document.getElementById('composer')?.focus();}); createRoot(document.getElementById('root')!).render(<App/>);`,
);
const replacements = {
  'react-i18next': `export const useTranslation=()=>({i18n:{language:'fr'}});`,
  './Markdown': `import React from 'react'; export const Markdown=({children})=><p style={{overflowWrap:'anywhere'}}>{children}</p>;`,
  '~/utils/constants': `export const MODEL_REGEX=/\\[Model:[^\\]]*\\]/g; export const PROVIDER_REGEX=/\\[Provider:[^\\]]*\\]/g;`,
};
esbuild.build({
  entryPoints: [dir + '/entry.tsx'],
  bundle: true,
  outfile: dir + (process.env.BEFORE ? '/before.js' : '/app.js'),
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  nodePaths: [root + '/node_modules'],
  alias: { '~': root + '/app' },
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [
    {
      name: 'baseline-source',
      setup(b) {
        if (process.env.BEFORE)
          b.onLoad({ filter: /(UserMessage|MessageContextMenu|message-context-menu)\.tsx?$/ }, (a) => ({
            contents: require('child_process').execFileSync(
              'git',
              ['show', '63e66383055c632865b7ebd27df19aa1a6f6f37f:' + path.relative(root, a.path)],
              { cwd: root, encoding: 'utf8' },
            ),
            loader: a.path.endsWith('tsx') ? 'tsx' : 'ts',
            resolveDir: path.dirname(a.path),
          }));
      },
    },
    {
      name: 'fixture-dependencies',
      setup(b) {
        b.onResolve({ filter: /^(react-i18next|\.\/Markdown|~\/utils\/constants)$/ }, (a) => ({
          path: a.path,
          namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          contents: replacements[a.path],
          loader: 'tsx',
          resolveDir: root,
        }));
      },
    },
  ],
});

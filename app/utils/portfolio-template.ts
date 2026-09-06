type ChatLikeMessage = {
  role?: string;
  content?: string;
};

type FileMapLike = Record<string, unknown> | undefined | null;

export interface PortfolioTemplateFile {
  path: string;
  content: string;
}

const starterFileNames = new Set([
  'README.md',
  'index.html',
  'package.json',
  'src/App.tsx',
  'src/main.tsx',
  'src/styles.css',
  'vite.config.ts',
]);

function latestUserPrompt(messages: ChatLikeMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === 'user')
    ?.content?.trim();
}

function fileMapPaths(files: FileMapLike) {
  if (!files || typeof files !== 'object') {
    return [];
  }

  return Object.keys(files).map((filePath) =>
    filePath.replace(/^\/?(?:home\/project|workspace)\//, '').replace(/^\/+/, ''),
  );
}

function isFreshStarterWorkspace(files: FileMapLike) {
  const paths = fileMapPaths(files);

  if (paths.length === 0) {
    return true;
  }

  return paths.length <= starterFileNames.size && paths.every((filePath) => starterFileNames.has(filePath));
}

export function shouldUsePortfolioTemplate(input: {
  messages: ChatLikeMessage[];
  chatMode?: 'build' | 'discuss';
  files?: FileMapLike;
}) {
  if (input.chatMode === 'discuss') {
    return false;
  }

  if (!isFreshStarterWorkspace(input.files)) {
    return false;
  }

  const prompt = latestUserPrompt(input.messages)?.toLowerCase();

  if (!prompt) {
    return false;
  }

  /*
   * Les deux motifs ne reconnaissaient QUE de l'anglais, sur une plateforme dont
   * les utilisateurs écrivent en français. « Créez un portfolio personnel » ne
   * déclenchait rien : `créez` n'est pas `create`, `site perso` n'est pas
   * `personal site`. Le modèle de démarrage était donc réservé aux anglophones,
   * en silence — et rien dans l'interface ne l'indiquait.
   *
   * Même classe que le repli d'état de serveur corrigé par #467 : la traduction
   * s'arrête à ce qui se VOIT et oublie ce qui DÉCIDE.
   *
   * Les accents sont tolérés dans les deux sens (`crée`/`cree`) parce qu'un
   * utilisateur mobile en tape rarement, et `\b` ne borne pas correctement un
   * mot accentué en JavaScript : on encadre donc par des classes explicites.
   *
   * ⚠️ Chaque position accentuée doit accepter TOUTES ses variantes. Un premier
   * jet écrivait `g[ée]n[èe]r[ee]r?` : `générer` et `générez` — l'infinitif et
   * l'impératif pluriel, les deux formes les plus courantes — ne déclenchaient
   * pas, parce que la quatrième position acceptait `è` ou `e`, jamais `é`. Le
   * test couvrait `génère-le`, qui passe, et manquait l'infinitif : un trou de
   * couverture, pas un test creux.
   */
  const bord = '(?:^|[^\\p{L}])';
  const finMot = '(?:[^\\p{L}]|$)';

  const creer =
    '(?:build|create|make|generate|develop|scaffold|cr[ée]e[rz]?|fabriqu[ee]r?|g[ée]n[èée]r[ee]r?[z]?|construis|construire|fais|faire)';
  const portfolio =
    '(?:portfolio|personal site|personal website|resume site|cv site|site perso(?:nnel)?|page perso(?:nnelle)?|site vitrine|cv en ligne)';

  const asksToCreate = new RegExp(`${bord}${creer}${finMot}`, 'iu').test(prompt);
  const portfolioIntent = new RegExp(`${bord}${portfolio}${finMot}`, 'iu').test(prompt);

  return asksToCreate && portfolioIntent;
}

function projectNameFromPrompt(messages: ChatLikeMessage[]) {
  const prompt = latestUserPrompt(messages) ?? '';
  const namedMatch = prompt.match(/\b(?:for|called|named)\s+([a-z][a-z0-9 .'-]{1,40})/i);
  const name = namedMatch?.[1]?.replace(/\b(with|using|that|and|including|include)\b.*$/i, '').trim();

  return name || 'Alex Morgan';
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'portfolio'
  );
}

export function createPortfolioTemplateFiles(messages: ChatLikeMessage[]): PortfolioTemplateFile[] {
  const name = projectNameFromPrompt(messages);
  const projectSlug = slugify(`${name} portfolio`);

  return [
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name: projectSlug,
          private: true,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'vite --host 0.0.0.0',
            build: 'vite build',
            preview: 'vite preview --host 0.0.0.0',
          },
          dependencies: {
            '@vitejs/plugin-react': 'latest',
            vite: 'latest',
            typescript: 'latest',
            react: 'latest',
            'react-dom': 'latest',
            'lucide-react': 'latest',
          },
          devDependencies: {},
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'index.html',
      content: `<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name} Portfolio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.tsx',
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: 'src/data/portfolio.ts',
      content: `export const profile = {
  name: ${JSON.stringify(name)},
  role: 'Product-minded full-stack engineer',
  location: 'Remote / Global',
  email: 'hello@example.com',
  summary:
    'I design and build polished web products with strong systems thinking, crisp interaction design, and production-ready engineering.',
};

export const metrics = [
  { label: 'Products shipped', value: '24+' },
  { label: 'Users reached', value: '1.8M' },
  { label: 'Avg. launch cycle', value: '6 wks' },
];

export const projects = [
  {
    title: 'Atlas Commerce',
    type: 'E-commerce platform',
    description: 'A conversion-focused storefront with real-time inventory, checkout analytics, and editorial collection pages.',
    impact: '+38% checkout conversion',
    tags: ['React', 'Node', 'Payments'],
  },
  {
    title: 'Northstar CRM',
    type: 'SaaS dashboard',
    description: 'A quiet, high-density operations console for sales teams managing enterprise pipeline and account health.',
    impact: '42 hours saved weekly',
    tags: ['TypeScript', 'Design Systems', 'Data Viz'],
  },
  {
    title: 'Signal Health',
    type: 'AI workflow tool',
    description: 'A secure workflow assistant that summarizes intake data and routes cases with auditable recommendations.',
    impact: '3.2x faster triage',
    tags: ['AI UX', 'Security', 'Automation'],
  },
];

export const services = [
  'Product strategy and technical discovery',
  'Frontend architecture and design systems',
  'Full-stack implementation and API integration',
  'Performance, accessibility, and launch readiness',
];
`,
    },
    {
      path: 'src/components/Header.tsx',
      content: `import { ArrowUpRight } from 'lucide-react';
import { profile } from '../data/portfolio';

export function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Home">
        <span>{profile.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
        {profile.name}
      </a>
      <nav aria-label="Primary navigation">
        <a href="#work">Work</a>
        <a href="#services">Services</a>
        <a href="#contact">Contact</a>
      </nav>
      <a className="header-cta" href={\`mailto:\${profile.email}\`}>
        Let's talk <ArrowUpRight size={16} aria-hidden />
      </a>
    </header>
  );
}
`,
    },
    {
      path: 'src/components/Hero.tsx',
      content: `import { ArrowRight, Sparkles } from 'lucide-react';
import { metrics, profile } from '../data/portfolio';

export function Hero() {
  return (
    <section id="top" className="hero-section">
      <div className="hero-copy">
        <p className="eyebrow"><Sparkles size={16} aria-hidden /> Available for selected projects</p>
        <h1>Building elegant software for ambitious teams.</h1>
        <p className="hero-summary">{profile.summary}</p>
        <div className="hero-actions">
          <a className="primary-action" href="#work">View work <ArrowRight size={18} aria-hidden /></a>
          <a className="secondary-action" href="#contact">Start a project</a>
        </div>
      </div>
      <aside className="hero-card" aria-label="Portfolio highlights">
        <span className="availability-dot" />
        <strong>{profile.role}</strong>
        <p>{profile.location}</p>
        <div className="metric-grid">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.value}</span>
              <small>{metric.label}</small>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
`,
    },
    {
      path: 'src/components/ProjectGrid.tsx',
      content: `import { projects } from '../data/portfolio';

export function ProjectGrid() {
  return (
    <section id="work" className="section">
      <div className="section-heading">
        <p className="eyebrow">Selected work</p>
        <h2>Case studies with measurable outcomes.</h2>
      </div>
      <div className="project-grid">
        {projects.map((project) => (
          <article className="project-card" key={project.title}>
            <div>
              <span>{project.type}</span>
              <h3>{project.title}</h3>
              <p>{project.description}</p>
            </div>
            <footer>
              <strong>{project.impact}</strong>
              <ul>
                {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
    },
    {
      path: 'src/components/Services.tsx',
      content: `import { CheckCircle2 } from 'lucide-react';
import { services } from '../data/portfolio';

export function Services() {
  return (
    <section id="services" className="section services-section">
      <div className="section-heading">
        <p className="eyebrow">Capabilities</p>
        <h2>From strategy to shipped product.</h2>
      </div>
      <div className="service-list">
        {services.map((service) => (
          <div className="service-item" key={service}>
            <CheckCircle2 size={20} aria-hidden />
            <span>{service}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
    },
    {
      path: 'src/components/Contact.tsx',
      content: `import { Mail } from 'lucide-react';
import { profile } from '../data/portfolio';

export function Contact() {
  return (
    <section id="contact" className="contact-section">
      <p className="eyebrow">Contact</p>
      <h2>Have a product worth sharpening?</h2>
      <p>Send a short note about your goals, timeline, and constraints. I usually reply within one business day.</p>
      <a className="primary-action" href={\`mailto:\${profile.email}\`}>
        <Mail size={18} aria-hidden /> {profile.email}
      </a>
    </section>
  );
}
`,
    },
    {
      path: 'src/App.tsx',
      content: `import { Contact } from './components/Contact';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { ProjectGrid } from './components/ProjectGrid';
import { Services } from './components/Services';

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ProjectGrid />
        <Services />
        <Contact />
      </main>
    </>
  );
}
`,
    },
    {
      path: 'src/styles.css',
      content: `:root {
  color: #161616;
  background: #f6f2ea;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
a { color: inherit; text-decoration: none; }

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px clamp(20px, 5vw, 72px);
  border-bottom: 1px solid rgba(22, 22, 22, 0.08);
  background: rgba(246, 242, 234, 0.88);
  backdrop-filter: blur(18px);
}

.brand, .header-cta, nav, .hero-actions, .primary-action, .secondary-action {
  display: inline-flex;
  align-items: center;
}

.brand { gap: 10px; font-weight: 800; }
.brand span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  color: white;
  background: #161616;
  font-size: 12px;
}

nav { gap: 22px; color: #5f5a50; font-size: 14px; }
.header-cta, .secondary-action {
  min-height: 42px;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(22, 22, 22, 0.14);
  border-radius: 999px;
  font-weight: 700;
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.65fr);
  gap: clamp(28px, 6vw, 72px);
  align-items: center;
  min-height: calc(100vh - 76px);
  padding: clamp(52px, 8vw, 110px) clamp(20px, 5vw, 72px);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 18px;
  color: #8d4a16;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1, h2, h3, p { margin-top: 0; }
h1 {
  max-width: 930px;
  margin-bottom: 24px;
  font-size: clamp(48px, 9vw, 112px);
  line-height: 0.92;
  letter-spacing: -0.06em;
}
h2 {
  margin-bottom: 0;
  font-size: clamp(34px, 5vw, 64px);
  line-height: 1;
  letter-spacing: -0.045em;
}
.hero-summary {
  max-width: 680px;
  color: #5f5a50;
  font-size: clamp(18px, 2vw, 22px);
  line-height: 1.55;
}

.hero-actions { gap: 12px; flex-wrap: wrap; margin-top: 32px; }
.primary-action {
  min-height: 48px;
  gap: 10px;
  padding: 0 22px;
  border-radius: 999px;
  color: white;
  background: #161616;
  font-weight: 800;
}

.hero-card, .project-card, .contact-section {
  border: 1px solid rgba(22, 22, 22, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 24px 80px rgba(30, 25, 17, 0.09);
}
.hero-card { padding: 28px; }
.availability-dot {
  display: block;
  width: 12px;
  height: 12px;
  margin-bottom: 26px;
  border-radius: 50%;
  background: #20b26b;
  box-shadow: 0 0 0 8px rgba(32, 178, 107, 0.14);
}
.hero-card strong { display: block; font-size: 26px; line-height: 1.1; }
.hero-card p { color: #6d675d; }
.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 36px; }
.metric-grid div { padding: 14px; border-radius: 18px; background: #f3eadb; }
.metric-grid span { display: block; font-weight: 900; font-size: 22px; }
.metric-grid small { color: #6d675d; }

.section { padding: 54px clamp(20px, 5vw, 72px); }
.section-heading { max-width: 780px; margin-bottom: 32px; }
.project-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.project-card { display: flex; min-height: 360px; flex-direction: column; justify-content: space-between; padding: 26px; }
.project-card span { color: #8d4a16; font-size: 12px; font-weight: 800; text-transform: uppercase; }
.project-card h3 { margin: 14px 0; font-size: 28px; }
.project-card p { color: #5f5a50; line-height: 1.6; }
.project-card footer strong { display: block; margin-bottom: 16px; }
.project-card ul { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0; list-style: none; }
.project-card li { padding: 7px 10px; border-radius: 999px; background: #f3eadb; font-size: 12px; font-weight: 700; }

.services-section { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr); gap: 42px; }
.service-list { display: grid; gap: 12px; }
.service-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  background: #fffaf1;
  font-weight: 750;
}

.contact-section {
  margin: 54px clamp(20px, 5vw, 72px) 72px;
  padding: clamp(32px, 7vw, 72px);
  color: white;
  background: #161616;
}
.contact-section .eyebrow, .contact-section p { color: #d9c8ae; }
.contact-section p { max-width: 650px; font-size: 18px; line-height: 1.6; }
.contact-section .primary-action { width: fit-content; margin-top: 20px; background: white; color: #161616; }

@media (max-width: 860px) {
  .site-header { align-items: flex-start; flex-direction: column; }
  nav { width: 100%; justify-content: space-between; }
  .header-cta { display: none; }
  .hero-section, .services-section { grid-template-columns: 1fr; }
  .project-grid { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: 1fr; }
}
`,
    },
    {
      path: 'README.md',
      content: `# ${name} Portfolio

Production-ready React + Vite portfolio generated from the cached E-Code portfolio template.

## Scripts

- \`npm run dev\` starts the local dev server.
- \`npm run build\` creates a production build.
- \`npm run preview\` serves the production build locally.
`,
    },
  ];
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/*
 * Portfolio prompts on a fresh workspace are served from a cached template
 * instead of the LLM (api.chat.ts). Lead with a visible badge so the user
 * knows this is an intentional Quick Start Template and that no AI tokens
 * were spent — otherwise a cached response is indistinguishable from a
 * generated one. The existing "cached portfolio app template" sentence is
 * preserved for continuity and because tests assert on it.
 */
export const PORTFOLIO_TEMPLATE_INTRO =
  '> 📦 **Quick Start Template** — using a pre-built portfolio template for fast setup. No AI tokens were used for this response.\n\n' +
  "I matched this to E-Code's cached portfolio app template, then customized the structure and copy for the request.\n\n";

export function createPortfolioTemplateArtifact(messages: ChatLikeMessage[]) {
  const files = createPortfolioTemplateFiles(messages);

  const actions = files
    .map(
      (file) => `<boltAction type="file" filePath="${escapeAttribute(file.path)}">
${file.content}
</boltAction>`,
    )
    .join('\n');

  return `${PORTFOLIO_TEMPLATE_INTRO}<boltArtifact id="cached-portfolio-site" title="Portfolio website">
${actions}
<boltAction type="start">
npm run dev
</boltAction>
</boltArtifact>`;
}

export function createPortfolioTemplateStreamChunks(messages: ChatLikeMessage[]) {
  const files = createPortfolioTemplateFiles(messages);

  const chunks = [PORTFOLIO_TEMPLATE_INTRO, '<boltArtifact id="cached-portfolio-site" title="Portfolio website">\n'];

  for (const file of files) {
    chunks.push(`<boltAction type="file" filePath="${escapeAttribute(file.path)}">
${file.content}
</boltAction>
`);
  }

  chunks.push(`<boltAction type="start">
npm run dev
</boltAction>
</boltArtifact>`);

  return chunks;
}

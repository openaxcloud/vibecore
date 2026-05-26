import type { LinksFunction, MetaFunction } from '@remix-run/cloudflare';

export const ecodeExactLinks: LinksFunction = () => [
  { rel: 'stylesheet', href: '/styles.css' },
  { rel: 'stylesheet', href: '/ecode-exact-host.css' },
];

export const ecodeHomeMeta: MetaFunction = () => [
  { title: 'E-code - Native cloud IDE for AI software teams' },
  {
    name: 'description',
    content:
      'E-code combines a VS Code-class cloud IDE, AI agents, Cloud Run deployment, and native mobile workflows on Google Cloud.',
  },
  { property: 'og:title', content: 'E-code' },
  { property: 'og:description', content: 'Build, run, collaborate, and deploy production apps with AI agents.' },
];

export const ecodeProductMeta: MetaFunction = () => [
  { title: 'E-code Product' },
  { name: 'description', content: 'Editor, AI, agents, deploy, mobile and collaboration features in E-code.' },
];

export const ecodeCustomersMeta: MetaFunction = () => [
  { title: 'E-code Customers' },
  { name: 'description', content: 'E-code customer showcase and public apps.' },
];

export const ecodePricingMeta: MetaFunction = () => [
  { title: 'E-code Pricing' },
  { name: 'description', content: 'E-code Free, Pro, Team and Enterprise pricing.' },
];

export const ecodeBlogMeta: MetaFunction = () => [
  { title: 'E-code Blog' },
  { name: 'description', content: 'Engineering notes from E-code.' },
];

export const ecodeChangelogMeta: MetaFunction = () => [
  { title: 'E-code Changelog' },
  { name: 'description', content: 'Public E-code release notes.' },
];

export const ecodePrivacyMeta: MetaFunction = () => [
  { title: 'E-code Legal' },
  { name: 'description', content: 'E-code privacy, terms, DPA and subprocessors.' },
];

export function EcodeHomePage() {
  return (
    <div className="ecode-exact-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            '{"@context":"https://schema.org","@type":"SoftwareApplication","name":"E-code","applicationCategory":"DeveloperApplication","operatingSystem":"Web, iOS, Android","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}}',
        }}
      />
      <nav className="shell nav">
        <strong>E-code</strong>
        <div>
          <a href="/product.html">Product</a>
          <a href="/pricing.html">Pricing</a>
          <a href="/customers.html">Customers</a>
          <a href="/changelog.html">Changelog</a>
          <a href="/privacy.html">Legal</a>
        </div>
      </nav>
      <header className="hero">
        <div className="shell">
          <h1>E-code</h1>
          <p>
            The GCP-native workspace where teams create, run, review, and deploy real applications with AI agents and
            production controls.
          </p>
          <div className="cta">
            <a className="button" href="/product.html">
              Explore product
            </a>
            <a className="button secondary" href="/pricing.html">
              View pricing
            </a>
          </div>
        </div>
      </header>
      <main>
        <section className="band shell grid">
          <article className="card">
            <h2>Editor</h2>
            <p>Workbench, terminal, preview, Git, LSP and collaborative presence in one workspace.</p>
          </article>
          <article className="card">
            <h2>AI and agents</h2>
            <p>Greenfield generation, codebase-aware agents, visible tool calls, diffs and rollback.</p>
          </article>
          <article className="card">
            <h2>Deploy</h2>
            <p>Cloud Build, Artifact Registry, Cloud Run, traffic splitting, domains and monitoring.</p>
          </article>
          <article className="card">
            <h2>Mobile</h2>
            <p>Native project browser, editor, terminal, AI chat, push and deep links for work on the move.</p>
          </article>
        </section>
        <section className="band shell">
          <h2>Compared with Replit, Cursor and Lovable</h2>
          <table className="compare">
            <tbody>
              <tr>
                <th>Capability</th>
                <th>E-code</th>
                <th>Alternatives</th>
              </tr>
              <tr>
                <td>Runtime</td>
                <td>Cloud Run with gVisor and GCS-backed files</td>
                <td>Mixed proprietary runtimes</td>
              </tr>
              <tr>
                <td>Agents</td>
                <td>Plan, act, observe, commit, deploy</td>
                <td>Editor-only or generation-only</td>
              </tr>
              <tr>
                <td>Mobile</td>
                <td>Native iOS and Android workflows</td>
                <td>Usually web-first</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
      <footer className="shell footer">E-code Inc. Privacy-first analytics. Google Cloud native.</footer>
    </div>
  );
}

export function EcodeProductPage() {
  return (
    <div className="ecode-exact-page">
      <nav className="shell nav">
        <strong>E-code</strong>
        <div>
          <a href="/">Home</a>
          <a href="/pricing.html">Pricing</a>
        </div>
      </nav>
      <main className="shell band grid">
        <article className="card">
          <h1>Editor</h1>
          <p>Panels, terminal, Git, preview, problems and settings built for repeated engineering work.</p>
        </article>
        <article className="card">
          <h1>AI</h1>
          <p>Streaming multi-model generation with attachments, stack selection and build correction.</p>
        </article>
        <article className="card">
          <h1>Agents</h1>
          <p>Visible plan, tool calls, artifacts, pause, resume and commit handoff.</p>
        </article>
        <article className="card">
          <h1>Deploy</h1>
          <p>Cloud Run releases, rollback, domains, scheduled jobs and Cloud Monitoring metrics.</p>
        </article>
        <article className="card">
          <h1>Mobile</h1>
          <p>Project browser, editor, terminal, preview and notifications on phone and tablet.</p>
        </article>
        <article className="card">
          <h1>Collaboration</h1>
          <p>Presence, shared editing, public projects, fork flow and moderation.</p>
        </article>
      </main>
    </div>
  );
}

export function EcodeCustomersPage() {
  return (
    <div className="ecode-exact-page">
      <main className="shell band">
        <h1>Customers and showcase</h1>
        <div className="grid">
          <article className="card">
            <h2>Internal tools</h2>
            <p>Teams build dashboards, automations and back-office apps with Cloud Run deployment.</p>
          </article>
          <article className="card">
            <h2>AI products</h2>
            <p>Founders generate, iterate and ship model-powered apps from validated templates.</p>
          </article>
          <article className="card">
            <h2>Education</h2>
            <p>Classrooms run safe project environments with reproducible templates.</p>
          </article>
        </div>
      </main>
    </div>
  );
}

export function EcodePricingPage() {
  return (
    <div className="ecode-exact-page">
      <nav className="shell nav">
        <strong>E-code</strong>
        <div>
          <a href="/">Home</a>
          <a href="/product.html">Product</a>
        </div>
      </nav>
      <main className="shell band">
        <h1>Pricing</h1>
        <section className="grid pricing">
          <article className="card">
            <h2>Free</h2>
            <p>$0 for learning and small projects.</p>
          </article>
          <article className="card">
            <h2>Pro</h2>
            <p>$20 per user monthly for private projects, agents and deploys.</p>
          </article>
          <article className="card">
            <h2>Team</h2>
            <p>$40 per user monthly with roles, billing controls and shared secrets.</p>
          </article>
          <article className="card">
            <h2>Enterprise</h2>
            <p>Custom security, SSO, audit logs and dedicated GCP architecture.</p>
          </article>
        </section>
        <h2>FAQ</h2>
        <p>Annual billing receives a discount. Compute, storage and AI quotas are visible before use.</p>
      </main>
    </div>
  );
}

export function EcodeBlogPage() {
  return (
    <div className="ecode-exact-page">
      <main className="shell band">
        <h1>Blog</h1>
        <article className="card">
          <h2>Why Cloud Run for developer workspaces</h2>
          <p>
            Cloud Run gives stateless services, gVisor isolation, regional deploys and predictable scaling for modern
            IDE workloads.
          </p>
        </article>
      </main>
    </div>
  );
}

export function EcodeChangelogPage() {
  return (
    <div className="ecode-exact-page">
      <main className="shell band">
        <h1>Changelog</h1>
        <article className="card">
          <h2>v1 platform hardening</h2>
          <p>
            GCP storage, deployer, creation flow, AI generator, mobile shipping kit, marketing and docs foundations.
          </p>
        </article>
      </main>
    </div>
  );
}

export function EcodePrivacyPage() {
  return (
    <div className="ecode-exact-page">
      <main className="shell band grid">
        <article className="card">
          <h1>Privacy</h1>
          <p>
            Project data is used to provide the workspace, AI, deployment and support workflows. Secrets stay
            server-side.
          </p>
        </article>
        <article className="card">
          <h1>Terms</h1>
          <p>Use E-code to build lawful software and keep account credentials secure.</p>
        </article>
        <article className="card">
          <h1>DPA</h1>
          <p>Enterprise plans may execute a data processing addendum with subprocessors listed here.</p>
        </article>
        <article className="card">
          <h1>Sub-processors</h1>
          <p>Google Cloud, Stripe, Sentry, email delivery and analytics providers support the service.</p>
        </article>
      </main>
    </div>
  );
}

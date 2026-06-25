import { ArrowRight, Code2, Layers, Sparkles, Terminal } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function Languages() {
  const languages = [
    { name: 'Python', note: 'Data, AI and backends with instant package installs.' },
    { name: 'JavaScript', note: 'Run Node and browser code with zero setup.' },
    { name: 'TypeScript', note: 'Type-safe apps with first-class tooling built in.' },
    { name: 'Go', note: 'Fast, compiled services that ship in seconds.' },
    { name: 'Rust', note: 'Memory-safe systems code with cargo ready to go.' },
    { name: 'Java', note: 'Enterprise apps and APIs on a managed JVM.' },
    { name: 'C#', note: 'Build .NET services and tools in the cloud.' },
    { name: 'Ruby', note: 'Rails and scripts with gems pre-wired.' },
    { name: 'PHP', note: 'Classic web stacks and modern Laravel apps.' },
    { name: 'Swift', note: 'Server-side Swift and quick prototyping.' },
    { name: 'Kotlin', note: 'Concise JVM apps and backends.' },
    { name: 'C++', note: 'High-performance code with a full compiler toolchain.' },
  ];

  const frameworks = [
    { name: 'React', note: 'Modern front-ends with hot reload previews.' },
    { name: 'Next.js', note: 'Full-stack React with server rendering.' },
    { name: 'Django', note: 'Batteries-included Python web framework.' },
    { name: 'FastAPI', note: 'Async Python APIs with auto docs.' },
    { name: 'Express', note: 'Minimal, flexible Node.js servers.' },
    { name: 'Rails', note: 'Convention-first Ruby web apps.' },
    { name: 'Spring Boot', note: 'Production-ready Java services.' },
    { name: 'Flutter', note: 'Cross-platform UIs from one codebase.' },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-languages">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Code2 className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-languages">
                Build in any language
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                E-Code supports every major programming language with instant environments, package managers and live
                previews — no local setup required.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                12+ languages, zero config
              </Badge>
            </div>
          </div>
        </section>

        {/* Languages Grid */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">Supported languages</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {languages.map((language) => (
                <Card key={language.name}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Terminal className="h-6 w-6" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="font-semibold mkt-h3">{language.name}</h3>
                    </div>
                    <p className="mkt-body text-muted-foreground mb-4">{language.note}</p>
                    <a
                      href="/"
                      className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                      style={{ color: 'var(--ecode-accent)' }}
                      data-testid={`link-start-${language.name.toLowerCase()}`}
                    >
                      Start building
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Frameworks Section */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <Layers className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h2 className="mkt-h2 font-bold mb-4">Frameworks and runtimes</h2>
              <p className="mkt-lead text-muted-foreground">
                Spin up the stack you already know. E-Code detects your project and installs dependencies automatically.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {frameworks.map((framework) => (
                <Card key={framework.name}>
                  <CardHeader>
                    <CardTitle className="mkt-h3">{framework.name}</CardTitle>
                    <CardDescription className="mkt-body">{framework.note}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Why E-Code */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">One workspace, every stack</h2>

            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="flex gap-4">
                <Sparkles className="h-6 w-6 flex-shrink-0 mt-1" style={{ color: 'var(--ecode-accent)' }} />
                <div>
                  <h3 className="mkt-h3 font-semibold mb-2">AI-native</h3>
                  <p className="mkt-body text-muted-foreground">
                    Describe what you want and generate working code in any supported language.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Terminal className="h-6 w-6 flex-shrink-0 mt-1" style={{ color: 'var(--ecode-accent)' }} />
                <div>
                  <h3 className="mkt-h3 font-semibold mb-2">Instant environments</h3>
                  <p className="mkt-body text-muted-foreground">
                    Compilers, package managers and a full terminal are ready the moment you open a project.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Layers className="h-6 w-6 flex-shrink-0 mt-1" style={{ color: 'var(--ecode-accent)' }} />
                <div>
                  <h3 className="mkt-h3 font-semibold mb-2">Mix and match</h3>
                  <p className="mkt-body text-muted-foreground">
                    Combine a Python backend with a TypeScript front-end in a single workspace.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Pick a language and start building</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Open a workspace, write a prompt and watch E-Code scaffold your project in the stack of your choice.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-white min-h-[44px] hover:opacity-90"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="button-languages-cta"
            >
              Start building
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

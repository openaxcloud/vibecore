import { ArrowRight, Loader2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useWouterLocation,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { resolveTemplateTech } from '~/components/marketing/template-tech-icon';

interface LandingTemplatesProps {
  templates: any[];
  isLoading: boolean;
}

export default function LandingTemplates({ templates, isLoading }: LandingTemplatesProps) {
  const [, navigate] = useWouterLocation();
  const displayApps = templates.slice(0, 6);

  return (
    <section className="py-20 bg-[var(--ecode-surface-tertiary)]" data-testid="section-templates">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">
            Remix a working community app
          </h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Inspect a live Preview, then create your own isolated copy in the IDE
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-ecode-accent" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayApps.map((template: any, index: number) => {
              const { Icon: IconComponent, brand } = resolveTemplateTech(template);
              return (
                <Card
                  key={template.id || index}
                  className="group cursor-pointer bg-[var(--ecode-surface)] border-[var(--ecode-border)] hover:border-ecode-accent/50 transition-all duration-300 hover:shadow-[0_8px_32px_-8px_rgba(242,98,7,0.2)] animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => navigate('/templates')}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div
                        className={
                          brand
                            ? 'w-10 h-10 rounded-lg bg-[var(--ecode-surface-tertiary)] border border-[var(--ecode-border)] flex items-center justify-center'
                            : 'w-10 h-10 rounded-lg bg-ecode-accent flex items-center justify-center'
                        }
                      >
                        <IconComponent className="h-5 w-5" style={{ color: brand ?? '#FFFFFF' }} />
                      </div>
                      <div>
                        <CardTitle className="text-[15px]">{template.name}</CardTitle>
                        <Badge variant="secondary" className="text-[11px] mt-1">
                          {template.category}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{template.description}</CardDescription>
                  </CardContent>
                </Card>
              );
            })}
            {displayApps.length === 0 ? (
              <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-6 py-10 text-center text-[var(--ecode-text-muted)]">
                Published applications are temporarily unavailable. Open the Gallery to retry.
              </div>
            ) : null}
          </div>
        )}

        <div className="text-center mt-12">
          <Button variant="outline" size="lg" className="gap-2" onClick={() => navigate('/templates')}>
            Open Community Gallery
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

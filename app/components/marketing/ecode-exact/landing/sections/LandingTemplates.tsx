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

const defaultTemplates = [
  {
    id: 1,
    name: 'SaaS Starter',
    description: 'Complete SaaS with auth, billing, dashboard',
    icon: 'stripe',
    category: 'Business',
  },
  {
    id: 2,
    name: 'E-Commerce',
    description: 'Full store with cart, checkout, inventory',
    icon: 'shopify',
    category: 'Commerce',
  },
  {
    id: 3,
    name: 'Analytics Dashboard',
    description: 'Real-time charts and data visualization',
    icon: 'chartjs',
    category: 'Analytics',
  },
  {
    id: 4,
    name: 'Chat Application',
    description: 'Real-time messaging with WebSocket',
    icon: 'socketio',
    category: 'Communication',
  },
  {
    id: 5,
    name: 'Documentation',
    description: 'Beautiful docs with search and versioning',
    icon: 'docs',
    category: 'Content',
  },
  { id: 6, name: 'Admin Panel', description: 'Full admin dashboard with CRUD', icon: 'admin', category: 'Business' },
];

export default function LandingTemplates({ templates, isLoading }: LandingTemplatesProps) {
  const [, navigate] = useWouterLocation();
  const displayTemplates = templates.length > 0 ? templates.slice(0, 6) : defaultTemplates;

  return (
    <section className="py-20 bg-[var(--ecode-surface-tertiary)]" data-testid="section-templates">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">Start with Templates</h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Production-ready templates to accelerate your development
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-ecode-accent" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayTemplates.map((template: any, index: number) => {
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
          </div>
        )}

        <div className="text-center mt-12">
          <Button variant="outline" size="lg" className="gap-2" onClick={() => navigate('/templates')}>
            View All Templates
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

import {
  Building2,
  Eye,
  FolderGit2,
  GraduationCap,
  MessageSquare,
  MousePointer2,
  PencilLine,
  Rocket,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactCaseStudiesCollaborationCopy,
  type CollaborationFeatureId,
  type CollaborationUseCaseId,
} from '~/lib/i18n/catalogs/marketing-exact-case-studies-collaboration';

const COLLABORATION_FEATURE_ICONS: Record<CollaborationFeatureId, LucideIcon> = {
  cursors: MousePointer2,
  editing: PencilLine,
  comments: MessageSquare,
  workspaces: FolderGit2,
  presence: Eye,
  roles: ShieldCheck,
};

const COLLABORATION_USE_CASE_ICONS: Record<CollaborationUseCaseId, LucideIcon> = {
  pairing: Rocket,
  education: GraduationCap,
  teams: Building2,
};

export default function Collaboration() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactCaseStudiesCollaborationCopy(i18n.resolvedLanguage ?? i18n.language).exactCollaboration;

  const features = copy.features.items.map((feature) => ({
    ...feature,
    icon: COLLABORATION_FEATURE_ICONS[feature.id],
  }));
  const useCases = copy.useCases.items.map((useCase) => ({
    ...useCase,
    icon: COLLABORATION_USE_CASE_ICONS[useCase.id],
  }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-collaboration">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Users className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} aria-hidden />
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-collaboration">
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">{copy.hero.description}</p>
              <Badge
                variant="secondary"
                className="inline-flex max-w-full whitespace-normal px-4 py-2 text-center text-[15px]"
              >
                {copy.hero.badge}
              </Badge>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.features.title}</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <Card key={feature.id} className="h-full">
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} aria-hidden />
                      <h3 className="mkt-h3 font-semibold mb-2">{feature.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <h2 className="mkt-h2 font-bold text-center mb-12">{copy.presence.title}</h2>

              <Card>
                <CardHeader>
                  <CardTitle>{copy.presence.cardTitle}</CardTitle>
                  <CardDescription>{copy.presence.cardDescription}</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                  {copy.presence.items.map((signal) => (
                    <div key={signal.id}>
                      <h3 className="mkt-h3 font-semibold mb-2">{signal.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{signal.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.useCases.title}</h2>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {useCases.map((useCase) => {
                const Icon = useCase.icon;

                return (
                  <Card key={useCase.id} className="h-full">
                    <CardContent className="pt-6">
                      <Icon className="h-10 w-10 mb-4" style={{ color: 'var(--ecode-accent)' }} aria-hidden />
                      <h3 className="mkt-h3 font-semibold mb-2">{useCase.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{useCase.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="mkt-h2 font-bold mb-4">{copy.cta.title}</h2>
            <p className="mkt-lead text-muted-foreground mb-8 max-w-2xl mx-auto">{copy.cta.description}</p>
            <a
              href="/register"
              className="inline-flex w-full max-w-sm sm:w-auto items-center justify-center rounded-md px-6 py-3 text-primary-foreground min-h-[44px] transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="button-collaboration-cta"
            >
              {copy.cta.button}
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

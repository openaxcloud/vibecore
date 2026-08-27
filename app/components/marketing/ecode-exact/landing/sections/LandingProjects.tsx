import { useTranslation } from 'react-i18next';
import { Badge, Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  formatMarketingLandingProjectBuildTime,
  getMarketingLandingProjectsCopy,
  type MarketingLandingProjectsKey,
} from '~/lib/i18n/catalogs/marketing-landing-projects';

/*
 * Card artwork reuses the local product screenshots shipped for the Press
 * page (no third-party stock-image dependency).
 */
const dashboardShotImg = '/ecode-static/assets/product/dashboard.png';

const ideShotImg = '/ecode-static/assets/product/ide.png';

const deployShotImg = '/ecode-static/assets/product/ide-deploy.png';

const projectDefinitions = [
  {
    id: 'tech-store',
    titleKey: 'marketingLandingProjects.project.techStore.title',
    descriptionKey: 'marketingLandingProjects.project.techStore.description',
    image: dashboardShotImg,
    technologyKeys: [
      'marketingLandingProjects.technology.react',
      'marketingLandingProjects.technology.node',
      'marketingLandingProjects.technology.postgresql',
    ],
    buildHours: 3,
  },
  {
    id: 'team-sync',
    titleKey: 'marketingLandingProjects.project.teamSync.title',
    descriptionKey: 'marketingLandingProjects.project.teamSync.description',
    image: ideShotImg,
    technologyKeys: [
      'marketingLandingProjects.technology.websocket',
      'marketingLandingProjects.technology.redis',
      'marketingLandingProjects.technology.typescript',
    ],
    buildHours: 2,
  },
  {
    id: 'data-viz',
    titleKey: 'marketingLandingProjects.project.dataViz.title',
    descriptionKey: 'marketingLandingProjects.project.dataViz.description',
    image: deployShotImg,
    technologyKeys: [
      'marketingLandingProjects.technology.recharts',
      'marketingLandingProjects.technology.d3',
      'marketingLandingProjects.technology.postgresql',
    ],
    buildHours: 4,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  titleKey: MarketingLandingProjectsKey;
  descriptionKey: MarketingLandingProjectsKey;
  image: string;
  technologyKeys: readonly MarketingLandingProjectsKey[];
  buildHours: number;
}>;

export default function LandingProjects() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingLandingProjectsCopy(language);

  return (
    <section
      className="bg-[var(--ecode-background)] py-14 sm:py-20"
      aria-labelledby="landing-projects-heading"
      data-testid="section-projects"
    >
      <div className="container-responsive max-w-7xl">
        <div className="mb-10 min-w-0 animate-fade-in text-center motion-reduce:animate-none sm:mb-12">
          <h2
            id="landing-projects-heading"
            className="mb-4 break-words text-responsive-2xl font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere]"
          >
            {copy['marketingLandingProjects.title']}
          </h2>
          <p className="mx-auto max-w-3xl break-words text-responsive-base text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]">
            {copy['marketingLandingProjects.subtitle']}
          </p>
        </div>

        <ul
          className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8"
          aria-labelledby="landing-projects-heading"
        >
          {projectDefinitions.map((project, index) => {
            const titleId = `landing-project-${project.id}-title`;
            const descriptionId = `landing-project-${project.id}-description`;

            return (
              <li
                key={project.id}
                className="min-w-0 animate-fade-in motion-reduce:animate-none"
                style={{ animationDelay: `${index * 100}ms` }}
                aria-labelledby={`${titleId} ${descriptionId}`}
              >
                <Card className="group h-full min-w-0 overflow-hidden border-[var(--ecode-border)] bg-[var(--ecode-surface)] transition-all duration-300 hover:border-ecode-accent/50 hover:shadow-[0_8px_32px_-8px_rgba(242,98,7,0.2)] motion-reduce:transition-none">
                  <div className="relative h-44 overflow-hidden sm:h-48">
                    <img
                      src={project.image}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none"
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={192}
                    />
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
                      aria-hidden="true"
                    />
                    <div className="absolute right-4 bottom-4 left-4 min-w-0">
                      <h3
                        id={titleId}
                        className="break-words text-[15px] font-bold text-white [overflow-wrap:anywhere]"
                      >
                        {copy[project.titleKey]}
                      </h3>
                      <p className="break-words text-[13px] text-white/80 [overflow-wrap:anywhere]">
                        {formatMarketingLandingProjectBuildTime(project.buildHours, language)}
                      </p>
                    </div>
                  </div>
                  <CardContent className="min-w-0 p-5 sm:p-6">
                    <p
                      id={descriptionId}
                      className="mb-4 break-words text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]"
                    >
                      {copy[project.descriptionKey]}
                    </p>
                    <ul className="flex min-w-0 flex-wrap gap-2" aria-label={copy[project.titleKey]}>
                      {project.technologyKeys.map((technologyKey) => (
                        <li key={technologyKey} className="min-w-0">
                          <Badge
                            variant="secondary"
                            className="max-w-full whitespace-normal break-words text-[11px] [overflow-wrap:anywhere]"
                          >
                            {copy[technologyKey]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

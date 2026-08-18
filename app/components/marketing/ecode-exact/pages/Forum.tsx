import { ArrowRight, Heart, LifeBuoy, Lightbulb, Megaphone, MessageSquare, Sparkles, Users } from 'lucide-react';
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
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  formatForumCount,
  formatForumStat,
  getMarketingExactLandingForumCopy,
  type ForumCategoryId,
  type ForumStatId,
} from '~/lib/i18n/catalogs/marketing-exact-landing-forum';

const CATEGORY_COUNTS: Record<ForumCategoryId, { topics: number; posts: number }> = {
  announcements: { topics: 128, posts: 1_200 },
  support: { topics: 3_400, posts: 12_800 },
  showcase: { topics: 960, posts: 5_100 },
  features: { topics: 742, posts: 4_300 },
};

const CATEGORY_ICONS: Record<ForumCategoryId, LucideIcon> = {
  announcements: Megaphone,
  support: LifeBuoy,
  showcase: Sparkles,
  features: Lightbulb,
};

const STAT_VALUES: Record<ForumStatId, { value: number; notation: 'standard' | 'compact' }> = {
  members: { value: 48_200, notation: 'standard' },
  posts: { value: 210_000, notation: 'compact' },
  solutions: { value: 36_000, notation: 'compact' },
};

const STAT_ICONS: Record<ForumStatId, LucideIcon> = {
  members: Users,
  posts: MessageSquare,
  solutions: Heart,
};

export default function Forum() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactLandingForumCopy(language).exactForum;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" data-testid="page-forum">
      <PublicNavbar />

      <main className="min-w-0 flex-1">
        <section className="bg-gradient-to-b from-background to-muted py-responsive">
          <div className="container-responsive">
            <div className="mx-auto max-w-3xl text-center">
              <Users className="mx-auto mb-4 h-12 w-12 text-ecode-accent-text" aria-hidden="true" />
              <h1 className="mb-4 break-words text-4xl font-bold leading-tight" data-testid="heading-forum">
                {copy.hero.title}
              </h1>
              <p className="mb-8 break-words text-[15px] leading-relaxed text-muted-foreground">
                {copy.hero.description}
              </p>
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal px-4 py-2 text-center text-[15px] leading-snug"
              >
                {formatForumCount(48_200, copy.hero.growingMembers, language, 'standard')}
              </Badge>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
              {copy.stats.items.map((stat) => {
                const Icon = STAT_ICONS[stat.id];
                const metric = STAT_VALUES[stat.id];

                return (
                  <Card key={stat.id} className="h-full min-w-0">
                    <CardContent className="pt-6 text-center">
                      <Icon className="mx-auto mb-3 h-8 w-8 text-ecode-accent-text" aria-hidden="true" />
                      <div className="break-words text-2xl font-bold tabular-nums">
                        {formatForumStat(metric.value, language, metric.notation)}
                      </div>
                      <p className="break-words text-[13px] text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-muted py-responsive">
          <div className="container-responsive">
            <h2 className="mb-12 break-words text-center text-3xl font-bold leading-tight">{copy.categories.title}</h2>

            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
              {copy.categories.items.map((category) => {
                const Icon = CATEGORY_ICONS[category.id];
                const counts = CATEGORY_COUNTS[category.id];

                return (
                  <Card key={category.id} className="h-full min-w-0">
                    <CardHeader>
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-ecode-accent/10">
                          <Icon className="h-6 w-6 text-ecode-accent-text" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="break-words leading-snug">{category.title}</CardTitle>
                          <CardDescription className="break-words leading-relaxed">
                            {category.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                      <span className="break-words">
                        {formatForumCount(counts.topics, copy.categories.topics, language)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="break-words">
                        {formatForumCount(counts.posts, copy.categories.posts, language)}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-4 break-words text-center text-3xl font-bold leading-tight">{copy.guidelines.title}</h2>
              <p className="mx-auto mb-12 max-w-2xl break-words text-center text-[15px] leading-relaxed text-muted-foreground">
                {copy.guidelines.description}
              </p>

              <div className="grid gap-8 md:grid-cols-2">
                {copy.guidelines.items.map((guideline) => (
                  <div key={guideline.id} className="flex min-w-0 gap-4">
                    <Heart className="mt-1 h-6 w-6 shrink-0 text-ecode-accent-text" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="mb-2 break-words font-semibold leading-snug">{guideline.title}</h3>
                      <p className="break-words leading-relaxed text-muted-foreground">{guideline.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-muted py-responsive">
          <div className="container-responsive text-center">
            <h2 className="mb-4 break-words text-3xl font-bold leading-tight">{copy.cta.title}</h2>
            <p className="mx-auto mb-8 max-w-2xl break-words text-[15px] leading-relaxed text-muted-foreground">
              {copy.cta.description}
            </p>
            <Link
              href="/signup"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal rounded-md bg-ecode-accent px-6 py-3 text-center leading-snug text-primary-foreground transition-colors hover:bg-ecode-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
              data-testid="button-forum-join"
            >
              <span className="min-w-0 break-words">{copy.cta.button}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

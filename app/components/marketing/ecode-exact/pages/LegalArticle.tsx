import type { ReactNode } from 'react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';

/**
 * Shared layout for long-form legal / policy articles so every policy page
 * (terms-adjacent acceptable-use, enforcement, inactivity, data-deletion …)
 * shares the same navbar/footer + prose treatment as Terms / Privacy.
 */
export function LegalArticle({
  testId,
  title,
  lastUpdated,
  intro,
  children,
}: {
  testId: string;
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col" data-testid={testId}>
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-8">{title}</h1>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
              <section>
                <p className="text-[15px] text-muted-foreground">Last updated: {lastUpdated}</p>
                {intro}
              </section>
              {children}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

/** A titled policy section with the shared heading rhythm. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold mt-8 mb-4">{title}</h2>
      {children}
    </section>
  );
}

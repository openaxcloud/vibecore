import { Fragment } from 'react';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  formatPolicySectionHeading,
  type PolicyLinkId,
  type PolicyPageCopy,
  type PolicyRichText,
} from '~/lib/i18n/catalogs/marketing-exact-guides-policies';

function RichText({ content, links }: { content: PolicyRichText; links: Record<PolicyLinkId, string> }) {
  return content.map((segment, index) => {
    if (segment.kind === 'strong') {
      return <strong key={`${segment.kind}-${index}`}>{segment.text}</strong>;
    }

    if (segment.kind === 'link') {
      return (
        <a key={`${segment.kind}-${index}`} className="break-words" href={links[segment.link]}>
          {segment.text}
        </a>
      );
    }

    return <Fragment key={`${segment.kind}-${index}`}>{segment.text}</Fragment>;
  });
}

export function LocalizedPolicyArticle({
  copy,
  headingTestId,
  language,
  lastUpdated,
  links,
  testId,
}: {
  copy: PolicyPageCopy;
  headingTestId: string;
  language: string;
  lastUpdated: string;
  links: Record<PolicyLinkId, string>;
  testId: string;
}) {
  return (
    <div className="min-h-screen flex flex-col" data-testid={testId}>
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <article className="mx-auto min-w-0 max-w-4xl">
            <h1 className="mb-8 break-words text-responsive-2xl font-bold" data-testid={headingTestId}>
              {copy.title}
            </h1>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 break-words [overflow-wrap:anywhere]">
              <header>
                <p className="text-[15px] text-muted-foreground">
                  {copy.lastUpdatedLabel} <time>{lastUpdated}</time>
                </p>
                <p>
                  <RichText content={copy.intro} links={links} />
                </p>
              </header>

              {copy.sections.map((section, sectionIndex) => {
                const headingId = `${testId}-${section.id}`;

                return (
                  <section key={section.id} aria-labelledby={headingId}>
                    <h2 id={headingId} className="mt-8 mb-4 text-2xl font-semibold">
                      {formatPolicySectionHeading(sectionIndex + 1, section.title, language)}
                    </h2>

                    {section.paragraphs.map((paragraph, index) => (
                      <p key={`${section.id}-paragraph-${index}`}>
                        <RichText content={paragraph} links={links} />
                      </p>
                    ))}

                    {section.orderedItems ? (
                      <ol className="mt-4 list-decimal space-y-2 pl-5 sm:pl-6">
                        {section.orderedItems.map((item, index) => (
                          <li key={`${section.id}-ordered-${index}`}>
                            <RichText content={item} links={links} />
                          </li>
                        ))}
                      </ol>
                    ) : null}

                    {section.unorderedItems ? (
                      <ul className="mt-4 list-disc space-y-2 pl-5 sm:pl-6">
                        {section.unorderedItems.map((item, index) => (
                          <li key={`${section.id}-unordered-${index}`}>
                            <RichText content={item} links={links} />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {section.closingParagraphs?.map((paragraph, index) => (
                      <p key={`${section.id}-closing-${index}`}>
                        <RichText content={paragraph} links={links} />
                      </p>
                    ))}
                  </section>
                );
              })}
            </div>
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

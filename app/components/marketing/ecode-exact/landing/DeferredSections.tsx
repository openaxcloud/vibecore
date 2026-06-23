import { Suspense, type ReactNode } from 'react';
import { SectionSkeleton, StatsSkeleton, FeaturesSkeleton } from './LandingSkeleton';
import { SectionLoadBoundary } from './SectionLoadBoundary';
import { instrumentedLazy, useDeferredRender } from '~/components/marketing/ecode-exact/EcodeExactUi';

const LandingStats = instrumentedLazy(() => import('./sections/LandingStats'), 'LandingStats');
const LandingVideo = instrumentedLazy(() => import('./sections/LandingVideo'), 'LandingVideo');
const LandingFeatures = instrumentedLazy(() => import('./sections/LandingFeatures'), 'LandingFeatures');
const LandingProjects = instrumentedLazy(() => import('./sections/LandingProjects'), 'LandingProjects');
const LandingTemplates = instrumentedLazy(() => import('./sections/LandingTemplates'), 'LandingTemplates');
const LandingTestimonials = instrumentedLazy(() => import('./sections/LandingTestimonials'), 'LandingTestimonials');
const LandingLanguages = instrumentedLazy(() => import('./sections/LandingLanguages'), 'LandingLanguages');
const LandingWorkflow = instrumentedLazy(() => import('./sections/LandingWorkflow'), 'LandingWorkflow');
const LandingCta = instrumentedLazy(() => import('./sections/LandingCTA'), 'LandingCTA');

interface DeferredSectionsProps {
  templates: any[];
  templatesLoading: boolean;
}

interface DeferredSectionProps {
  innerRef: React.Ref<HTMLDivElement>;
  shouldRender: boolean;
  name: string;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Renders one intersection-deferred section. While off-screen (or before the
 * chunk loads) it shows `fallback`. Once on-screen it lazily mounts `children`,
 * with a {@link SectionLoadBoundary} so a failed chunk import degrades to the
 * same `fallback` instead of tearing down the whole landing page.
 */
function DeferredSection({ innerRef, shouldRender, name, fallback, children }: DeferredSectionProps) {
  return (
    <div ref={innerRef}>
      {shouldRender ? (
        <SectionLoadBoundary name={name} fallback={fallback}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </SectionLoadBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}

export function DeferredSections({ templates, templatesLoading }: DeferredSectionsProps) {
  const statsSection = useDeferredRender({ rootMargin: '200px' });
  const videoSection = useDeferredRender({ rootMargin: '200px' });
  const featuresSection = useDeferredRender({ rootMargin: '200px' });
  const projectsSection = useDeferredRender({ rootMargin: '200px' });
  const templatesSection = useDeferredRender({ rootMargin: '200px' });
  const testimonialsSection = useDeferredRender({ rootMargin: '200px' });
  const languagesSection = useDeferredRender({ rootMargin: '200px' });
  const workflowSection = useDeferredRender({ rootMargin: '200px' });
  const ctaSection = useDeferredRender({ rootMargin: '200px' });

  return (
    <>
      <DeferredSection
        innerRef={statsSection.ref}
        shouldRender={statsSection.shouldRender}
        name="LandingStats"
        fallback={<StatsSkeleton />}
      >
        <LandingStats />
      </DeferredSection>

      <DeferredSection
        innerRef={videoSection.ref}
        shouldRender={videoSection.shouldRender}
        name="LandingVideo"
        fallback={<SectionSkeleton height="h-[600px]" />}
      >
        <LandingVideo />
      </DeferredSection>

      <DeferredSection
        innerRef={projectsSection.ref}
        shouldRender={projectsSection.shouldRender}
        name="LandingProjects"
        fallback={<SectionSkeleton />}
      >
        <LandingProjects />
      </DeferredSection>

      <DeferredSection
        innerRef={templatesSection.ref}
        shouldRender={templatesSection.shouldRender}
        name="LandingTemplates"
        fallback={<SectionSkeleton />}
      >
        <LandingTemplates templates={templates} isLoading={templatesLoading} />
      </DeferredSection>

      <DeferredSection
        innerRef={featuresSection.ref}
        shouldRender={featuresSection.shouldRender}
        name="LandingFeatures"
        fallback={<FeaturesSkeleton />}
      >
        <LandingFeatures />
      </DeferredSection>

      <DeferredSection
        innerRef={languagesSection.ref}
        shouldRender={languagesSection.shouldRender}
        name="LandingLanguages"
        fallback={<SectionSkeleton />}
      >
        <LandingLanguages />
      </DeferredSection>

      <DeferredSection
        innerRef={workflowSection.ref}
        shouldRender={workflowSection.shouldRender}
        name="LandingWorkflow"
        fallback={<SectionSkeleton />}
      >
        <LandingWorkflow />
      </DeferredSection>

      <DeferredSection
        innerRef={testimonialsSection.ref}
        shouldRender={testimonialsSection.shouldRender}
        name="LandingTestimonials"
        fallback={<SectionSkeleton />}
      >
        <LandingTestimonials />
      </DeferredSection>

      <DeferredSection
        innerRef={ctaSection.ref}
        shouldRender={ctaSection.shouldRender}
        name="LandingCTA"
        fallback={<SectionSkeleton height="h-64" />}
      >
        <LandingCta />
      </DeferredSection>
    </>
  );
}

import { Suspense } from 'react';
import { SectionSkeleton, StatsSkeleton, FeaturesSkeleton } from './LandingSkeleton';
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
      <div ref={statsSection.ref}>
        {statsSection.shouldRender ? (
          <Suspense fallback={<StatsSkeleton />}>
            <LandingStats />
          </Suspense>
        ) : (
          <StatsSkeleton />
        )}
      </div>

      <div ref={videoSection.ref}>
        {videoSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton height="h-[600px]" />}>
            <LandingVideo />
          </Suspense>
        ) : (
          <SectionSkeleton height="h-[600px]" />
        )}
      </div>

      <div ref={projectsSection.ref}>
        {projectsSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton />}>
            <LandingProjects />
          </Suspense>
        ) : (
          <SectionSkeleton />
        )}
      </div>

      <div ref={templatesSection.ref}>
        {templatesSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton />}>
            <LandingTemplates templates={templates} isLoading={templatesLoading} />
          </Suspense>
        ) : (
          <SectionSkeleton />
        )}
      </div>

      <div ref={featuresSection.ref}>
        {featuresSection.shouldRender ? (
          <Suspense fallback={<FeaturesSkeleton />}>
            <LandingFeatures />
          </Suspense>
        ) : (
          <FeaturesSkeleton />
        )}
      </div>

      <div ref={languagesSection.ref}>
        {languagesSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton />}>
            <LandingLanguages />
          </Suspense>
        ) : (
          <SectionSkeleton />
        )}
      </div>

      <div ref={workflowSection.ref}>
        {workflowSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton />}>
            <LandingWorkflow />
          </Suspense>
        ) : (
          <SectionSkeleton />
        )}
      </div>

      <div ref={testimonialsSection.ref}>
        {testimonialsSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton />}>
            <LandingTestimonials />
          </Suspense>
        ) : (
          <SectionSkeleton />
        )}
      </div>

      <div ref={ctaSection.ref}>
        {ctaSection.shouldRender ? (
          <Suspense fallback={<SectionSkeleton height="h-64" />}>
            <LandingCta />
          </Suspense>
        ) : (
          <SectionSkeleton height="h-64" />
        )}
      </div>
    </>
  );
}

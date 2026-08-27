import { Skeleton } from '~/components/marketing/ecode-exact/EcodeExactUi';

export function SectionSkeleton({ height = 'h-96' }: { height?: string }) {
  return (
    <div className={`${height} w-full bg-[var(--ecode-surface)] animate-pulse rounded-lg`}>
      <div className="container-responsive max-w-7xl py-12">
        <div className="text-center space-y-6">
          <Skeleton className="h-10 w-full max-w-[16rem] mx-auto" />
          <Skeleton className="h-6 w-full max-w-[24rem] mx-auto" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="py-20 bg-gradient-to-b from-[var(--ecode-background)] to-[var(--ecode-surface-tertiary)]">
      <div className="container-responsive max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center space-y-3">
              <Skeleton className="h-12 w-12 rounded-full mx-auto" />
              <Skeleton className="h-8 w-20 mx-auto" />
              <Skeleton className="h-4 w-24 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FeaturesSkeleton() {
  return (
    <div className="py-24 bg-[var(--ecode-surface)]">
      <div className="container-responsive max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <Skeleton className="h-12 w-full max-w-[20rem] mx-auto" />
          <Skeleton className="h-6 w-full max-w-[24rem] mx-auto" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-6 rounded-xl border border-[var(--ecode-border)] space-y-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

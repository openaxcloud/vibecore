import { Layers3 } from 'lucide-react';
import { Link } from 'react-router';
import { projectGallerySourcePath, type ProjectGalleryProvenance } from '~/lib/project-gallery-provenance';

export function ProjectGalleryOriginLink({ provenance }: { provenance: ProjectGalleryProvenance }) {
  const label = `Remixed from ${provenance.sourceGalleryAppName}`;

  return (
    <Link
      to={projectGallerySourcePath(provenance)}
      className="flex h-7 min-w-7 max-w-48 shrink-0 items-center justify-center gap-1.5 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 text-[11px] font-medium text-bolt-elements-textSecondary transition-colors hover:border-bolt-elements-borderColorActive hover:text-bolt-elements-textPrimary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 max-sm:px-1.5"
      aria-label={`${label}. View source app in Gallery.`}
      title={`${label} · ${provenance.sourceGalleryAppVersionId}`}
      data-testid="project-gallery-origin-link"
    >
      <Layers3 className="h-3.5 w-3.5 shrink-0 text-accent-500" aria-hidden />
      <span className="hidden min-[960px]:inline">Remixed from</span>
      <span className="max-w-24 truncate max-sm:hidden">{provenance.sourceGalleryAppName}</span>
    </Link>
  );
}

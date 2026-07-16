import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(new URL('./projects.$projectId.ide.tsx', import.meta.url), 'utf8');

describe('Project Editor Gallery provenance contract', () => {
  it('derives provenance from the real project activity and mounts the source link in the top bar', () => {
    expect(routeSource).toContain('projectGalleryProvenance(project, notifications)');
    expect(routeSource).toContain('<ProjectGalleryOriginLink provenance={galleryProvenance} />');
  });
});

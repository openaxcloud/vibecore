import { describe, expect, it } from 'vitest';
import { projectGalleryProvenance, projectGallerySourcePath } from './project-gallery-provenance';

describe('project Gallery provenance', () => {
  it('reads the complete READY remix activity contract and builds an exact slug link', () => {
    const provenance = projectGalleryProvenance({ sourceType: 'gallery-remix' }, [
      {
        action: 'project.remix.create',
        metadata: {
          sourceGalleryAppId: 'demo:react-saas',
          sourceGalleryAppVersionId: 'demo:react-saas:v1',
          sourceGalleryAppSlug: 'orbit-crm',
          sourceGalleryAppName: 'Orbit CRM',
          sourceProjectId: 'source-project-1',
        },
      },
    ]);

    expect(provenance).toEqual({
      sourceGalleryAppId: 'demo:react-saas',
      sourceGalleryAppVersionId: 'demo:react-saas:v1',
      sourceGalleryAppSlug: 'orbit-crm',
      sourceGalleryAppName: 'Orbit CRM',
      sourceProjectId: 'source-project-1',
    });
    expect(projectGallerySourcePath(provenance!)).toBe('/gallery/orbit-crm');
  });

  it('does not infer provenance for non-remixes or incomplete activity', () => {
    const incomplete = [
      {
        action: 'project.remix.create',
        metadata: {
          sourceGalleryAppId: 'gallery-app-1',
          sourceGalleryAppVersionId: 'gallery-version-1',
        },
      },
    ];

    expect(projectGalleryProvenance({ sourceType: 'gallery-remix' }, incomplete)).toBeUndefined();
    expect(
      projectGalleryProvenance({ sourceType: 'blank' }, [
        {
          action: 'project.remix.create',
          metadata: {
            sourceGalleryAppId: 'gallery-app-1',
            sourceGalleryAppVersionId: 'gallery-version-1',
            sourceGalleryAppSlug: 'sales-console',
            sourceGalleryAppName: 'Sales Console',
          },
        },
      ]),
    ).toBeUndefined();
  });

  it('encodes a validated source slug when constructing the route', () => {
    expect(
      projectGallerySourcePath({
        sourceGalleryAppId: 'app-1',
        sourceGalleryAppVersionId: 'version-1',
        sourceGalleryAppSlug: 'sales console/v2',
        sourceGalleryAppName: 'Sales Console',
      }),
    ).toBe('/gallery/sales%20console%2Fv2');
  });
});

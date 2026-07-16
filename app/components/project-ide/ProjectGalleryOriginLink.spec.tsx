/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProjectGalleryOriginLink } from './ProjectGalleryOriginLink';

describe('<ProjectGalleryOriginLink />', () => {
  afterEach(cleanup);

  it('links the remixed project to the exact Gallery source slug', () => {
    render(
      <MemoryRouter>
        <ProjectGalleryOriginLink
          provenance={{
            sourceGalleryAppId: 'demo:react-saas',
            sourceGalleryAppVersionId: 'demo:react-saas:v1',
            sourceGalleryAppSlug: 'orbit-crm',
            sourceGalleryAppName: 'Orbit CRM',
          }}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Remixed from Orbit CRM. View source app in Gallery.' });
    expect(link.getAttribute('href')).toBe('/gallery/orbit-crm');
    expect(link.getAttribute('title')).toContain('demo:react-saas:v1');
    expect(screen.getByText('Orbit CRM')).toBeTruthy();
  });
});

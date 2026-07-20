/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TemplateGallery,
  filterTemplateGallery,
  sortTemplateGallery,
  templateGalleryFacets,
  type GalleryApp,
} from './TemplateGallery';

const searchHarness = vi.hoisted(() => ({ current: '' }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useSearchParams: () => {
      const params = new URLSearchParams(searchHarness.current);

      const setSearchParams: ReturnType<typeof actual.useSearchParams>[1] = (nextInit) => {
        const previous = new URLSearchParams(searchHarness.current);
        const resolved = typeof nextInit === 'function' ? nextInit(previous) : nextInit;
        searchHarness.current = new URLSearchParams(resolved).toString();
      };

      return [params, setSearchParams] as const;
    },
  };
});

const galleryApps: readonly GalleryApp[] = [
  {
    id: 'crm-pro',
    slug: 'crm-pro',
    name: 'Northstar CRM',
    description: 'A production-ready sales pipeline with accounts, activities and forecasting.',
    thumbnailUrl: '/gallery/crm-pro.png',
    previewUrl: 'https://northstar.example.test',
    author: { id: 'user-1', name: 'Maya Chen', username: 'mayac', verified: true },
    artifactType: 'web-app',
    category: 'crm',
    technologies: ['React', 'TypeScript', 'PostgreSQL'],
    publishedAt: '2026-07-15T10:00:00.000Z',
    remixCount: 1284,
    reportCount: 0,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'booking',
    slug: 'booking-studio',
    name: 'Booking Studio',
    description: 'Appointments, availability, reminders and a customer booking portal.',
    thumbnailUrl: '/gallery/booking.png',
    previewUrl: 'https://booking.example.test',
    author: { id: 'user-2', name: 'Noah Williams', username: 'noahw' },
    artifactType: 'web-app',
    category: 'booking',
    technologies: ['Vue', 'TypeScript', 'SQLite'],
    publishedAt: '2026-07-14T10:00:00.000Z',
    remixCount: 834,
    reportCount: 2,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
    provenance: {
      sourceAppId: 'calendar-core',
      sourceAppName: 'Calendar Core',
      sourceAppSlug: 'calendar-core',
      sourceAuthorName: 'Ari Moss',
    },
  },
  {
    id: 'canvas-game',
    slug: 'orbit-runner',
    name: 'Orbit Runner',
    description: 'A polished browser game with touch controls, scores and particle effects.',
    thumbnailUrl: '/gallery/orbit.png',
    previewUrl: 'https://orbit.example.test',
    author: { id: 'user-3', name: 'Sam Rivera', username: 'samr' },
    artifactType: 'game',
    category: 'entertainment',
    technologies: ['Canvas', 'JavaScript'],
    publishedAt: '2026-07-13T10:00:00.000Z',
    remixCount: 421,
    reportCount: 0,
    featured: false,
    remixAllowed: false,
    moderationStatus: 'approved',
  },
  {
    id: 'pending-dashboard',
    slug: 'pending-dashboard',
    name: 'Pending Dashboard',
    description: 'An analytics dashboard waiting for moderation.',
    thumbnailUrl: null,
    previewUrl: null,
    author: { id: 'user-4', name: 'Taylor Reed' },
    artifactType: 'dashboard',
    category: 'analytics',
    technologies: ['Svelte', 'TypeScript'],
    publishedAt: '2026-07-16T10:00:00.000Z',
    remixCount: 0,
    reportCount: 3,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'pending',
  },
];

afterEach(() => {
  cleanup();
  searchHarness.current = '';
});

function renderGallery(
  props: Omit<React.ComponentProps<typeof TemplateGallery>, 'apps'> & { apps?: readonly GalleryApp[] } = {},
  initialEntry = '/dashboard/templates',
) {
  searchHarness.current = initialEntry.split('?')[1] ?? '';

  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/templates',
        element: <TemplateGallery apps={props.apps ?? galleryApps} {...props} />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  render(<RouterProvider router={router} />);
}

describe('TemplateGallery', () => {
  it('renders approved published apps with complete remix discovery metadata', () => {
    renderGallery();

    expect(screen.getByTestId('template-gallery').getAttribute('aria-label')).toBe('Community application gallery');
    expect(screen.getAllByTestId('template-card')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Northstar CRM' })).toBeTruthy();
    expect(screen.getByText('Maya Chen')).toBeTruthy();
    expect(screen.getAllByText('Web App').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CRM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Jul 15, 2026')).toBeTruthy();
    expect(screen.getByTitle('1,284 remixes')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Northstar CRM' }).getAttribute('href')).toBe('/gallery/crm-pro');
    expect(screen.getByRole('link', { name: 'Remix Northstar CRM' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Pending Dashboard' })).toBeNull();
  });

  it('shows remix provenance and links it to the source app', () => {
    renderGallery();

    expect(screen.getByText(/Remixed from/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Calendar Core' }).getAttribute('href')).toBe('/gallery/calendar-core');
    expect(screen.getByText(/by Ari Moss/)).toBeTruthy();
  });

  it('filters immediately across app, author, technology and provenance text', () => {
    renderGallery();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search published apps' }), {
      target: { value: 'PostgreSQL' },
    });
    expect(screen.getAllByTestId('template-card')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Northstar CRM' })).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search published apps' }), {
      target: { value: 'Calendar Core' },
    });
    expect(screen.getAllByTestId('template-card')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Booking Studio' })).toBeTruthy();
  });

  it('synchronizes category, artifact type, technology, sort, featured and list view with the URL', () => {
    renderGallery();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'crm' } });
    fireEvent.change(screen.getByLabelText('Artifact type'), { target: { value: 'web-app' } });
    fireEvent.change(screen.getByLabelText('Technology'), { target: { value: 'PostgreSQL' } });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'newest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Featured only' }));
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(searchHarness.current).toContain('category=crm');
    expect(searchHarness.current).toContain('type=web-app');
    expect(searchHarness.current).toContain('tech=PostgreSQL');
    expect(searchHarness.current).toContain('sort=newest');
    expect(searchHarness.current).toContain('featured=true');
    expect(searchHarness.current).toContain('view=list');
  });

  it('resets a stale server cursor when discovery filters change but preserves it for view changes', () => {
    renderGallery({}, '/dashboard/templates?cursor=page-two');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(searchHarness.current).toContain('cursor=page-two');

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'crm' } });
    expect(searchHarness.current).not.toContain('cursor=');
    expect(searchHarness.current).toContain('category=crm');
  });

  it('renders cursor navigation supplied by the server route', () => {
    renderGallery({
      firstPageHref: '/dashboard/templates?sort=name',
      nextPageHref: '/dashboard/templates?sort=name&cursor=next',
    });

    expect(screen.getByRole('navigation', { name: 'Gallery pages' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'First page' }).getAttribute('href')).toBe(
      '/dashboard/templates?sort=name',
    );
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/dashboard/templates?sort=name&cursor=next',
    );
  });

  it('invokes real view, remix and report callbacks with the selected app', async () => {
    const onView = vi.fn();
    const onRemix = vi.fn(async () => undefined);
    const onReport = vi.fn(async () => undefined);
    renderGallery({ onView, onRemix, onReport });

    fireEvent.click(screen.getByRole('button', { name: 'View Northstar CRM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remix Northstar CRM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report Booking Studio' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'SPAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(onView).toHaveBeenCalledWith(galleryApps[0]);
    await waitFor(() => expect(onRemix).toHaveBeenCalledWith(galleryApps[0]));
    await waitFor(() =>
      expect(onReport).toHaveBeenCalledWith(
        galleryApps[1],
        expect.objectContaining({ reason: 'SPAM', submissionId: expect.stringMatching(/^gallery-report-/) }),
      ),
    );
  });

  it('keeps global server facets available when the current page does not contain them', () => {
    renderGallery({
      apps: [galleryApps[0]],
      facets: {
        artifactTypes: ['dashboard', 'game', 'web-app'],
        categories: ['analytics', 'crm', 'entertainment'],
        technologies: ['Canvas', 'PostgreSQL', 'React', 'Svelte', 'TypeScript'],
      },
    });

    expect(screen.getByRole('option', { name: 'Analytics' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Game' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Svelte' })).toBeTruthy();
  });

  it('requires details for OTHER and preserves the report form after a recoverable failure', async () => {
    const onReport = vi.fn().mockRejectedValueOnce(new Error('Moderation service timed out.')).mockResolvedValueOnce();
    renderGallery({ onReport });

    const trigger = screen.getByRole('button', { name: 'Report Northstar CRM' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Report Northstar CRM' })).toBeTruthy();
    expect(within(screen.getByLabelText('Reason')).getAllByRole('option')).toHaveLength(9);

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'OTHER' } });
    expect((screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Details \(required\)/), { target: { value: 'A specific issue.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Moderation service timed out.'));
    expect((screen.getByLabelText(/Details \(required\)/) as HTMLTextAreaElement).value).toBe('A specific issue.');

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Report Northstar CRM' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('honors creator remix controls and locks duplicate remix actions while one is pending', () => {
    renderGallery({ onRemix: vi.fn(), remixingAppId: 'crm-pro' });

    const pending = screen.getByRole('button', { name: 'Remixing Northstar CRM' }) as HTMLButtonElement;

    const creatorDisabled = screen.getByRole('button', {
      name: 'Orbit Runner cannot be remixed by its creator settings',
    }) as HTMLButtonElement;

    const otherRemix = screen.getByRole('button', { name: 'Remix Booking Studio' }) as HTMLButtonElement;

    expect(pending.disabled).toBe(true);
    expect(creatorDisabled.disabled).toBe(true);
    expect(otherRemix.disabled).toBe(true);
  });

  it('can expose pending moderation records to an authorized moderation surface', () => {
    renderGallery({ includeUnapproved: true });

    expect(screen.getAllByTestId('template-card')).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Pending Dashboard' })).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(
      document.querySelector('[data-gallery-app-id="pending-dashboard"]')?.getAttribute('data-moderation-status'),
    ).toBe('pending');
  });

  it('renders explicit loading, recoverable error, filtered-empty and catalog-empty states', () => {
    const onRetry = vi.fn();
    renderGallery({ status: 'loading' });
    expect(screen.getByRole('status', { name: 'Loading published applications' })).toBeTruthy();

    cleanup();
    renderGallery({ status: 'error', error: 'The gallery service timed out.', onRetry });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    cleanup();
    renderGallery({}, '/dashboard/templates?category=impossible');
    expect(screen.getByRole('heading', { name: 'No published apps match' })).toBeTruthy();

    cleanup();
    renderGallery({ apps: [] });
    expect(screen.getByRole('heading', { name: 'No apps have been published yet' })).toBeTruthy();
  });

  it('keeps the compact embedding isolated from gallery URL filters and view state', () => {
    renderGallery({ compact: true }, '/dashboard/templates?q=impossible&category=crm&type=game&view=list');

    expect(screen.getAllByTestId('template-card')).toHaveLength(3);
    expect(screen.queryByRole('searchbox', { name: 'Search published apps' })).toBeNull();
    expect(screen.getByTestId('template-gallery').getAttribute('data-view')).toBe('grid');
  });
});

describe('community gallery discovery model', () => {
  it('derives deterministic category and artifact facets from approved applications', () => {
    expect(templateGalleryFacets(galleryApps)).toEqual({
      artifactTypes: ['game', 'web-app'],
      categories: ['booking', 'crm', 'entertainment'],
      technologies: ['Canvas', 'JavaScript', 'PostgreSQL', 'React', 'SQLite', 'TypeScript', 'Vue'],
    });
  });

  it('combines filters and excludes unapproved applications by default', () => {
    const results = filterTemplateGallery(galleryApps, {
      artifactType: 'web-app',
      category: 'crm',
      featuredOnly: true,
      includeUnapproved: false,
      query: 'Maya',
    });

    expect(results.map((app) => app.id)).toEqual(['crm-pro']);
    expect(
      filterTemplateGallery(galleryApps, {
        artifactType: '',
        category: '',
        featuredOnly: false,
        includeUnapproved: false,
        query: 'Pending Dashboard',
      }),
    ).toEqual([]);
  });

  it('sorts deterministically by featured status, remix count, date and name', () => {
    expect(sortTemplateGallery(galleryApps.slice(0, 3), 'featured').map((app) => app.id)).toEqual([
      'crm-pro',
      'booking',
      'canvas-game',
    ]);
    expect(sortTemplateGallery(galleryApps.slice(0, 3), 'newest').map((app) => app.id)).toEqual([
      'crm-pro',
      'booking',
      'canvas-game',
    ]);
    expect(sortTemplateGallery(galleryApps.slice(0, 3), 'name').map((app) => app.name)).toEqual([
      'Booking Studio',
      'Northstar CRM',
      'Orbit Runner',
    ]);
  });
});

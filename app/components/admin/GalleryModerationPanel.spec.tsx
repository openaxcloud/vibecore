/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GalleryModerationPanel,
  type GalleryModerationReport,
  type ModeratedPublishedApp,
  type ModerationQueueApp,
} from './GalleryModerationPanel';

const pendingApp: ModerationQueueApp = {
  id: 'gallery-app-pending',
  slug: 'northstar-ops',
  name: 'Northstar Operations',
  description: 'A live operations dashboard with incidents, runbooks and service ownership.',
  author: { displayName: 'Maya Chen', handle: 'mayac' },
  artifactType: 'DASHBOARD',
  category: 'operations',
  technologies: ['React', 'TypeScript'],
  thumbnailUrl: '/gallery/northstar.png',
  previewUrl: 'https://northstar.example.test',
  previewStatus: 'VERIFIED',
  submittedAt: '2026-07-16T08:00:00.000Z',
  reportCount: 0,
};

const publishedApp: ModeratedPublishedApp = {
  id: 'gallery-app-published',
  slug: 'kindred-booking',
  name: 'Kindred Booking',
  description: 'Scheduling, availability and a customer booking portal.',
  author: { displayName: 'Noah Williams', handle: 'noahw' },
  artifactType: 'WEB_APP',
  category: 'booking',
  technologies: ['Vue', 'TypeScript'],
  thumbnailUrl: '/gallery/kindred.png',
  previewUrl: 'https://kindred.example.test',
  featured: false,
  remixCount: 42,
  reportCount: 1,
  publishedAt: '2026-07-15T08:00:00.000Z',
};

const report: GalleryModerationReport = {
  id: 'report-1',
  galleryAppId: publishedApp.id,
  reporterUserId: 'user-reporter',
  reason: 'MALWARE',
  details: 'The preview attempts an unexpected executable download.',
  status: 'OPEN',
  createdAt: '2026-07-16T09:00:00.000Z',
};

afterEach(cleanup);

function renderPanel(overrides: Partial<React.ComponentProps<typeof GalleryModerationPanel>> = {}) {
  const onCommand = vi.fn();

  render(
    <GalleryModerationPanel
      queue={[pendingApp]}
      publishedApps={[publishedApp]}
      reports={[report]}
      onCommand={onCommand}
      {...overrides}
    />,
  );

  return onCommand;
}

describe('GalleryModerationPanel', () => {
  it('surfaces review evidence and requires confirmation before approval', () => {
    const onCommand = renderPanel();

    expect(screen.getByRole('heading', { name: pendingApp.name })).toBeTruthy();
    expect(screen.getByText('Preview verified')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open live preview' }).getAttribute('href')).toBe(pendingApp.previewUrl);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onCommand).not.toHaveBeenCalled();

    expect(screen.getByRole('link', { name: 'Open Preview in a real browser' }).getAttribute('href')).toBe(
      pendingApp.previewUrl,
    );

    const confirm = screen.getByRole('button', { name: 'Approve application' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(
      screen.getByLabelText(
        'I opened the Preview in a real browser and verified that it renders, basic interactions work, and the thumbnail is correct.',
      ),
    );
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moderate',
      appId: pendingApp.id,
      action: 'APPROVE',
      functionalPreviewConfirmed: true,
    });
  });

  it('requires an auditable reason before rejecting a submission', () => {
    const onCommand = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    const confirm = screen.getByRole('button', { name: 'Reject application' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Reason for rejection'), {
      target: { value: 'The preview does not match the submitted snapshot.' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moderate',
      appId: pendingApp.id,
      action: 'REJECT',
      reason: 'The preview does not match the submitted snapshot.',
    });
  });

  it('features published community applications but protects code-managed demos', () => {
    const onCommand = renderPanel({
      publishedApps: [publishedApp, { ...publishedApp, id: 'demo:react-saas', name: 'Orbit CRM' }],
    });

    fireEvent.click(screen.getByRole('tab', { name: /Published/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Feature' }));
    fireEvent.click(screen.getByRole('button', { name: 'Feature application' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moderate',
      appId: publishedApp.id,
      action: 'FEATURE',
    });

    const catalogManaged = screen.getByRole('button', { name: 'Catalog managed' }) as HTMLButtonElement;
    expect(catalogManaged.disabled).toBe(true);
  });

  it('archives a published community application only after an audited confirmation', () => {
    const onCommand = renderPanel({ initialTab: 'published' });

    fireEvent.click(screen.getByRole('button', { name: 'Archive application' }));

    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Archive application',
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for archival'), {
      target: { value: 'Confirmed malware in the published preview.' },
    });
    fireEvent.click(confirm);

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moderate',
      appId: publishedApp.id,
      action: 'ARCHIVE',
      reason: 'Confirmed malware in the published preview.',
    });
  });

  it('requires a resolution note and resolves reports against their source application', () => {
    const onCommand = renderPanel({ initialTab: 'reports' });

    expect(screen.getByRole('heading', { name: publishedApp.name })).toBeTruthy();
    expect(screen.getByText('Suspected malware')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Action taken' }));

    const confirm = screen.getByRole('button', { name: 'Resolve report' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Resolution note'), {
      target: { value: 'Preview disabled and application archived after malware verification.' },
    });
    fireEvent.click(confirm);

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'resolve-report',
      reportId: report.id,
      resolution: 'ACTIONED',
      note: 'Preview disabled and application archived after malware verification.',
    });
  });

  it('provides explicit empty, busy and recoverable mutation states', () => {
    const { rerender } = render(
      <GalleryModerationPanel queue={[]} publishedApps={[]} reports={[]} busy onCommand={vi.fn()} />,
    );

    expect(screen.getByRole('status').textContent).toContain('Applying moderation decision');
    expect(screen.getByText('Review queue is clear')).toBeTruthy();

    rerender(
      <GalleryModerationPanel
        queue={[]}
        publishedApps={[]}
        reports={[]}
        feedback={{ error: 'The moderation service is not reachable.' }}
        onCommand={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('not reachable');
    fireEvent.click(screen.getByRole('tab', { name: /Open reports/ }));
    expect(screen.getByText('No open reports')).toBeTruthy();
  });

  it('falls back gracefully when a moderation thumbnail cannot render', () => {
    renderPanel();

    fireEvent.error(screen.getByRole('img', { name: `Preview of ${pendingApp.name}` }));
    expect(screen.getByText('Preview image unavailable')).toBeTruthy();
  });
});

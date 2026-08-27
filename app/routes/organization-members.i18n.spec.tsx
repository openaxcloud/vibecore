/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  revalidatorState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationMock(...args),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      className,
      onSubmit,
      title,
    }: {
      children: ReactNode;
      className?: string;
      onSubmit?: FormEventHandler<HTMLFormElement>;
      title?: string;
    }) => (
      <form className={className} onSubmit={onSubmit} title={title}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
    useSubmit: () => submitMock,
  };
});

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
  AsyncPanelError: ({ title, description }: { title: string; description: string }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  ),
}));

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  PrimaryButton: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
  SelectField: ({
    label,
    name,
    options,
  }: {
    label: string;
    name: string;
    options: Array<{ value: string; label: string }>;
  }) => (
    <label>
      {label}
      <select name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
  TextField: ({
    label,
    name,
    placeholder,
    type,
  }: {
    label: string;
    name: string;
    placeholder?: string;
    type?: string;
  }) => (
    <label>
      {label}
      <input name={name} placeholder={placeholder} type={type} />
    </label>
  ),
}));

vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <section role="dialog">{children}</section>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
  }) =>
    isOpen ? (
      <section role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button">{confirmLabel}</button>
      </section>
    ) : null,
}));

vi.mock('~/components/ui/RelativeTime', () => ({
  RelativeTime: ({ prefix }: { prefix?: string }) => <span>{prefix}</span>,
}));

import OrganizationMembersPage, { action, loader, meta } from './organization-members';
import {
  formatOrganizationMembersCopy,
  getOrganizationMembersCopy,
  organizationMemberRoleLabel,
} from '~/lib/i18n/catalogs/organization-members';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';
  routeState.revalidatorState = 'idle';

  return render(
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <OrganizationMembersPage />
    </I18nextProvider>,
  );
}

async function runAction(fields: Record<string, string>) {
  return (await action({
    request: new Request('https://e-code.ai/organization-members?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    params: {},
    context: {},
  })) as { data: { status?: string; error?: string }; init?: { status?: number } };
}

const loaderData = {
  forbidden: false,
  loadError: null,
  loadErrorKind: null,
  language: 'fr',
  orgId: 'org-1',
  orgName: 'Acme France',
  roles: [
    { key: 'viewer', name: 'Lecteur' },
    { key: 'member', name: 'Membre' },
    { key: 'admin', name: 'Administrateur' },
    { key: 'owner', name: 'Propriétaire' },
  ],
  memberships: [
    {
      id: 'membership-1',
      userId: 'user-owner',
      roleKey: 'owner',
      userName: 'Avi Cohen',
      userEmail: 'avi@acme.example',
    },
    {
      id: 'membership-2',
      userId: 'user-member',
      roleKey: 'member',
      userName: 'Mélanie Durand',
      userEmail: 'melanie@acme.example',
    },
  ],
  invitations: [
    {
      id: 'invite-1',
      email: 'future@acme.example',
      roleKey: 'viewer',
      expiresAt: '2099-08-04T12:00:00.000Z',
      createdAt: '2026-08-04T12:00:00.000Z',
    },
  ],
};

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  revalidateMock.mockReset();
  submitMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
});

describe('organization members i18n', () => {
  it('falls back to English, interpolates user data, and localizes built-in roles', () => {
    const copy = getOrganizationMembersCopy('fr');

    expect(getOrganizationMembersCopy('de')['organizationMembers.title']).toBe('Organization members');
    expect(organizationMemberRoleLabel('owner', 'Custom owner', copy)).toBe('Propriétaire');
    expect(organizationMemberRoleLabel('incident_commander', 'Incident Commander', copy)).toBe('Incident Commander');
    expect(formatOrganizationMembersCopy(copy['organizationMembers.success.invited'], { email: 'a@b.test' })).toBe(
      'Invitation envoyée à a@b.test.',
    );
  });

  it('renders the complete member and invitation surfaces in French while preserving user data', () => {
    renderPage(loaderData);

    expect(screen.getByRole('heading', { name: 'Membres de l’organisation' })).toBeTruthy();
    expect(screen.getByLabelText('Inviter par e-mail')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Envoyer l’invitation' })).toBeTruthy();
    expect(screen.getByText('Avi Cohen')).toBeTruthy();
    expect(screen.getByText('Mélanie Durand')).toBeTruthy();
    expect(screen.getByText('future@acme.example')).toBeTruthy();
    expect(screen.getByText('Invité le')).toBeTruthy();
    expect(screen.getByText('Expire le')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renvoyer l’invitation à future@acme.example' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Révoquer l’invitation de future@acme.example' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Transférer la propriété à Mélanie Durand' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer Mélanie Durand' })).toBeTruthy();
    expect(screen.queryByText('Pending invitations')).toBeNull();
  });

  it('localizes the ownership transfer dialog without altering names', () => {
    renderPage(loaderData);

    fireEvent.click(screen.getByRole('button', { name: 'Transférer la propriété à Mélanie Durand' }));

    expect(screen.getByRole('heading', { name: 'Transférer la propriété' })).toBeTruthy();
    expect(screen.getByText(/Mélanie Durand deviendra propriétaire de Acme France/u)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Saisissez Acme France pour confirmer'), {
      target: { value: 'Acme France' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Transférer la propriété' }));

    expect(submitMock).toHaveBeenCalledWith(
      { intent: 'transfer', orgId: 'org-1', userId: 'user-member' },
      { method: 'post' },
    );
  });

  it('renders a French recoverable error instead of a false empty member list', () => {
    renderPage({ ...loaderData, memberships: [], invitations: [], loadError: true, loadErrorKind: 'temporary' });

    expect(screen.getByRole('heading', { name: 'Impossible de charger les membres' })).toBeTruthy();
    expect(screen.queryByText('Aucun membre trouvé.')).toBeNull();
  });

  it('returns localized action validation and masks raw upstream prose', async () => {
    const missingEmail = await runAction({ intent: 'invite', orgId: 'org-1' });
    expect(missingEmail.data.error).toBe('Saisissez une adresse e-mail pour envoyer une invitation.');
    expect(missingEmail.init?.status).toBe(400);

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Invitation service exploded' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const failedInvite = await runAction({
      intent: 'invite',
      orgId: 'org-1',
      email: 'new@acme.example',
      roleKey: 'member',
    });
    expect(failedInvite.data.error).toBe('Impossible d’envoyer l’invitation.');
    expect(failedInvite.data.error).not.toContain('exploded');
  });

  it('detects French in the loader and serves localized route metadata', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-1' });
    apiRequestMock
      .mockResolvedValueOnce({ memberships: [] })
      .mockResolvedValueOnce({ roles: [] })
      .mockResolvedValueOnce({ organization: { id: 'org-1', name: 'Acme France' } })
      .mockResolvedValueOnce({ invitations: [] });

    const result = (await loader({
      request: new Request('https://e-code.ai/organization-members', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
      }),
      params: {},
      context: {},
    })) as { data: { language: string; roles: Array<{ key: string; name: string }> } };

    expect(result.data.language).toBe('fr');
    expect(result.data.roles.find((role) => role.key === 'owner')?.name).toBe('Propriétaire');
    expect(meta({ matches: [{ id: 'root', data: { language: 'fr' } }] } as never)).toEqual([
      { title: 'Membres de l’organisation - E-Code' },
    ]);
  });
});

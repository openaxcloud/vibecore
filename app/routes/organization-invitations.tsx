import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

/*
 * `/invitations` is the single organization-invitation workspace. Keep this
 * legacy URL alive so bookmarks and forms opened before a deployment converge
 * safely, while every invitation mutation remains explicit on one screen.
 */
export function organizationInvitationsLocation(requestUrl: string, organizationId?: string): string {
  const source = new URL(requestUrl);
  const target = new URL('/invitations', source.origin);

  for (const [key, value] of source.searchParams) {
    target.searchParams.append(key, value);
  }

  if (organizationId?.trim()) {
    target.searchParams.set('orgId', organizationId.trim());
  }

  return `${target.pathname}${target.search}`;
}

export function loader({ request }: LoaderFunctionArgs) {
  return redirect(organizationInvitationsLocation(request.url), 308);
}

export async function action({ request }: ActionFunctionArgs) {
  let organizationId: string | undefined;

  try {
    const form = await request.formData();
    const value = form.get('orgId');
    organizationId = typeof value === 'string' ? value : undefined;
  } catch {
    // A malformed legacy request is still routed to the safe canonical screen.
  }

  // Never replay a mutation implicitly while consolidating a legacy surface.
  return redirect(organizationInvitationsLocation(request.url, organizationId), 303);
}

/* The loader always redirects; the element exists only for route typing. */
export default function OrganizationInvitationsRedirect() {
  return null;
}

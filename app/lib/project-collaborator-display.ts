/**
 * Pure helpers for rendering the project collaborators list.
 *
 * The collaborators API returns an opaque internal `userId` for every row and,
 * once the User join is wired server-side, an optional `email` / `displayName`.
 * These helpers pick the most human-recognizable label that is actually present
 * so a freshly-invited collaborator shows up as their name/email rather than a
 * raw CUID, while still degrading gracefully to the id when nothing else exists.
 */

export type ProjectCollaborator = {
  id: string;
  userId: string;
  roleKey: string;
  email?: string | null;
  displayName?: string | null;
  createdAt?: string;
};

function clean(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Primary label for a collaborator row: prefer the display name, then the
 * email, and only fall back to the opaque userId when neither is available.
 */
export function collaboratorTitle(collaborator: ProjectCollaborator): string {
  return clean(collaborator.displayName) ?? clean(collaborator.email) ?? clean(collaborator.userId) ?? 'Unknown member';
}

/**
 * Secondary line for a collaborator row. When the title is a name we also show
 * the email (if known) alongside the role so the member stays identifiable.
 */
export function collaboratorDetail(collaborator: ProjectCollaborator): string {
  const role = `Role: ${clean(collaborator.roleKey) ?? 'member'}`;
  const name = clean(collaborator.displayName);
  const email = clean(collaborator.email);

  // Only repeat the email on the detail line when the title used the name.
  if (name && email) {
    return `${email} · ${role}`;
  }

  return role;
}

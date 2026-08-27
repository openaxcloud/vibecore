import { describe, expect, it } from 'vitest';
import { collaboratorDetail, collaboratorTitle } from './project-collaborator-display';
import { formatProjectCollaboratorsCopy, getProjectCollaboratorsCopy } from '~/lib/i18n/catalogs/project-collaborators';

const base = { id: 'pc_1', userId: 'usr_cuid_opaque', roleKey: 'editor' };

describe('collaboratorTitle', () => {
  it('prefers display name', () => {
    expect(collaboratorTitle({ ...base, displayName: 'Ada Lovelace', email: 'ada@example.com' })).toBe('Ada Lovelace');
  });

  it('falls back to email when no display name', () => {
    expect(collaboratorTitle({ ...base, email: 'ada@example.com' })).toBe('ada@example.com');
  });

  it('falls back to the opaque userId only when nothing else is present', () => {
    expect(collaboratorTitle(base)).toBe('usr_cuid_opaque');
  });

  it('ignores blank/whitespace identity fields', () => {
    expect(collaboratorTitle({ ...base, displayName: '   ', email: '' })).toBe('usr_cuid_opaque');
  });

  it('handles null identity fields', () => {
    expect(collaboratorTitle({ ...base, displayName: null, email: null })).toBe('usr_cuid_opaque');
  });
});

describe('collaboratorDetail', () => {
  it('shows email alongside the role when the title used the name', () => {
    expect(collaboratorDetail({ ...base, displayName: 'Ada Lovelace', email: 'ada@example.com' })).toBe(
      'ada@example.com · Role: editor',
    );
  });

  it('shows just the role when the title already is the email', () => {
    expect(collaboratorDetail({ ...base, email: 'ada@example.com' })).toBe('Role: editor');
  });

  it('shows just the role when only an id is known', () => {
    expect(collaboratorDetail(base)).toBe('Role: editor');
  });

  it('defaults the role label when roleKey is missing', () => {
    expect(collaboratorDetail({ ...base, roleKey: '' })).toBe('Role: member');
  });

  it('localizes the role line in French without changing user identity data', () => {
    const copy = getProjectCollaboratorsCopy('fr');

    expect(collaboratorDetail({ ...base, displayName: 'Ada Lovelace', email: 'ada@example.com' }, 'fr')).toBe(
      'ada@example.com · Rôle : Éditeur',
    );
    expect(collaboratorTitle({ ...base, displayName: 'Ada Lovelace' }, 'fr')).toBe('Ada Lovelace');
    expect(formatProjectCollaboratorsCopy(copy['projectCollaborators.removeAria'], { member: 'Ada Lovelace' })).toBe(
      'Retirer Ada Lovelace',
    );
  });
});

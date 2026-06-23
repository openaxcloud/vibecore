/**
 * Brand-name constants and message builders for user-facing GitLab content
 * (project descriptions and commit messages). Centralized so the product
 * brand (E-Code) is never accidentally leaked as the upstream codename into
 * a user's permanent, publicly-visible GitLab repo.
 */
export const ECODE_BRAND = 'E-Code';

export const gitlabProjectDescription = (): string => `Project created with ${ECODE_BRAND}`;

export const gitlabInitialCommitMessage = (): string => `Initial commit from ${ECODE_BRAND}`;

export const gitlabUpdateCommitMessage = (): string => `Update from ${ECODE_BRAND}`;

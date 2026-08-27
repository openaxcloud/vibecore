import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Audit UX/UI de la zone utilisateur (chore/userarea-ux-audit) — garde-fous de
 * non-régression sur les correctifs de cohérence : cibles tactiles 44px,
 * responsive 390, tokens de statut thémés, états vides canoniques (EmptyState),
 * i18n et contraste AA des CTA pleins. Chaque assertion échoue sur le code
 * d'avant correctif.
 */

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('coque partagée (SaaSLayout / EmptyState / AsyncPanelState)', () => {
  it('LinkButton utilise min-h-[44px] (hauteur fixe h-[44px] rognait les libellés sur deux lignes)', () => {
    const source = read('app/components/dashboard/SaaSLayout.tsx');
    expect(source).toContain(
      "'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-center text-sm font-medium",
    );
  });

  it('le CTA primaire plein passe par --vc-cta-accent (contraste AA dans la coque user area, IDE inchangé)', () => {
    const emptyState = read('app/components/ui/EmptyState.tsx');
    expect(emptyState).toContain('bg-[var(--vc-cta-accent,var(--vc-ide-accent-action))]');

    const styles = read('app/styles/index.scss');
    expect(styles).toContain('--vc-cta-accent: var(--vc-ide-accent-action);');
    expect(styles).toContain('--vc-cta-accent: var(--vc-action-primary-strong);');
  });

  it('le badge non-lus de la top bar est blanc sur le ton renforcé (2,80:1 sur la marque vive avant)', () => {
    const source = read('app/components/dashboard/SaaSLayout.tsx');
    expect(source).toContain('rounded-full bg-[var(--vc-action-primary-strong)] px-1 text-[11px]');
    expect(source).not.toContain(
      'bg-bolt-elements-item-contentAccent px-1 text-[11px] font-semibold leading-none text-white',
    );
  });

  it("l'indice clavier de la palette affiche ⌘K comme la top bar et la nav (K seul avant)", () => {
    const source = read('app/components/dashboard/SaaSLayout.tsx');

    // Le <kbd> littéral de la palette annonce ⌘K — plus de « K » seul.
    expect(source).toMatch(/vc-keyboard-shortcut rounded border[^"]*">\s*⌘K\s*<\/kbd>/);
    expect(source).not.toMatch(/">\s*\n\s*K\s*\n\s*<\/kbd>/);
  });

  it("les étapes d'onboarding s'empilent (flex-wrap) et gardent une description lisible (line-clamp-2, plus de truncate)", () => {
    const source = read('app/components/dashboard/SaaSLayout.tsx');
    expect(source).toContain('<li key={step.key} className="flex flex-wrap items-center gap-3">');
    expect(source).toContain('line-clamp-2 text-[13px] text-bolt-elements-textSecondary">{step.description}');
    expect(source).not.toContain('truncate text-[13px] text-bolt-elements-textSecondary">{step.description}');
  });

  it('le pied de carte template peut replier ses deux éléments (FR long) au lieu de déborder à 390px', () => {
    const source = read('app/components/dashboard/SaaSLayout.tsx');
    expect(source).toContain('mt-auto flex flex-wrap items-center justify-between gap-3');
  });

  it('AsyncPanelError compact garde le même padding que AsyncPanelSkeleton compact (p-4, plus de saut de 2px)', () => {
    const source = read('app/components/dashboard/AsyncPanelState.tsx');
    const compactPaddings = source.match(/compact \? 'p-(\d)'/g) ?? [];
    expect(compactPaddings).toHaveLength(2);
    expect(new Set(compactPaddings).size).toBe(1);
    expect(compactPaddings[0]).toContain("'p-4'");
  });

  it('ProjectRenameForm fusionne className avec la hauteur 44px par défaut (?? la remplaçait)', () => {
    const source = read('app/components/dashboard/ProjectCardMenu.tsx');
    expect(source).toContain("classNames('h-[44px] text-sm font-semibold', className)");
    expect(source).not.toContain("className ?? 'h-[44px] text-sm font-semibold'");
  });

  it("le déclencheur ⋯ des cartes projet utilise l'anneau de focus accent (borderColorActive était quasi invisible)", () => {
    const source = read('app/components/dashboard/ProjectCardMenu.tsx');
    expect(source).not.toContain('focus-visible:ring-bolt-elements-borderColorActive');
  });
});

describe('/projects (liste)', () => {
  const source = () => read('app/routes/projects._index.tsx');

  it('la bascule grille/liste montre visuellement le mode actif (les deux boutons étaient identiques)', () => {
    expect(source()).toContain("view === 'grid'\n                      ? 'border-[var(--vc-ide-accent-action)]");
    expect(source()).toContain("view === 'list'\n                      ? 'border-[var(--vc-ide-accent-action)]");
  });

  it('le champ de recherche atteint 44px comme les boutons voisins (Input h-10 = 40px avant)', () => {
    expect(source()).toContain('className="min-h-[44px]"');
  });

  it('les FilterChip de statut atteignent 44px (≈30px avant)', () => {
    expect(source()).toContain('className="min-h-[44px]"\n                />');
  });

  it('le renommage en vue liste garde la hauteur 44px (h-7 = 28px avant)', () => {
    expect(source()).not.toContain('h-7 max-w-xs');
  });

  it('les lignes de la vue liste sont des h3 sous le h2 de section (h1→h2→h3 dans les deux vues)', () => {
    expect(source()).toContain('<h3 className="min-w-0 truncate text-sm font-semibold" title={project.name}>');
  });

  it('la barre outils suit la convention de carte (shadow-sm + palier sm)', () => {
    expect(source()).toContain('bg-bolt-elements-background-depth-2 p-4 shadow-sm sm:p-5');
  });
});

describe('/billing et /usage', () => {
  it('billing mobile (<640px) reprend packs de crédits et événements d’usage (masqués via hidden sm:block avant)', () => {
    const source = read('app/routes/billing.tsx');
    expect(source).toContain("label: t('billing.stats.creditPacks'),\n      value: creditsUnavailable");
    expect(source).toContain('index < mobileFinancialSummary.length - 2');
  });

  it("billing sépare erreur d'action (tokens error) et accès limité (warning) — l'un écrasait l'autre", () => {
    const source = read('app/routes/billing.tsx');
    expect(source).not.toContain("{actionError ?? t('billing.alert.accessLimited')}");
    expect(source).toContain(
      'border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)]',
    );
  });

  it('les états vides billing passent par EmptyState (plus de fausse ligne ActivityList)', () => {
    const source = read('app/routes/billing.tsx');
    expect(source).not.toMatch(/: \[\s*\{\s*title: t\('billing\.(checkpoints|activity)\.emptyTitle'\)/);
    expect(source).toContain("import { EmptyState } from '~/components/ui/EmptyState';");
  });

  it('les cartes de premier niveau billing/usage suivent depth-2 + p-5 shadow-sm sm:p-6 (depth-1 p-5 avant)', () => {
    expect(read('app/routes/billing.tsx')).not.toContain('bg-bolt-elements-background-depth-1 p-5">');
    expect(read('app/routes/usage.tsx')).not.toContain('bg-bolt-elements-background-depth-1 p-5">');
  });

  it('les titres de carte usage sont des h2 text-base (h3 text-sm plus petits que le corps avant)', () => {
    const source = read('app/routes/usage.tsx');
    expect(source).toContain(
      '<h2 className="text-base font-semibold text-bolt-elements-textPrimary">{t(\'usage.overrides.title\')}</h2>',
    );
    expect(source).toContain(
      '<h2 className="text-base font-semibold text-bolt-elements-textPrimary">{t(\'usage.members.title\')}</h2>',
    );
  });

  it('les CTA pleins billing/usage utilisent le token CTA à contraste AA', () => {
    expect(read('app/routes/billing.tsx')).toContain('bg-[var(--vc-cta-accent,var(--vc-ide-accent-action))]');
    expect(read('app/routes/usage.tsx')).toContain('bg-[var(--vc-cta-accent,var(--vc-ide-accent-action))]');
  });
});

describe('/api-keys', () => {
  it("le select d'expiration prend toute la largeur comme le champ nom (désalignement à 390px avant)", () => {
    const source = read('app/routes/api-keys.tsx');
    expect(source).toContain(
      'min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"\n                  >',
    );
  });
});

describe('/account-settings (3 onglets)', () => {
  it('les onglets annoncent aria-selected (role=tab sans état avant)', () => {
    const source = read('app/routes/account-settings.tsx');
    expect(source).toContain('aria-selected={end ? location.pathname === to : location.pathname.startsWith(to)}');
  });

  it('les bandeaux profil utilisent les tokens success/error (gris neutre et icon-error avant)', () => {
    const source = read('app/routes/account-settings._index.tsx');
    expect(source).toContain(
      'border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-text)]',
    );
    expect(source).toContain(
      'border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]',
    );
    expect(source).not.toContain('border-bolt-elements-icon-error');
  });

  it('les champs texte profil et confirmation de suppression neutralisent le zoom iOS (text-[16px] … sm:text-sm)', () => {
    expect(read('app/routes/account-settings._index.tsx')).toContain('px-3 text-[16px] outline-none');
    expect(read('app/routes/account-settings.data.tsx')).toContain(
      'px-3 py-2 text-[16px] text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none sm:text-sm',
    );
  });

  it("le bouton d'annulation de suppression atteint 44px et replie son libellé FR (h-9 nowrap avant)", () => {
    expect(read('app/routes/account-settings.data.tsx')).toContain(
      'min-h-[44px] w-full gap-1.5 whitespace-normal sm:w-auto',
    );
  });

  it('le bandeau success données utilise le texte success (texte gris sur fond success avant)', () => {
    expect(read('app/routes/account-settings.data.tsx')).toContain(
      'px-3 py-2 text-sm text-[var(--status-success-text)]"\n          >\n            {copy.success.cancellation}',
    );
  });

  it('les titres des onglets connected et data partagent la même taille (text-lg vs text-base avant)', () => {
    expect(read('app/routes/account-settings.connected.tsx')).not.toContain(
      'text-lg font-semibold text-bolt-elements-textPrimary',
    );
  });
});

describe('/security-settings et /session-security', () => {
  it('les boutons de déconnexion/révocation de session atteignent 44px (min-h-8 = 32px avant)', () => {
    const source = read('app/routes/session-security.tsx');
    expect(source).not.toContain('min-h-8');
    expect(source.match(/min-h-\[44px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("l'état vide des sessions passe par EmptyState", () => {
    const source = read('app/routes/session-security.tsx');
    expect(source).toContain("import { EmptyState } from '~/components/ui/EmptyState';");
    expect(source).toContain('icon={Monitor}');
  });

  it('le titre « organisation » de security-settings remonte à text-base (text-sm < corps de texte avant)', () => {
    expect(read('app/routes/security-settings.tsx')).toContain(
      'break-words text-base font-semibold text-bolt-elements-textPrimary',
    );
  });
});

describe('/notifications', () => {
  const source = () => read('app/routes/notifications.tsx');

  it('les tons info/success passent par les tokens de statut (blue-400/emerald-400 illisibles en clair avant)', () => {
    expect(source()).not.toContain('text-blue-400');
    expect(source()).not.toContain('text-emerald-400');
    expect(source()).toContain(
      'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]',
    );
  });

  it('le ton est dérivé de `categories` (le second dictionnaire divergent est supprimé)', () => {
    expect(source()).toContain('function categoryToneFor(category: string)');
    expect(source()).not.toContain('const categoryTone: Record<string,');
  });

  it('le badge non-lus est blanc sur ton renforcé (textPrimary sur accent échouait dans les deux thèmes)', () => {
    expect(source()).toContain(
      'rounded-full bg-[var(--vc-action-primary-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-white',
    );
  });

  it('les interrupteurs de la matrice étendent leur cible tactile à ~44px (rail de 24px avant)', () => {
    expect(source()).toContain('after:absolute after:-inset-x-1 after:-inset-y-2.5');
  });

  it('le lien « Voir » a une vraie zone de tap et un anneau de focus (16px, hover-only avant)', () => {
    expect(source()).toContain('px-1 py-2 -my-2 text-bolt-elements-item-contentAccent underline');
    expect(source()).toContain(
      'focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"\n                    href={notification.linkUrl}',
    );
  });

  it('la boîte de réception vide passe par EmptyState', () => {
    expect(source()).toContain("import { EmptyState } from '~/components/ui/EmptyState';");
    expect(source()).not.toContain('<Bell className="h-8 w-8 text-bolt-elements-textTertiary"');
  });
});

describe('auth (/login, /register) et pages enterprise', () => {
  it('PrimaryButton fusionne className au lieu de l’écraser (w-full du formulaire d’invitation était perdu)', () => {
    const source = read('app/components/enterprise/EnterpriseFormPage.tsx');
    expect(source).toContain('export function PrimaryButton({ children, className, ...props }');
    expect(source).toContain('className,\n      )}');
  });

  it('les bandeaux EnterpriseFormPage utilisent les tokens de statut (red-500 brut et gris neutre avant)', () => {
    const source = read('app/components/enterprise/EnterpriseFormPage.tsx');
    expect(source).not.toContain('border-red-500/40');
    expect(source).toContain('text-[var(--status-success-text)]');
    expect(source).toContain('text-[var(--status-error-text)]');
  });

  it('login : « Mot de passe oublié », case « rester connecté » et œil de mot de passe atteignent 44px', () => {
    const source = read('app/routes/login.tsx');
    expect(source).toContain('inline-flex min-h-11 items-center text-[12px] font-semibold hover:underline');
    expect(source).toContain('flex min-h-11 cursor-pointer items-center gap-2 text-[12px]');
    expect(source).toContain('grid h-11 w-11 -translate-y-1/2 place-items-center');
  });

  it('signup : les deux œils de mot de passe et le bouton « ajouter une organisation » atteignent 44px', () => {
    const source = read('app/routes/signup.tsx');
    expect(source.match(/grid h-11 w-11 -translate-y-1\/2 place-items-center/g)).toHaveLength(2);
    expect(source).toContain('inline-flex min-h-11 items-center px-1 text-[12px] font-semibold hover:underline');
  });

  it('signup : chiffres du panneau héros depuis AUTH_HERO_STATS + preuve sociale mobile comme /login', () => {
    const source = read('app/routes/signup.tsx');
    expect(source).toContain("import { AUTH_HERO_STATS } from '~/lib/auth-hero-stats';");
    expect(source).not.toContain('<div className="text-3xl font-bold">21</div>');
    expect(source).toContain('vc-auth-mobile-stats mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden');
  });
});

describe('invitations (les 3 surfaces)', () => {
  it('organization-invitations : Renvoyer/Expirer atteignent 44px (30px avant) et l’email reste lisible (break-all)', () => {
    const source = read('app/routes/organization-invitations.tsx');
    expect(
      source.match(/inline-flex min-h-\[44px\] items-center justify-center whitespace-normal rounded-md border/g),
    ).toHaveLength(2);
    expect(source).toContain('break-all font-medium text-bolt-elements-textPrimary">{invite.email}');
    expect(source).not.toContain('truncate font-medium text-bolt-elements-textPrimary">{invite.email}');
  });

  it('PendingInvitationsSection : email en break-all, pastille « expiré » via Badge (style inline avant)', () => {
    const source = read('app/components/dashboard/PendingInvitationsSection.tsx');
    expect(source).toContain('break-all font-medium text-bolt-elements-textPrimary">{invite.email}');
    expect(source).toContain('<Badge variant="warning">');
    expect(source).not.toContain(
      "style={{ color: 'var(--status-error-text)', borderColor: 'var(--status-error-text)' }}",
    );
  });

  it('les trois états vides passent par EmptyState (3 rendus différents avant)', () => {
    expect(read('app/routes/invitations.tsx')).toContain('icon={Mail}');
    expect(read('app/routes/organization-invitations.tsx')).toContain('icon={Mail}');
    expect(read('app/components/dashboard/PendingInvitationsSection.tsx')).toContain('icon={Mail}');
  });

  it('invitations : la carte formulaire suit p-5 sm:p-6', () => {
    expect(read('app/routes/invitations.tsx')).toContain('bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6');
  });

  it('teams settings : le lien « journal complet » sort de la phrase text-xs (line-box gonflée de ~28px avant)', () => {
    expect(read('app/routes/teams.$id.settings.tsx')).toContain('mt-1 flex min-h-[44px] w-fit');
  });
});

describe('templates (publique + languages)', () => {
  it('les chips de tag et le bouton effacer-recherche atteignent 44px (40px et 24px avant)', () => {
    const source = read('app/components/marketing/EcodePublicResourcePages.tsx');
    expect(source).toContain(
      "'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition',",
    );
    expect(source).toContain(
      'min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--ecode-text-muted)]',
    );
  });

  it('templates/languages : le squelette a la hauteur des entrées réelles (h-16 vs min-h-14 = saut de 8px avant)', () => {
    const source = read('app/routes/templates_.languages.tsx');
    expect(source).toContain('className="h-14 animate-pulse rounded-xl');
  });

  it('dashboard/templates : l’erreur de création est annoncée (role=alert absent avant)', () => {
    expect(read('app/routes/dashboard_.templates.tsx')).toContain('role="alert"');
  });
});

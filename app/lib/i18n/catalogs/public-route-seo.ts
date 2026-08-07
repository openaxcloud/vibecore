import type { MetaDescriptor } from 'react-router';

import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';
import { DEFAULT_OG_IMAGE, MARKETING_SITE_URL } from '~/utils/social-meta';

export const publicRouteSeoEn = {
  'publicRouteSeo.careers.title': 'Careers — E-Code',
  'publicRouteSeo.careers.description':
    'Join E-Code and help build AI-native software creation. Explore open roles across engineering, design, and go-to-market.',
  'publicRouteSeo.careers.imageAlt': 'Careers at E-Code, building an AI-native software creation platform',
  'publicRouteSeo.contactSales.title': 'Contact Sales — E-Code',
  'publicRouteSeo.contactSales.description':
    'Contact E-Code sales about Enterprise SSO and SAML, single-tenant infrastructure, VPC peering, and dedicated support.',
  'publicRouteSeo.contactSales.imageAlt': 'E-Code Enterprise sales and dedicated support',
  'publicRouteSeo.docs.title': 'Documentation — E-Code',
  'publicRouteSeo.docs.description':
    'Explore the E-Code IDE agent feature by feature, including shortcuts, workflows, collaboration, and interface previews.',
  'publicRouteSeo.docs.imageAlt': 'E-Code IDE agent documentation and feature walkthrough',
  'publicRouteSeo.templates.title': 'Templates — E-Code',
  'publicRouteSeo.templates.description':
    'Browse production-ready E-Code starter templates and open a real project foundation in the E-Code IDE.',
  'publicRouteSeo.templates.imageAlt': 'Production-ready starter templates in the E-Code public gallery',
  'publicRouteSeo.dpa.title': 'Data Processing Agreement — E-Code',
  'publicRouteSeo.dpa.description':
    'Read the E-Code Data Processing Agreement covering personal data processing, security, and subprocessors.',
  'publicRouteSeo.dpa.imageAlt': 'E-Code Data Processing Agreement and privacy commitments',
  'publicRouteSeo.reportAbuse.title': 'Report Abuse — E-Code',
  'publicRouteSeo.reportAbuse.description':
    'Report content or behavior that may violate E-Code policies to the Trust and Safety team.',
  'publicRouteSeo.reportAbuse.imageAlt': 'Report abuse to the E-Code Trust and Safety team',
  'publicRouteSeo.studentDpa.title': 'Student Data Processing Agreement — E-Code',
  'publicRouteSeo.studentDpa.description':
    'Review the E-Code Student Data Processing Agreement and its safeguards for schools and educational institutions.',
  'publicRouteSeo.studentDpa.imageAlt': 'E-Code safeguards for student data and educational institutions',
  'publicRouteSeo.subprocessors.title': 'Subprocessors — E-Code',
  'publicRouteSeo.subprocessors.description':
    'Review the service providers E-Code uses to operate its secure, reliable platform and process customer data.',
  'publicRouteSeo.subprocessors.imageAlt': 'E-Code subprocessors and data protection safeguards',
  'publicRouteSeo.notFound.seo.title': 'Page not found · E-Code',
  'publicRouteSeo.notFound.seo.description': 'The requested E-Code page could not be found.',
  'publicRouteSeo.notFound.seo.imageAlt': 'E-Code page not found',
  'publicRouteSeo.notFound.httpStatus': 'Not Found',
  'publicRouteSeo.notFound.errorTitle': 'Error {status} · E-Code',
  'publicRouteSeo.notFound.errorLabel': 'Error {status}',
  'publicRouteSeo.notFound.heading': 'This page could not be found',
  'publicRouteSeo.notFound.errorHeading': 'Something went wrong',
  'publicRouteSeo.notFound.description':
    'The page you are looking for may have been moved, renamed, or never existed. Check the address or return to a known place.',
  'publicRouteSeo.notFound.errorDescription':
    'The request could not be completed. Try again, or return to a known place.',
  'publicRouteSeo.notFound.home': 'Back to homepage',
  'publicRouteSeo.notFound.dashboard': 'Go to dashboard',
  'publicRouteSeo.notFound.help': 'Visit the help center',
} as const;

export type PublicRouteSeoKey = keyof typeof publicRouteSeoEn;
export type PublicRouteSeoCopy = Readonly<Record<PublicRouteSeoKey, string>>;

export const publicRouteSeoFr: PublicRouteSeoCopy = {
  'publicRouteSeo.careers.title': 'Carrières — E-Code',
  'publicRouteSeo.careers.description':
    'Rejoignez E-Code et contribuez à une nouvelle façon de créer des logiciels avec l’IA. Découvrez nos postes en ingénierie, design et développement commercial.',
  'publicRouteSeo.careers.imageAlt':
    'Carrières chez E-Code pour créer une plateforme de développement logiciel native de l’IA',
  'publicRouteSeo.contactSales.title': 'Contacter l’équipe commerciale — E-Code',
  'publicRouteSeo.contactSales.description':
    'Contactez l’équipe commerciale E-Code au sujet du SSO et de SAML, de l’infrastructure dédiée, du peering VPC et de l’assistance Enterprise.',
  'publicRouteSeo.contactSales.imageAlt': 'Offre E-Code Enterprise et assistance dédiée',
  'publicRouteSeo.docs.title': 'Documentation — E-Code',
  'publicRouteSeo.docs.description':
    'Découvrez chaque fonctionnalité de l’agent de l’IDE E-Code : raccourcis, processus de travail, collaboration et aperçus de l’interface.',
  'publicRouteSeo.docs.imageAlt': 'Documentation et guide des fonctionnalités de l’agent de l’IDE E-Code',
  'publicRouteSeo.templates.title': 'Modèles — E-Code',
  'publicRouteSeo.templates.description':
    'Parcourez les modèles de démarrage E-Code prêts pour la production et ouvrez une base de projet réelle dans l’IDE E-Code.',
  'publicRouteSeo.templates.imageAlt': 'Modèles de démarrage prêts pour la production dans la galerie publique E-Code',
  'publicRouteSeo.dpa.title': 'Accord de traitement des données — E-Code',
  'publicRouteSeo.dpa.description':
    'Consultez l’Accord de traitement des données E-Code relatif au traitement des données personnelles, à la sécurité et aux sous-traitants.',
  'publicRouteSeo.dpa.imageAlt': 'Accord de traitement des données et engagements de confidentialité E-Code',
  'publicRouteSeo.reportAbuse.title': 'Signaler un abus — E-Code',
  'publicRouteSeo.reportAbuse.description':
    'Signalez à l’équipe Confiance et sécurité tout contenu ou comportement susceptible d’enfreindre les règles E-Code.',
  'publicRouteSeo.reportAbuse.imageAlt': 'Signalement d’un abus à l’équipe Confiance et sécurité E-Code',
  'publicRouteSeo.studentDpa.title': 'Accord de traitement des données des élèves — E-Code',
  'publicRouteSeo.studentDpa.description':
    'Consultez l’Accord E-Code sur le traitement des données des élèves et les garanties prévues pour les établissements scolaires.',
  'publicRouteSeo.studentDpa.imageAlt': 'Garanties E-Code pour les données des élèves et les établissements scolaires',
  'publicRouteSeo.subprocessors.title': 'Sous-traitants — E-Code',
  'publicRouteSeo.subprocessors.description':
    'Découvrez les prestataires auxquels E-Code fait appel pour exploiter sa plateforme sécurisée et traiter les données de ses clients.',
  'publicRouteSeo.subprocessors.imageAlt': 'Sous-traitants E-Code et garanties de protection des données',
  'publicRouteSeo.notFound.seo.title': 'Page introuvable · E-Code',
  'publicRouteSeo.notFound.seo.description': 'La page E-Code demandée est introuvable.',
  'publicRouteSeo.notFound.seo.imageAlt': 'Page E-Code introuvable',
  'publicRouteSeo.notFound.httpStatus': 'Page introuvable',
  'publicRouteSeo.notFound.errorTitle': 'Erreur {status} · E-Code',
  'publicRouteSeo.notFound.errorLabel': 'Erreur {status}',
  'publicRouteSeo.notFound.heading': 'Cette page est introuvable',
  'publicRouteSeo.notFound.errorHeading': 'Une erreur est survenue',
  'publicRouteSeo.notFound.description':
    'La page recherchée a peut-être été déplacée, renommée ou n’a jamais existé. Vérifiez l’adresse ou revenez à une page connue.',
  'publicRouteSeo.notFound.errorDescription': 'La demande n’a pas pu aboutir. Réessayez ou revenez à une page connue.',
  'publicRouteSeo.notFound.home': 'Retour à l’accueil',
  'publicRouteSeo.notFound.dashboard': 'Accéder au tableau de bord',
  'publicRouteSeo.notFound.help': 'Consulter le centre d’aide',
};

export type PublicSeo = Readonly<{ title: string; description: string; imageAlt: string }>;

export function resolvePublicRouteLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getPublicRouteSeoCopy(language?: string | null): PublicRouteSeoCopy {
  return resolvePublicRouteLanguage(language) === 'fr' ? publicRouteSeoFr : publicRouteSeoEn;
}

export function interpolatePublicRouteSeoCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

function canonicalUrl(pathname: string): string {
  const url = new URL(MARKETING_SITE_URL);
  url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  url.search = '';
  url.hash = '';

  return url.toString();
}

export function buildPublicRouteMeta({
  language,
  pathname,
  seo,
  robots,
}: {
  language?: string | null;
  pathname: string;
  seo: PublicSeo;
  robots?: string;
}): MetaDescriptor[] {
  const activeLanguage = resolvePublicRouteLanguage(language);
  const canonical = canonicalUrl(pathname);

  return [
    { title: seo.title },
    { name: 'description', content: seo.description },
    ...(robots ? [{ name: 'robots', content: robots } satisfies MetaDescriptor] : []),
    { property: 'og:title', content: seo.title },
    { property: 'og:description', content: seo.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: activeLanguage === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: activeLanguage === 'fr' ? 'en_US' : 'fr_FR' },
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { property: 'og:image:type', content: 'image/jpeg' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: seo.imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: seo.title },
    { name: 'twitter:description', content: seo.description },
    { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:image:alt', content: seo.imageAlt },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
}

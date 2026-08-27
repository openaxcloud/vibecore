import { describe, expect, it } from 'vitest';

import { marketingAuxiliaryPageCopyFr, marketingPageCopyFr } from './marketing';
import { marketingCommunityRouteFr } from './marketing-community-route';
import { marketingExactAboutContactFr } from './marketing-exact-about-contact';
import { marketingExactAccountLanguagesFr } from './marketing-exact-account-languages';
import { marketingExactAiFr } from './marketing-exact-ai';
import { marketingExactCaseStudiesCollaborationFr } from './marketing-exact-case-studies-collaboration';
import { marketingExactChangelogFr } from './marketing-exact-changelog';
import { marketingExactCompanyFr } from './marketing-exact-company';
import { marketingExactCompareIndexFr } from './marketing-exact-compare-index';
import { marketingExactGuidesPoliciesFr } from './marketing-exact-guides-policies';
import { marketingExactHelpCenterFr } from './marketing-exact-help-center';
import { marketingExactLandingForumFr } from './marketing-exact-landing-forum';
import { marketingExactLegalBlogFr } from './marketing-exact-legal-blog';
import { marketingExactPartnersBountiesFr } from './marketing-exact-partners-bounties';
import { marketingExactProductFr } from './marketing-exact-product';
import { marketingExactProductControlsFr } from './marketing-exact-product-controls';
import { marketingExactTrustPressFr } from './marketing-exact-trust-press';
import {
  aiAgentMarketingCopy,
  pricingMarketingCopy,
  pricingPlanCopy,
  productMarketingRouteCopy,
} from './marketing-product';
import { marketingProductRemainingFr } from './marketing-product-remaining';
import { marketingPublicResourceFr } from './marketing-public-resource';
import { marketingSurfaceCategoryFr } from './marketing-surface';
import { marketingSurfaceDynamicFr } from './marketing-surface-dynamic';
import { marketingSurfacePageFr } from './marketing-surface-pages';
import { publicGalleryFr } from './public-gallery';
import { publicRouteSeoFr } from './public-route-seo';

const forbiddenFrenchMarketingTerms =
  /\b(?:backpressure|builds?|full-stack|backends?|front-?ends?|rollbacks?|runtimes?|workflows?|workspaces?|templates?|previews?|responsive|streaming|logs?|tags?|typechecks?|QA)\b/iu;

const stableIdentifierKeys = new Set(['id', 'href', 'slug', 'to', 'url']);

interface VisibleCopy {
  path: string;
  value: string;
}

function collectVisibleCopy(value: unknown, path: string[] = []): VisibleCopy[] {
  if (typeof value === 'string') {
    const key = path.at(-1);

    if (key && stableIdentifierKeys.has(key)) {
      return [];
    }

    if (/^(?:\/|https?:|mailto:|ecode:)/iu.test(value)) {
      return [];
    }

    return [{ path: path.join('.'), value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectVisibleCopy(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectVisibleCopy(item, [...path, key]));
  }

  return [];
}

describe('French marketing glossary', () => {
  it('uses the approved French terminology in public marketing catalogs', () => {
    const catalogs = {
      aboutContact: marketingExactAboutContactFr,
      accountLanguages: marketingExactAccountLanguagesFr,
      ai: marketingExactAiFr,
      aiAgent: aiAgentMarketingCopy.fr,
      caseStudies: marketingExactCaseStudiesCollaborationFr,
      changelog: marketingExactChangelogFr,
      community: marketingCommunityRouteFr,
      company: marketingExactCompanyFr,
      compare: marketingExactCompareIndexFr,
      guides: marketingExactGuidesPoliciesFr,
      helpCenter: marketingExactHelpCenterFr,
      landing: marketingExactLandingForumFr,
      legalBlog: marketingExactLegalBlogFr,
      marketingAuxiliaryPages: marketingAuxiliaryPageCopyFr,
      marketingPages: marketingPageCopyFr,
      partners: marketingExactPartnersBountiesFr,
      pricing: pricingMarketingCopy.fr,
      pricingPlans: pricingPlanCopy.fr,
      product: marketingExactProductFr,
      productControls: marketingExactProductControlsFr,
      productRoutes: productMarketingRouteCopy.fr,
      productRemaining: marketingProductRemainingFr,
      publicResources: marketingPublicResourceFr,
      publicGallery: publicGalleryFr,
      publicRouteSeo: publicRouteSeoFr,
      surfaces: marketingSurfaceCategoryFr,
      surfaceDynamic: marketingSurfaceDynamicFr,
      surfacePages: marketingSurfacePageFr,
      trustPress: marketingExactTrustPressFr,
    };

    const residuals = collectVisibleCopy(catalogs).filter(({ value }) => forbiddenFrenchMarketingTerms.test(value));

    expect(residuals).toEqual([]);
  });
});

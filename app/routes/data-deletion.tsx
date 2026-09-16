import type { LoaderFunctionArgs, MetaFunction } from 'react-router';

import DataDeletion from '~/components/marketing/ecode-exact/pages/DataDeletion';
import { getMarketingExactGuidesPoliciesCopy } from '~/lib/i18n/catalogs/marketing-exact-guides-policies';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingExactGuidesPoliciesCopy(data?.language).exactDataDeletion.seo;

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...social];
};

export default function DataDeletionRoute() {
  return <DataDeletion />;
}

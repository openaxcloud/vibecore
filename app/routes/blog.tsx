import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import Blog from '~/components/marketing/ecode-exact/pages/Blog';
import { getMarketingExactLegalBlogCopy } from '~/lib/i18n/catalogs/marketing-exact-legal-blog';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingExactLegalBlogCopy(data?.language).exactBlog.seo;

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...social];
};

export default function BlogRoute() {
  return <Blog />;
}

import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import About from '~/components/marketing/ecode-exact/pages/About';
import { getMarketingExactAboutContactCopy } from '~/lib/i18n/catalogs/marketing-exact-about-contact';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingExactAboutContactCopy(data?.language).exactAbout.seo;

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...socialMetaTags(seo)];
};

export default function AboutRoute() {
  return <About />;
}

import { useParams } from '@remix-run/react';
import { MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = () => [
  { title: 'Blog - E-Code' },
  { name: 'description', content: marketingPages.blog.description },
];

export default function BlogDetailRoute() {
  const params = useParams();
  return <MarketingStaticPage page={{ ...marketingPages.blog, title: `E-Code Blog: ${params.slug ?? 'Article'}` }} />;
}

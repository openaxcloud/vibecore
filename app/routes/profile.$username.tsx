import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import {
  createProfileSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) => makeEcodeSurfaceMetaTags(createProfileSurfacePage(params.username));

export default function ProfileSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProfileSurfacePage(params.username)} />;
}

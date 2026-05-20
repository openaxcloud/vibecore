import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createTeamSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createTeamSurfacePage(params.id ?? 'unknown', 'settings'));

export default function TeamSettingsSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createTeamSurfacePage(params.id ?? 'unknown', 'settings')} />;
}

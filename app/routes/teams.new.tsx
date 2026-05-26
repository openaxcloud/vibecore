import {
  EcodeSurfacePage,
  getEcodeStandaloneSurfacePage,
  makeEcodeSurfaceMeta,
} from '~/components/marketing/EcodeSurfacePages';

const page = getEcodeStandaloneSurfacePage('teams/new')!;

export const meta = makeEcodeSurfaceMeta(page);

export default function TeamsNewRoute() {
  return <EcodeSurfacePage page={page} />;
}

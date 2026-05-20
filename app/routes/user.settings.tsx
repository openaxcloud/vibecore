import {
  EcodeSurfacePage,
  getEcodeStandaloneSurfacePage,
  makeEcodeSurfaceMeta,
} from '~/components/marketing/EcodeSurfacePages';

const page = getEcodeStandaloneSurfacePage('user/settings')!;

export const meta = makeEcodeSurfaceMeta(page);

export default function UserSettingsRoute() {
  return <EcodeSurfacePage page={page} />;
}

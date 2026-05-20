import {
  EcodeSurfacePage,
  getEcodeStandaloneSurfacePage,
  makeEcodeSurfaceMeta,
} from '~/components/marketing/EcodeSurfacePages';

const page = getEcodeStandaloneSurfacePage('github-import')!;

export const meta = makeEcodeSurfaceMeta(page);

export default function GithubImportRoute() {
  return <EcodeSurfacePage page={page} />;
}

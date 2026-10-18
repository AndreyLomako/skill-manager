import { getCatalogAction, getProjectsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [catalog, projects] = await Promise.all([getCatalogAction(false), getProjectsAction()]);
  return <pre>{JSON.stringify({ catalog, projects }, null, 2)}</pre>;
}

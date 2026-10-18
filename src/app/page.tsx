import { ErrorScreen } from '@/components/ErrorScreen/ErrorScreen';
import { SkillManager } from '@/components/SkillManager/SkillManager';
import { getCatalogAction, getProjectsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [catalog, projects] = await Promise.all([getCatalogAction(false), getProjectsAction()]);
  if (!catalog.ok) return <ErrorScreen message={catalog.error} />;
  return <SkillManager initialCatalog={catalog.catalog} initialProjects={projects} />;
}

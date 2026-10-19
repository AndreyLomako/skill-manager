import { ErrorScreen } from '@/components/ErrorScreen/ErrorScreen';
import { AppShell } from '@/components/AppShell/AppShell';
import { SkillsSection } from '@/components/SkillsSection/SkillsSection';
import { getCatalogAction, getProjectsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [catalog, projects] = await Promise.all([getCatalogAction(false, false), getProjectsAction()]);
  if (!catalog.ok) return <ErrorScreen message={catalog.error} />;
  return (
    <AppShell active="skills">
      <SkillsSection initialCatalog={catalog.catalog} initialProjects={projects} />
    </AppShell>
  );
}

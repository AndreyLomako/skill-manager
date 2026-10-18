import type { AgentId, CatalogSkill, CategoryDef, InstalledState, InstalledStatus, ProjectSource } from './types';

export const MY_SKILLS = '__my__';
export const INSTALLED = '__installed__';
export const GLOBAL_PROJECT = '__global__';

export type AgentChoice = 'claude' | 'codex' | 'both';

export const AGENT_LABEL: Record<AgentId, string> = { claude: 'Claude', codex: 'Codex' };

const SOURCE_LABEL: Record<ProjectSource, string> = {
  vscode: 'VS Code',
  claude: 'Claude',
  codex: 'Codex',
  manual: 'вручную',
};

export function agentsOf(choice: AgentChoice): AgentId[] {
  return choice === 'both' ? ['claude', 'codex'] : [choice];
}

export function defaultAgentChoice(sources: readonly ProjectSource[] | null): AgentChoice {
  if (!sources) return 'claude';
  return sources.includes('codex') && !sources.includes('claude') && !sources.includes('vscode') ? 'codex' : 'claude';
}

export function mergeInstalled(
  states: Partial<Record<AgentId, InstalledState>>,
  agents: readonly AgentId[],
): InstalledState {
  const out: InstalledState = {};
  if (agents.length === 0) return out;
  const ids = new Set(agents.flatMap((a) => Object.keys(states[a] ?? {})));
  for (const id of ids) {
    const list = agents.map((a) => (Object.hasOwn(states[a] ?? {}, id) ? states[a]?.[id] : undefined));
    if (list.some((s) => s === undefined)) continue;
    const all = list as InstalledStatus[];
    out[id] = all.every((s) => s === 'up-to-date') ? 'up-to-date' : all.includes('outdated') ? 'outdated' : 'unknown';
  }
  return out;
}

export function sourcesLabel(sources: readonly ProjectSource[]): string {
  return sources.map((s) => SOURCE_LABEL[s]).join(' · ');
}

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export function skillsForCategory(skills: readonly CatalogSkill[], categoryId: string): CatalogSkill[] {
  return skills.filter((s) => (categoryId === MY_SKILLS ? s.layer === 'user' : s.category === categoryId));
}

export function countByCategory(
  selected: readonly string[],
  skills: readonly CatalogSkill[],
): Record<string, number> {
  const set = new Set(selected);
  const counts: Record<string, number> = {};
  for (const s of skills) {
    if (!set.has(s.id)) continue;
    counts[s.category] = (counts[s.category] ?? 0) + 1;
    if (s.layer === 'user') counts[MY_SKILLS] = (counts[MY_SKILLS] ?? 0) + 1;
  }
  return counts;
}

export function pruneSelection(selected: readonly string[], skills: readonly CatalogSkill[]): string[] {
  const available = new Set(skills.filter((s) => s.dir).map((s) => s.id));
  return selected.filter((id) => available.has(id));
}

export function summarizeByCategory(
  selected: readonly CatalogSkill[],
  categories: readonly CategoryDef[],
): string {
  const counts = new Map<string, number>();
  for (const s of selected) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return categories
    .filter((c) => counts.has(c.id))
    .map((c) => `${c.title} ${counts.get(c.id)}`)
    .join(' · ');
}

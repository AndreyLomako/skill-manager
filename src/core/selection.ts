import type {
  AgentId,
  CatalogPack,
  CatalogSkill,
  CategoryDef,
  InstalledSkill,
  InstalledState,
  InstalledStatus,
  ProjectSource,
  SkillCommand,
} from './types';

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

export function topCategories(categories: readonly CategoryDef[]): CategoryDef[] {
  return categories.filter((c) => !c.parent);
}

export function childCategories(categories: readonly CategoryDef[], parentId: string): CategoryDef[] {
  return categories.filter((c) => c.parent === parentId);
}

/** «Видео › Монтаж» для подкатегории, название — для верхнего уровня. */
export function categoryPath(categories: readonly CategoryDef[], id: string): string {
  const c = categories.find((x) => x.id === id);
  if (!c) return id;
  const parent = c.parent ? categories.find((x) => x.id === c.parent) : undefined;
  return parent ? `${parent.title} › ${c.title}` : c.title;
}

/** Скиллы категории для сетки; скиллы паков показываются внутри карточки пака. */
export function skillsForCategory(skills: readonly CatalogSkill[], categoryId: string): CatalogSkill[] {
  return skills.filter((s) => (categoryId === MY_SKILLS ? s.layer === 'user' : s.category === categoryId && !s.pack));
}

export function packsForCategory(packs: readonly CatalogPack[], categoryId: string): CatalogPack[] {
  return packs.filter((p) => p.category === categoryId);
}

export function countByCategory(
  selected: readonly string[],
  skills: readonly CatalogSkill[],
  categories: readonly CategoryDef[] = [],
): Record<string, number> {
  const set = new Set(selected);
  const parentOf = new Map(categories.flatMap((c) => (c.parent ? [[c.id, c.parent] as const] : [])));
  const counts: Record<string, number> = {};
  const add = (id: string) => (counts[id] = (counts[id] ?? 0) + 1);
  for (const s of skills) {
    if (!set.has(s.id)) continue;
    add(s.category);
    const parent = parentOf.get(s.category);
    if (parent) add(parent);
    if (s.layer === 'user') add(MY_SKILLS);
  }
  return counts;
}

export type PackState = 'none' | 'some' | 'all' | 'installed';

function packMembers(pack: CatalogPack, skills: readonly CatalogSkill[]): CatalogSkill[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  return pack.skills.flatMap((id) => {
    const s = byId.get(id);
    return s && isAvailable(s) ? [s] : [];
  });
}

/** Состояние карточки пака: недоступные скиллы не учитываются, установленные не выбираются. */
export function packState(
  pack: CatalogPack,
  selected: readonly string[],
  installed: InstalledState,
  skills: readonly CatalogSkill[],
): PackState {
  const members = packMembers(pack, skills);
  const open = members.filter((s) => !Object.hasOwn(installed, s.id));
  if (members.length > 0 && open.length === 0) return 'installed';
  const picked = open.filter((s) => selected.includes(s.id)).length;
  return picked === 0 ? 'none' : picked === open.length ? 'all' : 'some';
}

/** Клик по паку: выбрать все доступные неустановленные; если они уже выбраны — снять весь пак. */
export function togglePack(
  selected: readonly string[],
  pack: CatalogPack,
  skills: readonly CatalogSkill[],
  installed: InstalledState,
): string[] {
  const open = packMembers(pack, skills)
    .filter((s) => !Object.hasOwn(installed, s.id))
    .map((s) => s.id);
  if (open.length > 0 && open.every((id) => selected.includes(id))) {
    return selected.filter((id) => !pack.skills.includes(id));
  }
  return [...selected, ...open.filter((id) => !selected.includes(id))];
}

/** «Установлено»: сначала скиллы без пака, затем группы каталожных паков (только найденные). */
export interface InstalledGroup {
  /** loose — свои скиллы без группы; остальные — под заголовком */
  kind: 'loose' | 'pack' | 'plugin' | 'synced' | 'system';
  key: string;
  title: string;
  items: InstalledSkill[];
  pack?: CatalogPack;
  /** «имя@магазин» — для удаления плагина целиком */
  pluginId?: string;
}

/**
 * «Установлено» по группам: свои скиллы, паки каталога, каждый плагин Claude Code отдельно,
 * синхронизированные с claude.ai, системные Codex.
 */
export function groupInstalled(
  items: readonly InstalledSkill[],
  skills: readonly CatalogSkill[],
  packs: readonly CatalogPack[],
): InstalledGroup[] {
  const packOf = new Map(skills.flatMap((s) => (s.pack ? [[s.id, s.pack] as const] : [])));
  const loose: InstalledSkill[] = [];
  const byPack = new Map<string, InstalledSkill[]>();
  const plugins = new Map<string, InstalledGroup>();
  const synced: InstalledSkill[] = [];
  const system: InstalledSkill[] = [];
  for (const item of items) {
    if (item.kind === 'synced') synced.push(item);
    else if (item.kind === 'system') system.push(item);
    else if (item.kind === 'plugin') {
      const id = item.pluginId ?? item.plugin ?? item.name;
      const g = plugins.get(id) ?? { kind: 'plugin', key: `plugin:${id}`, title: item.plugin ?? id, items: [], pluginId: item.pluginId };
      g.items.push(item);
      plugins.set(id, g);
    } else {
      const pack = packOf.get(item.name);
      if (pack) byPack.set(pack, [...(byPack.get(pack) ?? []), item]);
      else loose.push(item);
    }
  }
  const groups: InstalledGroup[] = [];
  if (loose.length > 0) groups.push({ kind: 'loose', key: 'loose', title: '', items: loose });
  for (const p of packs) {
    const found = byPack.get(p.id);
    if (found) groups.push({ kind: 'pack', key: `pack:${p.id}`, title: p.title, items: found, pack: p });
  }
  groups.push(...[...plugins.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru')));
  if (synced.length > 0) groups.push({ kind: 'synced', key: 'synced', title: 'claude.ai', items: synced });
  if (system.length > 0) groups.push({ kind: 'system', key: 'system', title: 'Системные Codex', items: system });
  return groups;
}

/** Скилл можно установить хотя бы для одного агента. */
export function isAvailable(s: CatalogSkill): boolean {
  return !s.error && Object.keys(s.dirs).length > 0;
}

export function pruneSelection(selected: readonly string[], skills: readonly CatalogSkill[]): string[] {
  const available = new Set(skills.filter(isAvailable).map((s) => s.id));
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
    .map((c) => `${categoryPath(categories, c.id)} ${counts.get(c.id)}`)
    .join(' · ');
}

// Ключ сравнения путей в рендерере: он работает на той же машине, что и сервер, поэтому
// правило выводим из userAgent. Linux (но не Android) — регистр значим, иначе — без учёта регистра.
export function clientPathKey(p: string, userAgent: string): string {
  const caseSensitive = userAgent.includes('Linux') && !userAgent.includes('Android');
  return caseSensitive ? p : p.toLowerCase();
}

/**
 * Чипы команд для карточки: если у всех команд общий первый токен («/impeccable»),
 * он показывается один раз, а в чипах — подкоманды.
 */
export function commandChips(
  commands: readonly SkillCommand[],
  max: number,
): { prefix: string | null; chips: string[] } {
  const shown = commands.slice(0, max).map((c) => c.cmd.trim());
  const heads = shown.map((c) => c.split(/\s+/));
  const head = heads[0]?.[0];
  const shared = shown.length > 1 && heads.every((h) => h.length > 1 && h[0] === head);
  return shared ? { prefix: head!, chips: heads.map((h) => h.slice(1).join(' ')) } : { prefix: null, chips: shown };
}

/** Куда можно положить скилл: категории без подкатегорий, подпись — «Видео › Монтаж». */
export function leafCategories(categories: readonly CategoryDef[]): CategoryDef[] {
  const parents = new Set(categories.flatMap((c) => (c.parent ? [c.parent] : [])));
  return categories.filter((c) => !parents.has(c.id)).map((c) => ({ ...c, title: categoryPath(categories, c.id) }));
}

/** Подпись установленного скилла: для скиллов из каталога — название и описание каталога. */
export function installedLabel(
  item: InstalledSkill,
  skills: readonly CatalogSkill[],
): { title: string; description: string } {
  const own = item.kind === 'managed' ? skills.find((s) => s.id === item.name) : undefined;
  return own ? { title: own.title, description: own.summary || item.description } : { title: item.title, description: item.description };
}

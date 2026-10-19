export type Layer = 'base' | 'user';

export interface CategoryDef {
  id: string;
  title: string;
  order?: number;
  /** id категории верхнего уровня; вложенность — один уровень */
  parent?: string;
}

export interface SkillCommand {
  cmd: string;
  hint: string;
}

export type SourceDef =
  | { id: string; type: 'local'; path: string }
  | { id: string; type: 'git'; url: string; ref?: string };

export interface SkillDef {
  id: string;
  source: string;
  path: string;
  /** Путь отдельно для каждого агента — когда в источнике разные копии (вместо path) */
  paths?: Partial<Record<AgentId, string>>;
  category: string;
  title?: string;
  description?: string;
  summary?: string;
  commands?: SkillCommand[];
  commandsMore?: number;
  homepage?: string;
}

export interface PackDef {
  id: string;
  title: string;
  category: string;
  summary?: string;
  skills: string[];
}

export interface Manifest {
  version: 1;
  categories: CategoryDef[];
  sources: SourceDef[];
  skills: SkillDef[];
  packs: PackDef[];
}

export interface CatalogSkill {
  id: string;
  title: string;
  description: string;
  /** Одна-две строки для карточки: summary → description манифеста → description SKILL.md */
  summary: string;
  category: string;
  layer: Layer;
  /** Папка скилла для каждого агента; пусто, если скилл недоступен */
  dirs: Partial<Record<AgentId, string>>;
  commands: SkillCommand[];
  commandsMore: number;
  homepage?: string;
  /** Откуда скилл: адрес репозитория или «папка: …» */
  sourceLabel: string;
  /** id пака, в который входит скилл */
  pack?: string;
  error?: string;
}

export interface CatalogPack {
  id: string;
  title: string;
  category: string;
  summary: string;
  skills: string[];
  layer: Layer;
}

export interface Catalog {
  categories: CategoryDef[];
  skills: CatalogSkill[];
  packs: CatalogPack[];
  errors: string[];
}

export interface Project {
  path: string;
  name: string;
  open: boolean;
  active: boolean;
  sources: ProjectSource[];
}

export type InstallStatus = 'installed' | 'already-installed' | 'unsupported' | 'error';

export interface InstallResult {
  skillId: string;
  status: InstallStatus;
  message?: string;
  agent?: AgentId;
}

export type InstalledStatus = 'up-to-date' | 'outdated' | 'unknown';
export type InstalledState = Record<string, InstalledStatus>;

export type AgentId = 'claude' | 'codex';

export type Scope = { kind: 'project'; path: string } | { kind: 'global' };

export type InstalledKind = 'managed' | 'synced' | 'system' | 'plugin';

export interface InstalledSkill {
  name: string;
  title: string;
  description: string;
  agent: AgentId;
  kind: InstalledKind;
  dir: string;
  /** Папка, в которой найден скилл (для удаления из нужного корня) */
  root: string;
  status?: InstalledStatus;
  plugin?: string;
}

export interface TrashEntry {
  id: string;
  name: string;
  agent: AgentId;
  scope: 'project' | 'global';
  originalPath: string;
  deletedAt: number;
}

export type ProjectSource = 'vscode' | 'claude' | 'codex' | 'manual';

export interface ProjectSignal {
  path: string;
  source: ProjectSource;
  open: boolean;
  at: number;
}

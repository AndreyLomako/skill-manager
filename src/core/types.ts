export type Layer = 'base' | 'user';

export interface CategoryDef {
  id: string;
  title: string;
  order?: number;
}

export type SourceDef =
  | { id: string; type: 'local'; path: string }
  | { id: string; type: 'git'; url: string; ref?: string };

export interface SkillDef {
  id: string;
  source: string;
  path: string;
  category: string;
  title?: string;
  description?: string;
}

export interface Manifest {
  version: 1;
  categories: CategoryDef[];
  sources: SourceDef[];
  skills: SkillDef[];
}

export interface CatalogSkill {
  id: string;
  title: string;
  description: string;
  category: string;
  layer: Layer;
  dir: string | null;
  error?: string;
}

export interface Catalog {
  categories: CategoryDef[];
  skills: CatalogSkill[];
  errors: string[];
}

export interface Project {
  path: string;
  name: string;
  open: boolean;
  active: boolean;
}

export type InstallStatus = 'installed' | 'already-installed' | 'error';

export interface InstallResult {
  skillId: string;
  status: InstallStatus;
  message?: string;
}

export type InstalledStatus = 'up-to-date' | 'outdated' | 'unknown';
export type InstalledState = Record<string, InstalledStatus>;

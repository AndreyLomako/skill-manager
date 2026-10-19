import type { AgentId, CatalogSkill } from '../../src/core/types';

/** Скилл каталога с полями по умолчанию; dir — одна папка для обоих агентов. */
export function catalogSkill(
  over: Partial<CatalogSkill> & { id: string; dir?: string | null },
): CatalogSkill {
  const { dir, ...rest } = over;
  const dirs: Partial<Record<AgentId, string>> = dir ? { claude: dir, codex: dir } : {};
  return {
    title: over.id,
    description: '',
    summary: '',
    category: 'c',
    layer: 'base',
    dirs,
    commands: [],
    commandsMore: 0,
    sourceLabel: 'test',
    ...rest,
  };
}

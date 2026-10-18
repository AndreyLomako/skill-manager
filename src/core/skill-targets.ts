import path from 'node:path';
import type { AgentId, Scope } from './types';

export const AGENTS: readonly AgentId[] = ['claude', 'codex'];

const AGENT_DIR: Record<AgentId, string> = { claude: '.claude', codex: '.agents' };

export function skillsRoot(scope: Scope, agent: AgentId, home: string): string {
  const base = scope.kind === 'global' ? home : scope.path;
  return path.join(base, AGENT_DIR[agent], 'skills');
}

// synced — папка синхронизации claude.ai; имена на точку — служебные (.trash, .system).
// Windows без учёта регистра: 'Synced' указывает на ту же папку, что и 'synced'.
export function isReservedSkillName(name: string): boolean {
  return name.toLowerCase() === 'synced' || name.startsWith('.');
}

// Имена устройств Windows (CON, NUL, COM1, ...) недопустимы даже с расширением.
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export function isValidSkillName(name: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) &&
    !name.endsWith('.') &&
    !isReservedSkillName(name) &&
    !WINDOWS_DEVICE_NAME.test(name)
  );
}

export function parseAgents(input: unknown): AgentId[] {
  if (!Array.isArray(input)) return [];
  return AGENTS.filter((a) => input.includes(a)).sort((a, b) => input.indexOf(a) - input.indexOf(b));
}

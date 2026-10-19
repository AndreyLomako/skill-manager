import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  isForbiddenProjectRoot,
  isReservedSkillName,
  isValidSkillName,
  parseAgents,
  skillRoots,
  skillsRoot,
} from '../../src/core/skill-targets';

// Windows-only: C:\\-пути и сравнение без учёта регистра зависят от нативного path.
describe.runIf(process.platform === 'win32')('isForbiddenProjectRoot', () => {
  it.each([
    'C:\\home\\.codex',
    'C:\\home\\.codex\\sub',
    'c:\\HOME\\.Claude\\Plugins\\p',
    'C:\\home\\.claude\\skills',
    'C:\\home\\.agents\\skills\\a\\b',
    'C:\\home\\.codex\\',
  ])('«%s» запрещён', (p) => {
    expect(isForbiddenProjectRoot(p, 'C:\\home')).toBe(true);
  });

  it.each(['C:\\home', 'C:\\home\\.claude', 'C:\\home\\.codexx', 'C:\\home\\.agents', 'C:\\work\\a'])('«%s» разрешён', (p) => {
    expect(isForbiddenProjectRoot(p, 'C:\\home')).toBe(false);
  });
});

describe('isForbiddenProjectRoot: posix-пути', () => {
  it.each(['/home/u/.codex', '/home/u/.codex/x', '/home/u/.claude/plugins/p'])('«%s» запрещён', (p) => {
    expect(isForbiddenProjectRoot(p, '/home/u')).toBe(true);
  });

  it.each(['/home/u/proj', '/home/u', '/home/u/.codexx'])('«%s» разрешён', (p) => {
    expect(isForbiddenProjectRoot(p, '/home/u')).toBe(false);
  });
});

describe('skillsRoot', () => {
  it.each([
    [{ kind: 'project', path: 'C:\\p' } as const, 'claude' as const, path.join('C:\\p', '.claude', 'skills')],
    [{ kind: 'project', path: 'C:\\p' } as const, 'codex' as const, path.join('C:\\p', '.agents', 'skills')],
    [{ kind: 'global' } as const, 'claude' as const, path.join('C:\\home', '.claude', 'skills')],
    [{ kind: 'global' } as const, 'codex' as const, path.join('C:\\home', '.agents', 'skills')],
  ])('%o + %s', (scope, agent, expected) => {
    expect(skillsRoot(scope, agent, 'C:\\home')).toBe(expected);
  });
});

describe('имена скиллов', () => {
  it('зарезервированные', () => {
    expect(isReservedSkillName('synced')).toBe(true);
    expect(isReservedSkillName('.trash')).toBe(true);
    expect(isReservedSkillName('.system')).toBe(true);
    expect(isReservedSkillName('pdf')).toBe(false);
  });

  it.each(['pdf', 'my-skill', 'a.b_c'])('допустимое «%s»', (n) => expect(isValidSkillName(n)).toBe(true));
  it.each(['', '..', '../x', 'a/b', 'a\\b', 'synced', '.trash', '-x', 'Synced', 'SYNCED', 'a.', 'con', 'NUL', 'com1', 'lpt9', 'aux'])('недопустимое «%s»', (n) =>
    expect(isValidSkillName(n)).toBe(false),
  );
});

describe('parseAgents', () => {
  it('оставляет только известных агентов без повторов', () => {
    expect(parseAgents(['codex', 'claude', 'codex', 'evil', 1])).toEqual(['codex', 'claude']);
    expect(parseAgents('claude')).toEqual([]);
  });
});

describe('skillRoots', () => {
  const home = path.join('/h');
  it('проект — одна папка агента', () => {
    expect(skillRoots({ kind: 'project', path: '/p' }, 'codex', home)).toEqual([path.join('/p', '.agents', 'skills')]);
  });
  it('глобально: Claude — ~/.claude/skills; Codex — ~/.agents/skills и ~/.codex/skills', () => {
    expect(skillRoots({ kind: 'global' }, 'claude', home)).toEqual([path.join(home, '.claude', 'skills')]);
    expect(skillRoots({ kind: 'global' }, 'codex', home)).toEqual([
      path.join(home, '.agents', 'skills'),
      path.join(home, '.codex', 'skills'),
    ]);
  });
});

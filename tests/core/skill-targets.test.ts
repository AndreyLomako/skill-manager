import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { isReservedSkillName, isValidSkillName, parseAgents, skillsRoot } from '../../src/core/skill-targets';

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
  it.each(['', '..', '../x', 'a/b', 'a\\b', 'synced', '.trash', '-x'])('недопустимое «%s»', (n) =>
    expect(isValidSkillName(n)).toBe(false),
  );
});

describe('parseAgents', () => {
  it('оставляет только известных агентов без повторов', () => {
    expect(parseAgents(['codex', 'claude', 'codex', 'evil', 1])).toEqual(['codex', 'claude']);
    expect(parseAgents('claude')).toEqual([]);
  });
});

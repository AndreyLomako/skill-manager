import { describe, expect, it } from 'vitest';
import { isAllowedHost } from '../../src/core/allowed-hosts';

describe('isAllowedHost', () => {
  it('по умолчанию разрешает только 127.0.0.1:4317 и localhost:4317', () => {
    expect(isAllowedHost('127.0.0.1:4317', {})).toBe(true);
    expect(isAllowedHost('localhost:4317', {})).toBe(true);
    expect(isAllowedHost('LOCALHOST:4317', {})).toBe(true);
    expect(isAllowedHost('evil.example:4317', {})).toBe(false);
    expect(isAllowedHost('127.0.0.1:4318', {})).toBe(false);
    expect(isAllowedHost('', {})).toBe(false);
    expect(isAllowedHost(null, {})).toBe(false);
  });

  it('берёт порт из SKILL_MANAGER_PORT', () => {
    const env = { SKILL_MANAGER_PORT: '4320' };
    expect(isAllowedHost('127.0.0.1:4320', env)).toBe(true);
    expect(isAllowedHost('localhost:4320', env)).toBe(true);
    expect(isAllowedHost('127.0.0.1:4317', env)).toBe(false);
  });
});

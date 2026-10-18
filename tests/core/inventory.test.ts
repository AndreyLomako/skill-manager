import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { listInstalled } from '../../src/core/inventory';
import type { CatalogSkill } from '../../src/core/types';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const md = (name: string, description = '') => `---\nname: ${name}\ndescription: ${description}\n---\n`;

async function makeHome() {
  const root = await tmpDir();
  const home = path.join(root, 'home');
  const plugin = path.join(root, 'plugins', 'sp', '1.0.0');
  const disabled = path.join(root, 'plugins', 'off', '1.0.0');
  await writeFiles(root, {
    'home/.claude/skills/pdf/SKILL.md': md('PDF', 'работа с PDF'),
    'home/.claude/skills/no-skill-md/readme.txt': 'x',
    'home/.claude/skills/.trash/old/SKILL.md': md('old'),
    'home/.claude/skills/synced/bucket-1/morning/SKILL.md': md('Morning'),
    'home/.claude/plugins/installed_plugins.json': JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@sp-market': [{ installPath: plugin }],
        'off@x': [{ installPath: disabled }],
      },
    }),
    'home/.claude/settings.json': JSON.stringify({ enabledPlugins: { 'superpowers@sp-market': true, 'off@x': false } }),
    'plugins/sp/1.0.0/skills/brainstorming/SKILL.md': md('brainstorming'),
    'plugins/off/1.0.0/skills/hidden/SKILL.md': md('hidden'),
    'home/.agents/skills/codex-own/SKILL.md': md('Codex own'),
    'home/.codex/skills/.system/imagegen/SKILL.md': md('imagegen'),
    'lib/pdf/SKILL.md': md('PDF', 'работа с PDF'),
    'proj/.claude/skills/local-one/SKILL.md': md('Local'),
    'proj/.agents/skills/codex-local/SKILL.md': md('Codex local'),
  });
  const catalog: CatalogSkill[] = [
    { id: 'pdf', title: 'PDF', description: '', category: 'docs', layer: 'base', dir: path.join(root, 'lib', 'pdf') },
  ];
  return { root, home, catalog };
}

describe('listInstalled', () => {
  it('глобально для Claude: managed со статусом, synced и включённые плагины', async () => {
    const { home, catalog } = await makeHome();
    const res = await listInstalled({ kind: 'global' }, ['claude'], home, catalog);
    expect(res.map((s) => [s.kind, s.name, s.status ?? null, s.plugin ?? null])).toEqual([
      ['managed', 'pdf', 'up-to-date', null],
      ['synced', 'morning', null, null],
      ['plugin', 'brainstorming', null, 'superpowers'],
    ]);
    expect(res[0]).toMatchObject({ title: 'PDF', description: 'работа с PDF', agent: 'claude' });
  });

  it('глобально для Codex: свои и системные', async () => {
    const { home, catalog } = await makeHome();
    const res = await listInstalled({ kind: 'global' }, ['codex'], home, catalog);
    expect(res.map((s) => [s.kind, s.name, s.agent])).toEqual([
      ['managed', 'codex-own', 'codex'],
      ['system', 'imagegen', 'codex'],
    ]);
  });

  it('в проекте — только managed для выбранных агентов, без synced/plugin/system', async () => {
    const { root, home, catalog } = await makeHome();
    const res = await listInstalled({ kind: 'project', path: path.join(root, 'proj') }, ['claude', 'codex'], home, catalog);
    expect(res.map((s) => [s.kind, s.name, s.agent, s.status])).toEqual([
      ['managed', 'codex-local', 'codex', 'unknown'],
      ['managed', 'local-one', 'claude', 'unknown'],
    ]);
  });

  it('пустой дом — пусто', async () => {
    expect(await listInstalled({ kind: 'global' }, ['claude', 'codex'], await tmpDir(), [])).toEqual([]);
  });
});

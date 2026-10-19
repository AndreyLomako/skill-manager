import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseManifest } from '../../src/core/manifest';

// Каталог, который поставляется с приложением.
const file = path.join(__dirname, '..', '..', 'catalog', 'catalog.json');

describe('базовый каталог', async () => {
  const m = parseManifest(await readFile(file, 'utf8'), 'catalog.json');

  it('категории: Дизайн, Видео (Монтаж, Генерация), Другие', () => {
    expect(m.categories.map((c) => [c.id, c.parent ?? null])).toEqual([
      ['design', null],
      ['video', null],
      ['video-editing', 'video'],
      ['video-generation', 'video'],
      ['other', null],
    ]);
  });

  it('impeccable в «Дизайне»: отдельные копии для Claude и Codex, команды', () => {
    const imp = m.skills.find((s) => s.id === 'impeccable');
    expect(imp).toMatchObject({
      category: 'design',
      paths: { claude: '.claude/skills/impeccable', codex: '.agents/skills/impeccable' },
      homepage: 'https://impeccable.style',
    });
    expect(imp?.commands?.map((c) => c.cmd)).toEqual([
      '/impeccable critique',
      '/impeccable audit',
      '/impeccable polish',
      '/impeccable shape',
      '/impeccable typeset',
      '/impeccable animate',
    ]);
    expect(m.sources.find((s) => s.id === imp?.source)).toMatchObject({
      type: 'git',
      url: 'https://github.com/pbakaus/impeccable.git',
    });
  });

  it('примеров больше нет', () => {
    expect(m.skills.some((s) => s.id.startsWith('sample-'))).toBe(false);
  });
});

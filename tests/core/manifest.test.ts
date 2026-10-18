import { describe, expect, it } from 'vitest';
import { emptyManifest, ManifestError, parseManifest } from '../../src/core/manifest';

const valid = {
  version: 1,
  categories: [{ id: 'graphics', title: 'Графика', order: 1 }],
  sources: [
    { id: 's', type: 'local', path: './s' },
    { id: 'g', type: 'git', url: 'https://github.com/o/r', ref: 'main' },
  ],
  skills: [{ id: 'a', source: 's', path: 'a', category: 'graphics' }],
};

describe('parseManifest', () => {
  it('разбирает корректный манифест', () => {
    const m = parseManifest(JSON.stringify(valid), 'T');
    expect(m.skills[0]).toMatchObject({ id: 'a', source: 's', path: 'a', category: 'graphics' });
    expect(m.sources[1]).toEqual({ id: 'g', type: 'git', url: 'https://github.com/o/r', ref: 'main' });
    expect(m.categories[0]).toMatchObject({ id: 'graphics', title: 'Графика', order: 1 });
  });

  it('отсутствующие массивы считаются пустыми', () => {
    expect(parseManifest('{"version":1}', 'T')).toEqual(emptyManifest());
  });

  it.each([
    ['битый JSON', '{', /некорректный JSON/],
    ['версия', JSON.stringify({ ...valid, version: 2 }), /version/],
    ['тип источника', JSON.stringify({ ...valid, sources: [{ id: 's', type: 'ftp' }] }), /type/],
    [
      'неизвестный источник',
      JSON.stringify({ ...valid, skills: [{ id: 'a', source: 'zzz', path: 'a', category: 'graphics' }] }),
      /не найден/,
    ],
    [
      'id с путём',
      JSON.stringify({ ...valid, skills: [{ id: '../evil', source: 's', path: 'a', category: 'graphics' }] }),
      /id/,
    ],
    ['дубликат id', JSON.stringify({ ...valid, skills: [valid.skills[0], valid.skills[0]] }), /повторяется/],
  ])('отклоняет: %s', (_name, raw, re) => {
    expect(() => parseManifest(raw, 'T')).toThrow(ManifestError);
    expect(() => parseManifest(raw, 'T')).toThrow(re);
  });
});

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

describe('parseManifest: каталог v2', () => {
  const base = { version: 1, sources: [{ id: 's', type: 'local', path: '.' }] };
  const parse = (o: object) => parseManifest(JSON.stringify({ ...base, ...o }), 'T');

  it('parent у категории', () => {
    const m = parse({ categories: [{ id: 'video', title: 'Видео' }, { id: 'cut', title: 'Монтаж', parent: 'video' }] });
    expect(m.categories[1].parent).toBe('video');
    expect(m.categories[0].parent).toBeUndefined();
  });

  it('parent должен ссылаться на категорию верхнего уровня этого же файла', () => {
    expect(() => parse({ categories: [{ id: 'cut', title: 'М', parent: 'nope' }] })).toThrow(/parent/);
    expect(() =>
      parse({
        categories: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B', parent: 'a' },
          { id: 'c', title: 'C', parent: 'b' },
        ],
      }),
    ).toThrow(/вложенность/);
  });

  it('paths по агентам вместо path', () => {
    const m = parse({ skills: [{ id: 'x', source: 's', category: 'c', paths: { claude: 'a', codex: 'b' } }] });
    expect(m.skills[0].paths).toEqual({ claude: 'a', codex: 'b' });
    expect(() =>
      parse({ skills: [{ id: 'x', source: 's', category: 'c', path: 'p', paths: { claude: 'a' } }] }),
    ).toThrow(/path.*paths/);
    expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', paths: { gemini: 'a' } }] })).toThrow(/агент/);
    expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', paths: {} }] })).toThrow(/paths/);
  });

  it('summary, commands, commandsMore, homepage', () => {
    const m = parse({
      skills: [
        {
          id: 'x',
          source: 's',
          category: 'c',
          summary: 'S',
          commands: [{ cmd: '/x a', hint: 'h' }],
          commandsMore: 3,
          homepage: 'https://x.dev',
        },
      ],
    });
    expect(m.skills[0]).toMatchObject({
      summary: 'S',
      commands: [{ cmd: '/x a', hint: 'h' }],
      commandsMore: 3,
      homepage: 'https://x.dev',
    });
  });

  it('commands: не больше 8, cmd и hint обязательны; commandsMore — целое ≥ 0; homepage только https', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ cmd: `/c${i}`, hint: 'h' }));
    const sk = (extra: object) => parse({ skills: [{ id: 'x', source: 's', category: 'c', ...extra }] });
    expect(() => sk({ commands: nine })).toThrow(/8/);
    expect(() => sk({ commands: [{ cmd: '/a' }] })).toThrow(/hint/);
    expect(() => sk({ commandsMore: -1 })).toThrow(/commandsMore/);
    expect(() => sk({ homepage: 'http://x' })).toThrow(/https/);
  });

  it('packs: скиллы существуют, категория совпадает, id не пересекается, скилл в одном паке', () => {
    const skills = [
      { id: 'a', source: 's', category: 'cut' },
      { id: 'b', source: 's', category: 'cut' },
    ];
    const m = parse({ skills, packs: [{ id: 'p', title: 'P', category: 'cut', skills: ['a', 'b'] }] });
    expect(m.packs[0]).toEqual({ id: 'p', title: 'P', category: 'cut', skills: ['a', 'b'] });
    const pk = (p: object) => parse({ skills, packs: [{ id: 'p', title: 'P', category: 'cut', skills: ['a'], ...p }] });
    expect(() => pk({ skills: ['zzz'] })).toThrow(/zzz/);
    expect(() => pk({ category: 'other' })).toThrow(/категори/);
    expect(() => pk({ id: 'a', skills: ['b'] })).toThrow(/повторяется/);
    expect(() => pk({ skills: [] })).toThrow(/пуст/);
    expect(() =>
      parse({
        skills,
        packs: [
          { id: 'p', title: 'P', category: 'cut', skills: ['a'] },
          { id: 'q', title: 'Q', category: 'cut', skills: ['a'] },
        ],
      }),
    ).toThrow(/двух паках|уже в паке/);
  });

  it('старый файл без новых полей валиден, packs = []', () => {
    expect(parse({}).packs).toEqual([]);
  });
});

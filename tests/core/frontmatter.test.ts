import { describe, expect, it } from 'vitest';
import { readFrontmatter } from '../../src/core/frontmatter';

describe('readFrontmatter', () => {
  it('читает name и description', () => {
    expect(readFrontmatter('---\nname: Палитра\ndescription: Подбор цветов\n---\n# x')).toEqual({
      name: 'Палитра',
      description: 'Подбор цветов',
    });
  });

  it('поддерживает многострочное описание и CRLF', () => {
    expect(
      readFrontmatter('---\r\nname: a\r\ndescription: >\r\n  line one\r\n  line two\r\n---\r\n'),
    ).toEqual({ name: 'a', description: 'line one line two' });
  });

  it('без frontmatter — пусто', () => {
    expect(readFrontmatter('# title')).toEqual({});
  });

  it('битый YAML — пусто', () => {
    expect(readFrontmatter('---\nname: [oops\n---\n')).toEqual({});
  });
});

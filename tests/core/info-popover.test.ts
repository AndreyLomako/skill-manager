import { describe, expect, it } from 'vitest';
import { infoReducer, INFO_CLOSED, type InfoState } from '../../src/core/info-popover';

const open = (id: string, pinned = false): InfoState => ({ open: id, pinned });

describe('infoReducer (подробности скилла)', () => {
  it('наведение открывает, уход закрывает', () => {
    const s = infoReducer(INFO_CLOSED, { type: 'open', id: 'a' });
    expect(s).toEqual(open('a'));
    expect(infoReducer(s, { type: 'close' })).toEqual(INFO_CLOSED);
  });

  it('наведение на другой скилл переключает незакреплённый поповер', () => {
    expect(infoReducer(open('a'), { type: 'open', id: 'b' })).toEqual(open('b'));
  });

  it('закреплённый не закрывается уходом курсора и не перехватывается наведением на другой', () => {
    const pinned = open('a', true);
    expect(infoReducer(pinned, { type: 'close' })).toBe(pinned);
    expect(infoReducer(pinned, { type: 'open', id: 'b' })).toBe(pinned);
    expect(infoReducer(pinned, { type: 'open', id: 'a' })).toEqual(pinned);
  });

  it('ⓘ закрепляет; повторно на том же — снимает; на другом — переключает закреплённый', () => {
    const s = infoReducer(open('a'), { type: 'pin', id: 'a' });
    expect(s).toEqual(open('a', true));
    expect(infoReducer(s, { type: 'pin', id: 'a' })).toEqual(INFO_CLOSED);
    expect(infoReducer(s, { type: 'pin', id: 'b' })).toEqual(open('b', true));
  });

  it('Esc / клик вне / × закрывают даже закреплённый', () => {
    expect(infoReducer(open('a', true), { type: 'dismiss' })).toEqual(INFO_CLOSED);
  });
});

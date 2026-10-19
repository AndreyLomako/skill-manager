import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSplashPainted } = require('../../electron/reveal.cjs') as {
  isSplashPainted: (bitmap: Uint8Array) => boolean;
};

// NativeImage.toBitmap(): BGRA.
const bgra = (r: number, g: number, b: number) => Uint8Array.from([b, g, r, 255]);

describe('isSplashPainted', () => {
  it('пустой снимок — заставки ещё нет', () => {
    expect(isSplashPainted(new Uint8Array(0))).toBe(false);
  });

  it('цвет фона окна (#12071f) — заставки ещё нет', () => {
    expect(isSplashPainted(bgra(0x12, 0x07, 0x1f))).toBe(false);
    expect(isSplashPainted(bgra(0x14, 0x08, 0x22))).toBe(false); // сглаживание/округление
  });

  it('полностью прозрачный или чёрный пиксель — заставки ещё нет', () => {
    expect(isSplashPainted(Uint8Array.from([0, 0, 0, 0]))).toBe(false);
    expect(isSplashPainted(bgra(0, 0, 0))).toBe(false);
  });

  it('фиолетовый градиент заставки — нарисована', () => {
    expect(isSplashPainted(bgra(0x4e, 0x16, 0x7a))).toBe(true);
    expect(isSplashPainted(bgra(0x3a, 0x10, 0x60))).toBe(true);
  });
});

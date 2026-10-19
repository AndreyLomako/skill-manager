'use strict';
// Проверка снимка окна: нарисована ли уже заставка (electron/splash.html) или в окне пока только фон.

// backgroundColor окна (BG_COLOR в main.cjs) и --bg-1 заставки.
const BG = { r: 0x12, g: 0x07, b: 0x1f };
// Насколько пиксель должен отличаться от фона: сглаживание и округление дают единицы.
const MIN_DIFF = 30;

/**
 * true, если первый пиксель снимка (NativeImage.toBitmap(), BGRA) — уже градиент заставки:
 * заметно отличается от цвета фона и светлее его. Пустой, прозрачный или чёрный снимок — false.
 * @param {Uint8Array} bitmap
 */
function isSplashPainted(bitmap) {
  if (!bitmap || bitmap.length < 4) return false;
  const [b, g, r, a] = bitmap;
  if (a === 0) return false;
  const diff = Math.abs(r - BG.r) + Math.abs(g - BG.g) + Math.abs(b - BG.b);
  return diff > MIN_DIFF && r + g + b > BG.r + BG.g + BG.b;
}

module.exports = { isSplashPainted };

# CSS структура

## Файлы

Только два CSS-файла:

| Файл | Назначение |
|------|-----------|
| `css/main.css` | Все стили — сброс, переменные, шрифты, компоненты, страницы |
| `css/media.css` | Только медиазапросы |

**Никогда не пишем медиазапросы в `main.css`.** Все `@media` — только в `media.css`.

## Организация main.css

Файл разделён на секции через комментарии. Порядок обязателен:

```css
/* ==================== CSS ПЕРЕМЕННЫЕ ==================== */
:root { ... }

/* ==================== СБРОС ==================== */
/* сброс стилей браузера */

/* ==================== ШРИФТЫ ==================== */
@font-face { ... }

/* ==================== ГЛОБАЛЬНЫЕ СТИЛИ ==================== */
body { ... }
.wrapper { ... }
main { ... }
.container { ... }
.swiper { width: 100%; }

/* ==================== HOVER ==================== */
/* глобальные hover-эффекты */

/* ==================== НАВИГАЦИЯ СЛАЙДЕРОВ ==================== */
/* глобальные стили nav__prev / nav__next */

/* ==================== ШАПКА ==================== */
.header { ... }

/* ==================== ПОДВАЛ ==================== */
.footer { ... }

/* ==================== БУРГЕР ==================== */
.burger { ... }

/* ==================== МОБИЛЬНОЕ МЕНЮ ==================== */
.mobile-panel { ... }

/* ==================== ГЛАВНАЯ СТРАНИЦА ==================== */
.hero { ... }
.catalog { ... }

/* ==================== СТРАНИЦА ABOUT ==================== */
.about { ... }

/* ==================== ФОРМЫ ==================== */
.callback { ... }
```

## Секция СБРОС (обязательная, фиксированная)

Содержимое раздела СБРОС не меняется от проекта к проекту:

```css
*, *::before, *::after {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html {
  height: 100%;
}

body {
  min-height: 100%;
}

img, video {
  max-width: 100%;
  height: auto;
}

a {
  color: inherit;
  text-decoration: none;
}

input, button, textarea, select {
  font: inherit;
}

button {
  cursor: pointer;
  background-color: transparent;
  border: none;
}

ul, ol {
  list-style: none;
}

h1, h2, h3, h4, h5, h6 {
  font-size: inherit;
  font-weight: inherit;
}
```

## Секция ГЛОБАЛЬНЫЕ СТИЛИ (обязательная)

Значения переменных меняются под проект, структура — нет:

```css
body {
  font-family: var(--font-family);
  color: var(--color-primary);
  font-weight: var(--font-weight-default);
  font-size: var(--font-size-default);
  line-height: var(--line-height-default);
  background: #f0efeb;
}

body._disable-scroll {
  overflow: hidden;
  touch-action: none;
  -ms-touch-action: none;
}

.wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  position: relative;
}

main {
  flex: 1;
  position: relative;
}

.container {
  max-width: var(--container-width);
  width: 100%;
  padding-inline: var(--container-padding);
  margin-inline: auto;
}

.swiper {
  width: 100%;
}
```

Класс `._disable-scroll` вешается на `<body>` через JS при открытии мобильного меню или попапа.

## CSS-переменные

Переменные объявляем только **глобальные и часто используемые** — не создаём переменную под каждый отступ или цвет.

Критерий: если значение используется в 3+ местах или является частью дизайн-системы — заводим переменную. Разовые значения пишем напрямую.

```css
:root {
  /* Цвета */
  --color-black: #000000;
  --color-white: #ffffff;
  --color-primary: #2b2b2a;
  --color-secondary: #c2bfaf;
  --color-accent: #a08060;

  /* Контейнер */
  --container-width: 1644px;
  --container-padding: 22px;

  /* Типографика */
  --font-family: "Manrope", sans-serif;
  --font-weight-default: 400;
  --font-size-default: 18px;
  --line-height-default: 120%;
}
```

```css
/* Хорошо — переменная для цвета из дизайн-системы */
color: var(--color-primary);

/* Хорошо — разовый отступ напрямую */
margin-top: 14px;

/* Плохо — переменная под единственное использование */
--some-block-mt: 14px;
```

## Брейкпоинты

Только стандартные брейкпоинты — не придумываем произвольные значения:

| Брейкпоинт | Назначение |
|-----------|-----------|
| `(max-width: <container>px)` | Ширина контейнера — первый брейкпоинт адаптива (например, `1800px`) |
| `(max-width: 1439.98px)` | Широкие ноутбуки, небольшие десктопы |
| `(max-width: 1023.98px)` | Планшеты горизонтально |
| `(max-width: 767.98px)` | Планшеты вертикально, большие телефоны |
| `(max-width: 479.98px)` | Телефоны |
| Ниже `479.98px` | Только для мелких правок |

Структура `media.css`:

```css
/* ── container ── */
@media (max-width: 1700px) {
  .header { ... }
}

/* ── 1439 ── */
@media (max-width: 1439.98px) {
  .header { ... }
}

/* ── 1023 ── */
@media (max-width: 1023.98px) {
  .header { ... }
}

/* ── 767 ── */
@media (max-width: 767.98px) {
  .header { ... }
}

/* ── 479 ── */
@media (max-width: 479.98px) {
  .header { ... }
}
```

## Плавающие (sticky) блоки

Плавающие блоки делаем через `position: sticky`.

`overflow: hidden` на родителе ломает `position: sticky`. Используем `overflow: clip` — обрезает контент так же, но не мешает sticky:

```css
/* Плохо — ломает sticky внутри */
.section {
  overflow: hidden;
}

/* Хорошо */
.section {
  overflow: clip;
}
```

## Шрифты

Только WOFF2. `font-display: swap` обязателен:

```css
@font-face {
  font-family: 'Manrope';
  src: url('../font/Manrope-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

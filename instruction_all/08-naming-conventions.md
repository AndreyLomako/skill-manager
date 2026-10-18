# Соглашения по именованию

## Файлы и папки

| Тип | Стиль | Примеры |
|-----|-------|---------|
| HTML-страницы | kebab-case | `index.html`, `about.html`, `catalog-detail.html` |
| CSS-файлы | kebab-case | `main.css`, `media.css` |
| JS-файлы | kebab-case / snake_case | `main.js` |
| Изображения | kebab-case | `hero-bg.jpg`, `catalog-item-1.webp` |
| Шрифты | PascalCase с дефисом | `Manrope-Regular.woff2`, `Inter-Bold.woff2` |
| Папки | kebab-case | `swiper-slider/`, `other-page/` |

## CSS-классы (BEM)

```
Блок:        .header, .catalog, .mobile-panel
Элемент:     .header__logo, .catalog__item, .mobile-panel__link
Модификатор: ._is-show, ._is-active, ._is-hidden, ._margin  (отдельный класс)
```

Модификатор добавляется через пробел как отдельный класс:

```html
<header class="header _is-fixed">
<div class="catalog__item _is-active">
<ul class="header__list _margin">
```

В CSS модификаторы пишем через составной селектор — к блоку или элементу, которому принадлежат:
```css
.header._is-show { display: block; }
.catalog__item._is-hidden { display: none; }
.btn._is-active { ... }
```

Правила:
- Только строчные буквы
- Слова разделяются дефисом: `.catalog-list__item`
- Блок от элемента — двойное подчёркивание: `__`
- Модификатор — отдельный класс с `_`: `._is-show`
- Не используем camelCase: `.catalogItem` — плохо

## JS — имена переменных и функций

```javascript
// Переменные — camelCase
const headerFixed = document.querySelector('.header._is-fixed');
const swiperCatalog = new Swiper('.catalog-slider', {...});

// Функции — camelCase, глагол + существительное
function initBurger() {...}
function handleScroll() {...}
function debounce() {...}
```

## CSS-переменные

```css
/* kebab-case с префиксом смысловой группы */
--color-primary
--color-secondary
--font-family
--font-size-default
--container-width
```

## Изображения

```
hero-bg.jpg             — фон секции hero
catalog-item-1.webp     — фото продукта в каталоге
icon-arrow-right.svg    — иконка стрелки вправо
logo-white.svg          — белый вариант логотипа
about-team-photo.jpg    — фото команды на странице about
```

- Только строчные буквы
- Слова через дефис
- Нет пробелов, нет кириллицы в именах файлов

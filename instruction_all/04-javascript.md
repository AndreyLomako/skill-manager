# Работа с JavaScript

## Принципы

- Пишем на **Vanilla JS** — без фреймворков и лишних зависимостей
- Один файл `js/main.js` — весь код проекта в нём, разбитый на секции через комментарии
- Babel не используется — пишем код совместимый с целевыми браузерами

## Структура main.js

Файл разделён на секции через комментарии. Порядок обязателен: утилиты → компоненты → слайдеры → блоки страниц.

```javascript
/* ==================== УТИЛИТЫ ==================== */

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ==================== БУРГЕР ==================== */

(function () {
  const burger = document.querySelector('.burger');
  const menu = document.querySelector('.mobile-panel');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      burger.classList.toggle('_is-active');
      menu.classList.toggle('_is-show');
      document.body.classList.toggle('_disable-scroll');
    });
  }
})();

/* ==================== СЛАЙДЕРЫ ==================== */

(function () {
  const swiper = new Swiper('.catalog-slider', {
    speed: 1000,
    slidesPerView: 3,
    spaceBetween: 20,
    navigation: {
      nextEl: '.catalog-slider__btn-next',
      prevEl: '.catalog-slider__btn-prev',
    },
  });
})();

/* ==================== ШАПКА ==================== */

(function () {
  const header = document.querySelector('.header');
  if (!header) return;
  window.addEventListener('scroll', function () {
    header.classList.toggle('_fixed', window.scrollY > 50);
  });
})();
```

## Работа с DOM

Всегда проверяем наличие элемента — `main.js` общий для всех страниц, элемент может отсутствовать:

```javascript
// Хорошо
const el = document.querySelector('.some-block');
if (el) {
  el.addEventListener('click', handler);
}

// Плохо — упадёт если элемента нет на странице
document.querySelector('.some-block').addEventListener('click', handler);
```

## IIFE для изоляции

Каждый логический блок оборачиваем в IIFE — переменные не попадают в глобальную область и не конфликтуют друг с другом:

```javascript
// Без IIFE — конфликт если const swiper объявлен дважды
const swiper = new Swiper('.catalog', {...});
const swiper = new Swiper('.blog', {...}); // ОШИБКА

// С IIFE — каждый в своей области
(function () {
  const swiper = new Swiper('.catalog', {...});
})();

(function () {
  const swiper = new Swiper('.blog', {...});
})();
```

Исключение — утилитарные функции (`debounce`, `getMaskInput` и т.д.) объявляем без IIFE, так как они нужны в других секциях.

## Подключение в HTML

`main.js` подключается одним тегом перед `</body>`. Библиотеки — до него:

```html
<script src="lib/swiper-slider/swiper-bundle.min.js"></script>
<script src="lib/fancybox/fancybox.umd.js"></script>
<script src="js/main.js"></script>
```

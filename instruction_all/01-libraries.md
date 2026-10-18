# Работа с библиотеками

## Принципы

- Библиотеки подключаются **только локально** — файлы лежат в `lib/`
- CDN не используется
- Скачивать нужно **последнюю стабильную версию** с официального сайта
- Предпочитаем **минифицированные версии** файлов (`.min.js`, `.min.css`) — они меньше весят
- Если в библиотеке нет `.min`-версии — подключаем обычную

## Разрешённые библиотеки

| Библиотека | Назначение | Сайт |
|-----------|-----------|------|
| **Swiper** | Слайдеры, карусели, табы | https://swiperjs.com |
| **Fancybox** | Лайтбокс, попап-формы, галереи | https://fancyapps.com/fancybox |

> Прежде чем добавлять новую библиотеку — убедись, что задача не решается уже имеющимися или чистым JS.

## Структура в проекте

```
lib/
├── swiper-slider/
│   ├── swiper-bundle.min.js
│   └── swiper-bundle.min.css
└── fancybox/
    ├── fancybox.umd.js
    └── fancybox.css
```

Каждая библиотека — в **отдельной папке** с понятным именем.

## Подключение в HTML

Стили подключаются в `<head>`, скрипты — перед закрывающим `</body>`.

```html
<head>
  <link rel="stylesheet" href="lib/swiper-slider/swiper-bundle.min.css">
  <link rel="stylesheet" href="lib/fancybox/fancybox.css">
</head>

<body>
  ...
  <script src="lib/swiper-slider/swiper-bundle.min.js"></script>
  <script src="lib/fancybox/fancybox.umd.js"></script>
  <script src="js/main.js"></script>
</body>
```

---

## Swiper

> **При доработке проекта:** найти все слайдеры в HTML и JS. Любой слайдер не на Swiper (Owl Carousel, Slick, jQuery-карусель, кастомный) — **полностью переписать** на Swiper: HTML-структура, JS-инициализация, CSS-стили. Не пропускать.

### Структура HTML

В HTML всегда используем **полную стандартную структуру Swiper** как требует библиотека — `.swiper`, `.swiper-wrapper`, `.swiper-slide` обязательны. Уникальный класс блока добавляем на корневой элемент рядом с `.swiper`.

Кнопки навигации выносим в отдельную обёртку с **двумя классами**: уникальным (`hero-nav`) и общим (`nav`). Кнопки prev/next аналогично получают пару классов:

```html
<div class="catalog-slider swiper">
  <div class="catalog-slider__list swiper-wrapper">
    <div class="catalog-slider__item swiper-slide">...</div>
    <div class="catalog-slider__item swiper-slide">...</div>
  </div>
  <div class="catalog-slider-nav nav">
    <button class="catalog-slider-nav__prev nav__prev"></button>
    <button class="catalog-slider-nav__next nav__next"></button>
  </div>
  <div class="catalog-slider__pagination"></div>
</div>
```

Навигация может располагаться и снаружи `.swiper` — Swiper привязывает кнопки по селектору, не по позиции в DOM:

```html
<div class="hero swiper">...</div>
<div class="hero-nav nav">
  <button class="hero-nav__prev nav__prev"></button>
  <button class="hero-nav__next nav__next"></button>
</div>

<div class="about swiper">...</div>
<div class="about-nav nav">
  <button class="about-nav__prev nav__prev"></button>
  <button class="about-nav__next nav__next"></button>
</div>
```

### Кнопки навигации — скрывание через .swiper-button-lock

Swiper автоматически добавляет класс `.swiper-button-lock` на кнопки когда слайдов меньше, чем нужно для листания (например, `loop: false` и всего 2 слайда при `slidesPerView: 3`). Кастомные стили кнопок могут перебивать это скрывание.

**Решение** — в секции `/* НАВИГАЦИЯ СЛАЙДЕРОВ */` в `main.css` пишем глобальное правило для общих классов:

```css
/* ==================== НАВИГАЦИЯ СЛАЙДЕРОВ ==================== */

.nav__prev.swiper-button-lock,
.nav__next.swiper-button-lock {
  display: none;
}
```

Кастомные стили кнопок пишем на уникальном классе. Если для позиционирования или иконки нужен `display: flex` — используем `:not(.swiper-button-lock)` чтобы не перебить скрывание:

```css
/* Хорошо — кастомные размеры и цвет без display */
.hero-nav__prev,
.hero-nav__next {
  width: 48px;
  height: 48px;
  background-color: var(--color-primary);
  border-radius: 50%;
}

/* Если нужен display: flex для центрирования иконки */
.hero-nav__prev:not(.swiper-button-lock),
.hero-nav__next:not(.swiper-button-lock) {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Плохо — перебивает .swiper-button-lock */
.hero-nav__prev,
.hero-nav__next {
  display: flex; /* скрывание сломается */
}
```

Если все кнопки навигации на проекте выглядят одинаково — пишем визуальные стили на `nav__prev` / `nav__next`, а уникальные классы используем только для инициализации JS:

```css
/* Единый стиль для всех кнопок */
.nav__prev:not(.swiper-button-lock),
.nav__next:not(.swiper-button-lock) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background-color: var(--color-primary);
}

/* Уникальные классы — только для отличий если они есть */
.hero-nav__prev { ... }
```

### Уникальные классы

Swiper, его кнопки и пагинацию **всегда инициализируем только по уникальному классу** — никогда не используем дефолтные классы Swiper (`.swiper-button-next`, `.swiper-button-prev`, `.swiper-pagination`). Это предотвращает конфликты когда на странице несколько слайдеров.

В CSS и JS к внутренним классам Swiper (`.swiper-wrapper`, `.swiper-slide`) не обращаемся для кастомной стилизации — только через уникальный класс блока. Единственное исключение — глобальная базовая настройка в секции ГЛОБАЛЬНЫЕ СТИЛИ в `main.css`:

```css
.swiper {
  width: 100%;
}
```

```css
/* Хорошо — стилизуем через уникальный класс */
.catalog-slider__btn-prev,
.catalog-slider__btn-next { ... }
.catalog-slider__pagination { ... }

/* Плохо — обращаемся к внутренним классам Swiper */
.catalog-slider .swiper-slide { ... }   /* нельзя */
.catalog-slider .swiper-wrapper { ... } /* нельзя */
```

### Инициализация

Базовая скорость `speed: 1000`. Каждый слайдер — в отдельном файле, обёрнут в IIFE. Для `navigation` указываем уникальные классы кнопок из nav-обёртки:

```javascript
(function () {
  const swiper = new Swiper('.catalog-slider', {
    speed: 1000,
    slidesPerView: 3,
    spaceBetween: 20,
    navigation: {
      nextEl: '.catalog-slider-nav__next',  // уникальный класс nav__next
      prevEl: '.catalog-slider-nav__prev',  // уникальный класс nav__prev
    },
    pagination: {
      el: '.catalog-slider__pagination',    // уникальный класс
      clickable: true,
    },
  });
})();
```

### Табы через Swiper Thumbs

Блоки с табами реализуем через связку двух Swiper-экземпляров с опцией `thumbs`. Не пишем кастомную логику переключения вкладок вручную.

```html
<div class="tabs-nav swiper">
  <div class="tabs-nav__list swiper-wrapper">
    <div class="tabs-nav__item swiper-slide">Вкладка 1</div>
    <div class="tabs-nav__item swiper-slide">Вкладка 2</div>
  </div>
</div>

<div class="tabs-content swiper">
  <div class="tabs-content__list swiper-wrapper">
    <div class="tabs-content__item swiper-slide">Контент вкладки 1</div>
    <div class="tabs-content__item swiper-slide">Контент вкладки 2</div>
  </div>
</div>
```

```javascript
(function () {
  const tabs = new Swiper('.tabs-nav', {
    spaceBetween: 10,
    slidesPerView: 'auto',
    speed: 1000,
    freeMode: true,
    watchSlidesProgress: true,
  });

  const contentTabs = new Swiper('.tabs-content', {
    speed: 0,
    thumbs: {
      swiper: tabs,
    },
  });
})();
```

Swiper автоматически проставляет классы активного состояния — мы их не устанавливаем сами, но можем использовать в CSS для стилизации:

| Класс | Когда активен |
|-------|--------------|
| `swiper-slide-active` | Текущий активный слайд |
| `swiper-slide-thumb-active` | Активный таб в связке thumbs |

Пример использования для стилизации активного таба:

```css
.tabs-nav__item {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.3s ease;
}

.tabs-nav__item.swiper-slide-thumb-active {
  opacity: 1;
}
```

---

## Fancybox

> **При доработке проекта:** найти все попапы и лайтбоксы в проекте. Любой не через Fancybox (Magnific Popup, кастомный попап, jQuery-модалка) — **полностью заменить** на Fancybox: HTML-триггеры, JS-инициализация. Не пропускать.

### Попап-формы

Все попап-формы открываем через Fancybox. Не пишем собственные модальные окна для форм.

```html
<!-- Триггер -->
<button data-fancybox data-src="#callback-form">Оставить заявку</button>
```

> **Триггер внутри Swiper-слайда:** если кнопка вызова Fancybox находится внутри слайда, используем `<a>` вместо `<button>` — это избегает конфликтов с обработчиком кликов Swiper:
> ```html
> <a href="#callback-form" data-fancybox>Оставить заявку</a>
> ```

```html
<!-- Скрытый контейнер формы (display: none прописан в main.css) -->
<div id="callback-form" class="callback-form-popup">
  <form class="callback-form">
    ...
  </form>
</div>
```

В `css/main.css` в секции ФОРМЫ:

```css
.callback-form-popup {
  display: none;
  max-width: 600px;
}
```

```javascript
Fancybox.bind('[data-fancybox]', {
  animated: true,
  dragToClose: false,
});
```

### Галереи и изображения

Изображения в статьях, галереях, портфолио оборачиваем в `<a>` с атрибутом `data-fancybox`. Группировка — через одинаковое значение атрибута.

```html
<!-- Одиночное изображение -->
<a href="img/gallery/photo-1.jpg" data-fancybox>
  <img src="img/gallery/photo-1.jpg" alt="Описание">
</a>

<!-- Галерея (группа) — одинаковое значение data-fancybox -->
<a href="img/gallery/photo-1.jpg" data-fancybox="gallery">
  <img src="img/gallery/photo-1.jpg" alt="Фото 1">
</a>
<a href="img/gallery/photo-2.jpg" data-fancybox="gallery">
  <img src="img/gallery/photo-2.jpg" alt="Фото 2">
</a>
```

---

## Приведение существующего проекта к стандарту библиотек

При аудите или доработке существующего проекта — **обязательно заменить** слайдеры и попапы. Прочие сторонние библиотеки — оставить если они решают задачу, которую нельзя закрыть Swiper, Fancybox или чистым JS.

| Что найдено в проекте | Что делать |
|---|---|
| Используется не Swiper (Owl Carousel, Slick, кастомный слайдер и т.п.) | **Заменить на Swiper** — переписать HTML-структуру и JS-инициализацию |
| Используется не Fancybox (Magnific Popup, ColorBox, кастомный попап и т.п.) | **Заменить на Fancybox** — переписать HTML-триггеры и JS-инициализацию |
| Swiper инициализирован по дефолтным классам `.swiper-button-next` / `.swiper-pagination` | Переписать на уникальные классы |
| Библиотека подключена через CDN | Скачать локально в `lib/`, обновить пути в HTML |
| Библиотека лежит в нестандартном расположении | Переместить в `lib/<название>/` |
| Сторонняя библиотека (маски, анимации, карты и т.п.) не связанная со слайдерами/попапами | Оставить если нет замены через Vanilla JS или имеющиеся библиотеки |

> **Правило для агента:** слайдеры и попапы — **всегда** заменяем на Swiper и Fancybox. Остальные библиотеки не удаляем автоматически — оцениваем необходимость.

---

## Обновление библиотеки

1. Скачать новую версию с официального сайта
2. Заменить файлы в `lib/<название>/`
3. Проверить, что API не изменился — пробежаться по changelog
4. Проверить работу всех слайдеров / попапов на сайте

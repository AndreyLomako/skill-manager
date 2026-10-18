# HTML-страницы

## Принципы

- Каждая страница — **самостоятельный HTML-файл** в корне проекта
- Нет системы шаблонов — шапка, подвал и повторяющиеся блоки копируются в каждый файл вручную
- Все страницы лежат в корне: `index.html`, `about.html`, `catalog.html`

## Шаблон страницы

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Описание страницы" />
    <title>Заголовок | Название сайта</title>
    <link rel="stylesheet" href="lib/swiper-slider/swiper-bundle.min.css" />
    <link rel="stylesheet" href="lib/fancybox/fancybox.css" />
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/media.css" />
    <link rel="icon" href="favicon.ico" type="image/x-icon" />
  </head>
  <body>
    <div class="wrapper">

      <!-- ШАПКА -->
      <header class="header">
        <div class="container">
          <div class="header__wrapper">
            <a href="index.html" class="header__logo">
              <img src="img/header/logo.svg" alt="Логотип" width="120" height="40" />
            </a>
            <nav class="header__nav">
              <a href="index.html" class="header__link">Главная</a>
              <a href="about.html" class="header__link">О нас</a>
              <a href="catalog.html" class="header__link">Каталог</a>
              <a href="contacts.html" class="header__link">Контакты</a>
            </nav>
          </div>
        </div>
      </header>

      <main>
        <section class="hero">
          <div class="container">
            <div class="hero__wrapper">
              <!-- контент секции -->
            </div>
          </div>
        </section>
      </main>

      <!-- ПОДВАЛ -->
      <footer class="footer">
        <div class="container">
          <div class="footer__wrapper">
            <!-- контент подвала -->
          </div>
        </div>
      </footer>

      <!-- БУРГЕР -->
      <div class="burger">
        <span class="burger__line"></span>
        <span class="burger__line"></span>
        <span class="burger__line"></span>
      </div>

      <!-- МОБИЛЬНОЕ МЕНЮ -->
      <div class="mobile-panel">
        <nav class="mobile-panel__nav">
          <a href="index.html" class="mobile-panel__link">Главная</a>
          <a href="about.html" class="mobile-panel__link">О нас</a>
          <a href="catalog.html" class="mobile-panel__link">Каталог</a>
          <a href="contacts.html" class="mobile-panel__link">Контакты</a>
        </nav>
      </div>

      <!-- ПОПАП-ФОРМЫ -->

    </div>
    <script src="lib/swiper-slider/swiper-bundle.min.js"></script>
    <script src="lib/fancybox/fancybox.umd.js"></script>
    <script src="js/main.js"></script>
  </body>
</html>
```

## Структура секции

Каждая секция строится по единой схеме:

```html
<section class="about">
    <div class="container">
        <div class="about__wrapper">
            <!-- содержимое -->
        </div>
    </div>
</section>
```

- `section.about` — блок секции
- `.container` — глобальный класс ограничения ширины, не привязан к БЭМ-блоку
- `.about__wrapper` — внутренняя обёртка секции по БЭМ (не путать с глобальным `.wrapper` после `<body>`)

## Обёртка wrapper

Весь контент внутри `<body>` оборачиваем в `<div class="wrapper">` — кроме скриптов.

## Навигация

Во всех меню в `href` прописываем **реальный путь к файлу**:

```html
<!-- Хорошо -->
<a href="about.html">О нас</a>
<a href="catalog.html">Каталог</a>

<!-- Плохо -->
<a href="#">О нас</a>
```

## Добавление новой страницы

1. Скопировать `index.html` как основу
2. Переименовать в `new-page.html`
3. Обновить `<title>` и `<meta name="description">`
4. Добавить ссылку на новую страницу во все меню (шапка, мобильное меню, подвал) во **всех** существующих страницах
5. Написать контент в `<main>`
6. Добавить стили новой страницы в `css/main.css` с комментарием-секцией

## Формы

### Форма как секция страницы

Если форма присутствует на странице как самостоятельный видимый блок (например, форма обратной связи внизу страницы) — пишем её как обычную секцию:

```html
<section class="callback">
  <div class="callback__container container">
    <div class="callback__wrapper">
      <form class="callback__form">...</form>
    </div>
  </div>
</section>
```

### Форма как попап (Fancybox)

Если форма открывается в попапе по нажатию кнопки — разметка пишется как скрытый контейнер. Стили скрытия (`display: none`) — в `css/main.css`, не inline. Правила триггера и инициализации Fancybox — см. [01-libraries.md](01-libraries.md) в разделе Fancybox.

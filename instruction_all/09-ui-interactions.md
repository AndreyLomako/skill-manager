# UI-интерактивность

## Интерактивные блоки (JS + анимация)

Все интерактивные UI-блоки (бургер-меню, куки-оповещение, шторки, дропдауны и т.д.) реализуем на **чистом JS** с плавной анимацией через CSS-переходы.

Принцип: JS только переключает классы-модификаторы, анимация описана в CSS через `transition`.

```css
.burger-menu {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
}

.burger-menu._is-show {
    transform: translateX(0);
}
```

```javascript
const burger = document.querySelector(".burger");
const menu = document.querySelector(".burger-menu");

if (burger && menu) {
    burger.addEventListener("click", function () {
        burger.classList.toggle("_is-active");
        menu.classList.toggle("_is-show");
    });
}
```

Не используем `display: none / block` напрямую через JS — только добавление/удаление классов.

---

## Hover-эффекты

Все hover-эффекты делаем плавными через `transition`. Базовая скорость — `0.3s ease`, при необходимости корректируем.

```css
.btn {
    transition: opacity 0.3s ease;
}

.btn:hover {
    opacity: 0.8;
}

.header__link {
    transition: color 0.3s ease;
}

.header__link:hover {
    color: var(--color-secondary);
}
```

Не используем мгновенные переходы (`transition: none`) для интерактивных элементов — это ухудшает UX.

## Анимации изображений

Не используем `transform: scale()` при наведении на изображения — это ухудшает их визуальное качество.

Вместо масштабирования используем другие эффекты: изменение прозрачности, яркости/контрастности, наложение градиента, появление декоративных элементов, изменение тени, плавное смещение внутренних элементов.

```css
/* Плохо */
.card__img-wrap:hover img {
    transform: scale(1.05);
}

/* Пример — один из допустимых вариантов */
.card__img-wrap:hover img {
    filter: brightness(1.1);
    opacity: 0.85;
}
```

## Hover-эффекты только для элементов со ссылкой

Если класс используется и для ссылок, и для обычного текста — hover-эффект применяем **только** к вариантам с `<a>`:

```css
/* Плохо — применяется и к тексту без ссылки */
.contacts__item:hover {
    color: var(--color-accent);
}

/* Хорошо */
a.contacts__item:hover,
.contacts__item a:hover {
    color: var(--color-accent);
}
```

---

## Приведение существующего проекта к стандарту интерактивности

При аудите или доработке существующего проекта — **заменить** все реализации, не соответствующие этим инструкциям. Агент не пропускает интерактивные блоки — они обязательны к переработке:

| Что найдено в проекте                                                             | Что делать                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Кастомный слайдер (не Swiper), jQuery Slider, Owl Carousel, Slick и т.п.          | Переписать на Swiper согласно [01-libraries.md](01-libraries.md) |
| Попап / лайтбокс не через Fancybox (кастомный, Magnific, ColorBox и т.п.)         | Заменить на Fancybox                                             |
| Табы, написанные вручную (JS + data-атрибуты / индексы)                           | Переписать на Swiper Thumbs                                      |
| Интерактивный блок (бургер, дропдаун, аккордеон) с `display: none/block` через JS | Переписать на CSS `transition` + классы-модификаторы             |
| Анимация через jQuery (`.fadeIn`, `.slideDown` и т.д.)                            | Заменить на CSS `transition` + JS-классы                         |
| Hover-эффект без `transition` (мгновенное переключение)                           | Добавить `transition: ... 0.3s ease`                             |

> **Правило для агента:** запрос «привести к стандарту», «пройтись по инструкции», «исправить под инструкцию» — обязывает заменить **все** несоответствующие интерактивные блоки. Только структура и именование — недостаточно.

---

## Якорные ссылки с плавным скроллом

Если на проекте нужна прокрутка к секции по клику на ссылку — добавляем класс `_scroll-to` на элемент и прописываем в `href` ID целевого блока. JS перехватывает клик и плавно скроллит к нужному элементу.

```html
<a href="#about" class="_scroll-to">О нас</a>

<section id="about" class="about">...</section>
```

```javascript
const anchorLinks = document.querySelectorAll("._scroll-to");

if (anchorLinks.length > 0) {
    anchorLinks.forEach(function (anchorLink) {
        anchorLink.addEventListener("click", function (e) {
            e.preventDefault();

            const linkId = anchorLink.getAttribute("href");
            const targetElement = document.querySelector(linkId);

            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }
        });
    });
}
```

---

## Чекбокс согласия с политикой конфиденциальности

Во всех формах добавляем чекбокс согласия с политикой конфиденциальности. При загрузке страницы чекбокс всегда **не отмечен**. Переключение сопровождается плавной CSS-анимацией.

```html
<div class="form-checkbox">
    <input
        type="checkbox"
        id="privacy"
        name="privacy"
        class="form-checkbox__input"
    />
    <label for="privacy" class="form-checkbox__label">
        Я согласен с
        <a href="privacy.html" rel="nofollow" target="_blank"
            >политикой конфиденциальности</a
        >
    </label>
</div>
```

```css
.form-checkbox__input {
    display: none;
}

.form-checkbox__label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
}

.form-checkbox__label::before {
    content: "";
    display: inline-block;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border: 2px solid var(--color-secondary);
    border-radius: 4px;
    transition:
        background-color 0.3s ease,
        border-color 0.3s ease;
}

.form-checkbox__input:checked + .form-checkbox__label::before {
    background-color: var(--color-accent);
    border-color: var(--color-accent);
}
```

---

## Декоративные анимации

Для улучшения визуального восприятия допускается добавление небольших декоративных анимаций, не влияющих на функциональность сайта.

Пример: в Hero-блоке можно добавить подпись **«Скролл»** с анимированным индикатором (линия, градиент, стрелка и т.п.), который подсказывает пользователю необходимость прокрутки страницы вниз.

```css
.hero__scroll-line {
    width: 1px;
    height: 40px;
    background: linear-gradient(to bottom, var(--color-accent), transparent);
    animation: scrollLine 2s infinite;
}

@keyframes scrollLine {
    0% {
        transform: scaleY(0);
        transform-origin: top;
    }
    50% {
        transform: scaleY(1);
        transform-origin: top;
    }
    51% {
        transform: scaleY(1);
        transform-origin: bottom;
    }
    100% {
        transform: scaleY(0);
        transform-origin: bottom;
    }
}
```

Анимации не должны отвлекать пользователя или влиять на производительность страницы.

# Шрифты

### Форматы

Используем **только WOFF2**. WOFF, TTF, EOT — не используем.

```css
/* css/main.css */
@font-face {
  font-family: 'Manrope';
  src: url('../font/Manrope-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

`font-display: swap` — обязателен для всех `@font-face`.

### Шрифты проекта

Используем только шрифты из **Google Fonts** (https://fonts.google.com/).

Если конкретные начертания не заданы — агент анализирует проект и определяет нужные веса самостоятельно. Подключаем **полное семейство**: неиспользуемые начертания браузер не загрузит, а если понадобятся позже — уже будут подключены.

### Добавление шрифта

Разработчик указывает название шрифта и, если нужно, конкретные начертания. Агент выполняет следующие шаги:

1. Сформировать URL Google Fonts API. Если веса не заданы — запросить все доступные для данного семейства:
```
https://fonts.googleapis.com/css2?family=Manrope:wght@100;200;300;400;500;600;700;800;900&display=swap
```

2. Получить CSS по этому URL через `WebFetch` с заголовком User-Agent современного браузера — в ответе будут `@font-face` блоки с прямыми ссылками на woff2-файлы

3. Скачать каждый woff2-файл по полученным URL и сохранить в `font/` с понятным именем:
```
Manrope-Thin.woff2
Manrope-ExtraLight.woff2
Manrope-Light.woff2
Manrope-Regular.woff2
Manrope-Medium.woff2
Manrope-SemiBold.woff2
Manrope-Bold.woff2
Manrope-ExtraBold.woff2
```

4. Добавить `@font-face` в `css/main.css`

5. Добавить `<link rel="preload">` в `<head>` **только для критически важных шрифтов** — тех, что загружаются первыми и нужны для отображения основного текста (как правило Regular и Bold основного шрифта):
```html
<link rel="preload" href="font/Manrope-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="font/Manrope-Bold.woff2" as="font" type="font/woff2" crossorigin>
```

6. При необходимости добавить CSS-переменную в `:root`

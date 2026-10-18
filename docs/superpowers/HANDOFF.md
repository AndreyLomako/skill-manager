# Где остановились — 2026-10-18

## Текущая работа

**Автообновления + macOS и Linux** — эпик beads `interface-e7r`.
Ветка `feat/updates-crossplatform` (последний коммит `e6ffda1`). **В `main` не влита, на GitHub не отправлена.**
Дизайн: [specs/2026-10-18-skill-manager-updates-crossplatform-design.md](specs/2026-10-18-skill-manager-updates-crossplatform-design.md).

Остановились на шаге: живой запуск Linux-версии в WSL (`.deb` уже установлен в WSL, приложение ещё не запускали).

## Что уже сделано

### Раньше (в `main`, на GitHub)
- MVP + часть 2 (проекты из VS Code / Claude Code / Codex, «Глобально», «Установлено», корзина) — готово, проверено.
- Electron-приложение + установщик Windows (NSIS), релиз **v0.1.0** с `Skill-Manager-Setup-0.1.0.exe`:
  https://github.com/AndreyLomako/skill-manager/releases/tag/v0.1.0 (репозиторий пока **приватный**).
- README переписан под настольное приложение.

### В ветке `feat/updates-crossplatform`
- **Платформенный слой `src/core/platform.ts`.** Пути к `storage.json` VS Code для трёх ОС. Проверка процессов: `tasklist` на Windows; на macOS `pgrep -f "Visual Studio Code.app/Contents/MacOS/"`, для Codex `pgrep -ix codex`. Пути POSIX. Регистр путей: Linux различает, Windows/macOS нет. Параметр `platform` протянут через весь `src/core`.
- **UI:** `clientPathKey` — на Linux пути сравниваются точно, а не в нижнем регистре.
- **Обновления `electron/updater.cjs`:**
  - режим `auto` (Windows NSIS, Linux AppImage) — `electron-updater` скачивает и предлагает перезапуск;
  - режим `notify` (macOS без подписи, `.deb`) — диалог «Вышла версия X» → страница релиза;
  - в dev выключено.
  - Чистые функции `updateMode` и `isNewer` покрыты тестами.
- **macOS:** меню приложения; сборка dmg и zip для arm64 и x64 без подписи (`identity: null`, фьюз `resetAdHocDarwinSignature`).
- **Linux:** AppImage и `.deb`.
- **Скрипты:** `dist:win`, `dist:mac`, `dist:linux`, `dist`, `release`.
- **CI:**
  - `.github/workflows/ci.yml` — тесты, `tsc` и сборка на Windows, macOS, Linux;
  - `release.yml` — по тегу `v*`: черновик релиза → матрица сборок загружает файлы → публикация.
- README: установка на macOS/Linux, обновления по ОС, выпуск версии, пути данных.

### Проверено
- Windows: `tsc` чистый, **246 тестов** проходят, `npm run build` и `npm run dist:win` работают (появляется `latest.yml`).
- **Настоящий Linux (WSL Ubuntu 24.04, Node 24.22, `process.platform = linux`):** `tsc` чистый, 234 теста прошли, 12 пропущены (они только для Windows). `npm run dist:linux` собрал `Skill Manager-0.1.0.AppImage` (139 МБ), `skill-manager_0.1.0_amd64.deb` (110 МБ) и `latest-linux.yml`.
- `.deb` установлен в WSL через `apt` вместе с зависимостями (`dpkg -s skill-manager` → installed).
- Ревью платформенного слоя пройдено, найденные замечания исправлены (коммиты `bd04804`, `e6ffda1`).

## Что осталось — по порядку

1. **Запустить Linux-версию в WSL** (WSLg покажет окно на рабочем столе Windows):
   ```bash
   wsl -d Ubuntu-24.04 -- "/opt/Skill Manager/skill-manager"
   # проверить: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4327/  → 200
   # данные: ~/.config/Skill Manager/   лог: ~/.config/Skill Manager/logs/server.log
   ```
   AppImage в минимальной WSL без библиотек падал с `libnspr4.so` — после установки `.deb` зависимости уже есть, можно повторить:
   `cd ~/sm/dist && APPIMAGE_EXTRACT_AND_RUN=1 "./Skill Manager-0.1.0.AppImage"`.
   Сборка для WSL лежит в `~/sm` (свежий клон ветки, Linux `node_modules`).
2. **Ревью Electron/updater/CI-части** (коммиты `ff99905`…`e6ffda1`) — ещё не делалось целиком. Обратить внимание: гонки в `release.yml`, логика `updater.cjs`, конфиг electron-builder для mac/linux.
3. **Заменить email в истории** (решение пользователя: анонимный адрес GitHub). Адрес: `98387798+AndreyLomako@users.noreply.github.com`.
   ```bash
   git config user.email "98387798+AndreyLomako@users.noreply.github.com"
   git filter-branch --env-filter '
     if [ "$GIT_AUTHOR_EMAIL" = "<старый-адрес>" ]; then export GIT_AUTHOR_EMAIL="98387798+AndreyLomako@users.noreply.github.com"; fi
     if [ "$GIT_COMMITTER_EMAIL" = "<старый-адрес>" ]; then export GIT_COMMITTER_EMAIL="98387798+AndreyLomako@users.noreply.github.com"; fi
   ' --tag-name-filter cat -- --all
   ```
   Затем проверить `git log --all --format='%ae' | sort -u` — только noreply.
4. **Влить** `feat/updates-crossplatform` в `main` и **force-push** всех веток и тегов (`git push --force --all origin && git push --force --tags origin`) — история переписана.
5. **Сделать репозиторий публичным** (решение пользователя) — через REST API: `PATCH /repos/AndreyLomako/skill-manager` с `{"private": false}`.
6. **CI зелёный** на трёх ОС (проверить вкладку Actions после пуша).
7. **Выпустить v0.2.0**: `npm version minor` → `git push --follow-tags`. Тег должен совпадать с версией в `package.json` (electron-builder ищет черновик по тегу). Проверить, что в релизе есть: Setup.exe, dmg×2, zip×2, AppImage, deb, `latest.yml`, `latest-mac.yml`, `latest-linux.yml`.
8. **Живая проверка автообновления на Windows:** поставить v0.2.0 из релиза → выпустить v0.2.1 → приложение 0.2.0 показывает «Загружена версия 0.2.1» → после перезапуска стоит 0.2.1. (v0.1.0 обновиться не сможет — в нём нет updater'а.)
9. Закрыть эпик `interface-e7r`.

## Открытые вопросы и известные ограничения

- `interface-8o6` — VS Code держит закрытые окна в `storage.json` до выхода → проект «открыт», пока VS Code запущен. Варианты: мини-расширение VS Code или сверка с заголовками окон.
- Имя процесса VS Code на macOS (`pgrep -f "Visual Studio Code.app/Contents/MacOS/"`) проверено только по документации/ревью — нужен настоящий Mac.
- Подпись: Windows — нужен OV-сертификат или Azure Artifact Signing (зависит от страны); macOS — Apple Developer ($99/год), без него автоустановка обновлений на Mac невозможна (сделано уведомление со ссылкой).
- Без аппаратного ускорения графики интерфейс медленный (стеклянные эффекты).

## Полезное для следующей сессии

- **Терминалы VS Code выставляют `ELECTRON_RUN_AS_NODE=1`.** Собранное приложение защищено фьюзом; для `electron .` используйте `npm run electron:dev` (скрипт убирает переменную).
- **WSL:** не запускать тесты Windows-ным `node.exe` через мост WSL — это не Linux. Использовать Node из nvm в WSL (`. ~/.nvm/nvm.sh`), клон в `~/sm`, `npm ci` там. Сложные команды передавать в WSL файлом `.sh`, а не строкой из PowerShell (кавычки ломаются).
- **GitHub:** `gh` установлен, но сохранённый токен (Git Credential Manager, аккаунт AndreyLomako) без `read:org`, поэтому `gh auth login --with-token` его не принимает. Для API — `curl` с токеном из `git credential fill` **в bash** (в PowerShell к вводу добавляется BOM).
- **`next start` порождает дочерний процесс-сервер:** останавливать деревом (`taskkill /PID <pid> /T /F`).
- Порты: 4317 — режим разработки и веб-запуск; 4327+ — установленное приложение.
- Журнал задач SDD: `.superpowers/sdd/progress.md` (локально, в `.gitignore`).

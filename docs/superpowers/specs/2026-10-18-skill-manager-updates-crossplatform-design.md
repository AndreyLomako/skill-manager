# Skill Manager — автообновления, macOS и Linux

> Дата: 2026-10-18 · Эпик: `interface-e7r` · Решения пользователя: репозиторий станет публичным (обновления из его GitHub Releases); macOS без Apple Developer (уведомление + ссылка); Linux — AppImage + .deb.

## 1. Платформенный слой (`src/core`)

Все функции получают `platform: NodeJS.Platform` параметром (по умолчанию `process.platform`), чтобы тесты проверяли все три ОС на любой машине.

| Что | win32 | darwin | linux |
|---|---|---|---|
| `storage.json` VS Code | `%APPDATA%\Code\User\globalStorage\storage.json` | `~/Library/Application Support/Code/User/globalStorage/storage.json` | `$XDG_CONFIG_HOME` (или `~/.config`) `/Code/User/globalStorage/storage.json` |
| VS Code запущен | `tasklist /FI "IMAGENAME eq Code.exe"` | `pgrep -x Code` | `pgrep -x code` |
| Codex запущен | `tasklist /FI "IMAGENAME eq codex.exe"` | `pgrep -x codex` | `pgrep -x codex` |
| `file://` URI → путь | `fileURLToPath(uri, { windows: true })` + текущая нормализация | `fileURLToPath(uri, { windows: false })` | то же |
| Нормализация пути проекта | как сейчас (`\`, буква диска, `\\?\`, UNC) | `path.posix.normalize`, без завершающего `/` (кроме `/`) | то же |
| Ключ сравнения путей | без учёта регистра | без учёта регистра (APFS по умолчанию) | **с учётом регистра** |

- Новый модуль `src/core/platform.ts`: `vscodeStoragePath(env, home, platform)`, `isProcessRunning(names, platform)` (общая реализация для VS Code и Codex), `pathKey(p, platform)`, `pathApi(platform)` (`path.win32` / `path.posix`).
- `vscode-windows.ts` (`fileUriToPath`, `normalizeProjectPath`, `workspaceFolders`), `projects.ts` (`key`, `basename`), `codex-projects.ts`, `claude-projects.ts`, `paths.ts` (`vscodeStorage`) переходят на него. Поведение под Windows не меняется — существующие тесты обязаны проходить без правок ожиданий; Windows-специфичные тесты передают `'win32'` явно, если зависят от платформы.
- `skill-targets.ts` не меняется (запрет имён устройств Windows безвреден на других ОС).

## 2. Electron на трёх ОС

- `electron/main.cjs`:
  - на macOS — минимальное меню приложения (роли `appMenu`, `editMenu`, `windowMenu`), иначе не работают Cmd+Q и Cmd+C/V;
  - на Windows и Linux меню скрыто, как сейчас;
  - закрытие последнего окна завершает приложение на всех ОС (сервер внутри; держать его в доке смысла нет).
- `userData`: `app.getPath('appData')/Skill Manager`. Это `%APPDATA%` на Windows, `~/Library/Application Support` на macOS, `~/.config` на Linux.
- **Иконки:** electron-builder строит `.icns` из `build/icon.png`. Если нужно 1024×1024, `scripts/make-icon.mjs` дополнительно рендерит `build/icon-1024.png`.

## 3. Обновления

Новая runtime-зависимость: `electron-updater` (её единственную electron-builder кладёт в `app.asar`).

`electron/updater.cjs`:
- `updateMode({ platform, isPackaged, isAppImage })`:
  - `'off'`, если не `isPackaged`;
  - `'auto'` для win32 и для linux, когда запущен AppImage (`process.env.APPIMAGE`);
  - иначе `'notify'` (macOS без подписи, `.deb`).
  - Чистая функция, покрыта тестами.
- **Режим `auto`:**
  - `autoUpdater` (provider github, `autoDownload: true`) проверяет через 10 с после старта и затем каждые 6 ч;
  - на `update-downloaded` — диалог «Загружена версия X. Перезапустить и обновить сейчас?» с кнопками [Перезапустить] [Позже];
  - «Позже» ставит обновление при следующем выходе (`autoInstallOnAppQuit`).
- **Режим `notify`:**
  - `fetch('https://api.github.com/repos/AndreyLomako/skill-manager/releases/latest')`;
  - сравнение версий через `isNewer(latest, current)` (чистая функция, тесты: `0.2.0 > 0.1.9`, `1.0.0 > 0.9.9`, равные, префикс `v`, мусор → `false`);
  - если новее — диалог «Вышла версия X» с кнопками [Открыть страницу загрузки] [Позже], ссылка открывается через `shell.openExternal(html_url)`;
  - одна и та же версия показывается не чаще раза за запуск.
- Любые ошибки проверки пишутся в лог `logs/updater.log` и не показываются пользователю.
- **Конфиг electron-builder:**
  - `publish: [{ provider: 'github', owner: 'AndreyLomako', repo: 'skill-manager', releaseType: 'release' }]` вместо `publish: null`;
  - `latest*.yml` должны попадать в релиз.

## 4. Сборка под три ОС

- **electron-builder:**
  - `mac`: `target: ['dmg', 'zip']`, `category: public.app-category.developer-tools`, `identity: null` (без подписи);
  - `linux`: `target: ['AppImage', 'deb']`, `category: Development`, `maintainer`, `synopsis`.
- **Скрипты:**
  - `dist:win`, `dist:mac`, `dist:linux`;
  - `dist` — сборка под текущую ОС;
  - `release` — используется в CI, тот же путь сборки с `--publish always`.
- `scripts/prepare-standalone.mjs` и `scripts/electron-dev.mjs` должны работать на всех ОС: только `path`, без `cmd`.
- **GitHub Actions:**
  - `.github/workflows/ci.yml` — на push и PR: матрица `windows-latest`, `macos-latest`, `ubuntu-latest`, шаги `npm ci`, `npx tsc --noEmit -p .`, `npm test`, `npm run build`;
  - `.github/workflows/release.yml` — на тег `v*`: та же матрица, `npm ci`, `npm test`, `npm run release` с `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` и `permissions: contents: write`; все три задачи публикуют файлы в один релиз этого тега.
- **Как выпустить версию:** `npm version minor` (или `patch`), затем `git push --follow-tags`.

## 5. Документация

README:
- установка на macOS (dmg; первый запуск: «Системные настройки → Конфиденциальность и безопасность → Всё равно открыть»);
- установка на Linux (AppImage: `chmod +x`, запуск; `.deb`: `sudo apt install ./skill-manager_<версия>_amd64.deb`);
- как работают обновления на каждой ОС;
- как выпустить новую версию;
- таблица путей данных для трёх ОС.

## 6. Проверка

- Юнит-тесты платформенного слоя для трёх ОС на Windows; тот же `npm test` проходит в CI на macOS и Linux.
- **Linux вживую** — в WSL (Ubuntu 24.04): `npm ci`, `npm test`, `npm run dist:linux`, запуск AppImage (`--appimage-extract-and-run`) под WSLg; окно открывается, сервер отвечает.
- **macOS** — CI собирает dmg и прогоняет тесты (живого Mac нет; окно на macOS не проверяется).
- **Обновление вживую на Windows:** установить версию N из релиза, выпустить N+1 → приложение N показывает диалог «Загружена версия N+1», после перезапуска стоит N+1.

## Приёмка

- [ ] CI зелёный на трёх ОС.
- [ ] Релиз по тегу содержит Setup.exe, dmg, zip, AppImage, deb и `latest.yml`, `latest-mac.yml`, `latest-linux.yml`.
- [ ] Windows: установленная версия сама обновляется до следующего релиза.
- [ ] Linux (WSL): AppImage запускается, проекты и скиллы читаются из Linux-путей.
- [ ] Режим `notify` (юнит-тесты + ручной вызов в dev с подставленной версией) показывает диалог со ссылкой.

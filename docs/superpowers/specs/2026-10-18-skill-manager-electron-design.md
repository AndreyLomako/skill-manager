# Skill Manager — Electron-приложение и установщик

> Дата: 2026-10-18 · Эпик: `interface-kui` · Решения пользователя: Electron, установщик Setup.exe (NSIS), сразу итоговый вариант.

## Цель

Двойной клик по ярлыку → окно Skill Manager. Не нужны установленные Node и Edge. Закрыли окно → приложение полностью завершилось.

## Архитектура

```
Skill Manager.exe (Electron 44, Node 24.22, Chromium 152)
 ├─ main process: electron/main.cjs
 │    ├─ single-instance lock (повторный запуск фокусирует окно)
 │    ├─ свободный порт: 4317, иначе следующий свободный (до 4417)
 │    ├─ utilityProcess.fork(resources/app-server/server.js)  ← Next standalone
 │    │     env: PORT, HOSTNAME=127.0.0.1, NODE_ENV=production,
 │    │          SKILL_MANAGER_PORT, SKILL_MANAGER_USER_DIR, SKILL_MANAGER_CACHE_DIR,
 │    │          SKILL_MANAGER_CATALOG_DIR
 │    ├─ окно-заставка в цветах фона, затем loadURL(http://127.0.0.1:<port>) когда сервер ответил
 │    └─ window-all-closed → убить сервер → app.quit()
 └─ resources/
      ├─ app-server/   (.next/standalone + .next/static)
      └─ catalog/      (базовый каталог)
```

| Что | Где в установленном приложении |
|---|---|
| Пользовательский слой, настройки, корзина | `%APPDATA%\Skill Manager\user\` (`app.getPath('userData')/user`) |
| Кэш git-источников | `%APPDATA%\Skill Manager\cache\` |
| Лог сервера | `%APPDATA%\Skill Manager\logs\server.log` |
| Базовый каталог | `resources\catalog\` (только чтение, обновляется новой версией) |

## Изменения в приложении

- `next.config.ts`: `output: 'standalone'`, `outputFileTracingRoot` = корень проекта, `outputFileTracingExcludes` для `user/**`, `.cache/**`, `.beads/**`, `.superpowers/**`, `ref/**`, `docs/**`, `instruction_all/**`, `dist/**`, `electron/**`, `build/**`, `tests/**`. Standalone не должен содержать пользовательские данные.
- `src/core/paths.ts`: `cacheDir` = `SKILL_MANAGER_CACHE_DIR ?? <root>/.cache`.
- `src/proxy.ts`: разрешённые Host — `127.0.0.1:<port>` и `localhost:<port>`, где `port = SKILL_MANAGER_PORT ?? 4317`.
- `package.json`:
  - `main: "electron/main.cjs"`;
  - runtime-зависимости Next/React/Three/yaml переносятся в `devDependencies`, потому что сервер берётся из standalone, а electron-builder не должен тащить `node_modules` в asar;
  - новые devDependencies: `electron@44`, `electron-builder@26`;
  - скрипты `electron:dev` и `dist`.
- `scripts/prepare-standalone.mjs`: копирует `.next/static` → `.next/standalone/.next/static`, проверяет отсутствие `user/`, `.cache/`, `.beads/` в standalone (иначе ошибка сборки).
- `electron/paths.cjs`: чистые функции `resolveRuntime({ isPackaged, resourcesPath, appRoot, userData })` → `{ serverJs, serverCwd, catalogDir, userDir, cacheDir, logDir }` и `findFreePort(start, end)`; покрываются тестами Vitest.
- **Иконка:** `build/icon.png` 512×512 в стиле круга (стеклянная капля, синий → фиолетовый → розовый) и `build/icon.ico` для окна и ярлыков.
- **electron-builder** (в `package.json` → `build`):
  - `appId: com.andreylomako.skillmanager`, `productName: Skill Manager`;
  - `files: ["electron/**/*", "package.json"]`;
  - `extraResources`: `.next/standalone` → `app-server`, `catalog` → `catalog`;
  - `win.target: nsis (x64)`;
  - `nsis`: `oneClick: true`, `perMachine: false` (без прав администратора), ярлыки на рабочем столе и в «Пуске», `runAfterFinish: true`;
  - `directories.output: dist`.
- **Безопасность окна:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; внешние ссылки открываются в системном браузере, навигация за пределы `127.0.0.1:<port>` запрещена.
- **Ошибка старта сервера** (нет ответа за 30 с или процесс упал) → диалог с текстом и путём к логу, выход.

## Вне рамок

Подпись кода: без сертификата Windows SmartScreen покажет предупреждение при первом запуске. Также вне рамок автообновление (позже через GitHub Releases) и сборки для macOS и Linux.

## Приёмка

- [ ] `npm run dist` создаёт `dist/Skill Manager Setup <версия>.exe`.
- [ ] Тихая установка `/S` ставит приложение в профиль пользователя; ярлыки созданы.
- [ ] Запуск установленного exe открывает окно «Skill Manager» с интерфейсом (без Node/Edge в PATH).
- [ ] Данные пишутся в `%APPDATA%\Skill Manager\user`; в папке установки нет `user/`.
- [ ] Повторный запуск не создаёт второе окно.
- [ ] Закрытие окна завершает все процессы приложения и освобождает порт.
- [ ] `npm test`, `npx tsc --noEmit -p .`, `npm run build` проходят.

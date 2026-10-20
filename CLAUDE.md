# Skill Manager — инструкции для агентов

Настольное приложение (Windows, macOS, Linux), которое ставит скиллы Claude Code и Codex в проекты и глобально.
Интерфейс и тексты — на русском.

## Сборка и тесты

```bash
npm ci
npx tsc --noEmit        # типы
npm test                # vitest: tests/core, tests/app, tests/electron
npm run dev             # веб-режим на http://127.0.0.1:4317
npm run build:app       # standalone-сборка Next.js для Electron
npm run electron:dev    # приложение из исходников (убирает ELECTRON_RUN_AS_NODE)
npm run dist:win        # установщик в dist/ (dist:mac, dist:linux — для других ОС)
```

Выпуск версии: `npm version patch|minor` → `git push --follow-tags origin main` → workflow `release.yml`
собирает все ОС и публикует релиз; установленные приложения обновляются сами.

## Устройство

- `src/core/` — вся логика без UI: каталог (`catalog.ts`, `manifest.ts`, `user-catalog.ts`), git-источники
  с частичным клоном (`sources.ts`), установка (`installer.ts`), что установлено (`inventory.ts`),
  корзина (`trash.ts`), проекты из VS Code / Claude Code / Codex (`projects.ts`), пути по ОС (`platform.ts`).
- `src/app/actions.ts` — server actions: тонкий слой между UI и `src/core`, проверяет область и агента.
- `src/components/` — UI (CSS-модули); `AppShell` → `SkillsSection`.
- `electron/` — оболочка: запуск standalone-сервера, заставка, автообновление (`updater.cjs`).
- `catalog/catalog.json` — базовый каталог, идёт с приложением.

## Договорённости

- Пути пользователя проверяются на сервере: удаление и восстановление — только внутри разрешённых папок скиллов.
- git вызывается через `execFile` без shell, с `--` перед адресами и путями.
- Текущее состояние работы и полезные заметки (WSL, GitHub API) — в `docs/superpowers/HANDOFF.md`.

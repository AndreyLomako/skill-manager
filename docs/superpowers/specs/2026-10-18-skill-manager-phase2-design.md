# Skill Manager — часть 2: проекты из Claude и Codex, глобальные скиллы, удаление

> Дата: 2026-10-18 · Эпик: `interface-n3i` · Основа: [MVP-дизайн](2026-10-18-skill-manager-mvp-design.md)
> Решения согласованы с пользователем: агент выбирается в корзине; «Глобально» — это особый проект; удаление идёт в корзину приложения.

## 1. Цели

1. Подтягивать проекты не только из VS Code, но и из Claude Code (расширение VS Code, CLI, Desktop) и из Codex (CLI и приложение).
2. Ставить скиллы в Claude, в Codex или в оба сразу.
3. Видеть глобально установленные скиллы (Claude и Codex), ставить их и удалять.
4. Видеть всё установленное в проекте и удалять оттуда.
5. Удалять с возможностью вернуть: корзина приложения, автоочистка через 30 дней.

## 2. Источники проектов

| Источник | Файл | Сигнал |
|---|---|---|
| VS Code | `%APPDATA%\Code\User\globalStorage\storage.json` (как в MVP) | открыт, если окно есть и запущен `Code.exe`; активный — `lastActiveWindow` |
| Claude, сессии | `~/.claude/sessions/<pid>.json` → `{ pid, cwd, startedAt, entrypoint }` | открыт, если процесс `pid` жив (`process.kill(pid, 0)`; `EPERM` тоже считается «жив») |
| Claude, недавние | `~/.claude.json` → ключи объекта `projects` (пути вида `c:/Users/...`) | недавний |
| Codex | `~/.codex/state_<N>.sqlite` (берётся файл с наибольшим N) → таблица `threads`: `cwd` + время (`recency_at_ms`, иначе `updated_at_ms`, иначе `updated_at`), без архивных (`archived`) | недавний; если запущен процесс `codex.exe`, самый свежий считается открытым |

- Все пути нормализуются: обратные слэши, буква диска в верхнем регистре. Дубликаты сравниваются без учёта регистра.
- Ошибка или отсутствие любого источника не ломает остальные: такой источник просто пуст.
- `node:sqlite` встроен в Node 24, база открывается только на чтение.
- **Порядок проектов:** активный → открытые (свежие выше) → недавние Claude/Codex (свежие выше) → недавние из `user/settings.json` → добавленные вручную.
- **Активный проект:** `lastActiveWindow` VS Code (если VS Code запущен), иначе самая свежая живая сессия Claude.
- **Модель `Project`** получает поле `sources: ProjectSource[]` (`'vscode' | 'claude' | 'codex' | 'manual'`).
- **На плитке проекта** подзаголовок вида «VS Code · Claude — C:\путь».
- `rememberOpen` запоминает в «недавних» открытые проекты из всех источников.

## 3. Куда ставим: агент и область

```
Scope   = { kind: 'project', path } | { kind: 'global' }
AgentId = 'claude' | 'codex'
```

| | claude | codex |
|---|---|---|
| project | `<path>/.claude/skills` | `<path>/.agents/skills` |
| global | `~/.claude/skills` | `~/.agents/skills` |

- Установщик работает с корнем папки скиллов (`skillsRoot(scope, agent, home)`), а не с путём проекта.
- **Зарезервированные имена**, которые нельзя ставить и удалять: `synced` (Claude) и любые имена на точку (`.trash`, `.system`).
- **Переключатель в корзине:** `[Claude] [Codex] [Оба]`.
  - По умолчанию — `codex`, если у проекта есть только источник `codex`, иначе `claude`.
  - Для «Глобально» по умолчанию `claude`.
- **Статус плитки при «Оба»** (функция `mergeInstalled`):
  - `up-to-date`, если у обоих агентов `up-to-date`;
  - `outdated`, если скилл есть у обоих и хотя бы у одного `outdated`;
  - если стоит только у одного агента, плитка считается неустановленной: установка поставит недостающее, а для второго агента вернёт `already-installed`.
- Результат установки содержит поле `agent`.

## 4. «🌐 Глобально»

- Особая первая плитка в списке проектов, значение `GLOBAL_PROJECT = '__global__'`.
- Если она выбрана, область установки — `global`, корзина пишет «Глобально (все проекты)».

## 5. Категория «✓ Установлено»

Виртуальная категория `INSTALLED = '__installed__'` в кольце, перед «Мои скиллы». Показывает `listInstalled(scope, agents)`:

| kind | Откуда | Управление |
|---|---|---|
| `managed` | папки с `SKILL.md` в `skillsRoot` (кроме зарезервированных); статус по хешу, если id есть в каталоге | ✓/↻, 🗑 удалить |
| `synced` | только global+claude: `~/.claude/skills/synced/<bucket>/<name>/SKILL.md` | 🔒 «синхронизировано с claude.ai» |
| `system` | только global+codex: `~/.codex/skills/.system/<name>` и `~/.agents/skills/.system/<name>` | 🔒 «системный скилл Codex» |
| `plugin` | только global+claude: `~/.claude/plugins/installed_plugins.json` (`plugins[key][].installPath`), фильтр по `enabledPlugins` из `~/.claude/settings.json` → `<installPath>/skills/<name>/SKILL.md` | 🔒 «плагин <имя> — управляется через /plugin» |

Название и описание берутся из frontmatter `SKILL.md`.

## 6. Удаление и корзина

- `removeSkill(scope, agent, name)`:
  - имя проходит проверку (без разделителей, `..`, не зарезервированное), папка `skillsRoot/name` существует и содержит `SKILL.md`;
  - папка переносится в `user/trash/<id>/skill`, рядом пишется `entry.json`: `{ id, name, agent, scope: 'project' | 'global', originalPath, deletedAt }`;
  - перенос через `rename`, при `EXDEV` — копирование и удаление.
- `restoreFromTrash(id)` возвращает папку на место. Если на месте уже есть папка, восстановление отклоняется с ошибкой.
- `purgeTrash(30 дней)` вызывается при каждом `listInstalledAction`.
- **В UI:** 🗑 на плитке → диалог подтверждения → уведомление «Удалено: X» с кнопкой «Вернуть».

## 7. Server Actions

| Action | Вход | Выход |
|---|---|---|
| `getInstalledAction` | `scope, agents[]` | `Record<AgentId, InstalledState>` |
| `installSkillsAction` | `scope, agents[], ids[], overwrite` | `InstallResult[]` (с `agent`) |
| `listInstalledAction` | `scope, agents[]` | `InstalledSkill[]` |
| `removeSkillAction` | `scope, agent, name` | `{ ok: true, entry }` или `{ ok: false, error }` |
| `restoreSkillAction` | `id` | `{ ok: true }` или `{ ok: false, error }` |

`scope.kind === 'project'` обязательно проверяется через `isKnownProject`. `agents` фильтруется до допустимых значений.

## 8. Прочее

- **Подсказка после установки:** «Скиллы подхватятся автоматически. Если папки skills раньше не было — выполните /reload-skills в Claude или перезапустите Codex.»
- В README добавить раздел про агентов, «Глобально», «Установлено» и корзину.

## 9. Тесты

- Vitest для core на временной «домашней» папке. `AppPaths.home` берётся из `SKILL_MANAGER_HOME`, иначе `os.homedir()`. Добавляется `AppPaths.trashDir = <userDir>/trash`.
- **Что покрывается:**
  - сессии Claude (живой и мёртвый pid, битый файл);
  - недавние из `.claude.json`;
  - Codex sqlite (создаётся в тесте через `DatabaseSync`; архив; запущен / не запущен; нет файла);
  - слияние сигналов;
  - `skillsRoot`;
  - установщик с новым корнем;
  - `listInstalled` по всем kind;
  - корзина (перенос, восстановление, конфликт, очистка, отказ для зарезервированных имён и `..`);
  - `mergeInstalled`.
- **UI:** сборка, CDP-замер наведения (`hover-probe`), скриншот.

## 10. Критерии приёмки

- [ ] Проект, открытый в Claude Code (сессия жива), виден как открытый с бейджем «Claude».
- [ ] Проекты Codex из `state_*.sqlite` видны с бейджем «Codex».
- [ ] «🌐 Глобально» → «✓ Установлено» показывает глобальные скиллы Claude и Codex, включая synced и плагинные с 🔒.
- [ ] Установка с агентом «Оба» создаёт папки и в `.claude/skills`, и в `.agents/skills`.
- [ ] 🗑 переносит скилл в `user/trash/`, «Вернуть» возвращает его на место.
- [ ] Зарезервированные и плагинные скиллы удалить нельзя (ни из UI, ни прямым вызовом action).
- [ ] `npm test`, `npx tsc --noEmit -p .` и `npm run build` проходят; замер наведения показывает неизменную высоту плиток.

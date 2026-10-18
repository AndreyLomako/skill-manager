# Skill Manager, часть 2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Проекты из Claude Code и Codex, установка для агента Claude/Codex/обоих, глобальные скиллы и категория «Установлено» с удалением в корзину приложения.

**Architecture:** Новые чистые модули в `src/core` (`skill-targets`, `claude-projects`, `codex-projects`, `inventory`, `trash`), расширение `projects`, `installer`, `selection`; Server Actions принимают `Scope` и список агентов; UI получает плитку «Глобально», переключатель агента и категорию «Установлено».

**Tech Stack:** как в MVP (Next.js 16, React 19, TypeScript 7, Vitest 5) + встроенный `node:sqlite` (через `process.getBuiltinModule`, чтобы бандлер его не трогал).

**Спецификация:** [docs/superpowers/specs/2026-10-18-skill-manager-phase2-design.md](../specs/2026-10-18-skill-manager-phase2-design.md)

## Global Constraints

- Все ограничения MVP-плана в силе (127.0.0.1:4317, только Server Actions, без новых npm-пакетов, CSS Modules + BEM, текст UI на русском, `src/core` без импортов `next`).
- Новых npm-зависимостей нет; SQLite — только встроенный `node:sqlite`, открывать `{ readOnly: true }` для данных Codex.
- Запись на диск разрешена только в: `<проект>/.claude/skills/`, `<проект>/.agents/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, `user/`, `.cache/`.
- Никогда не изменять: `~/.claude/skills/synced/`, имена на точку (`.trash`, `.system`), папки плагинов, `~/.claude.json`, `~/.codex/*`.
- Перед коммитом: `npx tsc --noEmit -p .` чистый, `npm test` зелёный.
- Коммиты заканчиваются `Co-Authored-By: Claude <модель> <noreply@anthropic.com>`.

## Карта файлов

| Файл | Ответственность |
|---|---|
| `src/core/types.ts` | + `AgentId`, `Scope`, `ProjectSource`, `ProjectSignal`, `InstalledKind`, `InstalledSkill`, `TrashEntry`; `Project.sources`; `InstallResult.agent` |
| `src/core/paths.ts` | + `home`, `trashDir` |
| `src/core/skill-targets.ts` | `AGENTS`, `skillsRoot`, проверка имён, `parseAgents` |
| `src/core/vscode-windows.ts` | + `normalizeProjectPath` |
| `src/core/claude-projects.ts` | сессии и недавние проекты Claude |
| `src/core/codex-projects.ts` | проекты Codex из `state_*.sqlite`, `isCodexRunning` |
| `src/core/projects.ts` | слияние сигналов всех источников |
| `src/core/installer.ts` | работа с корнем папки скиллов |
| `src/core/inventory.ts` | `listInstalled` (managed/synced/system/plugin) |
| `src/core/trash.ts` | корзина: перенос, восстановление, очистка, `removeSkill` |
| `src/core/selection.ts` | + `INSTALLED`, `GLOBAL_PROJECT`, `AgentChoice`, `agentsOf`, `defaultAgentChoice`, `mergeInstalled`, `sourcesLabel`, `AGENT_LABEL` |
| `src/app/actions.ts` | новые сигнатуры actions |
| `src/components/*` | «Глобально», переключатель агента, «Установлено», удаление/возврат |

---

### Task P1: Типы, пути и корни папок скиллов

**Files:**
- Modify: `src/core/types.ts` (дописать в конец), `src/core/paths.ts`, `tests/core/paths.test.ts`
- Create: `src/core/skill-targets.ts`, `tests/core/skill-targets.test.ts`

**Interfaces:**
- Produces:
  - в `types.ts`: `AgentId`, `Scope`, `InstalledKind`, `InstalledSkill`, `TrashEntry`, поле `InstallResult.agent?: AgentId` (код ниже);
  - `AppPaths.home: string`, `AppPaths.trashDir: string`;
  - `AGENTS: readonly AgentId[]`, `skillsRoot(scope: Scope, agent: AgentId, home: string): string`, `isReservedSkillName(name): boolean`, `isValidSkillName(name): boolean`, `parseAgents(input: unknown): AgentId[]`.

- [ ] **Step 1: Дописать в конец `src/core/types.ts`**

```ts
export type AgentId = 'claude' | 'codex';

export type Scope = { kind: 'project'; path: string } | { kind: 'global' };

export type InstalledKind = 'managed' | 'synced' | 'system' | 'plugin';

export interface InstalledSkill {
  name: string;
  title: string;
  description: string;
  agent: AgentId;
  kind: InstalledKind;
  dir: string;
  status?: InstalledStatus;
  plugin?: string;
}

export interface TrashEntry {
  id: string;
  name: string;
  agent: AgentId;
  scope: 'project' | 'global';
  originalPath: string;
  deletedAt: number;
}
```

И в `interface InstallResult` добавить последней строкой поле `agent?: AgentId;`.

- [ ] **Step 2: Обновить тест `tests/core/paths.test.ts` (сначала — RED)**

В первом тесте ожидаемый объект дополнить полями (импортировать `os` из `node:os`):
```ts
      home: os.homedir(),
      trashDir: path.join('C:\\app', 'user', 'trash'),
```
Во втором тесте добавить в env `SKILL_MANAGER_HOME: 'D:\\home'` и проверки:
```ts
    expect(p.home).toBe('D:\\home');
    expect(p.trashDir).toBe(path.join('D:\\my', 'trash'));
```

Run: `npx vitest run tests/core/paths.test.ts` → FAIL (нет полей `home`/`trashDir`).

- [ ] **Step 3: Обновить `src/core/paths.ts`**

```ts
import os from 'node:os';
import path from 'node:path';

export const BASE_MANIFEST = 'catalog.json';
export const USER_MANIFEST = 'user-catalog.json';

export interface AppPaths {
  baseCatalogDir: string;
  userDir: string;
  cacheDir: string;
  vscodeStorage: string;
  home: string;
  trashDir: string;
}

export function resolveAppPaths(
  env: Record<string, string | undefined> = process.env,
  root: string = process.cwd(),
): AppPaths {
  const userDir = env.SKILL_MANAGER_USER_DIR ?? path.join(root, 'user');
  return {
    baseCatalogDir: env.SKILL_MANAGER_CATALOG_DIR ?? path.join(root, 'catalog'),
    userDir,
    cacheDir: path.join(root, '.cache'),
    vscodeStorage:
      env.SKILL_MANAGER_VSCODE_STORAGE ??
      path.join(env.APPDATA ?? '', 'Code', 'User', 'globalStorage', 'storage.json'),
    home: env.SKILL_MANAGER_HOME ?? os.homedir(),
    trashDir: path.join(userDir, 'trash'),
  };
}
```

Run: `npx vitest run tests/core/paths.test.ts` → PASS. Затем `npx tsc --noEmit -p .`: во всех тестах, где объект `AppPaths` собирается вручную (`tests/core/projects.test.ts`, `tests/core/catalog.test.ts` и др.), добавить `home: root, trashDir: path.join(root, 'user', 'trash')` (или эквивалент для их переменных), пока `tsc` не станет чистым.

- [ ] **Step 4: Написать падающий тест `tests/core/skill-targets.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { isReservedSkillName, isValidSkillName, parseAgents, skillsRoot } from '../../src/core/skill-targets';

describe('skillsRoot', () => {
  it.each([
    [{ kind: 'project', path: 'C:\\p' } as const, 'claude' as const, path.join('C:\\p', '.claude', 'skills')],
    [{ kind: 'project', path: 'C:\\p' } as const, 'codex' as const, path.join('C:\\p', '.agents', 'skills')],
    [{ kind: 'global' } as const, 'claude' as const, path.join('C:\\home', '.claude', 'skills')],
    [{ kind: 'global' } as const, 'codex' as const, path.join('C:\\home', '.agents', 'skills')],
  ])('%o + %s', (scope, agent, expected) => {
    expect(skillsRoot(scope, agent, 'C:\\home')).toBe(expected);
  });
});

describe('имена скиллов', () => {
  it('зарезервированные', () => {
    expect(isReservedSkillName('synced')).toBe(true);
    expect(isReservedSkillName('.trash')).toBe(true);
    expect(isReservedSkillName('.system')).toBe(true);
    expect(isReservedSkillName('pdf')).toBe(false);
  });

  it.each(['pdf', 'my-skill', 'a.b_c'])('допустимое «%s»', (n) => expect(isValidSkillName(n)).toBe(true));
  it.each(['', '..', '../x', 'a/b', 'a\\b', 'synced', '.trash', '-x'])('недопустимое «%s»', (n) =>
    expect(isValidSkillName(n)).toBe(false),
  );
});

describe('parseAgents', () => {
  it('оставляет только известных агентов без повторов', () => {
    expect(parseAgents(['codex', 'claude', 'codex', 'evil', 1])).toEqual(['codex', 'claude']);
    expect(parseAgents('claude')).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/skill-targets.test.ts` → FAIL (нет модуля).

- [ ] **Step 5: Создать `src/core/skill-targets.ts`**

```ts
import path from 'node:path';
import type { AgentId, Scope } from './types';

export const AGENTS: readonly AgentId[] = ['claude', 'codex'];

const AGENT_DIR: Record<AgentId, string> = { claude: '.claude', codex: '.agents' };

export function skillsRoot(scope: Scope, agent: AgentId, home: string): string {
  const base = scope.kind === 'global' ? home : scope.path;
  return path.join(base, AGENT_DIR[agent], 'skills');
}

// synced — папка синхронизации claude.ai; имена на точку — служебные (.trash, .system).
export function isReservedSkillName(name: string): boolean {
  return name === 'synced' || name.startsWith('.');
}

export function isValidSkillName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !isReservedSkillName(name);
}

export function parseAgents(input: unknown): AgentId[] {
  if (!Array.isArray(input)) return [];
  return AGENTS.filter((a) => input.includes(a)).sort((a, b) => input.indexOf(a) - input.indexOf(b));
}
```

- [ ] **Step 6: Проверка и коммит**

Run: `npx tsc --noEmit -p .; npm test` → чисто / всё PASS.
```powershell
git add src/core tests/core
git commit -m "feat(core): agent skill roots, home/trash paths, phase 2 types" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P2: Проекты Claude — сессии и недавние

**Files:**
- Modify: `src/core/types.ts` (дописать), `src/core/vscode-windows.ts` (добавить функцию)
- Create: `src/core/claude-projects.ts`, `tests/core/claude-projects.test.ts`

**Interfaces:**
- Consumes: `normalizeWinPath` (vscode-windows).
- Produces:
  - в `types.ts`: `ProjectSource = 'vscode' | 'claude' | 'codex' | 'manual'`, `ProjectSignal { path: string; source: ProjectSource; open: boolean; at: number }`;
  - `normalizeProjectPath(p: string): string` в `vscode-windows.ts`;
  - `pidAlive(pid: number): boolean`, `readClaudeSessions(home: string, alive?: (pid: number) => boolean): Promise<ProjectSignal[]>` (только живые, свежие выше), `readClaudeRecent(home: string): Promise<ProjectSignal[]>`.

- [ ] **Step 1: Дописать в `src/core/types.ts`**

```ts
export type ProjectSource = 'vscode' | 'claude' | 'codex' | 'manual';

export interface ProjectSignal {
  path: string;
  source: ProjectSource;
  open: boolean;
  at: number;
}
```

- [ ] **Step 2: Добавить в `src/core/vscode-windows.ts` после `normalizeWinPath`**

```ts
// Пути из ~/.claude.json и Codex бывают с прямыми слэшами и маленькой буквой диска.
export function normalizeProjectPath(p: string): string {
  return normalizeWinPath(p.replace(/\//g, '\\'));
}
```

- [ ] **Step 3: Написать падающий тест `tests/core/claude-projects.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pidAlive, readClaudeRecent, readClaudeSessions } from '../../src/core/claude-projects';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

describe('readClaudeSessions', () => {
  it('берёт только живые сессии, свежие выше, пропускает мусор', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude/sessions/100.json': JSON.stringify({ pid: 100, cwd: 'c:\\work\\old', startedAt: 1000, entrypoint: 'cli' }),
      '.claude/sessions/200.json': JSON.stringify({ pid: 200, cwd: 'c:\\work\\new', startedAt: 2000, entrypoint: 'claude-vscode' }),
      '.claude/sessions/300.json': JSON.stringify({ pid: 300, cwd: 'c:\\work\\dead', startedAt: 3000 }),
      '.claude/sessions/400.json': '{oops',
      '.claude/sessions/200.abc.key': 'x',
    });
    const alive = (pid: number) => pid !== 300;
    expect(await readClaudeSessions(home, alive)).toEqual([
      { path: 'C:\\work\\new', source: 'claude', open: true, at: 2000 },
      { path: 'C:\\work\\old', source: 'claude', open: true, at: 1000 },
    ]);
  });

  it('нет папки — пусто', async () => {
    expect(await readClaudeSessions(await tmpDir(), () => true)).toEqual([]);
  });
});

describe('readClaudeRecent', () => {
  it('ключи projects из ~/.claude.json с нормализацией путей', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude.json': JSON.stringify({ projects: { 'c:/Users/me/a': {}, 'C:\\Users\\me\\b': {} } }),
    });
    expect(await readClaudeRecent(home)).toEqual([
      { path: 'C:\\Users\\me\\a', source: 'claude', open: false, at: 0 },
      { path: 'C:\\Users\\me\\b', source: 'claude', open: false, at: 0 },
    ]);
  });

  it('нет файла или битый — пусто', async () => {
    const home = await tmpDir();
    expect(await readClaudeRecent(home)).toEqual([]);
    await writeFiles(home, { '.claude.json': '{oops' });
    expect(await readClaudeRecent(home)).toEqual([]);
  });
});

describe('pidAlive', () => {
  it('свой процесс жив, несуществующий — нет', () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(0)).toBe(false);
    expect(pidAlive(-5)).toBe(false);
  });
});
```

Run: `npx vitest run tests/core/claude-projects.test.ts` → FAIL (нет модуля).

- [ ] **Step 4: Создать `src/core/claude-projects.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSignal } from './types';
import { normalizeProjectPath } from './vscode-windows';

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: процесс есть, но сигнал слать нельзя — значит жив.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readClaudeSessions(
  home: string,
  alive: (pid: number) => boolean = pidAlive,
): Promise<ProjectSignal[]> {
  const dir = path.join(home, '.claude', 'sessions');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: ProjectSignal[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      const j = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      if (typeof j?.pid !== 'number' || typeof j?.cwd !== 'string' || !j.cwd) continue;
      if (!alive(j.pid)) continue;
      out.push({
        path: normalizeProjectPath(j.cwd),
        source: 'claude',
        open: true,
        at: typeof j.startedAt === 'number' ? j.startedAt : 0,
      });
    } catch {
      // битый файл сессии пропускаем
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

export async function readClaudeRecent(home: string): Promise<ProjectSignal[]> {
  try {
    const j = JSON.parse(await readFile(path.join(home, '.claude.json'), 'utf8'));
    const projects = j?.projects && typeof j.projects === 'object' ? Object.keys(j.projects) : [];
    return projects
      .filter((p) => p.trim())
      .map((p) => ({ path: normalizeProjectPath(p), source: 'claude' as const, open: false, at: 0 }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Проверка и коммит**

Run: `npx tsc --noEmit -p .; npm test` → чисто / PASS.
```powershell
git add src/core tests/core
git commit -m "feat(core): read Claude Code sessions and recent projects" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P3: Проекты Codex из `state_*.sqlite`

**Files:**
- Create: `src/core/codex-projects.ts`, `tests/core/codex-projects.test.ts`

**Interfaces:**
- Consumes: `ProjectSignal` (types), `normalizeProjectPath` (vscode-windows).
- Produces: `findCodexStateDb(home): Promise<string | null>`, `readCodexProjects(home, running?: () => Promise<boolean>, limit = 20): Promise<ProjectSignal[]>`, `isCodexRunning(): Promise<boolean>`.

`node:sqlite` загружается через `process.getBuiltinModule('node:sqlite')` — бандлер Next не пытается его разрешать.

- [ ] **Step 1: Написать падающий тест `tests/core/codex-projects.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { findCodexStateDb, readCodexProjects } from '../../src/core/codex-projects';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

async function makeDb(home: string, file: string, columns: string, rows: Array<Array<string | number | null>>) {
  await mkdir(path.join(home, '.codex'), { recursive: true });
  const db = new DatabaseSync(path.join(home, '.codex', file));
  db.exec(`create table threads (${columns})`);
  const marks = columns.split(',').map(() => '?').join(',');
  const insert = db.prepare(`insert into threads values (${marks})`);
  for (const r of rows) insert.run(...r);
  db.close();
}

describe('findCodexStateDb', () => {
  it('берёт файл с наибольшим номером', async () => {
    const home = await tmpDir();
    await writeFiles(home, { '.codex/state_4.sqlite': '', '.codex/state_12.sqlite': '', '.codex/logs_2.sqlite': '' });
    expect(await findCodexStateDb(home)).toBe(path.join(home, '.codex', 'state_12.sqlite'));
  });

  it('нет ~/.codex — null', async () => {
    expect(await findCodexStateDb(await tmpDir())).toBeNull();
  });
});

describe('readCodexProjects', () => {
  it('уникальные cwd без архивных, свежие выше; при запущенном Codex первый открыт', async () => {
    const home = await tmpDir();
    await makeDb(home, 'state_5.sqlite', 'cwd text, recency_at_ms integer, archived integer', [
      ['c:\\work\\a', 100, 0],
      ['c:\\work\\b', 300, 0],
      ['c:\\work\\a', 500, 0],
      ['c:\\work\\gone', 900, 1],
      ['', 950, 0],
    ]);
    expect(await readCodexProjects(home, async () => true)).toEqual([
      { path: 'C:\\work\\a', source: 'codex', open: true, at: 500 },
      { path: 'C:\\work\\b', source: 'codex', open: false, at: 300 },
    ]);
    expect((await readCodexProjects(home, async () => false))[0].open).toBe(false);
  });

  it('старая схема с updated_at (секунды) переводится в мс', async () => {
    const home = await tmpDir();
    await makeDb(home, 'state_1.sqlite', 'cwd text, updated_at integer', [['c:\\x', 7]]);
    expect(await readCodexProjects(home, async () => false)).toEqual([
      { path: 'C:\\x', source: 'codex', open: false, at: 7000 },
    ]);
  });

  it('нет таблицы/колонки cwd или нет базы — пусто', async () => {
    const home = await tmpDir();
    expect(await readCodexProjects(home, async () => true)).toEqual([]);
    await makeDb(home, 'state_2.sqlite', 'title text', [['t']]);
    expect(await readCodexProjects(home, async () => true)).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/codex-projects.test.ts` → FAIL (нет модуля).

- [ ] **Step 2: Создать `src/core/codex-projects.ts`**

```ts
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSignal } from './types';
import { normalizeProjectPath } from './vscode-windows';

type Sqlite = typeof import('node:sqlite');

export async function findCodexStateDb(home: string): Promise<string | null> {
  const dir = path.join(home, '.codex');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  let best: { n: number; name: string } | null = null;
  for (const name of names) {
    const m = /^state_(\d+)\.sqlite$/.exec(name);
    if (m && (!best || Number(m[1]) > best.n)) best = { n: Number(m[1]), name };
  }
  return best ? path.join(dir, best.name) : null;
}

function readThreads(file: string, limit: number): Array<{ cwd: string; at: number }> {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as Sqlite;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const cols = new Set(
      (db.prepare('pragma table_info(threads)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    if (!cols.has('cwd')) return [];
    const timeCol = ['recency_at_ms', 'updated_at_ms', 'updated_at'].find((c) => cols.has(c));
    const timeExpr = timeCol ? `max(${timeCol})` : '0';
    const archived = cols.has('archived') ? 'and (archived is null or archived = 0)' : '';
    const rows = db
      .prepare(
        `select cwd, ${timeExpr} as at from threads where cwd is not null and cwd <> '' ${archived} group by cwd order by at desc limit ?`,
      )
      .all(limit) as Array<{ cwd: string; at: number | null }>;
    const scale = timeCol === 'updated_at' ? 1000 : 1;
    return rows.map((r) => ({ cwd: r.cwd, at: Number(r.at ?? 0) * scale }));
  } finally {
    db.close();
  }
}

export async function readCodexProjects(
  home: string,
  running: () => Promise<boolean> = isCodexRunning,
  limit = 20,
): Promise<ProjectSignal[]> {
  const file = await findCodexStateDb(home);
  if (!file) return [];
  let rows: Array<{ cwd: string; at: number }>;
  try {
    rows = readThreads(file, limit);
  } catch {
    return [];
  }
  if (rows.length === 0) return [];
  const isRunning = await running();
  return rows.map((r, i) => ({
    path: normalizeProjectPath(r.cwd),
    source: 'codex' as const,
    open: isRunning && i === 0,
    at: r.at,
  }));
}

export function isCodexRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      resolve(!err && /^"codex\.exe"/im.test(String(stdout))),
    );
  });
}
```

- [ ] **Step 3: Проверка и коммит**

Run: `npx vitest run tests/core/codex-projects.test.ts` → PASS. Если тесты печатают `ExperimentalWarning` про SQLite — это шум окружения Node; зафиксировать в отчёте, не подавлять глобально. Затем `npx tsc --noEmit -p .; npm test`.
```powershell
git add src/core/codex-projects.ts tests/core/codex-projects.test.ts
git commit -m "feat(core): read Codex projects from state sqlite" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P4: Слияние проектов из всех источников

**Files:**
- Modify: `src/core/types.ts` (`Project.sources`), `src/core/projects.ts`, `tests/core/projects.test.ts`

**Interfaces:**
- Consumes: `readOpenWindows`, `isVsCodeRunning` (vscode-windows); `readClaudeSessions`, `readClaudeRecent`, `pidAlive` (P2); `readCodexProjects`, `isCodexRunning` (P3); `ProjectSignal`, `ProjectSource` (types).
- Produces:
  - `Project.sources: ProjectSource[]`;
  - `interface ProjectDeps { vscodeRunning?: () => Promise<boolean>; pidAlive?: (pid: number) => boolean; codexRunning?: () => Promise<boolean> }`;
  - `mergeSignals(signals: ProjectSignal[], activePath: string | null, s: Settings): Project[]`;
  - `listProjects(paths: AppPaths, deps?: ProjectDeps): Promise<ProjectsResult>`;
  - `isKnownProject(paths, projectPath, deps?: ProjectDeps): Promise<boolean>`;
  - `rememberOpen`, `loadSettings`, `saveSettings`, `addManualProject` — без изменений. Старая `mergeProjects` удаляется.

**Правила `mergeSignals`:**
1. Порядок: активный → открытые сигналы (сначала `vscode` в исходном порядке, затем остальные по `at` убыв.) → неоткрытые сигналы по `at` убыв. (стабильно) → `s.recent` → `s.manual`.
2. Для каждого уникального пути (без учёта регистра): `sources` — объединение источников всех его сигналов в порядке `vscode, claude, codex`, плюс `'manual'`, если путь есть в `s.manual`; `open` — есть ли открытый сигнал; `active` — совпадение с `activePath`.

- [ ] **Step 1: В `src/core/types.ts` добавить в `interface Project` поле `sources: ProjectSource[];`**

- [ ] **Step 2: Переписать тесты `tests/core/projects.test.ts` (RED)**

Заменить блок `describe('mergeProjects', …)` на:
```ts
describe('mergeSignals', () => {
  it('активный, открытые (vscode первыми), недавние по свежести, settings; источники объединяются', () => {
    const res = mergeSignals(
      [
        { path: 'C:\\b', source: 'vscode', open: true, at: 0 },
        { path: 'C:\\a', source: 'vscode', open: true, at: 0 },
        { path: 'c:\\B', source: 'claude', open: true, at: 50 },
        { path: 'C:\\c', source: 'claude', open: true, at: 90 },
        { path: 'C:\\old', source: 'codex', open: false, at: 10 },
        { path: 'C:\\newer', source: 'codex', open: false, at: 20 },
      ],
      'C:\\a',
      { recent: ['C:\\rec', 'C:\\old'], manual: ['C:\\man', 'C:\\a'] },
    );
    expect(res.map((p) => p.path)).toEqual(['C:\\a', 'C:\\b', 'C:\\c', 'C:\\newer', 'C:\\old', 'C:\\rec', 'C:\\man']);
    expect(res[0]).toEqual({ path: 'C:\\a', name: 'a', open: true, active: true, sources: ['vscode', 'manual'] });
    expect(res[1]).toEqual({ path: 'C:\\b', name: 'b', open: true, active: false, sources: ['vscode', 'claude'] });
    expect(res.find((p) => p.path === 'C:\\rec')).toEqual({ path: 'C:\\rec', name: 'rec', open: false, active: false, sources: [] });
  });
});
```
В `setup()` добавить в `paths` поля `home: path.join(root, 'home')`, `trashDir: path.join(root, 'user', 'trash')` и файлы:
```ts
    'home/.claude/sessions/4242.json': JSON.stringify({ pid: 4242, cwd: 'c:\\work\\claude-proj', startedAt: 5 }),
    'home/.claude.json': JSON.stringify({ projects: { 'c:/work/claude-recent': {} } }),
```
Зависимости в тестах передавать объектом: `const deps = { vscodeRunning: async () => true, pidAlive: (pid: number) => pid === 4242, codexRunning: async () => false };` и `const stoppedDeps = { ...deps, vscodeRunning: async () => false, pidAlive: () => false };`. Обновить вызовы: `listProjects(paths, deps)`, `isKnownProject(paths, proj, deps)`.
Ожидания `listProjects` (первый тест):
```ts
    expect(res.projects).toEqual([
      { path: 'C:\\work\\a', name: 'a', open: true, active: true, sources: ['vscode'] },
      { path: 'C:\\work\\claude-proj', name: 'claude-proj', open: true, active: false, sources: ['claude'] },
      { path: 'C:\\work\\claude-recent', name: 'claude-recent', open: false, active: false, sources: ['claude'] },
    ]);
    expect((await loadSettings(paths.userDir)).recent).toEqual(['C:\\work\\a', 'C:\\work\\claude-proj']);
```
Второй тест («VS Code не запущен») — `listProjects(paths, stoppedDeps)`, ожидание: `C:\work\a` и `C:\work\claude-proj` с `open: false, active: false, sources: []` (они пришли из `settings.recent`), `C:\work\claude-recent` с `sources: ['claude']`; проверять через `toContainEqual`.
Добавить тест «если VS Code не запущен, активной становится свежая сессия Claude»: `listProjects(paths, { ...deps, vscodeRunning: async () => false })` → проект `C:\work\claude-proj` имеет `active: true`.

Run: `npx vitest run tests/core/projects.test.ts` → FAIL.

- [ ] **Step 3: Переписать `src/core/projects.ts`**

Оставить без изменений `Settings`, `ProjectsResult`, `MAX_RECENT`, `SETTINGS_FILE`, `key`, `uniq`, `loadSettings`, `saveSettings`, `rememberOpen`, `addManualProject`. Удалить `mergeProjects`. Импорты дополнить:
```ts
import { pidAlive as defaultPidAlive, readClaudeRecent, readClaudeSessions } from './claude-projects';
import { isCodexRunning, readCodexProjects } from './codex-projects';
import type { Project, ProjectSignal, ProjectSource } from './types';
```
Добавить:
```ts
export interface ProjectDeps {
  vscodeRunning?: () => Promise<boolean>;
  pidAlive?: (pid: number) => boolean;
  codexRunning?: () => Promise<boolean>;
}

const SOURCE_ORDER: ProjectSource[] = ['vscode', 'claude', 'codex', 'manual'];

export function mergeSignals(signals: ProjectSignal[], activePath: string | null, s: Settings): Project[] {
  const activeKey = activePath ? key(activePath) : null;
  const vscodeOpen = signals.filter((x) => x.open && x.source === 'vscode');
  const otherOpen = signals.filter((x) => x.open && x.source !== 'vscode').sort((a, b) => b.at - a.at);
  const closed = signals.filter((x) => !x.open).sort((a, b) => b.at - a.at);
  const order = uniq([
    ...(activePath ? [activePath] : []),
    ...[...vscodeOpen, ...otherOpen, ...closed].map((x) => x.path),
    ...s.recent,
    ...s.manual,
  ]);
  const manualKeys = new Set(s.manual.map(key));
  return order.map((p) => {
    const mine = signals.filter((x) => key(x.path) === key(p));
    const found = new Set<ProjectSource>(mine.map((x) => x.source));
    if (manualKeys.has(key(p))) found.add('manual');
    return {
      path: mine[0]?.path ?? p,
      name: path.win32.basename(p) || p,
      open: mine.some((x) => x.open),
      active: key(p) === activeKey,
      sources: SOURCE_ORDER.filter((src) => found.has(src)),
    };
  });
}

export async function listProjects(paths: AppPaths, deps: ProjectDeps = {}): Promise<ProjectsResult> {
  const raw = await readOpenWindows(paths.vscodeStorage);
  const vscodeUp = await (deps.vscodeRunning ?? isVsCodeRunning)();
  const win: VsCodeWindows = vscodeUp ? raw : { open: [], active: null, error: raw.error };
  const [sessions, claudeRecent, codex] = await Promise.all([
    readClaudeSessions(paths.home, deps.pidAlive ?? defaultPidAlive),
    readClaudeRecent(paths.home),
    readCodexProjects(paths.home, deps.codexRunning ?? isCodexRunning),
  ]);
  const signals: ProjectSignal[] = [
    ...win.open.map((p) => ({ path: p, source: 'vscode' as const, open: true, at: 0 })),
    ...sessions,
    ...claudeRecent,
    ...codex,
  ];
  const activePath = win.active ?? sessions[0]?.path ?? null;
  const settings = await loadSettings(paths.userDir);
  const next = rememberOpen(settings, signals.filter((x) => x.open).map((x) => x.path));
  if (next.recent.join('|') !== settings.recent.join('|')) await saveSettings(paths.userDir, next);
  return { projects: mergeSignals(signals, activePath, next), error: win.error };
}

export async function isKnownProject(paths: AppPaths, projectPath: string, deps?: ProjectDeps): Promise<boolean> {
  const { projects } = await listProjects(paths, deps);
  const target = key(path.resolve(projectPath));
  return projects.some((p) => key(p.path) === target);
}
```
Примечание: при «VS Code не запущен» пути из `settings.recent` попадают без сигналов, поэтому `sources: []`. Если ожидания теста из Step 2 расходятся с этим правилом — править тест под правило, а не наоборот.

- [ ] **Step 4: Починить компиляцию UI**

`npx tsc --noEmit -p .` покажет места, где создаются `Project` без `sources` (если есть, например в тестах компонентов — их нет) — добавить `sources`. Компоненты только читают `Project`, менять их не нужно.

- [ ] **Step 5: Проверка и коммит**

Run: `npx tsc --noEmit -p .; npm test` → чисто / PASS.
```powershell
git add src/core tests/core
git commit -m "feat(core): merge projects from VS Code, Claude and Codex" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P5: Установщик работает с корнем папки скиллов

**Files:**
- Modify: `src/core/installer.ts`, `tests/core/installer.test.ts`, `src/app/actions.ts` (минимально, чтобы сохранить поведение)

**Interfaces:**
- Consumes: `isValidSkillName`, `isReservedSkillName`, `skillsRoot` (P1).
- Produces (первый параметр теперь `root` — папка скиллов агента, например `<проект>/.claude/skills`):
  - `skillTargetDir(root: string, skillId: string): string` — бросает, если `!isValidSkillName(skillId)`;
  - `installSkills(root, catalog, ids, opts?)` — поведение как раньше;
  - `getInstalled(root, catalog)` — пропускает зарезервированные имена;
  - экспорт `skillsDir` удаляется.

- [ ] **Step 1: Обновить тесты (RED)**

В `tests/core/installer.test.ts`:
- в `setup()` вернуть ещё `root: path.join(root, 'project', '.claude', 'skills')` и во всех вызовах `installSkills`/`getInstalled` передавать `root` вместо `project` (пути проверок файлов остаются через `project/.claude/skills/...`);
- `skillTargetDir`: первый тест → `expect(skillTargetDir('C:\\p\\.claude\\skills', 'a')).toBe(path.join('C:\\p', '.claude', 'skills', 'a'))`; список недопустимых id дополнить `'synced'` и `'.trash'`;
- в тест `getInstalled` «up-to-date, outdated и unknown» добавить файлы `'.claude/skills/synced/x/SKILL.md': 'x'` и `'.claude/skills/.trash/y/SKILL.md': 'x'` — ожидание прежнее (`{ a, b, foreign }`), то есть зарезервированные не попадают.

Run: `npx vitest run tests/core/installer.test.ts` → FAIL.

- [ ] **Step 2: Обновить `src/core/installer.ts`**

- удалить `skillsDir`;
- `skillTargetDir`:
```ts
export function skillTargetDir(root: string, skillId: string): string {
  if (!isValidSkillName(skillId)) throw new Error(`Недопустимый id скилла: ${skillId}`);
  return path.join(path.resolve(root), skillId);
}
```
- `installSkills(root, …)`: вместо `skillTargetDir(projectPath, id)` — `skillTargetDir(root, id)`; остальное без изменений;
- `getInstalled(root, …)`: `const names = …` читать из `root`; в цикле первым делом `if (isReservedSkillName(name)) continue;`.
- импорт: `import { isReservedSkillName, isValidSkillName } from './skill-targets';`.

- [ ] **Step 3: Сохранить поведение actions**

В `src/app/actions.ts` в `getInstalledAction` и `installSkillsAction` передавать `skillsRoot({ kind: 'project', path: projectPath }, 'claude', paths.home)` вместо `projectPath` (импорт `skillsRoot` из `@/core/skill-targets`). Сигнатуры actions пока не меняются (это Task P9).

- [ ] **Step 4: Проверка и коммит**

Run: `npx tsc --noEmit -p .; npm test` → чисто / PASS.
```powershell
git add src/core/installer.ts tests/core/installer.test.ts src/app/actions.ts
git commit -m "refactor(core): installer targets an agent skills root" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P6: Инвентарь установленных скиллов

**Files:**
- Create: `src/core/inventory.ts`, `tests/core/inventory.test.ts`

**Interfaces:**
- Consumes: `skillsRoot`, `isReservedSkillName` (P1); `getInstalled(root, catalog)` (P5); `readFrontmatter` (MVP); `InstalledSkill`, `Scope`, `AgentId`, `CatalogSkill` (types).
- Produces: `listInstalled(scope: Scope, agents: AgentId[], home: string, catalog: CatalogSkill[]): Promise<InstalledSkill[]>`.

**Правила:**
- `managed`: для каждого агента — папки в `skillsRoot(scope, agent, home)` с `SKILL.md`, кроме зарезервированных; `status` = значение из `getInstalled(root, catalog)` для этого имени.
- Только при `scope.kind === 'global'`:
  - claude → `synced`: `~/.claude/skills/synced/<bucket>/<name>/SKILL.md` (bucket — любая папка);
  - claude → `plugin`: `~/.claude/plugins/installed_plugins.json` → `plugins: Record<"имя@маркетплейс", Array<{ installPath: string }>>`; учитываются только ключи, у которых в `~/.claude/settings.json` → `enabledPlugins[key] === true`; для каждой записи — `<installPath>/skills/<name>/SKILL.md`; `plugin` = часть ключа до `@`; одинаковые `dir` не дублировать;
  - codex → `system`: `~/.codex/skills/.system/<name>/SKILL.md` и `~/.agents/skills/.system/<name>/SKILL.md`.
- `title` = `name` из frontmatter, иначе имя папки; `description` = `description` из frontmatter или `''`.
- Сортировка: по `kind` в порядке `managed, synced, plugin, system`, внутри — по `title` (`localeCompare(…, 'ru')`).
- Любая ошибка чтения отдельного файла/папки — пропуск, не исключение.

- [ ] **Step 1: Написать падающий тест `tests/core/inventory.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { listInstalled } from '../../src/core/inventory';
import type { CatalogSkill } from '../../src/core/types';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const md = (name: string, description = '') => `---\nname: ${name}\ndescription: ${description}\n---\n`;

async function makeHome() {
  const root = await tmpDir();
  const home = path.join(root, 'home');
  const plugin = path.join(root, 'plugins', 'sp', '1.0.0');
  const disabled = path.join(root, 'plugins', 'off', '1.0.0');
  await writeFiles(root, {
    'home/.claude/skills/pdf/SKILL.md': md('PDF', 'работа с PDF'),
    'home/.claude/skills/no-skill-md/readme.txt': 'x',
    'home/.claude/skills/.trash/old/SKILL.md': md('old'),
    'home/.claude/skills/synced/bucket-1/morning/SKILL.md': md('Morning'),
    'home/.claude/plugins/installed_plugins.json': JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@sp-market': [{ installPath: plugin }],
        'off@x': [{ installPath: disabled }],
      },
    }),
    'home/.claude/settings.json': JSON.stringify({ enabledPlugins: { 'superpowers@sp-market': true, 'off@x': false } }),
    'plugins/sp/1.0.0/skills/brainstorming/SKILL.md': md('brainstorming'),
    'plugins/off/1.0.0/skills/hidden/SKILL.md': md('hidden'),
    'home/.agents/skills/codex-own/SKILL.md': md('Codex own'),
    'home/.codex/skills/.system/imagegen/SKILL.md': md('imagegen'),
    'lib/pdf/SKILL.md': md('PDF', 'работа с PDF'),
    'proj/.claude/skills/local-one/SKILL.md': md('Local'),
    'proj/.agents/skills/codex-local/SKILL.md': md('Codex local'),
  });
  const catalog: CatalogSkill[] = [
    { id: 'pdf', title: 'PDF', description: '', category: 'docs', layer: 'base', dir: path.join(root, 'lib', 'pdf') },
  ];
  return { root, home, catalog };
}

describe('listInstalled', () => {
  it('глобально для Claude: managed со статусом, synced и включённые плагины', async () => {
    const { home, catalog } = await makeHome();
    const res = await listInstalled({ kind: 'global' }, ['claude'], home, catalog);
    expect(res.map((s) => [s.kind, s.name, s.status ?? null, s.plugin ?? null])).toEqual([
      ['managed', 'pdf', 'up-to-date', null],
      ['synced', 'morning', null, null],
      ['plugin', 'brainstorming', null, 'superpowers'],
    ]);
    expect(res[0]).toMatchObject({ title: 'PDF', description: 'работа с PDF', agent: 'claude' });
  });

  it('глобально для Codex: свои и системные', async () => {
    const { home, catalog } = await makeHome();
    const res = await listInstalled({ kind: 'global' }, ['codex'], home, catalog);
    expect(res.map((s) => [s.kind, s.name, s.agent])).toEqual([
      ['managed', 'codex-own', 'codex'],
      ['system', 'imagegen', 'codex'],
    ]);
  });

  it('в проекте — только managed для выбранных агентов, без synced/plugin/system', async () => {
    const { root, home, catalog } = await makeHome();
    const res = await listInstalled({ kind: 'project', path: path.join(root, 'proj') }, ['claude', 'codex'], home, catalog);
    expect(res.map((s) => [s.kind, s.name, s.agent, s.status])).toEqual([
      ['managed', 'codex-local', 'codex', 'unknown'],
      ['managed', 'local-one', 'claude', 'unknown'],
    ]);
  });

  it('пустой дом — пусто', async () => {
    expect(await listInstalled({ kind: 'global' }, ['claude', 'codex'], await tmpDir(), [])).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/inventory.test.ts` → FAIL.

- [ ] **Step 2: Создать `src/core/inventory.ts`**

```ts
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readFrontmatter } from './frontmatter';
import { getInstalled } from './installer';
import { isReservedSkillName, skillsRoot } from './skill-targets';
import type { AgentId, CatalogSkill, InstalledKind, InstalledSkill, Scope } from './types';

const KIND_ORDER: InstalledKind[] = ['managed', 'synced', 'plugin', 'system'];
const exists = (p: string) => access(p).then(() => true, () => false);

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function describeSkill(dir: string, name: string): Promise<{ title: string; description: string } | null> {
  try {
    const fm = readFrontmatter(await readFile(path.join(dir, 'SKILL.md'), 'utf8'));
    return { title: fm.name || name, description: fm.description ?? '' };
  } catch {
    return null;
  }
}

async function collect(
  parent: string,
  agent: AgentId,
  kind: InstalledKind,
  extra: Partial<InstalledSkill> = {},
  skip: (name: string) => boolean = () => false,
): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  for (const name of await subdirs(parent)) {
    if (skip(name)) continue;
    const dir = path.join(parent, name);
    const info = await describeSkill(dir, name);
    if (info) out.push({ name, agent, kind, dir, ...info, ...extra });
  }
  return out;
}

async function readJson(file: string): Promise<any> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function pluginSkills(home: string): Promise<InstalledSkill[]> {
  const installed = await readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
  const settings = await readJson(path.join(home, '.claude', 'settings.json'));
  const enabled: Record<string, unknown> = settings?.enabledPlugins ?? {};
  const plugins: Record<string, Array<{ installPath?: unknown }>> = installed?.plugins ?? {};
  const out: InstalledSkill[] = [];
  const seen = new Set<string>();
  for (const [key, records] of Object.entries(plugins)) {
    if (enabled[key] !== true || !Array.isArray(records)) continue;
    const plugin = key.split('@')[0];
    for (const r of records) {
      if (typeof r?.installPath !== 'string') continue;
      for (const s of await collect(path.join(r.installPath, 'skills'), 'claude', 'plugin', { plugin })) {
        if (seen.has(s.dir.toLowerCase())) continue;
        seen.add(s.dir.toLowerCase());
        out.push(s);
      }
    }
  }
  return out;
}

export async function listInstalled(
  scope: Scope,
  agents: AgentId[],
  home: string,
  catalog: CatalogSkill[],
): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  for (const agent of agents) {
    const root = skillsRoot(scope, agent, home);
    const state = await getInstalled(root, catalog);
    for (const s of await collect(root, agent, 'managed', {}, isReservedSkillName)) {
      out.push({ ...s, status: state[s.name] });
    }
    if (scope.kind !== 'global') continue;
    if (agent === 'claude') {
      for (const bucket of await subdirs(path.join(root, 'synced'))) {
        out.push(...(await collect(path.join(root, 'synced', bucket), 'claude', 'synced')));
      }
      out.push(...(await pluginSkills(home)));
    } else {
      for (const sys of [path.join(home, '.codex', 'skills', '.system'), path.join(root, '.system')]) {
        if (await exists(sys)) out.push(...(await collect(sys, 'codex', 'system')));
      }
    }
  }
  return out.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, 'ru'),
  );
}
```
Примечание: у `managed` без совпадения в каталоге `getInstalled` возвращает `'unknown'` — это ожидаемо (тест проекта). Если `tsc`/eslint ругается на `any` в `readJson` — заменить на `unknown` с сужением, поведение то же.

- [ ] **Step 3: Проверка и коммит**

Run: `npx vitest run tests/core/inventory.test.ts` → PASS; затем `npx tsc --noEmit -p .; npm test`.
```powershell
git add src/core/inventory.ts tests/core/inventory.test.ts
git commit -m "feat(core): inventory of installed skills incl. synced, plugin and system" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P7: Корзина приложения и удаление скилла

**Files:**
- Create: `src/core/trash.ts`, `tests/core/trash.test.ts`

**Interfaces:**
- Consumes: `writeJsonAtomic`, `renameWithRetry` (json-file, финальный пакет MVP — проверить точные экспорты в файле); `skillsRoot`, `isValidSkillName` (P1); `AgentId`, `Scope`, `TrashEntry` (types).
- Produces:
  - `moveToTrash(trashDir, dir, meta: { name: string; agent: AgentId; scope: 'project' | 'global' }, now?: number): Promise<TrashEntry>`;
  - `restoreFromTrash(trashDir, id): Promise<TrashEntry>`;
  - `listTrash(trashDir): Promise<TrashEntry[]>` (свежие выше);
  - `purgeTrash(trashDir, maxAgeMs = 30 дней, now = Date.now()): Promise<number>` — сколько удалено;
  - `removeSkill(scope: Scope, agent: AgentId, name: string, home: string, trashDir: string): Promise<TrashEntry>`.

**Правила:**
- `id` = `${now}-${6 случайных символов [a-z0-9]}`; на диске: `<trashDir>/<id>/skill/` (содержимое скилла) и `<trashDir>/<id>/entry.json`.
- Перенос: `rename`; при `EXDEV` — `cp(recursive)` + `rm(recursive)`.
- `restoreFromTrash`: `id` должен соответствовать `/^\d+-[a-z0-9]+$/`, иначе ошибка «Неверный id корзины»; `basename(dirname(originalPath))` должен быть `skills`, иначе ошибка; если `originalPath` существует — ошибка «На месте уже есть скилл с таким именем»; после успешного возврата папка `<trashDir>/<id>` удаляется.
- `removeSkill`: `isValidSkillName(name)`, иначе «Этот скилл нельзя удалить»; папка `skillsRoot(...)/name` должна содержать `SKILL.md`, иначе «Скилл не найден»; затем `moveToTrash`.
- `purgeTrash`: удаляет записи с `deletedAt < now - maxAgeMs` и папки без читаемого `entry.json`.

- [ ] **Step 1: Написать падающий тест `tests/core/trash.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { listTrash, purgeTrash, removeSkill, restoreFromTrash } from '../../src/core/trash';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const exists = (p: string) => access(p).then(() => true, () => false);

async function setup() {
  const root = await tmpDir();
  const home = path.join(root, 'home');
  const trash = path.join(root, 'user', 'trash');
  await writeFiles(root, {
    'home/.claude/skills/pdf/SKILL.md': '---\nname: PDF\n---\n',
    'home/.claude/skills/pdf/ref/a.md': 'a',
    'home/.claude/skills/synced/b/morning/SKILL.md': 'x',
    'proj/.agents/skills/local/SKILL.md': 'x',
  });
  return { root, home, trash };
}

describe('removeSkill / restoreFromTrash', () => {
  it('глобальный скилл уходит в корзину и возвращается целиком', async () => {
    const { home, trash } = await setup();
    const original = path.join(home, '.claude', 'skills', 'pdf');
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    expect(entry).toMatchObject({ name: 'pdf', agent: 'claude', scope: 'global', originalPath: original });
    expect(await exists(original)).toBe(false);
    expect(await exists(path.join(trash, entry.id, 'skill', 'ref', 'a.md'))).toBe(true);
    expect((await listTrash(trash)).map((e) => e.id)).toEqual([entry.id]);

    await restoreFromTrash(trash, entry.id);
    expect(await readFile(path.join(original, 'ref', 'a.md'), 'utf8')).toBe('a');
    expect(await exists(path.join(trash, entry.id))).toBe(false);
  });

  it('проектный скилл Codex', async () => {
    const { root, home, trash } = await setup();
    const entry = await removeSkill({ kind: 'project', path: path.join(root, 'proj') }, 'codex', 'local', home, trash);
    expect(entry.scope).toBe('project');
    expect(await exists(path.join(root, 'proj', '.agents', 'skills', 'local'))).toBe(false);
  });

  it('восстановление отклоняется, если на месте уже есть папка', async () => {
    const { home, trash } = await setup();
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    await writeFiles(home, { '.claude/skills/pdf/SKILL.md': 'new' });
    await expect(restoreFromTrash(trash, entry.id)).rejects.toThrow(/уже есть/);
  });

  it.each(['synced', '../x', 'a/b', '.trash'])('нельзя удалить «%s»', async (name) => {
    const { home, trash } = await setup();
    await expect(removeSkill({ kind: 'global' }, 'claude', name, home, trash)).rejects.toThrow(/нельзя/);
  });

  it('несуществующий скилл и неверный id корзины', async () => {
    const { home, trash } = await setup();
    await expect(removeSkill({ kind: 'global' }, 'claude', 'nope', home, trash)).rejects.toThrow(/не найден/);
    await expect(restoreFromTrash(trash, '../../evil')).rejects.toThrow(/id/);
  });
});

describe('purgeTrash', () => {
  it('удаляет записи старше срока', async () => {
    const { home, trash } = await setup();
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    expect(await purgeTrash(trash, 1000, entry.deletedAt + 500)).toBe(0);
    expect(await purgeTrash(trash, 1000, entry.deletedAt + 5000)).toBe(1);
    expect(await listTrash(trash)).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/trash.test.ts` → FAIL.

- [ ] **Step 2: Создать `src/core/trash.ts`**

```ts
import { access, cp, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { writeJsonAtomic } from './json-file';
import { isValidSkillName, skillsRoot } from './skill-targets';
import type { AgentId, Scope, TrashEntry } from './types';

const ENTRY = 'entry.json';
const SKILL = 'skill';
const ID = /^\d+-[a-z0-9]+$/;
const DAY = 24 * 60 * 60 * 1000;
const exists = (p: string) => access(p).then(() => true, () => false);

async function move(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}

export async function moveToTrash(
  trashDir: string,
  dir: string,
  meta: { name: string; agent: AgentId; scope: 'project' | 'global' },
  now = Date.now(),
): Promise<TrashEntry> {
  const id = `${now}-${randomBytes(4).toString('hex').slice(0, 6)}`;
  const entry: TrashEntry = { id, ...meta, originalPath: path.resolve(dir), deletedAt: now };
  await move(dir, path.join(trashDir, id, SKILL));
  await writeJsonAtomic(path.join(trashDir, id, ENTRY), entry);
  return entry;
}

async function readEntry(trashDir: string, id: string): Promise<TrashEntry | null> {
  try {
    return JSON.parse(await readFile(path.join(trashDir, id, ENTRY), 'utf8')) as TrashEntry;
  } catch {
    return null;
  }
}

export async function listTrash(trashDir: string): Promise<TrashEntry[]> {
  let ids: string[];
  try {
    ids = (await readdir(trashDir)).filter((n) => ID.test(n));
  } catch {
    return [];
  }
  const out: TrashEntry[] = [];
  for (const id of ids) {
    const e = await readEntry(trashDir, id);
    if (e) out.push(e);
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function restoreFromTrash(trashDir: string, id: string): Promise<TrashEntry> {
  if (!ID.test(id)) throw new Error('Неверный id корзины');
  const entry = await readEntry(trashDir, id);
  if (!entry) throw new Error('Запись в корзине не найдена');
  if (path.basename(path.dirname(entry.originalPath)) !== 'skills') throw new Error('Некорректный путь восстановления');
  if (await exists(entry.originalPath)) throw new Error('На месте уже есть скилл с таким именем');
  await move(path.join(trashDir, id, SKILL), entry.originalPath);
  await rm(path.join(trashDir, id), { recursive: true, force: true });
  return entry;
}

export async function purgeTrash(trashDir: string, maxAgeMs = 30 * DAY, now = Date.now()): Promise<number> {
  let names: string[];
  try {
    names = await readdir(trashDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const entry = ID.test(name) ? await readEntry(trashDir, name) : null;
    if (entry && entry.deletedAt >= now - maxAgeMs) continue;
    await rm(path.join(trashDir, name), { recursive: true, force: true });
    removed++;
  }
  return removed;
}

export async function removeSkill(
  scope: Scope,
  agent: AgentId,
  name: string,
  home: string,
  trashDir: string,
): Promise<TrashEntry> {
  if (!isValidSkillName(name)) throw new Error('Этот скилл нельзя удалить');
  const dir = path.join(skillsRoot(scope, agent, home), name);
  if (!(await exists(path.join(dir, 'SKILL.md')))) throw new Error('Скилл не найден');
  return moveToTrash(trashDir, dir, { name, agent, scope: scope.kind });
}
```
Примечание: `purgeTrash` удаляет и посторонние папки без `entry.json`; файлы с временными именами от `writeJsonAtomic` (`*.tmp-*`) тоже, так как не соответствуют `ID`. Если в `json-file.ts` нет `writeJsonAtomic` с сигнатурой `(file, data)` — свериться и адаптировать вызов.

- [ ] **Step 3: Проверка и коммит**

Run: `npx vitest run tests/core/trash.test.ts` → PASS; `npx tsc --noEmit -p .; npm test`.
```powershell
git add src/core/trash.ts tests/core/trash.test.ts
git commit -m "feat(core): app trash with restore and 30-day purge" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P8: Логика выбора агента и объединения статусов

**Files:**
- Modify: `src/core/selection.ts`, `tests/core/selection.test.ts`

**Interfaces:**
- Consumes: только типы `AgentId`, `InstalledState`, `ProjectSource` (модуль клиентский — никаких Node-импортов).
- Produces:
  - `INSTALLED = '__installed__'`, `GLOBAL_PROJECT = '__global__'`;
  - `type AgentChoice = 'claude' | 'codex' | 'both'`, `AGENT_LABEL: Record<AgentId, string>` (`Claude`, `Codex`);
  - `agentsOf(choice: AgentChoice): AgentId[]` (`both` → `['claude', 'codex']`);
  - `defaultAgentChoice(sources: readonly ProjectSource[] | null): AgentChoice` — `null` (Глобально) → `claude`; если в источниках есть `codex` и нет `claude`/`vscode` → `codex`; иначе `claude`;
  - `mergeInstalled(states: Partial<Record<AgentId, InstalledState>>, agents: readonly AgentId[]): InstalledState` — для id, который есть у всех агентов: все `up-to-date` → `up-to-date`; хотя бы один `outdated` → `outdated`; иначе `unknown`; id, которого нет хотя бы у одного агента, не попадает;
  - `sourcesLabel(sources: readonly ProjectSource[]): string` — `vscode`→`VS Code`, `claude`→`Claude`, `codex`→`Codex`, `manual`→`вручную`, через ` · `.

- [ ] **Step 1: Дописать тесты в `tests/core/selection.test.ts` (RED)**

```ts
import { agentsOf, defaultAgentChoice, mergeInstalled, sourcesLabel } from '../../src/core/selection';

describe('агенты', () => {
  it('agentsOf', () => {
    expect(agentsOf('claude')).toEqual(['claude']);
    expect(agentsOf('both')).toEqual(['claude', 'codex']);
  });

  it('defaultAgentChoice', () => {
    expect(defaultAgentChoice(null)).toBe('claude');
    expect(defaultAgentChoice(['codex'])).toBe('codex');
    expect(defaultAgentChoice(['codex', 'manual'])).toBe('codex');
    expect(defaultAgentChoice(['vscode', 'codex'])).toBe('claude');
    expect(defaultAgentChoice([])).toBe('claude');
  });

  it('mergeInstalled', () => {
    const states = {
      claude: { a: 'up-to-date', b: 'outdated', c: 'up-to-date', d: 'unknown' } as const,
      codex: { a: 'up-to-date', b: 'up-to-date', d: 'unknown' } as const,
    };
    expect(mergeInstalled(states, ['claude', 'codex'])).toEqual({ a: 'up-to-date', b: 'outdated', d: 'unknown' });
    expect(mergeInstalled(states, ['claude'])).toEqual(states.claude);
    expect(mergeInstalled({}, ['codex'])).toEqual({});
  });

  it('sourcesLabel', () => {
    expect(sourcesLabel(['vscode', 'claude', 'codex', 'manual'])).toBe('VS Code · Claude · Codex · вручную');
    expect(sourcesLabel([])).toBe('');
  });
});
```
(Импорт добавить к существующему импорту из `selection`.)

Run: `npx vitest run tests/core/selection.test.ts` → FAIL.

- [ ] **Step 2: Дописать в `src/core/selection.ts`**

```ts
import type { AgentId, InstalledState, InstalledStatus, ProjectSource } from './types';

export const INSTALLED = '__installed__';
export const GLOBAL_PROJECT = '__global__';

export type AgentChoice = 'claude' | 'codex' | 'both';

export const AGENT_LABEL: Record<AgentId, string> = { claude: 'Claude', codex: 'Codex' };

const SOURCE_LABEL: Record<ProjectSource, string> = {
  vscode: 'VS Code',
  claude: 'Claude',
  codex: 'Codex',
  manual: 'вручную',
};

export function agentsOf(choice: AgentChoice): AgentId[] {
  return choice === 'both' ? ['claude', 'codex'] : [choice];
}

export function defaultAgentChoice(sources: readonly ProjectSource[] | null): AgentChoice {
  if (!sources) return 'claude';
  return sources.includes('codex') && !sources.includes('claude') && !sources.includes('vscode') ? 'codex' : 'claude';
}

export function mergeInstalled(
  states: Partial<Record<AgentId, InstalledState>>,
  agents: readonly AgentId[],
): InstalledState {
  const out: InstalledState = {};
  if (agents.length === 0) return out;
  const ids = new Set(agents.flatMap((a) => Object.keys(states[a] ?? {})));
  for (const id of ids) {
    const list = agents.map((a) => states[a]?.[id]);
    if (list.some((s) => s === undefined)) continue;
    const all = list as InstalledStatus[];
    out[id] = all.every((s) => s === 'up-to-date') ? 'up-to-date' : all.includes('outdated') ? 'outdated' : 'unknown';
  }
  return out;
}

export function sourcesLabel(sources: readonly ProjectSource[]): string {
  return sources.map((s) => SOURCE_LABEL[s]).join(' · ');
}
```
(Существующий `import type { CatalogSkill, CategoryDef } from './types'` объединить с новым.)

- [ ] **Step 3: Проверка и коммит**

Run: `npx tsc --noEmit -p .; npm test` → чисто / PASS.
```powershell
git add src/core/selection.ts tests/core/selection.test.ts
git commit -m "feat(core): agent choice and merged installed status" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P9: Server Actions с областью и агентами

**Files:**
- Modify: `src/app/actions.ts`, `src/components/SkillManager/SkillManager.tsx` (только адаптация вызовов, поведение UI прежнее)

**Interfaces:**
- Consumes: `skillsRoot`, `parseAgents` (P1); `listProjects`, `isKnownProject` (P4); `installSkills`, `getInstalled` (P5); `listInstalled` (P6); `removeSkill`, `restoreFromTrash`, `purgeTrash` (P7).
- Produces (`'use server'`):
  - `getInstalledAction(scope: Scope, agents: AgentId[]): Promise<Partial<Record<AgentId, InstalledState>>>`
  - `installSkillsAction(scope: Scope, agents: AgentId[], ids: string[], overwrite?: boolean): Promise<InstallResult[]>` — результаты всех агентов подряд, у каждого `agent`
  - `listInstalledAction(scope: Scope, agents: AgentId[]): Promise<InstalledSkill[]>` — перед чтением вызывает `purgeTrash(paths.trashDir)` (ошибку очистки игнорировать)
  - `removeSkillAction(scope: Scope, agent: AgentId, name: string): Promise<{ ok: true; entry: TrashEntry } | { ok: false; error: string }>`
  - `restoreSkillAction(id: string): Promise<{ ok: true; entry: TrashEntry } | { ok: false; error: string }>`
  - `getProjectsAction`, `addProjectAction`, `getCatalogAction`, `addUserSkillAction` — без изменений.

**Проверка входа (всё приходит из браузера и не доверено):**
```ts
async function checkScope(paths: AppPaths, scope: unknown): Promise<Scope | null> {
  if (!scope || typeof scope !== 'object') return null;
  const s = scope as { kind?: unknown; path?: unknown };
  if (s.kind === 'global') return { kind: 'global' };
  if (s.kind === 'project' && typeof s.path === 'string' && (await isKnownProject(paths, s.path))) {
    return { kind: 'project', path: s.path };
  }
  return null;
}
```
- Неизвестная область: `getInstalledAction` → `{}`, `listInstalledAction` → `[]`, `installSkillsAction` → по каждому id и агенту `{ status: 'error', message: 'Проект не найден в списке' }`, `removeSkillAction` → `{ ok: false, error: 'Проект не найден в списке' }`.
- `agents` пропускать через `parseAgents`; для `removeSkillAction` агент должен быть `'claude'` или `'codex'`, иначе `{ ok: false, error: 'Неизвестный агент' }`.
- `restoreSkillAction` ловит ошибки `restoreFromTrash` и возвращает `{ ok: false, error }`.

- [ ] **Step 1: Переписать перечисленные actions в `src/app/actions.ts`** по контракту выше (каталог для установки и статусов — `loadCatalog(paths)`; корень — `skillsRoot(scope, agent, paths.home)`; для `installSkillsAction` результат каждого агента дополнить полем `agent`).

- [ ] **Step 2: Адаптировать `SkillManager.tsx` без изменения поведения**

Все вызовы `getInstalledAction(path)` / `installSkillsAction(path, ids, overwrite)` заменить на `getInstalledAction({ kind: 'project', path }, ['claude'])` (брать `.claude ?? {}`) и `installSkillsAction({ kind: 'project', path }, ['claude'], ids, overwrite)`. Больше ничего в UI не менять — это Task P10.

- [ ] **Step 3: Проверка и коммит**

Run: `npx tsc --noEmit -p .; npm test; npm run build` → чисто / PASS / exit 0.
```powershell
git add src/app/actions.ts src/components/SkillManager/SkillManager.tsx
git commit -m "feat(app): scope- and agent-aware server actions, list/remove/restore" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P10: UI — «Глобально», источники проектов, выбор агента

**Files:**
- Modify: `src/components/ProjectList/ProjectList.tsx`, `src/components/Cart/Cart.tsx`, `src/components/Cart/Cart.module.css`, `src/components/SkillManager/SkillManager.tsx`

**Interfaces:**
- Consumes: `GLOBAL_PROJECT`, `AgentChoice`, `agentsOf`, `defaultAgentChoice`, `mergeInstalled`, `sourcesLabel`, `AGENT_LABEL` (P8); actions P9.
- Produces:
  - `ProjectList` — новая плитка «🌐 Глобально» первой (вне секций «Открыто»/«Недавние», над ними), `selected` когда `activePath === GLOBAL_PROJECT`, клик → `onSelect(GLOBAL_PROJECT)`; подзаголовок «все проекты · ~/.claude и ~/.agents». Подзаголовок (`hint`) плиток проектов: `sourcesLabel(p.sources)`, а если он пуст — путь; если не пуст — `` `${sourcesLabel(p.sources)} — ${p.path}` ``.
  - `Cart` — новые props `agent: AgentChoice; onAgentChange(choice: AgentChoice): void; scopeLabel: string | null`. В `cart__bar` перед кнопкой «Установить» группа из трёх `Tile`: «Claude», «Codex», «Оба» (`selected` по `agent`). Строка проекта: `scopeLabel ?? 'Выберите проект слева'` (SkillManager передаёт `Проект: <имя>` или `Глобально (все проекты)`).
  - `SkillManager`:
    - `activePath` может быть `GLOBAL_PROJECT`; `scope = activePath === GLOBAL_PROJECT ? { kind: 'global' } : project ? { kind: 'project', path: project.path } : null`;
    - логика «активный проект исчез из списка» не сбрасывает `GLOBAL_PROJECT`;
    - состояние `agentChoice: AgentChoice`; при смене выбранного проекта (или выборе «Глобально») выставляется `defaultAgentChoice(project?.sources ?? null)`; пользователь может переключить вручную;
    - `installed` хранится как `Partial<Record<AgentId, InstalledState>>` из `getInstalledAction(scope, agentsOf(agentChoice))`; в `SkillTiles` передаётся `mergeInstalled(installed, agentsOf(agentChoice))`; перезапрос при смене `scope`/`agentChoice`/каталога (с теми же защитами от гонок, что сейчас);
    - установка: `installSkillsAction(scope, agentsOf(agentChoice), ids, overwrite)`; строки уведомления при `both` содержат агента: `«<название>» (Claude) — ✓ установлен`;
    - подсказка после установки: «Скиллы подхватятся автоматически. Если папки skills раньше не было — выполните /reload-skills в Claude или перезапустите Codex.»;
    - кнопка «Установить» недоступна, если `scope === null`.

- [ ] **Step 1: Реализовать изменения** по контракту (прочитать текущие файлы целиком перед правкой; существующие защиты от гонок в `SkillManager` сохранить).
- [ ] **Step 2: CSS** — группа агентов в корзине: `.cart__agents { display: flex; gap: 6px; }`, плитки компактнее (`min-height` 40px через собственный класс-обёртку, без изменения `Tile.module.css`).
- [ ] **Step 3: Проверка**: `npx tsc --noEmit -p .; npm test; npm run build`. Затем `npx next start -H 127.0.0.1 -p 4317` в фоне, скриншот headless Edge (как в MVP Task 14 Step 7) в `.superpowers/sdd/p10-shot.png`; осмотреть: плитка «🌐 Глобально» сверху, бейджи источников в подзаголовках, переключатель агентов в корзине. Остановить сервер **деревом процессов** (`taskkill /PID <pid> /T /F`) и убедиться, что порт 4317 свободен.
- [ ] **Step 4: Коммит**
```powershell
git add src/components
git commit -m "feat(ui): global target, project source badges, agent switch in cart" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P11: UI — категория «✓ Установлено», удаление и возврат

**Files:**
- Create: `src/components/InstalledTiles/InstalledTiles.tsx`, `src/components/InstalledTiles/InstalledTiles.module.css`
- Modify: `src/components/CategoryRing/CategoryRing.tsx`, `src/components/SkillManager/SkillManager.tsx`, `src/components/SkillManager/SkillManager.module.css`

**Interfaces:**
- Consumes: `INSTALLED`, `AGENT_LABEL` (P8); `listInstalledAction`, `removeSkillAction`, `restoreSkillAction` (P9); `InstalledSkill`, `TrashEntry` (types); `Tile`, `Dialog`.
- Produces:
  - `CategoryRing` — в кольце после категорий каталога и перед «Мои скиллы» плитка `{ id: INSTALLED, title: 'Установлено', marker: '✓' }`;
  - `InstalledTiles({ items: InstalledSkill[]; showAgent: boolean; loading: boolean; onRemove(item: InstalledSkill): void; onUpdate(name: string): void; onHover(): void })` — сетка той же геометрии, что `SkillTiles` (вписанный квадрат 52%); для каждого элемента обёртка `div.installed__item` (position: relative) с `Tile` и, для `kind === 'managed'`, отдельной круглой кнопкой `button.installed__remove` «🗑» в правом верхнем углу (aria-label «Удалить <title>»), видимой при hover/focus обёртки (`opacity` + `transition`, без изменения размеров);
    - маркер плитки: `managed` — `✓` (tone success) / `↻` (tone warning, клик → `onUpdate(name)`) / `•` для `unknown`; остальные — `🔒` с `disabled`;
    - подзаголовок: `managed` — описание; `synced` — «синхронизировано с claude.ai»; `plugin` — `` `плагин ${plugin} — управляется через /plugin` ``; `system` — «системный скилл Codex»; при `showAgent` к подзаголовку спереди `` `${AGENT_LABEL[agent]} · ` ``;
    - пусто → «Здесь пока ничего не установлено»; `loading` → «Загружаю…».
  - `SkillManager`:
    - при `category === INSTALLED` внутри круга рендерится `InstalledTiles` вместо `SkillTiles` (с `key`, чтобы срабатывала анимация появления);
    - список грузится `listInstalledAction(scope, agentsOf(agentChoice))` при входе в категорию, смене scope/агента, после установки, удаления и возврата (с защитой от гонок по образцу `refreshInstalled`);
    - 🗑 → `Dialog` «Удалить скилл?» с текстом «<title> будет перенесён в корзину приложения. Вернуть можно сразу из уведомления; через 30 дней корзина очищается.» и плитками «Удалить» / «Отмена»; подтверждение → `removeSkillAction(scope, item.agent, item.name)`;
    - успех → уведомление `tone: 'success'`, заголовок «Удалено: <title>», кнопка-действие «Вернуть» → `restoreSkillAction(entry.id)` → уведомление «Возвращено: <title>» или ошибка; список и статусы перезагружаются;
    - уведомление получает необязательное поле `action?: { label: string; onClick(): void }` — отдельная кнопка внутри уведомления (`button.notice__action`), клик по ней не закрывает уведомление до завершения действия; авто-скрытие уведомления с действием — через 15 с.
    - `↻` в «Установлено» использует существующий диалог обновления (переустановка из каталога выбранным агентам).

- [ ] **Step 1: Реализовать `InstalledTiles` + CSS** (BEM: `installed`, `installed__item`, `installed__remove`, `installed__empty`; анимация/hover — только `opacity`/`transform`, никаких изменений размеров при наведении).
- [ ] **Step 2: `CategoryRing`** — добавить плитку «Установлено».
- [ ] **Step 3: `SkillManager`** — состояние списка, диалог удаления, уведомление с действием «Вернуть».
- [ ] **Step 4: Проверка**: `npx tsc --noEmit -p .; npm test; npm run build`; запустить сервер, открыть скриншотом (headless Edge) — для проверки категории «Установлено» использовать CDP-скрипт `.superpowers/sdd/hover-probe.mjs` как образец: кликнуть «🌐 Глобально», затем «Установлено», сделать `Page.captureScreenshot` в `.superpowers/sdd/p11-shot.png`; осмотреть (должны быть видны глобальные скиллы с 🔒 у synced/плагинов). Остановить сервер деревом процессов.
- [ ] **Step 5: Коммит**
```powershell
git add src/components
git commit -m "feat(ui): Installed category with remove to trash and restore" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

---

### Task P12: README и финальная проверка

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README** — добавить раздел «Агенты и области»: таблица 4 папок из спецификации (раздел 3), «🌐 Глобально», категория «Установлено» (что можно удалять, что только просмотр), корзина `user/trash/` с автоочисткой 30 дней; источники проектов (VS Code, Claude Code, Codex) и где они читаются; убрать/заменить упоминание о необходимости перезапуска после установки.
- [ ] **Step 2: Финальная проверка**: `npx tsc --noEmit -p .`, `npm test`, `npm run build`, CDP-замер наведения (`hover-probe.mjs`) — высота плиток неизменна, скриншоты P10/P11 осмотрены.
- [ ] **Step 3: Коммит**
```powershell
git add README.md
git commit -m "docs: agents, global scope, installed view and trash" -m "Co-Authored-By: Claude <модель> <noreply@anthropic.com>"
```

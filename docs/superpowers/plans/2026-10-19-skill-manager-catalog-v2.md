# Каталог v2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** реализовать спецификацию [2026-10-19-skill-manager-catalog-v2-design.md](../specs/2026-10-19-skill-manager-catalog-v2-design.md): «Глобально» со всеми скиллами Claude/Codex, категории Дизайн / Видео (Монтаж, Генерация) / Другие, impeccable по умолчанию, карточки с командами и подробностями, паки, задел под «Шаблоны».

**Architecture:**
- Ядро (`src/core`) остаётся чистыми функциями с тестами vitest на временных папках.
- В каталоге у скилла появляются пути отдельно для каждого агента (`dirs`) и описательные поля. Git-источники загружаются частично (sparse).
- UI (`src/components`) получает новые компоненты `SkillCard`, `SkillInfo`, `PackCard`, `SubcategoryTabs`.
- `SkillManager` делится на `AppShell` и `SkillsSection`.

**Tech Stack:** Next.js 16 (server actions), React 19, TypeScript, CSS-модули, vitest, Electron 44, git CLI.

## Global Constraints

- Формат каталога: `"version": 1`, все новые поля необязательные, старые `user-catalog.json` валидны.
- Тексты интерфейса — по-русски.
- Команда установки Codex глобально — `~/.agents/skills`; сканирование Codex глобально — `~/.agents/skills` и `~/.codex/skills`.
- Вложенность категорий — один уровень (`parent` у категории без своего `parent`).
- На карточке не больше 3 команд; в `commands` не больше 8.
- Подробности: наведение 400 мс открывает, уход > 150 мс закрывает, если поповер не закреплён; «ⓘ» или `i` закрепляет; `Esc` / клик вне / «×» закрывают.
- impeccable: git `https://github.com/pbakaus/impeccable.git`; Claude — `.claude/skills/impeccable`, Codex — `.agents/skills/impeccable`; папка установки `impeccable`.
- Живые проверки только на временной домашней папке (`SKILL_MANAGER_HOME`), настоящие скиллы пользователя не трогаем.
- Каждая задача: TDD (RED → GREEN), `npx tsc --noEmit -p .`, `npm test`, коммит с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Карта файлов

| Файл | Что меняется |
|---|---|
| `src/core/types.ts` | `CategoryDef.parent`, `SkillDef.paths/summary/commands/commandsMore/homepage`, `SkillCommand`, `PackDef`, `Manifest.packs`, `CatalogSkill.dirs/summary/commands/commandsMore/homepage/sourceLabel`, `CatalogPack`, `Catalog.packs`, `InstallStatus 'unsupported'`, `InstalledSkill.root` |
| `src/core/manifest.ts` | разбор новых полей и проверки |
| `src/core/sources.ts` | `EnsureSourceOpts.sparse`, sparse-клон и обновление |
| `src/core/catalog.ts` | `dirs` по агентам, sparse-пути на источник, паки, проверки категорий |
| `src/core/installer.ts` | `agent` в `installSkills` / `getInstalled` |
| `src/core/skill-targets.ts` | `skillRoots(scope, agent, home)` |
| `src/core/inventory.ts` | обход всех корней, поле `root` |
| `src/core/trash.ts` | `removeSkill(..., root?)`, восстановление в любой разрешённый корень |
| `src/core/selection.ts` | подкатегории, паки, группировка установленного |
| `src/app/actions.ts` | агент при установке, корни, `root` при удалении |
| `catalog/catalog.json`, `catalog/samples/**` | новый каталог; примеры удаляются |
| `src/components/SkillCard/*` (новый) | карточка скилла: summary, чипы команд, агенты, ⓘ |
| `src/components/SkillInfo/*` (новый) | поповер подробностей + `useSkillInfo` |
| `src/components/PackCard/*` (новый) | карточка пака с раскрытием |
| `src/components/SubcategoryTabs/*` (новый) | «таблетки» подкатегорий |
| `src/components/SkillTiles/*` | собирает карточки, паки, пустое состояние |
| `src/components/InstalledTiles/*` | группы паков, «Удалить весь пак», подпись корня |
| `src/components/CategoryRing/*` | только верхний уровень, счётчики с подкатегориями |
| `src/components/AppShell/*` (новый), `SkillsSection/*` (новый), `SkillManager/*` | разделение, `SECTIONS` |
| `src/components/AddSkillDialog/*` | только «листовые» категории, подписи «Видео › Монтаж» |
| `README.md` | категории, подробности, паки, Глобально (`~/.codex/skills`), формат каталога |

---

### Task 1: Формат каталога — новые поля в манифесте

**Files:** Modify `src/core/types.ts`, `src/core/manifest.ts`; Test `tests/core/manifest.test.ts`

**Interfaces — Produces:**
```ts
export interface CategoryDef { id: string; title: string; order?: number; parent?: string }
export interface SkillCommand { cmd: string; hint: string }
export interface SkillDef {
  id: string; source: string; path: string; paths?: Partial<Record<AgentId, string>>;
  category: string; title?: string; description?: string;
  summary?: string; commands?: SkillCommand[]; commandsMore?: number; homepage?: string;
}
export interface PackDef { id: string; title: string; category: string; summary?: string; skills: string[] }
export interface Manifest { version: 1; categories: CategoryDef[]; sources: SourceDef[]; skills: SkillDef[]; packs: PackDef[] }
```

- [ ] **Step 1: тесты (RED)** — в `tests/core/manifest.test.ts` добавить:
```ts
const base = { version: 1, sources: [{ id: 's', type: 'local', path: '.' }] };
const parse = (o: object) => parseManifest(JSON.stringify({ ...base, ...o }), 'T');

it('parent у категории', () => {
  const m = parse({ categories: [{ id: 'video', title: 'Видео' }, { id: 'cut', title: 'Монтаж', parent: 'video' }] });
  expect(m.categories[1].parent).toBe('video');
});
it('parent должен ссылаться на категорию верхнего уровня этого же файла', () => {
  expect(() => parse({ categories: [{ id: 'cut', title: 'М', parent: 'nope' }] })).toThrow(/parent/);
  expect(() => parse({ categories: [
    { id: 'a', title: 'A' }, { id: 'b', title: 'B', parent: 'a' }, { id: 'c', title: 'C', parent: 'b' },
  ] })).toThrow(/вложенность/);
});
it('paths по агентам вместо path', () => {
  const m = parse({ skills: [{ id: 'x', source: 's', category: 'c', paths: { claude: 'a', codex: 'b' } }] });
  expect(m.skills[0].paths).toEqual({ claude: 'a', codex: 'b' });
  expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', path: 'p', paths: { claude: 'a' } }] })).toThrow(/path.*paths/);
  expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', paths: { gemini: 'a' } }] })).toThrow(/агент/);
});
it('summary, commands, commandsMore, homepage', () => {
  const m = parse({ skills: [{ id: 'x', source: 's', category: 'c', summary: 'S',
    commands: [{ cmd: '/x a', hint: 'h' }], commandsMore: 3, homepage: 'https://x.dev' }] });
  expect(m.skills[0]).toMatchObject({ summary: 'S', commands: [{ cmd: '/x a', hint: 'h' }], commandsMore: 3, homepage: 'https://x.dev' });
});
it('commands: не больше 8, cmd и hint обязательны; homepage только https', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ cmd: `/c${i}`, hint: 'h' }));
  expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', commands: nine }] })).toThrow(/8/);
  expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', commands: [{ cmd: '/a' }] }] })).toThrow(/hint/);
  expect(() => parse({ skills: [{ id: 'x', source: 's', category: 'c', homepage: 'http://x' }] })).toThrow(/https/);
});
it('packs: скиллы существуют, категория совпадает, id не пересекается со скиллами', () => {
  const skills = [{ id: 'a', source: 's', category: 'cut' }, { id: 'b', source: 's', category: 'cut' }];
  const m = parse({ skills, packs: [{ id: 'p', title: 'P', category: 'cut', skills: ['a', 'b'] }] });
  expect(m.packs[0]).toEqual({ id: 'p', title: 'P', category: 'cut', skills: ['a', 'b'] });
  expect(() => parse({ skills, packs: [{ id: 'p', title: 'P', category: 'cut', skills: ['zzz'] }] })).toThrow(/zzz/);
  expect(() => parse({ skills, packs: [{ id: 'p', title: 'P', category: 'other', skills: ['a'] }] })).toThrow(/категори/);
  expect(() => parse({ skills, packs: [{ id: 'a', title: 'P', category: 'cut', skills: ['b'] }] })).toThrow(/повторяется/);
  expect(() => parse({ skills, packs: [{ id: 'p', title: 'P', category: 'cut', skills: [] }] })).toThrow(/пуст/);
});
it('старый файл без новых полей валиден, packs = []', () => {
  expect(parse({}).packs).toEqual([]);
});
```
- [ ] **Step 2:** `npx vitest run tests/core/manifest.test.ts` → FAIL.
- [ ] **Step 3: реализация** в `manifest.ts`:
  - категория: `parent: optId(c.parent)`. После разбора: каждый `parent` — id категории этого файла без собственного `parent` (иначе ошибка «вложенность категорий — один уровень» или «parent "…" не найден»);
  - скилл: `paths` — объект, ключи только `claude` / `codex` (иначе «неизвестный агент …»), значения — строки. Если заданы и `path` (непустая строка), и `paths` — ошибка «укажите path или paths, не оба». `summary`, `homepage` — `optStr`; `homepage` должен начинаться с `https://`. `commands` — массив, не больше 8, элементы `{cmd: str, hint: str}`. `commandsMore` — целое ≥ 0;
  - `packs`: `id` (не повторяется ни среди паков, ни среди скиллов), `title`, `category`, `summary?`, `skills` — непустой массив id из `skills` этого файла, у каждого `category === pack.category`; один скилл не может входить в два пака;
  - `emptyManifest()` возвращает `packs: []`.
- [ ] **Step 4:** тесты зелёные, `tsc` (поправить `user-catalog.ts`, если он собирает `Manifest` без `packs`).
- [ ] **Step 5:** коммит `feat(catalog): manifest fields for subcategories, per-agent paths, commands, packs`.

### Task 2: Частичная загрузка git-источника (sparse)

**Files:** Modify `src/core/sources.ts`; Test `tests/core/sources.test.ts`

**Interfaces — Produces:** `EnsureSourceOpts.sparse?: string[]`. Если задан и не пуст, клон частичный и в рабочем дереве только эти пути.

- [ ] **Step 1: тест (RED)** — по образцу существующего git-теста (`makeRepo`). В origin добавить `big/blob.bin` (1 МБ) и `skills/demo/SKILL.md`, затем `git config uploadpack.allowFilter true` в origin.
```ts
it('git + sparse: в рабочем дереве только нужные пути, новые пути докачиваются', async () => {
  // ...origin с skills/demo, skills/other, big/blob.bin
  const dir = await ensureSource(src, { ...opts, update: false, sparse: ['skills/demo'] });
  await expect(access(path.join(dir, 'skills/demo/SKILL.md'))).resolves.toBeUndefined();
  await expect(access(path.join(dir, 'big/blob.bin'))).rejects.toThrow();
  await expect(access(path.join(dir, 'skills/other/SKILL.md'))).rejects.toThrow();
  // в каталоге появился новый скилл того же источника — без update путь добавляется
  await ensureSource(src, { ...opts, update: false, sparse: ['skills/demo', 'skills/other'] });
  await expect(access(path.join(dir, 'skills/other/SKILL.md'))).resolves.toBeUndefined();
});
it('git + sparse: update подтягивает новый коммит и сохраняет набор путей', async () => { /* v2 в skills/demo; big не появляется */ });
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: реализация.**
  - **Клон.** `clone --depth 1 --filter=blob:none --sparse [--branch ref] -- url tmp`, затем `git sparse-checkout set --no-cone -- <пути…>` с `cwd=tmp`.
  - **Метка набора путей.** Отсортированный список путей записывается в `<dir>/.git/skill-manager-sparse.json`.
  - **Существующий клон.** Если метка отличается от нужного набора (или её нет, а `sparse` задан), выполнить `sparse-checkout set --no-cone` и переписать метку. Это работает и на старом полном клоне: он становится частичным.
  - **update.** `fetch --depth 1 --filter=blob:none -- origin ref|HEAD` + `reset --hard FETCH_HEAD`.
  - **Без `sparse`** поведение прежнее.
  - Пути в `sparse-checkout` — с прямыми слэшами, без ведущего `/`. Шаблон в no-cone режиме: `/<path>/`.
- [ ] **Step 4:** тесты зелёные (включая старые git-тесты).
- [ ] **Step 5:** коммит `feat(sources): sparse partial clone for git sources`.

### Task 3: Каталог — пути по агентам, описания, паки, проверки категорий

**Files:** Modify `src/core/types.ts`, `src/core/catalog.ts`, `src/core/selection.ts` (`pruneSelection`); Test `tests/core/catalog.test.ts`

**Interfaces — Produces:**
```ts
export interface CatalogSkill {
  id: string; title: string; description: string; summary: string; category: string; layer: Layer;
  dirs: Partial<Record<AgentId, string>>;   // пусто, если источник/SKILL.md недоступны
  commands: SkillCommand[]; commandsMore: number; homepage?: string;
  sourceLabel: string;                        // URL git без .git или «папка: <путь>»
  pack?: string;                              // id пака, если скилл в паке
  error?: string;
}
export interface CatalogPack { id: string; title: string; category: string; summary: string; skills: string[]; layer: Layer }
export interface Catalog { categories: CategoryDef[]; skills: CatalogSkill[]; packs: CatalogPack[]; errors: string[] }
export function isAvailable(s: CatalogSkill): boolean   // Object.keys(dirs).length > 0 && !error
```
`dir` удаляется. Все места, где был `skill.dir`, переходят на `dirs` / `isAvailable`: `installer.ts`, `selection.ts pruneSelection`, `SkillTiles`, `actions.ts`.

- [ ] **Step 1: тесты (RED)** в `tests/core/catalog.test.ts`:
  - скилл с `paths: {claude: 'c/x', codex: 'a/x'}` → `dirs.claude`, `dirs.codex` указывают на соответствующие папки; заголовок и описание берутся из SKILL.md копии Claude, а если её нет — Codex;
  - `paths: {claude: 'c/x'}` → только `dirs.claude`;
  - нет SKILL.md ни у одной копии → `error: 'SKILL.md не найден'`, `dirs: {}`;
  - SKILL.md нет у одного агента → этот агент не попадает в `dirs`, ошибки нет;
  - `path` (как раньше) → `dirs` для обоих агентов на одну папку;
  - `summary` по умолчанию: manifest `summary` → manifest `description` → frontmatter `description`;
  - `packs` переносятся в `catalog.packs` с `layer`, у скиллов пака проставлен `pack`;
  - категория скилла, у которой есть дочерние → у скилла `error: 'Категория «Видео» разделена на подкатегории — укажите подкатегорию'`;
  - `ensureSource` получает `sparse` из путей всех скиллов источника — проверить через подменённый `GitRunner`, что вызывается `sparse-checkout set` с этими путями.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: реализация** в `catalog.ts`:
  - **sparse.** До цикла по источникам собрать `Map<sourceId, string[]>` из `def.paths ?? {all: def.path}` (только для git) и передать в `ensureSource(..., { sparse })`.
  - **Пути по агентам.** Для каждого агента из `AGENTS` берётся `def.paths?.[agent] ?? (def.paths ? undefined : def.path)`, папка проверяется через `isInside` и наличие SKILL.md. Если путь выходит за пределы источника, это ошибка всего скилла.
  - **Описание** берётся из первой найденной копии.
  - **`sourceLabel`:** для git — `url` без `.git`; для local — `папка: <path>`.
  - **Паки.** Слои сливаются по id так же, как скиллы.
  - **Категории.** `mergeCategories` сохраняет `parent`. Категория с неизвестным `parent` после слияния слоёв становится верхнего уровня, а в `errors` пишется сообщение.
- [ ] **Step 4:** зелёные тесты, `tsc` (ошибки компиляции из-за `dir` закрываются в Task 4–5 и UI — до них временно оставить совместимость нельзя, поэтому Task 3–5 коммитятся вместе, если `tsc` иначе не проходит).
- [ ] **Step 5:** коммит `feat(catalog): per-agent skill dirs, summaries, commands, packs`.

### Task 4: Установка по агенту

**Files:** Modify `src/core/installer.ts`, `src/core/types.ts` (`InstallStatus` + `'unsupported'`); Test `tests/core/installer.test.ts`

**Interfaces — Produces:**
```ts
installSkills(root, catalog, ids, opts: { agent: AgentId; overwrite?: boolean; trash?: {...} }): Promise<InstallResult[]>
getInstalled(roots: string | string[], catalog: CatalogSkill[], agent: AgentId): Promise<InstalledState>
```
- [ ] **Step 1: тесты (RED):**
  - ставит копию `dirs[agent]`: у Claude и Codex разный контент — в целевой папке именно копия агента;
  - нет `dirs[agent]` → `{status: 'unsupported', message: 'нет версии для Codex'}`, папка не создаётся;
  - `getInstalled` сравнивает хеш с `dirs[agent]`; при нескольких корнях скилл считается установленным, если есть хотя бы в одном (статус из первого корня, где найден).
- [ ] **Step 2:** FAIL. **Step 3:** реализация. **Step 4:** PASS.
- [ ] **Step 5:** коммит `feat(installer): install the agent-specific copy; unsupported status`.

### Task 5: Корни скиллов, `~/.codex/skills`, удаление и восстановление

**Files:** Modify `src/core/skill-targets.ts`, `src/core/inventory.ts`, `src/core/trash.ts`, `src/core/types.ts`; Test `tests/core/{skill-targets,inventory,trash}.test.ts`

**Interfaces — Produces:**
```ts
skillRoots(scope: Scope, agent: AgentId, home: string): string[]
// project: [skillsRoot(...)]; global claude: [~/.claude/skills]; global codex: [~/.agents/skills, ~/.codex/skills]
interface InstalledSkill { ...; root: string }
removeSkill(scope, agent, name, home, trashDir, root?: string): Promise<TrashEntry>
```
- [ ] **Step 1: тесты (RED):**
  - `skillRoots` для четырёх случаев;
  - `listInstalled(global, ['codex'])` находит `~/.codex/skills/foo` (kind `managed`, `root` = `~/.codex/skills`) и `~/.agents/skills/bar`; одинаковое имя в обоих — две записи с разными `root`; `.system` по-прежнему `system`, и в `managed` из `~/.codex/skills` он не попадает;
  - `removeSkill(global, 'codex', 'foo', home, trash, '~/.codex/skills')` переносит в корзину; `root` вне `skillRoots` → «Этот скилл нельзя удалить»; без `root` используется первый корень;
  - `restoreFromTrash` возвращает запись с `originalPath` в `~/.codex/skills/foo` на место; путь вне разрешённых корней — `BAD_TARGET`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: реализация.**
  - `inventory.ts`: перебирать `skillRoots` и передавать `getInstalled(root, catalog, agent)`.
  - `trash.ts`: в `restoreFromTrash` для global-записи сравнивать `originalPath` с `path.join(r, name)` для каждого `r` из `skillRoots`.
  - `isForbiddenProjectRoot` уже запрещает `~/.codex`.
- [ ] **Step 4:** PASS. **Step 5:** коммит `feat(inventory): scan ~/.codex/skills; remove/restore by root`.

### Task 6: Выбор — подкатегории, паки, группировка

**Files:** Modify `src/core/selection.ts`; Test `tests/core/selection.test.ts`

**Interfaces — Produces:**
```ts
topCategories(cats: CategoryDef[]): CategoryDef[]
childCategories(cats: CategoryDef[], parentId: string): CategoryDef[]
categoryPath(cats: CategoryDef[], id: string): string                 // «Видео › Монтаж»
skillsForCategory(skills, categoryId): CatalogSkill[]                   // без скиллов, входящих в пак
packsForCategory(packs, categoryId): CatalogPack[]
countByCategory(selected, skills, cats): Record<string, number>         // + суммы на родителя
summarizeByCategory(selected, cats): string                             // «Видео › Монтаж 3 · Дизайн 1»
type PackState = 'none' | 'some' | 'all' | 'installed'
packState(pack, selected, installed, skills): PackState                 // недоступные скиллы не учитываются
togglePack(selected, pack, skills, installed): string[]                 // all → снять все; иначе добавить доступные неустановленные
groupInstalled(items: InstalledSkill[], skills: CatalogSkill[], packs: CatalogPack[]): Array<{ pack: CatalogPack | null; items: InstalledSkill[] }>
```
- [ ] **Step 1: тесты (RED)** на каждую функцию, в том числе:
  - `countByCategory` для скилла в `video-editing` даёт `{ 'video-editing': 1, video: 1 }`;
  - `MY_SKILLS` считается, как раньше;
  - `packState`: всё установлено → `installed`;
  - `togglePack` не добавляет установленные и ошибочные;
  - `groupInstalled`: скиллы без пака — в группу `pack: null` (первой); группа пака создаётся, только если найден хотя бы один его скилл.
- [ ] **Step 2–4:** RED → реализация → GREEN.
- [ ] **Step 5:** коммит `feat(selection): subcategories, packs, installed grouping`.

### Task 7: Серверные действия

**Files:** Modify `src/app/actions.ts`

- [ ] **Step 1.**
  - `installSkillsAction`: `installSkills(skillsRoot(...), catalog.skills, ids, { agent, overwrite, trash })`.
  - `getInstalledAction`: `getInstalled(skillRoots(checked, agent, home), catalog.skills, agent)`.
  - `removeSkillAction(scope, agent, name, root?)` передаёт `root`, проверку делает `removeSkill`.
- [ ] **Step 2:** `tsc`, `npm test`. **Step 3:** коммит `feat(actions): agent-aware install, multi-root status, remove by root`.

### Task 8: Содержимое каталога — impeccable, новые категории, без примеров

**Files:** Modify `catalog/catalog.json`; Delete `catalog/samples/**`; Modify tests that referenced the samples, if any

- [ ] **Step 1:** сравнить копии impeccable для Claude и Codex (`git diff --no-index`) и записать разницу в коммит, чтобы подтвердить, что `paths` действительно нужны.
- [ ] **Step 2:** `catalog.json` — ровно как в спецификации, раздел 2, без блока `packs`: реального пака пока нет, а тестовый живёт в тестах.
- [ ] **Step 3:** удалить `catalog/samples`. Поиск `sample-` по `tests/ src/ scripts/` — заменить фикстуры на временные каталоги.
- [ ] **Step 4:** тест `tests/core/base-catalog.test.ts`: настоящий `catalog/catalog.json` разбирается, категории `design`, `video`, `video-editing`, `video-generation`, `other`; `impeccable` в `design` с `paths.claude/codex`; 6 команд.
- [ ] **Step 5:** живая проверка `loadCatalog` с настоящей сетью во временном `cacheDir`: у impeccable есть `dirs.claude` и `dirs.codex`, размер кэша < 15 МБ.
- [ ] **Step 6:** коммит `feat(catalog): impeccable by default; Design/Video(Editing, Generation)/Other; drop samples`.

### Task 9: UI — карточка скилла и подробности

**Files:** Create `src/components/SkillCard/{SkillCard.tsx,SkillCard.module.css}`, `src/components/SkillInfo/{SkillInfo.tsx,SkillInfo.module.css,useSkillInfo.ts}`; Modify `src/components/SkillTiles/*`

**Interfaces:**
```tsx
<SkillCard skill state={{marker, tone, disabled}} selected index agentsAvailable={['claude','codex']}
  onToggle onInfo={(el: HTMLElement, pin: boolean) => void} onInfoLeave onHover />
<SkillInfo skill anchor={DOMRect} pinned onClose onCopy(cmd) />
useSkillInfo(): { info: {skill, rect, pinned} | null; enter(skill, el); leave(); pin(skill, el); close() }
```
- **Верстка карточки.** Стиль `Tile` (стекло), маркер слева. Справа значки `C` / `X`: приглушённый, если для агента нет `dirs`. Кнопка «ⓘ» (`aria-label="Подробнее"`). Под названием — `summary` в одну строку. Ниже — до трёх чипов `<code>` с командами в моноширинном шрифте, мелко.
- **Поповер.** Позиционируется внутри `.stage`: справа от карточки, а если не помещается — слева; ширина 320 px; анимация появления 150 мс с учётом `prefers-reduced-motion`. Клик по команде вызывает `navigator.clipboard.writeText` и показывает «Скопировано» на 1,5 с. «Подробнее ↗» открывает `homepage` через `window.open` (Electron отправит в системный браузер).
- **Тайминги** — из Global Constraints. `Esc` закрывает.
- **Логика наведения** — в чистой функции `nextInfoState(state, event, now)` в `src/core/selection.ts`, с тестами в `tests/core/selection.test.ts`. React-хук только вызывает её по таймерам.
- **Проверка.** Тесты `nextInfoState`, затем живой скриншот (Task 13).
- Коммит `feat(ui): skill cards with command chips and info popover`.

### Task 10: UI — подкатегории, паки, пустые категории

**Files:** Create `src/components/SubcategoryTabs/*`, `src/components/PackCard/*`; Modify `SkillTiles`, `CategoryRing`, `Cart` (сводка через `summarizeByCategory(…, categories)` с путём), `AddSkillDialog` (только листовые категории, подписи `categoryPath`)

- **Кольцо.** `CategoryRing` получает `topCategories`. Счётчик берётся из `countByCategory`: на родителе — сумма.
- **Подкатегории.** `SkillsSection` хранит `subcategory: Record<parentId, childId>`. По умолчанию выбрана первая дочерняя. `SubcategoryTabs` — ряд таблеток над сеткой (`role="tablist"`), у таблеток свои счётчики.
- **Пак.** `PackCard` — маркер по `packState` (○ ◐ ◉ ✓), «Название · N скиллов», `summary`, «⌄» раскрывает список скиллов пака с флажками: ✓ установлен, ! ошибка. Клик по карточке — `togglePack`.
- **Пустая (под)категория** — «Скоро здесь появятся скиллы».
- Коммит `feat(ui): subcategory tabs, pack cards, empty states`.

### Task 11: UI — «Установлено» с паками и корнями; «Глобально» открывает «Установлено»

**Files:** Modify `InstalledTiles`, `SkillsSection`

- **Группировка.** `InstalledTiles` получает `groups` из `groupInstalled`. У группы пака заголовок «Пак: Название» и кнопка «Удалить весь пак». Подтверждение — тем же `Dialog`: «N скиллов будут перенесены в корзину». Удаление идёт по одному скиллу, все `entry.id` собираются, «Вернуть все» восстанавливает по очереди.
- **Подпись корня.** Если один и тот же `name` есть с разными `root`, в подсказке видна папка (`~/.codex/skills` или `~/.agents/skills`).
- **Глобально.** Выбор «Глобально» в `ProjectList` ставит категорию `INSTALLED`.
- **Удаление** передаёт `item.root`.
- Коммит `feat(ui): installed view groups packs, shows skill root; Global opens Installed`.

### Task 12: Разделение `SkillManager` → `AppShell` + `SkillsSection`

**Files:** Create `src/components/AppShell/{AppShell.tsx,AppShell.module.css,sections.ts}`, `src/components/SkillsSection/{SkillsSection.tsx,SkillsSection.module.css}`; Modify `src/components/SkillManager/SkillManager.tsx` (становится тонкой обёрткой или удаляется с заменой в `page.tsx`)

- **`sections.ts`:** `export const SECTIONS = [{ id: 'skills', title: 'Скиллы' }] as const`.
- **`AppShell`.** Рендерит шапку (логотип, переключатель разделов, если `SECTIONS.length > 1`, и слот действий раздела — «Обновить каталог»), уведомление и активный раздел.
- **Переезд.** Состояние и разметка скиллов переезжают в `SkillsSection` без изменения поведения. Уведомления поднимаются в `AppShell` через `onNotice`.
- **Проверка:** `tsc`, тесты, живой запуск (Task 13). Коммит `refactor(ui): AppShell with sections; SkillsSection holds the skills workspace`.

### Task 13: Живая проверка, README, релиз

- [ ] **Сборка и запуск.** `npm run build:app`, затем `electron .` с `SKILL_MANAGER_HOME=<tmp>`, `SKILL_MANAGER_USER_DIR=<tmp>/user`, `SKILL_MANAGER_CACHE_DIR=<tmp>/cache`. Кэш каталога не должен пересекаться с настоящим.
- [ ] **Скриншоты** (тем же PowerShell-захватом, что для заставки):
  - кольцо с «Дизайн / Видео / Другие»;
  - «Дизайн» с карточкой impeccable и чипами команд;
  - поповер по наведению;
  - «Видео» с таблетками и пустым состоянием;
  - «Глобально» → «Установлено».
- [ ] **Установка и удаление impeccable на временном HOME.**
  - Режим «Оба» ставит две разные копии: `<tmp>/.claude/skills/impeccable` и `<tmp>/.agents/skills/impeccable` — сравнить с источником.
  - Удаление через «Установлено» переносит в корзину, «Вернуть» возвращает.
  - Скилл в `<tmp>/.codex/skills/foo` виден и удаляется.
- [ ] **Пак** — на тестовом `user-catalog.json` во временной `userDir`: два локальных скилла и пак; выбор пака, установка, «Удалить весь пак», «Вернуть все».
- [ ] **README:** разделы «Каталог скиллов» (категории, подкатегории, карточки, паки, формат с новыми полями), «Агенты и области» (`~/.codex/skills`), «Установлено» (паки).
- [ ] **Проверки:** `tsc`, `npm test`, `npm run dist:win`.
- [ ] **Ревью** (`superpowers:requesting-code-review`), исправления.
- [ ] **Релиз** `npm version minor` → `git push --follow-tags origin main`, Release-workflow зелёный, установленная 0.2.1 обновляется до 0.3.0.
- [ ] Обновить `docs/superpowers/HANDOFF.md`, закрыть задачи beads.

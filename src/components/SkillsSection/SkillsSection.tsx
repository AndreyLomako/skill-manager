'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCatalogAction,
  addProjectAction,
  getInstalledAction,
  getProjectsAction,
  installSkillsAction,
  listInstalledAction,
  removeSkillAction,
  restoreSkillAction,
  uninstallPluginAction,
} from '@/app/actions';
import type { ProjectsResult } from '@/core/projects';
import {
  AGENT_LABEL,
  GLOBAL_PROJECT,
  INSTALLED,
  agentsOf,
  childCategories,
  clientPathKey,
  countByCategory,
  defaultAgentChoice,
  groupInstalled,
  mergeInstalled,
  MY_SKILLS,
  packsForCategory,
  pruneSelection,
  skillsForCategory,
  toggleSelection,
  togglePack,
  topCategories,
  type AgentChoice,
  type InstalledGroup,
} from '@/core/selection';
import type {
  AgentId,
  Catalog,
  CatalogPack,
  InstallResult,
  InstalledSkill,
  InstalledState,
  Scope,
  TrashEntry,
} from '@/core/types';
import { AddSkillDialog } from '../AddSkillDialog/AddSkillDialog';
import { Blob, type BlobHandle, type BlobPulse } from '../Blob/Blob';
import { Cart } from '../Cart/Cart';
import { CatalogErrors } from '../CatalogErrors/CatalogErrors';
import { CategoryRing } from '../CategoryRing/CategoryRing';
import { Dialog } from '../Dialog/Dialog';
import { InstalledTiles } from '../InstalledTiles/InstalledTiles';
import { ProjectList } from '../ProjectList/ProjectList';
import { SkillTiles } from '../SkillTiles/SkillTiles';
import { SubcategoryTabs } from '../SubcategoryTabs/SubcategoryTabs';
import { Icon } from '../Icon/Icon';
import { Tile } from '../Tile/Tile';
import { Notice, type NoticeData } from '../Notice/Notice';
import styles from './SkillsSection.module.css';

const STATUS_TEXT: Record<InstallResult['status'], string> = {
  installed: '✓ установлен',
  'already-installed': '• уже был установлен',
  unsupported: '• пропущен',
  error: '✗ ошибка',
};

const POLL_MS = 2000;
const NOTICE_MS = 9000;
const NOTICE_ACTION_MS = 15000;

const pathKey = (p: string) => clientPathKey(p, typeof navigator === 'undefined' ? '' : navigator.userAgent);

export function SkillsSection({ initialCatalog, initialProjects }: { initialCatalog: Catalog; initialProjects: ProjectsResult }) {
  const blob = useRef<BlobHandle>(null);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [projects, setProjects] = useState(initialProjects);
  const [activePath, setActivePath] = useState<string | null>(
    () => initialProjects.projects.find((p) => p.active)?.path ?? initialProjects.projects[0]?.path ?? null,
  );
  const [category, setCategory] = useState(() => topCategories(initialCatalog.categories)[0]?.id ?? MY_SKILLS);
  // Выбранная подкатегория для каждой категории верхнего уровня
  const [subcategory, setSubcategory] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [installed, setInstalled] = useState<Partial<Record<AgentId, InstalledState>>>({});
  const [agentChoice, setAgentChoice] = useState<AgentChoice>(() =>
    defaultAgentChoice(initialProjects.projects.find((p) => p.active)?.sources ?? initialProjects.projects[0]?.sources ?? null),
  );
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  // agent задан — обновление из «Установлено» только для этого агента; null — для текущего выбора агента
  const [updating, setUpdating] = useState<{ id: string; agent: AgentId | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [installedList, setInstalledList] = useState<InstalledSkill[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ item: InstalledSkill; scope: Scope; scopeKey: string | null } | null>(null);
  const [removingPack, setRemovingPack] = useState<{
    pack: CatalogPack;
    items: InstalledSkill[];
    scope: Scope;
    scopeKey: string | null;
  } | null>(null);
  const [removingPlugin, setRemovingPlugin] = useState<{ group: InstalledGroup; scope: Scope; scopeKey: string | null } | null>(null);
  const [noticeBusy, setNoticeBusy] = useState(false);

  const activePathRef = useRef(activePath);
  const agentRef = useRef(agentChoice);
  const projectsRef = useRef(projects);
  const installedReq = useRef(0);
  const listReq = useRef(0);
  const categoryRef = useRef(category);
  const installing = useRef(false);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    agentRef.current = agentChoice;
  }, [agentChoice]);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const pulse = useCallback((kind: BlobPulse) => blob.current?.pulse(kind), []);
  const hover = useCallback(() => pulse('hover'), [pulse]);

  // Первая отрисовка не ждёт загрузки git-источников — догружаем каталог сразу после показа.
  useEffect(() => {
    if (!initialCatalog.skills.some((s) => s.pending)) return;
    let alive = true;
    getCatalogAction(false)
      .then((res) => {
        if (alive && res.ok) setCatalog(res.catalog);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [initialCatalog]);

  // Живое обновление списка проектов VS Code
  useEffect(() => {
    const timer = setInterval(() => {
      getProjectsAction().then(setProjects).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // Пути проектов сравниваются без учёта регистра (Windows). Если в списке поменялось только
  // написание активного пути — просто переводим activePath на новую строку (ключ тот же).
  useEffect(() => {
    const list = projects.projects;
    if (activePath === GLOBAL_PROJECT) return;
    if (activePath !== null) {
      const same = list.find((p) => pathKey(p.path) === pathKey(activePath));
      if (same) {
        if (same.path !== activePath) setActivePath(same.path);
        return;
      }
    }
    const next = list.find((p) => p.active)?.path ?? list[0]?.path ?? null;
    if (next !== activePath) setActivePath(next);
  }, [projects, activePath]);

  const activeKey = activePath === null ? null : pathKey(activePath);
  const project = projects.projects.find((p) => pathKey(p.path) === activeKey) ?? null;
  // scopeKey — регистронезависимый ключ: смена написания пути не меняет scope и не сбрасывает состояние
  const scopeKey = activePath === GLOBAL_PROJECT ? 'global' : project ? pathKey(project.path) : null;
  const scopePath = project?.path ?? null;
  const scope = useMemo<Scope | null>(
    () =>
      scopeKey === null
        ? null
        : scopeKey === 'global' && activePath === GLOBAL_PROJECT
          ? { kind: 'global' }
          : scopePath === null
            ? null
            : { kind: 'project', path: scopePath },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  const refreshInstalled = useCallback(async (target: Scope | null, choice: AgentChoice) => {
    const req = ++installedReq.current;
    const result = target ? await getInstalledAction(target, agentsOf(choice)) : {};
    if (req === installedReq.current) setInstalled(result);
  }, []);

  const refreshList = useCallback(async (target: Scope | null, choice: AgentChoice) => {
    const req = ++listReq.current;
    setListLoading(true);
    setListError(null);
    try {
      const result = target ? await listInstalledAction(target, agentsOf(choice)) : [];
      if (req === listReq.current) setInstalledList(result);
    } catch (e) {
      if (req === listReq.current) setListError(e instanceof Error ? e.message : String(e));
    } finally {
      if (req === listReq.current) setListLoading(false);
    }
  }, []);

  // Смена проекта: не показываем статусы и диалог обновления от предыдущего проекта,
  // агент по умолчанию берётся из источников проекта
  useEffect(() => {
    setInstalled({});
    setUpdating(null);
    const p = projectsRef.current.projects.find((x) => pathKey(x.path) === activeKey);
    setAgentChoice(defaultAgentChoice(p?.sources ?? null));
  }, [activeKey]);

  useEffect(() => {
    refreshInstalled(scope, agentChoice).catch(() => undefined);
    return () => {
      installedReq.current++;
    };
  }, [scope, agentChoice, catalog, refreshInstalled]);

  // Диалог обновления относится к конкретному проекту и выбору агента
  useEffect(() => {
    setUpdating(null);
    setRemoving(null);
    setRemovingPack(null);
    setRemovingPlugin(null);
  }, [scopeKey, agentChoice]);

  // Список «Установлено»: при входе в категорию и смене проекта/агента
  useEffect(() => {
    if (category !== INSTALLED) return;
    setInstalledList([]);
    refreshList(scope, agentChoice).catch(() => setListLoading(false));
    return () => {
      listReq.current++;
    };
  }, [category, scope, agentChoice, refreshList]);

  // Обновление статусов и списка после изменения содержимого (по ключу проекта и ТЕКУЩЕМУ выбору агента)
  const refreshAfterChange = async (targetScope: Scope, targetKey: string | null) => {
    const current = activePathRef.current;
    const currentKey = current === GLOBAL_PROJECT ? 'global' : current === null ? null : pathKey(current);
    if (currentKey !== targetKey) return;
    const choice = agentRef.current;
    await Promise.all([
      refreshInstalled(targetScope, choice).catch(() => undefined),
      categoryRef.current === INSTALLED ? refreshList(targetScope, choice).catch(() => undefined) : undefined,
    ]);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.action ? NOTICE_ACTION_MS : NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(
    () => countByCategory(selected, catalog.skills, catalog.categories),
    [selected, catalog.skills, catalog.categories],
  );
  const children = useMemo(() => childCategories(catalog.categories, category), [catalog.categories, category]);
  const activeSub = children.length === 0 ? null : (children.find((c) => c.id === subcategory[category]) ?? children[0]).id;
  const gridCategory = activeSub ?? category;
  const visible = useMemo(() => skillsForCategory(catalog.skills, gridCategory), [catalog.skills, gridCategory]);
  const visiblePacks = useMemo(
    () => (gridCategory === MY_SKILLS ? [] : packsForCategory(catalog.packs, gridCategory)),
    [catalog.packs, gridCategory],
  );
  const mergedInstalled = useMemo(() => mergeInstalled(installed, agentsOf(agentChoice)), [installed, agentChoice]);
  const installedGroups = useMemo(
    () => groupInstalled(installedList, catalog.skills, catalog.packs),
    [installedList, catalog.skills, catalog.packs],
  );
  const selectedSkills = useMemo(() => catalog.skills.filter((s) => selected.includes(s.id)), [catalog.skills, selected]);
  const titleOf = (id: string) => catalog.skills.find((s) => s.id === id)?.title ?? id;

  const toggle = (id: string) => {
    setSelected((sel) => toggleSelection(sel, id));
    pulse('select');
  };

  const choosePack = (pack: CatalogPack) => {
    setSelected((sel) => togglePack(sel, pack, catalog.skills, mergedInstalled));
    pulse('select');
  };

  const install = async (ids: string[], overwrite: boolean, onlyAgent: AgentId | null = null) => {
    if (installing.current || !scope || ids.length === 0) return;
    const targetScope = scope;
    const targetKey = scopeKey;
    const targetChoice = agentChoice;
    const targetAgents = onlyAgent ? [onlyAgent] : agentsOf(targetChoice);
    const targetName = targetScope.kind === 'global' ? 'Глобально' : (project?.name ?? '');
    installing.current = true;
    setBusy(true);
    try {
      const results = await installSkillsAction(targetScope, targetAgents, ids, overwrite);
      const failed = results.filter((r) => r.status === 'error');
      // При «Оба» скилл остаётся в выборе, если хотя бы для одного агента установка не удалась
      const failedIds = new Set(failed.map((r) => r.skillId));
      const done = new Set(results.filter((r) => !failedIds.has(r.skillId)).map((r) => r.skillId));
      setSelected((sel) => sel.filter((id) => !done.has(id)));
      pulse(failed.length > 0 ? 'error' : 'success');
      setNotice({
        tone: failed.length > 0 ? 'error' : 'success',
        title:
          failed.length > 0
            ? `Готово с ошибками (${failed.length})`
            : targetScope.kind === 'global'
              ? 'Установлено глобально'
              : `Установлено в «${targetName}»`,
        lines: results.map((r) => `${titleOf(r.skillId)}${targetChoice === 'both' && r.agent ? ` (${AGENT_LABEL[r.agent]})` : ''} — ${STATUS_TEXT[r.status]}${r.message ? `: ${r.message}` : ''}`),
        hint: !results.some((r) => r.status === 'installed')
          ? undefined
          : overwrite
            ? 'Предыдущая версия перенесена в корзину приложения (хранится 30 дней).'
            : 'Скиллы подхватятся автоматически. Если папки skills раньше не было — выполните /reload-skills в Claude или перезапустите Codex.',
      });
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Не удалось установить', lines: [e instanceof Error ? e.message : String(e)] });
      return;
    } finally {
      installing.current = false;
      setBusy(false);
    }
    await refreshAfterChange(targetScope, targetKey);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const { item, scope: targetScope, scopeKey: targetKey } = removing;
    setRemoving(null);
    try {
      const res = await removeSkillAction(targetScope, item.agent, item.name, item.root);
      if (!res.ok) {
        pulse('error');
        setNotice({ tone: 'error', title: 'Не удалось удалить', lines: [res.error] });
        return;
      }
      pulse('success');
      const entryId = res.entry.id;
      setNotice({
        tone: 'success',
        title: `Удалено: ${item.title}`,
        lines: [],
        action: { label: 'Вернуть', onClick: () => void restore(entryId, item.title, targetScope, targetKey) },
      });
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Не удалось удалить', lines: [e instanceof Error ? e.message : String(e)] });
      return;
    }
    await refreshAfterChange(targetScope, targetKey);
  };

  const confirmRemovePack = async () => {
    if (!removingPack) return;
    const { pack, items, scope: targetScope, scopeKey: targetKey } = removingPack;
    setRemovingPack(null);
    const entries: TrashEntry[] = [];
    const failed: string[] = [];
    for (const item of items) {
      try {
        const res = await removeSkillAction(targetScope, item.agent, item.name, item.root);
        if (res.ok) entries.push(res.entry);
        else failed.push(`${item.title}: ${res.error}`);
      } catch (e) {
        failed.push(`${item.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    pulse(failed.length > 0 ? 'error' : 'success');
    setNotice({
      tone: failed.length > 0 ? 'error' : 'success',
      title: failed.length > 0 ? `Пак «${pack.title}» удалён не полностью` : `Удалён пак «${pack.title}»`,
      lines: failed,
      action:
        entries.length > 0
          ? { label: 'Вернуть все', onClick: () => void restoreAll(entries, pack.title, targetScope, targetKey) }
          : undefined,
    });
    await refreshAfterChange(targetScope, targetKey);
  };

  const confirmRemovePlugin = async () => {
    if (!removingPlugin?.group.pluginId) return;
    const { group, scope: targetScope, scopeKey: targetKey } = removingPlugin;
    const pluginId = group.pluginId!;
    setRemovingPlugin(null);
    setBusy(true);
    try {
      const res = await uninstallPluginAction(pluginId);
      if (res.ok) {
        pulse('success');
        setNotice({
          tone: 'success',
          title: `Плагин «${group.title}» удалён`,
          lines: [`Через Claude Code ${res.via === 'vscode' ? 'из расширения VS Code' : '(клиент)'}.`],
          hint: `Открытые сессии Claude Code увидят изменение после перезапуска (в VS Code — «Developer: Reload Window»). Вернуть плагин: /plugin install ${pluginId}`,
        });
      } else {
        pulse('error');
        const command = res.command;
        setNotice({
          tone: 'error',
          title: 'Плагин не удалён',
          lines: command ? [res.error, `Удалите его в Claude Code командой: ${command}`] : [res.error],
          action: command ? { label: 'Скопировать команду', onClick: () => void navigator.clipboard?.writeText(command) } : undefined,
        });
      }
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Плагин не удалён', lines: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(false);
    }
    await refreshAfterChange(targetScope, targetKey);
  };

  const restoreAll = async (entries: TrashEntry[], title: string, targetScope: Scope, targetKey: string | null) => {
    setNoticeBusy(true);
    const failed: string[] = [];
    try {
      for (const e of entries) {
        const res = await restoreSkillAction(e.id).catch((err: unknown) => ({
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        }));
        if (!res.ok) failed.push(`${e.name}: ${res.error}`);
      }
    } finally {
      setNoticeBusy(false);
    }
    pulse(failed.length > 0 ? 'error' : 'success');
    setNotice(
      failed.length > 0
        ? { tone: 'error', title: 'Вернулось не всё', lines: failed }
        : { tone: 'success', title: `Возвращён пак «${title}»`, lines: [] },
    );
    await refreshAfterChange(targetScope, targetKey);
  };

  const restore = async (id: string, title: string, targetScope: Scope, targetKey: string | null) => {
    setNoticeBusy(true);
    try {
      const res = await restoreSkillAction(id);
      if (!res.ok) {
        pulse('error');
        setNotice({ tone: 'error', title: 'Не удалось вернуть', lines: [res.error] });
        return;
      }
      pulse('success');
      setNotice({ tone: 'success', title: `Возвращено: ${title}`, lines: [] });
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Не удалось вернуть', lines: [e instanceof Error ? e.message : String(e)] });
      return;
    } finally {
      setNoticeBusy(false);
    }
    await refreshAfterChange(targetScope, targetKey);
  };

  const refreshCatalog = async () => {
    setRefreshing(true);
    try {
      const res = await getCatalogAction(true);
      if (res.ok) {
        setCatalog(res.catalog);
        setSelected((sel) => pruneSelection(sel, res.catalog.skills));
        pulse(res.catalog.errors.length > 0 ? 'error' : 'success');
      } else {
        pulse('error');
        setNotice({ tone: 'error', title: 'Каталог не обновлён', lines: [res.error] });
      }
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Каталог не обновлён', lines: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setRefreshing(false);
    }
  };

  const addFolder = async (folder: string): Promise<string | null> => {
    const res = await addProjectAction(folder);
    if (!res.ok) {
      pulse('error');
      return res.error;
    }
    setProjects(res.result);
    setActivePath(res.path);
    pulse('success');
    return null;
  };

  return (
    <>
      <div className={styles.actions}>
        <CatalogErrors errors={catalog.errors} />
        <Tile
          title={refreshing ? 'Обновляю каталог…' : 'Обновить каталог'}
          marker="↻"
          disabled={refreshing}
          onClick={refreshCatalog}
          onHover={hover}
        />
      </div>

      <ProjectList
        projects={projects.projects}
        activePath={activePath}
        error={projects.error}
        onSelect={(p) => {
          setActivePath(p);
          // «Глобально» сразу показывает всё, что установлено на компьютере.
          if (p === GLOBAL_PROJECT) setCategory(INSTALLED);
          pulse('select');
        }}
        onAddFolder={addFolder}
        onHover={hover}
      />

      <main className={styles.app__main}>
        <div className={styles.stage}>
          <Blob ref={blob} />
          <CategoryRing
            categories={topCategories(catalog.categories)}
            active={category}
            counts={counts}
            onSelect={(id) => {
              setCategory(id);
              pulse('select');
            }}
            onHover={hover}
          />
          <div className={styles.orb}>
            {category !== INSTALLED && activeSub && (
              <SubcategoryTabs
                items={children}
                active={activeSub}
                counts={counts}
                onSelect={(id) => {
                  setSubcategory((m) => ({ ...m, [category]: id }));
                  pulse('select');
                }}
                onHover={hover}
              />
            )}
            {category === INSTALLED ? (
              <InstalledTiles
                key={INSTALLED}
                groups={installedGroups}
                skills={catalog.skills}
                showAgent={agentChoice === 'both'}
                loading={listLoading}
                error={listError ? `Не удалось загрузить список: ${listError}` : undefined}
                onRemove={(item) => scope && setRemoving({ item, scope, scopeKey })}
                onRemovePack={(pack, items) => scope && setRemovingPack({ pack, items, scope, scopeKey })}
                onRemovePlugin={(group) => scope && setRemovingPlugin({ group, scope, scopeKey })}
                onUpdate={(item) => setUpdating({ id: item.name, agent: item.agent })}
                onHover={hover}
              />
            ) : (
              <SkillTiles
                key={gridCategory}
                skills={visible}
                packs={visiblePacks}
                allSkills={catalog.skills}
                selected={selected}
                installed={mergedInstalled}
                showAdd={category === MY_SKILLS}
                emptyText="Скоро здесь появятся скиллы"
                onToggle={toggle}
                onTogglePack={choosePack}
                onUpdate={(id) => setUpdating({ id, agent: null })}
                onAdd={() => setAdding(true)}
                onHover={hover}
              />
            )}
          </div>
        </div>
      </main>

      <Cart
        scopeLabel={scope === null ? null : scope.kind === 'global' ? 'Глобально (все проекты)' : `Проект: ${project?.name ?? ''}`}
        agent={agentChoice}
        onAgentChange={setAgentChoice}
        selected={selectedSkills}
        categories={catalog.categories}
        busy={busy}
        onRemove={toggle}
        onClear={() => setSelected([])}
        onInstall={() => void install(selected, false)}
      />

      {notice && <Notice notice={notice} busy={noticeBusy} onClose={() => setNotice(null)} />}

      {updating && scope && (
        <Dialog title="Обновить скилл?" onClose={() => setUpdating(null)}>
          <p className={styles.dialog__text}>
            «{titleOf(updating.id)}» {scope.kind === 'global' ? 'в глобальных скиллах' : `в проекте «${project?.name ?? ''}»`} отличается от версии в каталоге. Установленная копия будет заменена для {(updating.agent ? [updating.agent] : agentsOf(agentChoice)).map((a) => AGENT_LABEL[a]).join(' и ')}; предыдущая версия попадёт в корзину приложения.
          </p>
          <div className={styles.dialog__actions}>
            <Tile
              title="Обновить"
              marker="↻"
              selected
              disabled={busy}
              onClick={() => {
                const { id, agent } = updating;
                setUpdating(null);
                void install([id], true, agent);
              }}
            />
            <Tile title="Отмена" onClick={() => setUpdating(null)} />
          </div>
        </Dialog>
      )}

      {removing && (
        <Dialog title="Удалить скилл?" onClose={() => setRemoving(null)}>
          <p className={styles.dialog__text}>
            {removing.item.title} будет перенесён в корзину приложения. Вернуть можно сразу из уведомления; через 30 дней корзина очищается.
          </p>
          <div className={styles.dialog__actions}>
            <Tile title="Удалить" marker={<Icon name="trash" />} tone="warning" onClick={() => void confirmRemove()} />
            <Tile title="Отмена" onClick={() => setRemoving(null)} />
          </div>
        </Dialog>
      )}

      {removingPack && (
        <Dialog title="Удалить пак?" onClose={() => setRemovingPack(null)}>
          <p className={styles.dialog__text}>
            Пак «{removingPack.pack.title}»: скиллов — {removingPack.items.length}, все они будут перенесены в корзину приложения. Вернуть можно сразу из уведомления; через 30 дней корзина очищается.
          </p>
          <div className={styles.dialog__actions}>
            <Tile title="Удалить пак" marker={<Icon name="trash" />} tone="warning" onClick={() => void confirmRemovePack()} />
            <Tile title="Отмена" onClick={() => setRemovingPack(null)} />
          </div>
        </Dialog>
      )}

      {removingPlugin && (
        <Dialog title="Удалить плагин?" onClose={() => setRemovingPlugin(null)}>
          <p className={styles.dialog__text}>
            Плагин «{removingPlugin.group.title}» будет удалён из Claude Code целиком: скиллов — {removingPlugin.group.items.length}, а также его команды, агенты и хуки. Это делает сам Claude Code (клиент или расширение VS Code), в корзину приложения плагин не попадает — вернуть его можно командой /plugin install {removingPlugin.group.pluginId}.
          </p>
          <div className={styles.dialog__actions}>
            <Tile title="Удалить плагин" marker={<Icon name="trash" />} tone="warning" disabled={busy} onClick={() => void confirmRemovePlugin()} />
            <Tile title="Отмена" onClick={() => setRemovingPlugin(null)} />
          </div>
        </Dialog>
      )}

      {adding && (
        <AddSkillDialog
          categories={catalog.categories}
          onClose={() => setAdding(false)}
          onError={() => pulse('error')}
          onAdded={(next) => {
            setCatalog(next);
            setAdding(false);
            setCategory(MY_SKILLS);
            pulse('success');
          }}
        />
      )}
    </>
  );
}

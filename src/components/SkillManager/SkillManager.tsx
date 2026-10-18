'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCatalogAction,
  addProjectAction,
  getInstalledAction,
  getProjectsAction,
  installSkillsAction,
} from '@/app/actions';
import type { ProjectsResult } from '@/core/projects';
import {
  AGENT_LABEL,
  GLOBAL_PROJECT,
  agentsOf,
  countByCategory,
  defaultAgentChoice,
  mergeInstalled,
  MY_SKILLS,
  pruneSelection,
  skillsForCategory,
  toggleSelection,
  type AgentChoice,
} from '@/core/selection';
import type { AgentId, Catalog, InstallResult, InstalledState, Scope } from '@/core/types';
import { AddSkillDialog } from '../AddSkillDialog/AddSkillDialog';
import { Blob, type BlobHandle, type BlobPulse } from '../Blob/Blob';
import { Cart } from '../Cart/Cart';
import { CategoryRing } from '../CategoryRing/CategoryRing';
import { Dialog } from '../Dialog/Dialog';
import { ProjectList } from '../ProjectList/ProjectList';
import { SkillTiles } from '../SkillTiles/SkillTiles';
import { Tile } from '../Tile/Tile';
import styles from './SkillManager.module.css';

interface Notice {
  tone: 'success' | 'error';
  title: string;
  lines: string[];
  hint?: string;
}

const STATUS_TEXT: Record<InstallResult['status'], string> = {
  installed: '✓ установлен',
  'already-installed': '• уже был установлен',
  error: '✗ ошибка',
};

const POLL_MS = 2000;
const NOTICE_MS = 9000;

export function SkillManager({ initialCatalog, initialProjects }: { initialCatalog: Catalog; initialProjects: ProjectsResult }) {
  const blob = useRef<BlobHandle>(null);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [projects, setProjects] = useState(initialProjects);
  const [activePath, setActivePath] = useState<string | null>(
    () => initialProjects.projects.find((p) => p.active)?.path ?? initialProjects.projects[0]?.path ?? null,
  );
  const [category, setCategory] = useState(() => initialCatalog.categories[0]?.id ?? MY_SKILLS);
  const [selected, setSelected] = useState<string[]>([]);
  const [installed, setInstalled] = useState<Partial<Record<AgentId, InstalledState>>>({});
  const [agentChoice, setAgentChoice] = useState<AgentChoice>('claude');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const activePathRef = useRef(activePath);
  const agentRef = useRef(agentChoice);
  const projectsRef = useRef(projects);
  const installedReq = useRef(0);
  const installing = useRef(false);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    agentRef.current = agentChoice;
  }, [agentChoice]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const pulse = useCallback((kind: BlobPulse) => blob.current?.pulse(kind), []);
  const hover = useCallback(() => pulse('hover'), [pulse]);

  // Живое обновление списка проектов VS Code
  useEffect(() => {
    const timer = setInterval(() => {
      getProjectsAction().then(setProjects).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const list = projects.projects;
    if (activePath === GLOBAL_PROJECT) return;
    if (activePath !== null && list.some((p) => p.path === activePath)) return;
    const next = list.find((p) => p.active)?.path ?? list[0]?.path ?? null;
    if (next !== activePath) setActivePath(next);
  }, [projects, activePath]);

  const project = projects.projects.find((p) => p.path === activePath) ?? null;
  const scopeKey = activePath === GLOBAL_PROJECT ? 'global' : project ? project.path : null;
  const scope = useMemo<Scope | null>(
    () => (scopeKey === null ? null : scopeKey === 'global' && activePath === GLOBAL_PROJECT ? { kind: 'global' } : { kind: 'project', path: scopeKey }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  const refreshInstalled = useCallback(async (target: Scope | null, choice: AgentChoice) => {
    const req = ++installedReq.current;
    const result = target ? await getInstalledAction(target, agentsOf(choice)) : {};
    if (req === installedReq.current) setInstalled(result);
  }, []);

  // Смена проекта: не показываем статусы и диалог обновления от предыдущего проекта,
  // агент по умолчанию берётся из источников проекта
  useEffect(() => {
    setInstalled({});
    setUpdateId(null);
    const p = projectsRef.current.projects.find((x) => x.path === activePath);
    setAgentChoice(defaultAgentChoice(p?.sources ?? null));
  }, [activePath]);

  useEffect(() => {
    refreshInstalled(scope, agentChoice).catch(() => undefined);
    return () => {
      installedReq.current++;
    };
  }, [scope, agentChoice, catalog, refreshInstalled]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => countByCategory(selected, catalog.skills), [selected, catalog.skills]);
  const visible = useMemo(() => skillsForCategory(catalog.skills, category), [catalog.skills, category]);
  const selectedSkills = useMemo(() => catalog.skills.filter((s) => selected.includes(s.id)), [catalog.skills, selected]);
  const titleOf = (id: string) => catalog.skills.find((s) => s.id === id)?.title ?? id;

  const toggle = (id: string) => {
    setSelected((sel) => toggleSelection(sel, id));
    pulse('select');
  };

  const install = async (ids: string[], overwrite: boolean) => {
    if (installing.current || !scope || ids.length === 0) return;
    const targetScope = scope;
    const targetKey = scopeKey;
    const targetChoice = agentChoice;
    const targetAgents = agentsOf(targetChoice);
    const targetName = targetScope.kind === 'global' ? 'Глобально' : (project?.name ?? '');
    installing.current = true;
    setBusy(true);
    try {
      const results = await installSkillsAction(targetScope, targetAgents, ids, overwrite);
      const failed = results.filter((r) => r.status === 'error');
      const done = new Set(results.filter((r) => r.status !== 'error').map((r) => r.skillId));
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
        hint: results.some((r) => r.status === 'installed')
          ? 'Скиллы подхватятся автоматически. Если папки skills раньше не было — выполните /reload-skills в Claude или перезапустите Codex.'
          : undefined,
      });
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Не удалось установить', lines: [(e as Error).message] });
      return;
    } finally {
      installing.current = false;
      setBusy(false);
    }
    const currentKey = activePathRef.current === GLOBAL_PROJECT ? 'global' : activePathRef.current;
    if (currentKey === targetKey && agentRef.current === targetChoice) {
      try {
        await refreshInstalled(targetScope, targetChoice);
      } catch {
        // ошибка обновления статуса не должна выглядеть как ошибка установки
      }
    }
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
      setNotice({ tone: 'error', title: 'Каталог не обновлён', lines: [(e as Error).message] });
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
    <div className={styles.app}>
      <header className={styles.app__header}>
        <h1 className={styles.app__logo}>Skill Manager</h1>
        <Tile
          title={refreshing ? 'Обновляю каталог…' : 'Обновить каталог'}
          marker="↻"
          disabled={refreshing}
          onClick={refreshCatalog}
          onHover={hover}
        />
      </header>

      <ProjectList
        projects={projects.projects}
        activePath={activePath}
        error={projects.error}
        onSelect={(p) => {
          setActivePath(p);
          pulse('select');
        }}
        onAddFolder={addFolder}
        onHover={hover}
      />

      <main className={styles.app__main}>
        <div className={styles.stage}>
          <Blob ref={blob} />
          <CategoryRing
            categories={catalog.categories}
            active={category}
            counts={counts}
            onSelect={(id) => {
              setCategory(id);
              pulse('select');
            }}
            onHover={hover}
          />
          <SkillTiles
            key={category}
            skills={visible}
            selected={selected}
            installed={mergeInstalled(installed, agentsOf(agentChoice))}
            showAdd={category === MY_SKILLS}
            onToggle={toggle}
            onUpdate={setUpdateId}
            onAdd={() => setAdding(true)}
            onHover={hover}
          />
        </div>
        {catalog.errors.length > 0 && (
          <ul className={styles.app__errors}>
            {catalog.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
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

      {notice && (
        <div className={`${styles.notice} ${styles[`notice--${notice.tone}`]}`} role="status" onClick={() => setNotice(null)}>
          <strong className={styles.notice__title}>{notice.title}</strong>
          <ul className={styles.notice__list}>
            {notice.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {notice.hint && <p className={styles.notice__hint}>{notice.hint}</p>}
        </div>
      )}

      {updateId && scope && (
        <Dialog title="Обновить скилл?" onClose={() => setUpdateId(null)}>
          <p className={styles.dialog__text}>
            «{titleOf(updateId)}» {scope.kind === 'global' ? 'в глобальных скиллах' : `в проекте «${project?.name ?? ''}»`} отличается от версии в каталоге. Установленная копия будет заменена.
          </p>
          <div className={styles.dialog__actions}>
            <Tile
              title="Обновить"
              marker="↻"
              selected
              disabled={busy}
              onClick={() => {
                const id = updateId;
                setUpdateId(null);
                void install([id], true);
              }}
            />
            <Tile title="Отмена" onClick={() => setUpdateId(null)} />
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
    </div>
  );
}

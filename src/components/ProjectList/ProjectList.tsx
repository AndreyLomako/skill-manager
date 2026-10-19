'use client';

import { useRef, useState } from 'react';
import { clientPathKey, GLOBAL_PROJECT, sourcesLabel } from '@/core/selection';
import type { Project } from '@/core/types';
import { Icon } from '../Icon/Icon';
import { Tile } from '../Tile/Tile';
import styles from './ProjectList.module.css';

interface Props {
  projects: Project[];
  activePath: string | null;
  error?: string;
  onSelect(path: string): void;
  onAddFolder(path: string): Promise<string | null>;
  onHover(): void;
}

export function ProjectList({ projects, activePath, error, onSelect, onAddFolder, onHover }: Props) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const open = projects.filter((p) => p.open);
  const recent = projects.filter((p) => !p.open);

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const err = await onAddFolder(value);
      if (err) {
        setAddError(err);
        return;
      }
      setAdding(false);
      setValue('');
      setAddError(null);
    } catch (e) {
      setAddError((e as Error).message || 'Не удалось добавить проект');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const renderTiles = (list: Project[], offset: number) =>
    list.map((p, i) => (
      <Tile
        key={p.path}
        index={offset + i}
        title={p.name}
        hint={sourcesLabel(p.sources) ? `${sourcesLabel(p.sources)} — ${p.path}` : p.path}
        marker={p.open ? '●' : '○'}
        tone={p.open ? 'success' : 'default'}
        selected={activePath !== null && clientPathKey(p.path, ua) === clientPathKey(activePath, ua)}
        onClick={() => onSelect(p.path)}
        onHover={onHover}
      />
    ));

  return (
    <aside className={styles.projects}>
      <Tile
        title="Глобально"
        hint="все проекты · ~/.claude и ~/.agents"
        marker={<Icon name="globe" />}
        selected={activePath === GLOBAL_PROJECT}
        onClick={() => onSelect(GLOBAL_PROJECT)}
        onHover={onHover}
      />
      <h2 className={styles.projects__title}>Открыто сейчас</h2>
      {open.length > 0 ? (
        <div className={styles.projects__list}>{renderTiles(open, 0)}</div>
      ) : (
        <p className={styles.projects__empty}>{error ?? 'Нет открытых проектов'}</p>
      )}

      {recent.length > 0 && (
        <>
          <h2 className={styles.projects__title}>Недавние</h2>
          <div className={styles.projects__list}>{renderTiles(recent, open.length)}</div>
        </>
      )}

      {adding ? (
        <form
          className={styles.projects__add}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="glass-input"
            autoFocus
            placeholder="C:\путь\к\проекту"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setAddError(null);
            }}
          />
          {addError && <p className={styles.projects__error}>{addError}</p>}
          <div className={styles.projects__row}>
            <Tile title={busy ? 'Добавляю…' : 'Добавить'} selected disabled={busy} onClick={() => void submit()} />
            <Tile
              title="Отмена"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
            />
          </div>
        </form>
      ) : (
        <Tile title="Добавить проект" marker="+" index={projects.length} onClick={() => setAdding(true)} onHover={onHover} />
      )}
    </aside>
  );
}

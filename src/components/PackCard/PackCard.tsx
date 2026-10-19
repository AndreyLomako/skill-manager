'use client';

import { useState, type CSSProperties } from 'react';
import { isAvailable, type PackState } from '@/core/selection';
import type { CatalogPack, CatalogSkill, InstalledState } from '@/core/types';
import styles from './PackCard.module.css';

interface Props {
  pack: CatalogPack;
  skills: CatalogSkill[];
  state: PackState;
  selected: string[];
  installed: InstalledState;
  index: number;
  onTogglePack(): void;
  onToggleSkill(id: string): void;
  onHover(): void;
}

const MARKER: Record<PackState, string> = { none: '○', some: '◐', all: '◉', installed: '✓' };

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'скилл';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'скилла';
  return 'скиллов';
}

export function PackCard({ pack, skills, state, selected, installed, index, onTogglePack, onToggleSkill, onHover }: Props) {
  const [expanded, setExpanded] = useState(false);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const members = pack.skills.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const done = state === 'installed';
  const cls = [
    styles.pack,
    (state === 'all' || state === 'some') && styles['pack--selected'],
    done && styles['pack--done'],
    expanded && styles['pack--expanded'],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} style={{ '--i': index } as CSSProperties} onMouseEnter={onHover}>
      <div className={styles.pack__row}>
        <button type="button" className={styles.pack__main} aria-pressed={state === 'all'} disabled={done} onClick={onTogglePack}>
          <span className={styles.pack__marker} aria-hidden="true">
            {MARKER[state]}
          </span>
          <span className={styles.pack__body}>
            <span className={styles.pack__title}>
              {pack.title}
              <span className={styles.pack__count}>
                {members.length} {plural(members.length)}
              </span>
            </span>
            {pack.summary && <span className={styles.pack__summary}>{pack.summary}</span>}
          </span>
        </button>
        <button
          type="button"
          className={styles.pack__expand}
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть список' : 'Показать скиллы пака'}
          onClick={() => setExpanded((x) => !x)}
        >
          ⌄
        </button>
      </div>
      {expanded && (
        <ul className={styles.pack__list}>
          {members.map((s) => {
            const status = installed[s.id];
            const available = isAvailable(s);
            const mark = !available ? '!' : status ? '✓' : selected.includes(s.id) ? '☑' : '☐';
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.pack__item}
                  disabled={!available || Boolean(status)}
                  title={s.error ?? s.summary}
                  onClick={() => onToggleSkill(s.id)}
                >
                  <span className={styles.pack__check} aria-hidden="true">
                    {mark}
                  </span>
                  <span className={styles.pack__name}>{s.title}</span>
                  <span className={styles.pack__hint}>{s.error ?? (status ? 'установлен' : s.summary)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

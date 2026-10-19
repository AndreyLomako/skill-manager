'use client';

import type { ReactNode } from 'react';
import { SECTIONS, type SectionId } from './sections';
import styles from './AppShell.module.css';

interface Props {
  active: SectionId;
  onSection?(id: SectionId): void;
  /** Содержимое раздела: его элементы занимают области сетки actions / projects / main / cart. */
  children: ReactNode;
}

export function AppShell({ active, onSection, children }: Props) {
  return (
    <div className={styles.app}>
      <header className={styles.app__header}>
        <h1 className={styles.app__logo}>Skill Manager</h1>
        {SECTIONS.length > 1 && (
          <nav className={styles.sections} aria-label="Разделы">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.sections__item} ${s.id === active ? styles['sections__item--active'] : ''}`}
                aria-current={s.id === active ? 'page' : undefined}
                onClick={() => onSection?.(s.id)}
              >
                {s.title}
              </button>
            ))}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

'use client';

import type { CategoryDef } from '@/core/types';
import styles from './SubcategoryTabs.module.css';

interface Props {
  items: CategoryDef[];
  active: string;
  counts: Record<string, number>;
  onSelect(id: string): void;
  onHover(): void;
}

export function SubcategoryTabs({ items, active, counts, onSelect, onHover }: Props) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Подкатегории">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={c.id === active}
          className={`${styles.tabs__item} ${c.id === active ? styles['tabs__item--active'] : ''}`}
          onClick={() => onSelect(c.id)}
          onMouseEnter={onHover}
        >
          {c.title}
          {counts[c.id] ? <span className={styles.tabs__count}>{counts[c.id]}</span> : null}
        </button>
      ))}
    </div>
  );
}

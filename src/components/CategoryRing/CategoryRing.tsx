'use client';

import type { CSSProperties } from 'react';
import { MY_SKILLS } from '@/core/selection';
import type { CategoryDef } from '@/core/types';
import { Tile } from '../Tile/Tile';
import styles from './CategoryRing.module.css';

interface Props {
  categories: CategoryDef[];
  active: string;
  counts: Record<string, number>;
  onSelect(id: string): void;
  onHover(): void;
}

export function CategoryRing({ categories, active, counts, onSelect, onHover }: Props) {
  const items = [...categories.map((c) => ({ id: c.id, title: c.title })), { id: MY_SKILLS, title: 'Мои скиллы' }];
  const step = 360 / items.length;

  return (
    <div className={styles.ring}>
      {items.map((c, i) => (
        <div
          key={c.id}
          className={styles.ring__slot}
          style={{ '--angle': `${-90 + i * step}deg` } as CSSProperties}
        >
          <Tile
            index={i}
            title={c.title}
            marker={c.id === MY_SKILLS ? '★' : undefined}
            selected={c.id === active}
            badge={counts[c.id] || undefined}
            onClick={() => onSelect(c.id)}
            onHover={onHover}
          />
        </div>
      ))}
    </div>
  );
}

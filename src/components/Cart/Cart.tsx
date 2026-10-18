'use client';

import { useState } from 'react';
import { summarizeByCategory } from '@/core/selection';
import type { CatalogSkill, CategoryDef, Project } from '@/core/types';
import { Tile } from '../Tile/Tile';
import styles from './Cart.module.css';

interface Props {
  project: Project | null;
  selected: CatalogSkill[];
  categories: CategoryDef[];
  busy: boolean;
  onRemove(id: string): void;
  onClear(): void;
  onInstall(): void;
}

export function Cart({ project, selected, categories, busy, onRemove, onClear, onInstall }: Props) {
  const [open, setOpen] = useState(false);
  const count = selected.length;
  const canInstall = project !== null && count > 0 && !busy;

  return (
    <footer className={styles.cart}>
      {open && count > 0 && (
        <div className={styles.cart__items}>
          {selected.map((s, i) => (
            <Tile key={s.id} index={i} title={s.title} marker="×" hint="Убрать из выбора" onClick={() => onRemove(s.id)} />
          ))}
          <Tile
            title="Очистить"
            index={count}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          />
        </div>
      )}
      <div className={styles.cart__bar}>
        <button type="button" className={styles.cart__summary} disabled={count === 0} onClick={() => setOpen((o) => !o)}>
          <span className={styles.cart__project}>{project ? `Проект: ${project.name}` : 'Выберите проект слева'}</span>
          <span className={styles.cart__counts}>
            {count > 0 ? `Выбрано: ${summarizeByCategory(selected, categories)} — нажмите, чтобы посмотреть` : 'Отметьте скиллы в круге'}
          </span>
        </button>
        <button type="button" className={styles.cart__install} disabled={!canInstall} onClick={onInstall}>
          {busy ? 'Устанавливаю…' : `Установить${count > 0 ? ` (${count})` : ''}`}
        </button>
      </div>
    </footer>
  );
}

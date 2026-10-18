'use client';

import { useEffect, useState } from 'react';
import { AGENT_LABEL, summarizeByCategory, type AgentChoice } from '@/core/selection';
import type { CatalogSkill, CategoryDef } from '@/core/types';
import { Tile } from '../Tile/Tile';
import styles from './Cart.module.css';

const AGENT_CHOICES: [AgentChoice, string][] = [
  ['claude', AGENT_LABEL.claude],
  ['codex', AGENT_LABEL.codex],
  ['both', 'Оба'],
];

interface Props {
  scopeLabel: string | null;
  agent: AgentChoice;
  onAgentChange(choice: AgentChoice): void;
  selected: CatalogSkill[];
  categories: CategoryDef[];
  busy: boolean;
  onRemove(id: string): void;
  onClear(): void;
  onInstall(): void;
}

export function Cart({ scopeLabel, agent, onAgentChange, selected, categories, busy, onRemove, onClear, onInstall }: Props) {
  const [open, setOpen] = useState(false);
  const count = selected.length;
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);
  const canInstall = scopeLabel !== null && count > 0 && !busy;

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
          <span className={styles.cart__project}>{scopeLabel ?? 'Выберите проект слева'}</span>
          <span className={styles.cart__counts}>
            {count > 0 ? `Выбрано: ${summarizeByCategory(selected, categories)} — нажмите, чтобы посмотреть` : 'Отметьте скиллы в круге'}
          </span>
        </button>
        <div className={styles.cart__agents} role="group" aria-label="Агент">
          {AGENT_CHOICES.map(([id, title]) => (
            <Tile key={id} className={styles.cart__agent} title={title} selected={agent === id} onClick={() => onAgentChange(id)} />
          ))}
        </div>
        <button type="button" className={styles.cart__install} disabled={!canInstall} onClick={onInstall}>
          {busy ? 'Устанавливаю…' : `Установить${count > 0 ? ` (${count})` : ''}`}
        </button>
      </div>
    </footer>
  );
}

'use client';

import { AGENT_LABEL } from '@/core/selection';
import type { InstalledSkill } from '@/core/types';
import { Icon } from '../Icon/Icon';
import { Tile, type TileProps } from '../Tile/Tile';
import styles from './InstalledTiles.module.css';

interface Props {
  items: InstalledSkill[];
  showAgent: boolean;
  loading: boolean;
  error?: string;
  onRemove(item: InstalledSkill): void;
  onUpdate(item: InstalledSkill): void;
  onHover(): void;
}

function subtitle(item: InstalledSkill): string {
  switch (item.kind) {
    case 'managed':
      return item.description;
    case 'synced':
      return 'синхронизировано с claude.ai';
    case 'plugin':
      return `плагин ${item.plugin ?? ''} — управляется через /plugin`;
    case 'system':
      return 'системный скилл Codex';
  }
}

function tileState(item: InstalledSkill): Pick<TileProps, 'marker' | 'tone' | 'disabled'> {
  if (item.kind !== 'managed') return { marker: <Icon name="lock" size={14} />, disabled: true };
  if (item.status === 'up-to-date') return { marker: '✓', tone: 'success' };
  if (item.status === 'outdated') return { marker: '↻', tone: 'warning' };
  return { marker: '•' };
}

export function InstalledTiles({ items, showAgent, loading, error, onRemove, onUpdate, onHover }: Props) {
  if (items.length === 0) {
    return (
      <div className={styles.installed}>
        <p className={styles.installed__empty}>{loading ? 'Загружаю…' : (error ?? 'Здесь пока ничего не установлено')}</p>
      </div>
    );
  }

  return (
    <div className={styles.installed}>
      {items.map((item, i) => {
        const sub = subtitle(item);
        const hint = showAgent ? `${AGENT_LABEL[item.agent]} · ${sub}` : sub;
        return (
          <div key={`${item.agent}:${item.kind}:${item.dir}`} className={styles.installed__item}>
            <Tile
              index={i}
              title={item.title}
              hint={hint}
              {...tileState(item)}
              onClick={item.kind === 'managed' && item.status === 'outdated' ? () => onUpdate(item) : undefined}
              onHover={onHover}
            />
            {item.kind === 'managed' && (
              <button
                type="button"
                className={styles.installed__remove}
                aria-label={`Удалить ${item.title}`}
                onClick={() => onRemove(item)}
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

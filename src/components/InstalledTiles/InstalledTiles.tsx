'use client';

import { AGENT_LABEL, installedLabel } from '@/core/selection';
import type { CatalogPack, CatalogSkill, InstalledSkill } from '@/core/types';
import { Icon } from '../Icon/Icon';
import { Tile, type TileProps } from '../Tile/Tile';
import styles from './InstalledTiles.module.css';

export interface InstalledGroup {
  pack: CatalogPack | null;
  items: InstalledSkill[];
}

interface Props {
  groups: InstalledGroup[];
  /** Каталог — названия и описания для своих скиллов */
  skills: CatalogSkill[];
  showAgent: boolean;
  loading: boolean;
  error?: string;
  onRemove(item: InstalledSkill): void;
  onRemovePack(pack: CatalogPack, items: InstalledSkill[]): void;
  onUpdate(item: InstalledSkill): void;
  onHover(): void;
}

function subtitle(item: InstalledSkill, description: string): string {
  switch (item.kind) {
    case 'managed':
      return description;
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

/** «.codex/skills» — две последние части пути папки. */
function shortRoot(root: string): string {
  return root.split(/[\\/]+/).filter(Boolean).slice(-2).join('/');
}

export function InstalledTiles({ groups, skills, showAgent, loading, error, onRemove, onRemovePack, onUpdate, onHover }: Props) {
  if (groups.length === 0) {
    return (
      <div className={styles.installed}>
        <p className={styles.installed__empty}>{loading ? 'Загружаю…' : (error ?? 'Здесь пока ничего не установлено')}</p>
      </div>
    );
  }

  // Одно имя в двух папках одного агента (~/.agents/skills и ~/.codex/skills) — подписываем папку.
  const seen = new Map<string, number>();
  for (const g of groups) for (const it of g.items) seen.set(`${it.agent}:${it.name}`, (seen.get(`${it.agent}:${it.name}`) ?? 0) + 1);

  let index = 0;
  const tile = (item: InstalledSkill) => {
    const label = installedLabel(item, skills);
    const parts = [
      showAgent ? AGENT_LABEL[item.agent] : null,
      (seen.get(`${item.agent}:${item.name}`) ?? 0) > 1 ? shortRoot(item.root) : null,
      subtitle(item, label.description),
    ].filter(Boolean);
    return (
      <div key={`${item.agent}:${item.kind}:${item.dir}`} className={styles.installed__item}>
        <Tile
          index={index++}
          title={label.title}
          hint={parts.join(' · ')}
          {...tileState(item)}
          onClick={item.kind === 'managed' && item.status === 'outdated' ? () => onUpdate(item) : undefined}
          onHover={onHover}
        />
        {item.kind === 'managed' && (
          <button
            type="button"
            className={styles.installed__remove}
            aria-label={`Удалить ${label.title}`}
            onClick={() => onRemove(item)}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.installed}>
      {groups.map((g) =>
        g.pack ? (
          <section key={g.pack.id} className={styles.installed__pack}>
            <header className={styles.installed__packHead}>
              <span className={styles.installed__packTitle} title={g.pack.title}>
                <span className={styles.installed__packName}>{g.pack.title}</span>
                <span className={styles.installed__packCount}>{g.items.length}</span>
              </span>
              <button
                type="button"
                className={styles.installed__packRemove}
                aria-label={`Удалить весь пак ${g.pack.title}`}
                onClick={() => onRemovePack(g.pack!, g.items)}
              >
                <Icon name="trash" size={13} /> Весь пак
              </button>
            </header>
            <div className={styles.installed__grid}>{g.items.map(tile)}</div>
          </section>
        ) : (
          <div key="loose" className={styles.installed__grid}>
            {g.items.map(tile)}
          </div>
        ),
      )}
    </div>
  );
}

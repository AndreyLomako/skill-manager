'use client';

import { useState } from 'react';
import { AGENT_LABEL, installedLabel, type InstalledGroup } from '@/core/selection';
import type { CatalogPack, CatalogSkill, InstalledSkill } from '@/core/types';
import { Icon } from '../Icon/Icon';
import { Tile, type TileProps } from '../Tile/Tile';
import styles from './InstalledTiles.module.css';

interface Props {
  groups: InstalledGroup[];
  /** Каталог — названия и описания для своих скиллов */
  skills: CatalogSkill[];
  showAgent: boolean;
  loading: boolean;
  error?: string;
  onRemove(item: InstalledSkill): void;
  onRemovePack(pack: CatalogPack, items: InstalledSkill[]): void;
  onRemovePlugin(group: InstalledGroup): void;
  onUpdate(item: InstalledSkill): void;
  onHover(): void;
}

// Чем управляет не приложение — подпись группы под заголовком.
const GROUP_HINT: Partial<Record<InstalledGroup['kind'], string>> = {
  plugin: 'плагин Claude Code',
  synced: 'синхронизируются с вашего аккаунта claude.ai',
  system: 'идут с Codex',
};

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

export function InstalledTiles({
  groups,
  skills,
  showAgent,
  loading,
  error,
  onRemove,
  onRemovePack,
  onRemovePlugin,
  onUpdate,
  onHover,
}: Props) {
  // Раскрытые служебные группы (плагины, claude.ai, системные) — по умолчанию свёрнуты.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });

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
      label.description,
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

  const hasOwn = groups.some((g) => g.kind === 'loose' || g.kind === 'pack');

  return (
    <div className={styles.installed}>
      {!hasOwn && <p className={styles.installed__note}>Своих скиллов здесь пока нет. Ниже — установленные другими программами.</p>}
      {groups.map((g) => {
        if (g.kind === 'loose') {
          return (
            <div key={g.key} className={styles.installed__grid}>
              {g.items.map(tile)}
            </div>
          );
        }
        if (g.kind === 'pack' && g.pack) {
          const pack = g.pack;
          return (
            <section key={g.key} className={styles.installed__pack}>
              <header className={styles.installed__packHead}>
                <span className={styles.installed__packTitle} title={pack.title}>
                  <span className={styles.installed__packName}>{pack.title}</span>
                  <span className={styles.installed__packCount}>{g.items.length}</span>
                </span>
                <button
                  type="button"
                  className={styles.installed__packRemove}
                  aria-label={`Удалить весь пак ${pack.title}`}
                  onClick={() => onRemovePack(pack, g.items)}
                >
                  <Icon name="trash" size={13} /> Весь пак
                </button>
              </header>
              <div className={styles.installed__grid}>{g.items.map(tile)}</div>
            </section>
          );
        }
        const expanded = open.has(g.key);
        const title = g.kind === 'plugin' ? `Плагин ${g.title}` : g.title;
        return (
          <section key={g.key} className={`${styles.installed__pack} ${styles.installed__foreign}`} data-group={g.key}>
            <header className={styles.installed__packHead}>
              <button
                type="button"
                className={styles.installed__groupToggle}
                aria-expanded={expanded}
                onClick={() => toggle(g.key)}
                onMouseEnter={onHover}
              >
                <span className={`${styles.installed__chevron} ${expanded ? styles['installed__chevron--open'] : ''}`} aria-hidden>
                  ▸
                </span>
                <span className={styles.installed__packName}>{title}</span>
                <span className={styles.installed__packCount}>{g.items.length}</span>
              </button>
              {g.kind === 'plugin' && g.pluginId ? (
                <button
                  type="button"
                  className={styles.installed__packRemove}
                  aria-label={`Удалить плагин ${g.title}`}
                  title="Удалить плагин целиком"
                  onClick={() => onRemovePlugin(g)}
                >
                  <Icon name="trash" size={13} /> Удалить
                </button>
              ) : (
                <span className={styles.installed__lock} title="Только для просмотра">
                  <Icon name="lock" size={13} />
                </span>
              )}
            </header>
            {expanded && (
              <>
                <p className={styles.installed__groupHint}>{GROUP_HINT[g.kind]}</p>
                <div className={styles.installed__grid}>{g.items.map(tile)}</div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

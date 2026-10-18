'use client';

import type { CatalogSkill, InstalledState } from '@/core/types';
import { Tile, type TileProps } from '../Tile/Tile';
import styles from './SkillTiles.module.css';

interface Props {
  skills: CatalogSkill[];
  selected: string[];
  installed: InstalledState;
  showAdd: boolean;
  onToggle(id: string): void;
  onUpdate(id: string): void;
  onAdd(): void;
  onHover(): void;
}

function tileState(
  skill: CatalogSkill,
  installed: InstalledState,
  isSelected: boolean,
): Pick<TileProps, 'marker' | 'tone' | 'disabled' | 'hint'> {
  if (skill.error) return { marker: '!', tone: 'error', disabled: true, hint: skill.error };
  const status = installed[skill.id];
  if (status === 'up-to-date') return { marker: '✓', tone: 'success', disabled: true, hint: 'Уже установлен в проекте' };
  if (status === 'outdated') return { marker: '↻', tone: 'warning', hint: 'Доступно обновление — нажмите, чтобы обновить' };
  return { marker: isSelected ? '◉' : '○', hint: skill.description || undefined };
}

export function SkillTiles({ skills, selected, installed, showAdd, onToggle, onUpdate, onAdd, onHover }: Props) {
  if (skills.length === 0 && !showAdd) {
    return (
      <div className={styles.skills}>
        <p className={styles.skills__empty}>В этой категории пока нет скиллов</p>
      </div>
    );
  }

  return (
    <div className={styles.skills}>
      {skills.map((s, i) => {
        const isSelected = selected.includes(s.id);
        return (
          <Tile
            key={s.id}
            index={i}
            title={s.title}
            {...tileState(s, installed, isSelected)}
            selected={isSelected}
            badge={s.layer === 'user' ? 'Мой' : undefined}
            onClick={() => (installed[s.id] === 'outdated' ? onUpdate(s.id) : onToggle(s.id))}
            onHover={onHover}
          />
        );
      })}
      {showAdd && (
        <Tile
          index={skills.length}
          title="Добавить скилл"
          marker="+"
          hint="Репозиторий GitHub или папка на компьютере"
          onClick={onAdd}
          onHover={onHover}
        />
      )}
    </div>
  );
}

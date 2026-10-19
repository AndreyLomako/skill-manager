'use client';

import { packState } from '@/core/selection';
import type { CatalogPack, CatalogSkill, InstalledState } from '@/core/types';
import { PackCard } from '../PackCard/PackCard';
import { SkillCard } from '../SkillCard/SkillCard';
import { SkillInfo } from '../SkillInfo/SkillInfo';
import { useSkillInfo } from '../SkillInfo/useSkillInfo';
import { Tile } from '../Tile/Tile';
import styles from './SkillTiles.module.css';

interface Props {
  skills: CatalogSkill[];
  packs: CatalogPack[];
  /** Все скиллы каталога — для состава паков */
  allSkills: CatalogSkill[];
  selected: string[];
  installed: InstalledState;
  showAdd: boolean;
  emptyText: string;
  onToggle(id: string): void;
  onTogglePack(pack: CatalogPack): void;
  onUpdate(id: string): void;
  onAdd(): void;
  onHover(): void;
}

export function SkillTiles({
  skills, packs, allSkills, selected, installed, showAdd, emptyText,
  onToggle, onTogglePack, onUpdate, onAdd, onHover,
}: Props) {
  const info = useSkillInfo();
  const infoSkill = info.open ? skills.find((s) => s.id === info.open) : undefined;

  if (skills.length === 0 && packs.length === 0 && !showAdd) {
    return (
      <div className={styles.skills}>
        <p className={styles.skills__empty}>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={styles.skills} onScroll={() => !info.pinned && info.dismiss()}>
      {packs.map((p, i) => (
        <PackCard
          key={p.id}
          pack={p}
          skills={allSkills}
          state={packState(p, selected, installed, allSkills)}
          selected={selected}
          installed={installed}
          index={i}
          onTogglePack={() => onTogglePack(p)}
          onToggleSkill={onToggle}
          onHover={onHover}
        />
      ))}
      {skills.map((s, i) => (
        <SkillCard
          key={s.id}
          skill={s}
          index={packs.length + i}
          selected={selected.includes(s.id)}
          status={installed[s.id]}
          active={info.open === s.id}
          onToggle={() => {
            info.cancel();
            onToggle(s.id);
          }}
          onUpdate={() => {
            info.cancel();
            onUpdate(s.id);
          }}
          onInfoEnter={(el) => info.enter(s.id, el)}
          onInfoLeave={info.leave}
          onInfoPin={(el) => info.pin(s.id, el)}
          onHover={onHover}
        />
      ))}
      {showAdd && (
        <Tile
          index={packs.length + skills.length}
          title="Добавить скилл"
          marker="+"
          hint="Репозиторий GitHub или папка на компьютере"
          className={styles.skills__add}
          onClick={onAdd}
          onHover={onHover}
        />
      )}
      {infoSkill && info.rect && (
        <SkillInfo
          skill={infoSkill}
          rect={info.rect}
          pinned={info.pinned}
          onClose={info.dismiss}
          onEnter={info.hold}
          onLeave={info.leave}
        />
      )}
    </div>
  );
}

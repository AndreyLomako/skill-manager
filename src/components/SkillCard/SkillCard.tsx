'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { AGENT_LABEL, commandChips } from '@/core/selection';
import type { AgentId, CatalogSkill, InstalledStatus } from '@/core/types';
import styles from './SkillCard.module.css';

const MAX_CHIPS = 3;

interface Props {
  skill: CatalogSkill;
  index: number;
  selected: boolean;
  status?: InstalledStatus;
  /** Подсветка: для этой карточки открыты подробности */
  active?: boolean;
  onToggle(): void;
  onUpdate(): void;
  onInfoEnter(el: HTMLElement): void;
  onInfoLeave(): void;
  onInfoPin(el: HTMLElement): void;
  onHover(): void;
}

type View = { marker: string; tone?: 'success' | 'warning' | 'error' | 'muted'; disabled?: boolean; note?: string };

function view(skill: CatalogSkill, selected: boolean, status?: InstalledStatus): View {
  if (skill.pending) return { marker: '…', tone: 'muted', disabled: true, note: 'Загружается…' };
  if (skill.error) return { marker: '!', tone: 'error', disabled: true, note: skill.error };
  if (status === 'up-to-date') return { marker: '✓', tone: 'success', disabled: true, note: 'Уже установлен' };
  if (status === 'outdated') return { marker: '↻', tone: 'warning', note: 'Есть обновление — нажмите' };
  return { marker: selected ? '◉' : '○' };
}

/** «только Claude», если копия есть не для всех агентов. */
function onlyFor(skill: CatalogSkill): string | null {
  const agents = Object.keys(skill.dirs) as AgentId[];
  return agents.length === 1 ? `только ${AGENT_LABEL[agents[0]]}` : null;
}

export function SkillCard({
  skill, index, selected, status, active = false,
  onToggle, onUpdate, onInfoEnter, onInfoLeave, onInfoPin, onHover,
}: Props) {
  const v = view(skill, selected, status);
  const { prefix, chips } = commandChips(skill.commands, MAX_CHIPS);
  const only = onlyFor(skill);
  const cls = [
    styles.card,
    selected && styles['card--selected'],
    v.disabled && styles['card--disabled'],
    v.tone && styles[`card--${v.tone}`],
    active && styles['card--active'],
  ]
    .filter(Boolean)
    .join(' ');

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'i' || e.key === 'ш') {
      e.preventDefault();
      onInfoPin(e.currentTarget.parentElement ?? e.currentTarget);
    }
  };

  return (
    <div
      className={cls}
      style={{ '--i': index } as CSSProperties}
      onMouseEnter={(e) => {
        onInfoEnter(e.currentTarget);
        if (!v.disabled) onHover();
      }}
      onMouseLeave={onInfoLeave}
    >
      <button
        type="button"
        className={styles.card__main}
        aria-pressed={selected}
        aria-disabled={v.disabled}
        onClick={v.disabled ? undefined : status === 'outdated' ? onUpdate : onToggle}
        onKeyDown={onKey}
      >
        <span className={styles.card__head}>
          <span className={styles.card__marker} aria-hidden="true">
            {v.marker}
          </span>
          <span className={styles.card__title}>{skill.title}</span>
          {skill.layer === 'user' && <span className={styles.card__badge}>Мой</span>}
        </span>
        <span className={styles.card__summary}>{v.note ?? skill.summary}</span>
        {chips.length > 0 && !v.note && (
          <span className={styles.card__chips}>
            {prefix && <code className={styles.card__prefix}>{prefix}</code>}
            {chips.map((c) => (
              <code key={c} className={styles.card__chip}>
                {c}
              </code>
            ))}
          </span>
        )}
        {only && !v.note && <span className={styles.card__only}>{only}</span>}
      </button>
      <button
        type="button"
        className={styles.card__info}
        aria-label={`Подробнее о ${skill.title}`}
        aria-expanded={active}
        onClick={(e) => onInfoPin(e.currentTarget.parentElement ?? e.currentTarget)}
      >
        i
      </button>
    </div>
  );
}

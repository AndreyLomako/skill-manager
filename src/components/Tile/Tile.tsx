'use client';

import type { CSSProperties, ReactNode } from 'react';
import styles from './Tile.module.css';

export interface TileProps {
  title: string;
  hint?: string;
  marker?: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'error';
  index?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  onHover?: () => void;
}

export function Tile({
  title, hint, marker, badge, selected = false, disabled = false, tone = 'default',
  index = 0, className, style, onClick, onHover,
}: TileProps) {
  const cls = [
    styles.tile,
    selected && styles['tile--selected'],
    disabled && styles['tile--disabled'],
    tone !== 'default' && styles[`tile--${tone}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      style={{ ...style, '--i': index } as CSSProperties}
      title={hint}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={disabled ? undefined : onHover}
    >
      {marker !== undefined && (
        <span className={styles.tile__marker} aria-hidden="true">
          {marker}
        </span>
      )}
      <span className={styles.tile__body}>
        <span className={styles.tile__title}>{title}</span>
        {hint && <span className={styles.tile__hint}>{hint}</span>}
      </span>
      {badge !== undefined && badge !== null && <span className={styles.tile__badge}>{badge}</span>}
    </button>
  );
}

'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AGENT_LABEL } from '@/core/selection';
import type { AgentId, CatalogSkill } from '@/core/types';
import styles from './SkillInfo.module.css';

const WIDTH = 340;
const GAP = 12;
const COPIED_MS = 1500;
const AGENTS = Object.keys(AGENT_LABEL) as AgentId[];

interface Props {
  skill: CatalogSkill;
  rect: DOMRect;
  pinned: boolean;
  onClose(): void;
  onEnter(): void;
  onLeave(): void;
}

/** Справа от карточки, если помещается, иначе слева; по вертикали — от верха карточки или снизу вверх. */
function place(rect: DOMRect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = rect.right + GAP + WIDTH <= vw - GAP ? rect.right + GAP : Math.max(GAP, rect.left - GAP - WIDTH);
  return rect.top < vh * 0.55
    ? { left, top: Math.max(GAP, rect.top), maxHeight: vh - Math.max(GAP, rect.top) - GAP }
    : { left, bottom: Math.max(GAP, vh - rect.bottom), maxHeight: rect.bottom - GAP };
}

export function SkillInfo({ skill, rect, pinned, onClose, onEnter, onLeave }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Закреплённый поповер закрывается кликом вне него.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [pinned, onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
    } catch {
      setCopied(null);
    }
  };

  const problem = skill.pending ? 'Источник загружается — карточка обновится сама.' : skill.error;

  return createPortal(
    <div
      ref={box}
      className={`${styles.info} ${pinned ? styles['info--pinned'] : ''}`}
      style={{ ...place(rect), width: WIDTH }}
      role="dialog"
      aria-label={`Подробнее: ${skill.title}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className={styles.info__head}>
        <h3 className={styles.info__title}>{skill.title}</h3>
        {pinned && (
          <button type="button" className={styles.info__close} aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {skill.summary && <p className={styles.info__summary}>{skill.summary}</p>}
      {problem && <p className={styles.info__problem}>{problem}</p>}

      {skill.commands.length > 0 && (
        <>
          <h4 className={styles.info__label}>Главные команды</h4>
          <ul className={styles.info__commands}>
            {skill.commands.map((c) => (
              <li key={c.cmd}>
                <button type="button" className={styles.info__command} onClick={() => void copy(c.cmd)} title="Скопировать">
                  <code>{c.cmd}</code>
                  <span>{copied === c.cmd ? 'Скопировано' : c.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          {skill.commandsMore > 0 && <p className={styles.info__more}>и ещё {skill.commandsMore} — список выдаст сам скилл</p>}
        </>
      )}

      <dl className={styles.info__meta}>
        <dt>Агенты</dt>
        <dd>
          {AGENTS.map((a) => (
            <span key={a} className={skill.dirs[a] ? styles.info__agent : `${styles.info__agent} ${styles['info__agent--off']}`}>
              {AGENT_LABEL[a]} {skill.dirs[a] ? '✓' : '—'}
            </span>
          ))}
        </dd>
        {skill.sourceLabel && (
          <>
            <dt>Источник</dt>
            <dd className={styles.info__source}>{skill.sourceLabel}</dd>
          </>
        )}
      </dl>

      {skill.homepage && (
        <a className={styles.info__link} href={skill.homepage} target="_blank" rel="noreferrer">
          Подробнее ↗
        </a>
      )}
    </div>,
    document.body,
  );
}

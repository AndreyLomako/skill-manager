'use client';

import styles from './Notice.module.css';

export interface NoticeData {
  tone: 'success' | 'error';
  title: string;
  lines: string[];
  hint?: string;
  action?: { label: string; onClick(): void };
}

interface Props {
  notice: NoticeData;
  busy?: boolean;
  onClose(): void;
}

export function Notice({ notice, busy = false, onClose }: Props) {
  return (
    <div className={`${styles.notice} ${styles[`notice--${notice.tone}`]}`} role="status" onClick={onClose}>
      <strong className={styles.notice__title}>{notice.title}</strong>
      <ul className={styles.notice__list}>
        {notice.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {notice.hint && <p className={styles.notice__hint}>{notice.hint}</p>}
      {notice.action && (
        <button
          type="button"
          className={styles.notice__action}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            notice.action?.onClick();
          }}
        >
          {notice.action.label}
        </button>
      )}
    </div>
  );
}

'use client';

import { useEffect, type ReactNode } from 'react';
import styles from './Dialog.module.css';

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.dialog}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog__panel} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className={styles.dialog__title}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

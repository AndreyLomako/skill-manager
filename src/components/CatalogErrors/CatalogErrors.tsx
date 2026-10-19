'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CatalogErrors.module.css';

/** Ошибки каталога — значок в шапке; список раскрывается по клику и не перекрывает круг. */
export function CatalogErrors({ errors }: { errors: string[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (errors.length === 0) return null;

  return (
    <div ref={box} className={styles.errors}>
      <button
        type="button"
        className={styles.errors__toggle}
        aria-expanded={open}
        title="Проблемы каталога"
        onClick={() => setOpen((x) => !x)}
      >
        ⚠ {errors.length}
      </button>
      {open && (
        <div className={styles.errors__panel} role="dialog" aria-label="Проблемы каталога">
          <p className={styles.errors__title}>Проблемы каталога</p>
          <ul className={styles.errors__list}>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className={styles.errors__hint}>Проверьте сеть и нажмите «Обновить каталог».</p>
        </div>
      )}
    </div>
  );
}

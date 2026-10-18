'use client';

import { useState } from 'react';
import { addUserSkillAction } from '@/app/actions';
import type { Catalog, CategoryDef } from '@/core/types';
import type { NewUserSkill } from '@/core/user-catalog';
import { Dialog } from '../Dialog/Dialog';
import { Tile } from '../Tile/Tile';
import styles from './AddSkillDialog.module.css';

const NEW_CATEGORY = '__new__';

interface Props {
  categories: CategoryDef[];
  onClose(): void;
  onAdded(catalog: Catalog): void;
  onError(): void;
}

export function AddSkillDialog({ categories, onClose, onAdded, onError }: Props) {
  const [kind, setKind] = useState<NewUserSkill['kind']>('git');
  const [location, setLocation] = useState('');
  const [ref, setRef] = useState('');
  const [skillPath, setSkillPath] = useState('');
  const [category, setCategory] = useState(categories[0]?.id ?? NEW_CATEGORY);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const isNew = category === NEW_CATEGORY;
    const res = await addUserSkillAction({
      kind,
      location,
      ref: kind === 'git' ? ref : undefined,
      skillPath,
      category: isNew ? '' : category,
      newCategoryTitle: isNew ? newTitle : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      onError();
      return;
    }
    if (!res.catalog.ok) {
      setError(res.catalog.error);
      onError();
      return;
    }
    onAdded(res.catalog.catalog);
  };

  return (
    <Dialog title="Добавить свой скилл" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={styles.form__row}>
          <Tile title="Репозиторий" hint="Ссылка на GitHub" selected={kind === 'git'} onClick={() => setKind('git')} />
          <Tile title="Папка на компьютере" index={1} selected={kind === 'local'} onClick={() => setKind('local')} />
        </div>

        <label className={styles.form__label}>
          {kind === 'git' ? 'Адрес репозитория' : 'Путь к папке'}
          <input
            className="glass-input"
            autoFocus
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={kind === 'git' ? 'https://github.com/owner/repo' : 'C:\\skills\\my-skill'}
          />
        </label>

        {kind === 'git' && (
          <label className={styles.form__label}>
            Ветка или тег
            <input className="glass-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="по умолчанию — основная ветка" />
          </label>
        )}

        <label className={styles.form__label}>
          Папка скилла внутри
          <input
            className="glass-input"
            value={skillPath}
            onChange={(e) => setSkillPath(e.target.value)}
            placeholder="skills/my-skill (пусто — корень)"
          />
        </label>

        <span className={styles.form__label}>Категория</span>
        <div className={styles.form__row}>
          {categories.map((c, i) => (
            <Tile key={c.id} index={i} title={c.title} selected={category === c.id} onClick={() => setCategory(c.id)} />
          ))}
          <Tile
            title="Новая категория"
            marker="+"
            index={categories.length}
            selected={category === NEW_CATEGORY}
            onClick={() => setCategory(NEW_CATEGORY)}
          />
        </div>
        {category === NEW_CATEGORY && (
          <input className="glass-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Название категории" />
        )}

        {error && <p className={styles.form__error}>{error}</p>}

        <div className={styles.form__actions}>
          <Tile
            title={busy ? 'Добавляю… клонирование может занять время' : 'Добавить'}
            marker="+"
            selected
            disabled={busy}
            onClick={() => void submit()}
          />
          <Tile title="Отмена" onClick={onClose} />
        </div>
      </form>
    </Dialog>
  );
}

import styles from './ErrorScreen.module.css';

export function ErrorScreen({ message }: { message: string }) {
  return (
    <main className={styles.error}>
      <div className={styles.error__panel}>
        <h1 className={styles.error__title}>Каталог не загружен</h1>
        <p className={styles.error__text}>{message}</p>
        <p className={styles.error__hint}>Проверьте файл catalog/catalog.json и перезапустите приложение.</p>
      </div>
    </main>
  );
}

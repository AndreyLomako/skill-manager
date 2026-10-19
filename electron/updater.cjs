'use strict';
// Обновления Skill Manager из GitHub Releases.
// auto   — Windows и AppImage: electron-updater сам скачивает версию и ставит её при перезапуске/выходе.
// notify — macOS без подписи и .deb: спрашиваем GitHub API о последнем релизе и предлагаем страницу загрузки.
// Ошибки проверки пишутся в <userData>/logs/updater.log и пользователю не показываются.
const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'Skill Manager';
const OWNER = 'AndreyLomako';
const REPO = 'skill-manager';
const LATEST_RELEASE_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Как обновляется эта копия приложения.
 * @param {{ platform: NodeJS.Platform, isPackaged: boolean, isAppImage: boolean }} o
 * @returns {'off' | 'auto' | 'notify'}
 */
function updateMode({ platform, isPackaged, isAppImage }) {
  if (!isPackaged) return 'off';
  if (platform === 'win32') return 'auto';
  if (platform === 'linux' && isAppImage) return 'auto';
  return 'notify';
}

/**
 * Запущена ли эта копия из AppImage. Одного APPIMAGE мало: переменная наследуется дочерними процессами,
 * и .deb, запущенный из терминала AppImage-программы, иначе получил бы режим auto, а electron-updater
 * (по resources/package-type) — DebUpdater с `pkexec dpkg -i` при выходе.
 * @param {{ env: Record<string, string | undefined>, execPath: string, hasPackageType: boolean }} o
 */
function isAppImageRun({ env, execPath, hasPackageType }) {
  if (hasPackageType || !env.APPIMAGE || !env.APPDIR) return false;
  return execPath.startsWith(`${env.APPDIR.replace(/\/+$/, '')}/`);
}

const VERSION_RE =/^v?(\d+)\.(\d+)\.(\d+)$/;

/** [major, minor, patch] или null, если строка — не версия вида 1.2.3 (с необязательным `v`). */
function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const m = VERSION_RE.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** true, только если обе строки — версии и `latest` строго новее `current`. */
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function describe(value) {
  if (value instanceof Error) return value.stack || value.message;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Логгер с интерфейсом { info, warn, error } — его же принимает electron-updater. */
function createLogger(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    // Нет доступа к папке логов — проверка обновлений всё равно работает, просто без журнала.
  }
  const write = (level) => (message) => {
    try {
      fs.appendFileSync(file, `[${new Date().toISOString()}] ${level} ${describe(message)}\n`);
    } catch {
      // Журнал не должен ронять приложение.
    }
  };
  return { info: write('INFO'), warn: write('WARN'), error: write('ERROR'), debug: write('DEBUG') };
}

/** Первая проверка через 10 с после старта, затем каждые 6 ч. */
function schedule(check) {
  setTimeout(() => {
    check();
    setInterval(check, CHECK_INTERVAL_MS).unref?.();
  }, FIRST_CHECK_DELAY_MS).unref?.();
}

function showBox(dialog, getWindow, options) {
  const win = getWindow();
  return win && !win.isDestroyed() ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function startAuto({ dialog, getWindow, log }) {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  // «Позже» — обновление ставится при следующем выходе из приложения.
  autoUpdater.autoInstallOnAppQuit = true;

  let shown = '';
  autoUpdater.on('error', (e) => log.error(`ошибка обновления: ${describe(e)}`));
  autoUpdater.on('update-downloaded', async (info) => {
    // Повторные проверки находят ту же скачанную версию — спрашиваем о ней один раз за запуск.
    if (info.version === shown) return;
    shown = info.version;
    try {
      const { response } = await showBox(dialog, getWindow, {
        type: 'info',
        title: APP_NAME,
        message: `Загружена версия ${info.version}. Перезапустить и обновить сейчас?`,
        buttons: ['Перезапустить', 'Позже'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      log.error(`диалог обновления: ${describe(e)}`);
    }
  });

  schedule(() => {
    autoUpdater
      .checkForUpdates()
      // Сбой загрузки уже записан обработчиком 'error'; без catch он стал бы необработанным отказом.
      .then((r) => r?.downloadPromise?.catch(() => {}))
      .catch((e) => log.error(`проверка обновлений: ${describe(e)}`));
  });
}

function startNotify({ dialog, shell, net, getWindow, log, currentVersion }) {
  let shown = '';
  const check = async () => {
    try {
      const res = await net.fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': APP_NAME },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`GitHub API ответил ${res.status}`);
      const release = await res.json();
      const latest = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
      if (!isNewer(latest, currentVersion)) {
        log.info(`обновлений нет: последняя ${release.tag_name}, текущая ${currentVersion}`);
        return;
      }
      if (latest === shown) return;
      shown = latest;
      log.info(`вышла версия ${latest}, текущая ${currentVersion}`);
      const page =
        typeof release.html_url === 'string' && release.html_url.startsWith(`https://github.com/${OWNER}/${REPO}/`)
          ? release.html_url
          : RELEASES_PAGE;
      const { response } = await showBox(dialog, getWindow, {
        type: 'info',
        title: APP_NAME,
        message: `Вышла версия ${latest}`,
        detail: `У вас установлена версия ${currentVersion}.`,
        buttons: ['Открыть страницу загрузки', 'Позже'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) await shell.openExternal(page);
    } catch (e) {
      log.error(`проверка обновлений: ${describe(e)}`);
    }
  };
  schedule(check);
}

/**
 * Запускает проверку обновлений в режиме, подходящем этой копии приложения.
 * В разработке SKILL_MANAGER_FAKE_VERSION=<версия> включает режим notify с подставленной текущей версией
 * (ручная проверка диалога).
 * @param {{ app: Electron.App, dialog: Electron.Dialog, shell: Electron.Shell, net: Electron.Net,
 *   getWindow: () => Electron.BrowserWindow | null, logDir: string }} deps
 */
function startUpdater({ app, dialog, shell, net, getWindow, logDir }) {
  const log = createLogger(path.join(logDir, 'updater.log'));
  try {
    const fakeVersion = app.isPackaged ? undefined : process.env.SKILL_MANAGER_FAKE_VERSION;
    const mode = fakeVersion
      ? 'notify'
      : updateMode({
          platform: process.platform,
          isPackaged: app.isPackaged,
          isAppImage:
            process.platform === 'linux' &&
            isAppImageRun({
              env: process.env,
              execPath: process.execPath,
              hasPackageType: fs.existsSync(path.join(process.resourcesPath, 'package-type')),
            }),
        });
    const currentVersion = fakeVersion || app.getVersion();
    log.info(`${APP_NAME} ${currentVersion} (${process.platform}), режим обновлений: ${mode}`);
    if (mode === 'auto') startAuto({ dialog, getWindow, log });
    else if (mode === 'notify') startNotify({ dialog, shell, net, getWindow, log, currentVersion });
  } catch (e) {
    log.error(`запуск обновлений: ${describe(e)}`);
  }
}

module.exports = { updateMode, isNewer, isAppImageRun, startUpdater };

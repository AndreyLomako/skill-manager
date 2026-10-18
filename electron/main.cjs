'use strict';
// Main-процесс Skill Manager: запускает Next standalone-сервер в utility-процессе и показывает его в окне.
const electron = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { resolveRuntime, findFreePort, envWithoutRunAsNode, serverEnv } = require('./paths.cjs');
const { startUpdater } = require('./updater.cjs');

// Запущены как Node (ELECTRON_RUN_AS_NODE=1 из терминала VS Code): require('electron') отдаёт строку.
// Перезапускаемся как приложение без этой переменной. В собранном приложении это отключено фьюзом runAsNode.
if (typeof electron === 'string' || !electron.app) {
  // Защита от бесконечного перезапуска, если и без переменной Electron не стал приложением.
  if (process.env.SKILL_MANAGER_RELAUNCHED) {
    console.error('Skill Manager: Electron запущен в режиме Node даже без ELECTRON_RUN_AS_NODE.');
    process.exit(1);
  }
  require('node:child_process')
    .spawn(process.execPath, process.argv.slice(1), {
      env: { ...envWithoutRunAsNode(process.env), SKILL_MANAGER_RELAUNCHED: '1' },
      detached: true,
      stdio: 'ignore',
    })
    .unref();
  process.exit(0);
}

const { app, BrowserWindow, Menu, dialog, net, shell, utilityProcess } = electron;

const APP_NAME = 'Skill Manager';
// 4317 занят режимом разработки и `npm run app`: старые вкладки Edge с той версией продолжают
// опрашивать свой порт, поэтому приложение берёт отдельный диапазон.
const PORT_FIRST = 4327;
const PORT_LAST = 4427;
const SERVER_TIMEOUT_MS = 30_000;
const BG_COLOR = '#12071f';

// Данные — в <appData>/Skill Manager независимо от имени пакета (и в разработке тоже):
// %APPDATA% на Windows, ~/Library/Application Support на macOS, ~/.config на Linux.
app.setName(APP_NAME);
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  /** @type {BrowserWindow | null} */
  let win = null;
  /** @type {Electron.UtilityProcess | null} */
  let server = null;
  let quitting = false;
  let failed = false;
  let logFile = '';

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  function killServer() {
    if (server) {
      const s = server;
      server = null;
      s.kill();
    }
  }

  function fail(message) {
    if (failed || quitting) return;
    failed = true;
    killServer();
    dialog.showErrorBox(APP_NAME, `${message}\n\nПодробности в журнале сервера:\n${logFile}`);
    app.exit(1);
  }

  const splashHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title>
<style>html,body{margin:0;height:100%;background:${BG_COLOR};color:rgba(238,240,255,.62);
font:15px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
body{background-image:radial-gradient(ellipse 70% 80% at 20% 85%,rgba(122,30,160,.55),transparent 60%),
radial-gradient(ellipse 60% 70% at 85% 15%,rgba(20,40,120,.55),transparent 60%),linear-gradient(120deg,#12071f,#3a1060 45%,#0c1538)}
</style></head><body>Запуск Skill Manager…</body></html>`;

  // Иконка окна нужна только при запуске из исходников: в установленном приложении Windows берёт её из exe,
  // Linux — из .desktop-файла, а у окон macOS иконки нет (в доке — иконка бандла).
  function devWindowIcon() {
    if (app.isPackaged) return undefined;
    if (process.platform === 'win32') return path.join(__dirname, '..', 'build', 'icon.ico');
    if (process.platform === 'linux') return path.join(__dirname, '..', 'build', 'icon.png');
    return undefined;
  }

  // macOS: без меню приложения не работают Cmd+Q и Cmd+C/V. На Windows и Linux меню скрыто (autoHideMenuBar).
  function setupMenu() {
    if (process.platform !== 'darwin') return;
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  }

  function createWindow(appOrigin) {
    win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 900,
      minHeight: 600,
      title: APP_NAME,
      backgroundColor: BG_COLOR,
      autoHideMenuBar: true,
      icon: devWindowIcon(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const isAppUrl = (url) => {
      try {
        return new URL(url).origin === appOrigin;
      } catch {
        return false;
      }
    };
    const openExternal = (url) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    };

    // Новые окна не открываем: внешние ссылки — в системном браузере.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!isAppUrl(url)) openExternal(url);
      return { action: 'deny' };
    });
    // Навигация только внутри http://127.0.0.1:<порт>.
    const lock = (event, url) => {
      if (isAppUrl(url)) return;
      event.preventDefault();
      openExternal(url);
    };
    win.webContents.on('will-navigate', lock);
    win.webContents.on('will-redirect', lock);

    win.on('closed', () => {
      win = null;
    });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  }

  function answers(url) {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(false));
    });
  }

  async function waitForServer(url) {
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (failed || quitting) return false;
      if (await answers(url)) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async function start() {
    setupMenu();
    const rt = resolveRuntime({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appRoot: path.join(__dirname, '..'),
      userData: app.getPath('userData'),
    });
    fs.mkdirSync(rt.logDir, { recursive: true });
    logFile = path.join(rt.logDir, 'server.log');
    const log = fs.createWriteStream(logFile, { flags: 'w' });
    log.write(`[${new Date().toISOString()}] ${APP_NAME} ${app.getVersion()}, сервер ${rt.serverJs}\n`);

    if (!fs.existsSync(rt.serverJs)) {
      fail(`Не найден сервер приложения: ${rt.serverJs}`);
      return;
    }

    let port;
    try {
      port = await findFreePort(PORT_FIRST, PORT_LAST);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      return;
    }
    const appUrl = `http://127.0.0.1:${port}`;
    log.write(`порт ${port}\n`);
    createWindow(new URL(appUrl).origin);

    server = utilityProcess.fork(rt.serverJs, [], {
      cwd: rt.serverCwd,
      stdio: 'pipe',
      serviceName: `${APP_NAME} Server`,
      env: {
        // Без ELECTRON_RUN_AS_NODE / NODE_OPTIONS из «грязного» терминала — они дошли бы до git и других дочерних процессов.
        ...serverEnv(process.env),
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        SKILL_MANAGER_PORT: String(port),
        SKILL_MANAGER_USER_DIR: rt.userDir,
        SKILL_MANAGER_CACHE_DIR: rt.cacheDir,
        SKILL_MANAGER_CATALOG_DIR: rt.catalogDir,
      },
    });
    server.stdout?.pipe(log, { end: false });
    server.stderr?.pipe(log, { end: false });
    server.on('exit', (code) => {
      log.write(`[${new Date().toISOString()}] сервер завершился, код ${code}\n`);
      if (server) {
        server = null;
        fail(`Сервер приложения неожиданно завершился (код ${code}).`);
      }
    });

    if (await waitForServer(appUrl)) {
      if (!win) return;
      // Обновления проверяем, когда интерфейс уже открыт: диалогу нужно окно, а запуску проверка не мешает.
      win
        .loadURL(appUrl)
        .catch((e) => log.write(`интерфейс не загрузился: ${e instanceof Error ? e.message : e}\n`))
        .finally(() => {
          if (!quitting && !failed) startUpdater({ app, dialog, shell, net, getWindow: () => win, logDir: rt.logDir });
        });
    } else {
      fail(`Сервер приложения не ответил за ${SERVER_TIMEOUT_MS / 1000} с.`);
    }
  }

  // Закрытие последнего окна завершает приложение на всех ОС, включая macOS: сервер живёт внутри приложения.
  app.on('window-all-closed', () => {
    quitting = true;
    killServer();
    app.quit();
  });
  app.on('will-quit', () => {
    quitting = true;
    killServer();
  });

  app.whenReady().then(start, (e) => fail(String(e)));
}

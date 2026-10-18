'use strict';
// Чистые функции main-процесса: где лежат сервер, каталог и данные; поиск свободного порта.
const net = require('node:net');
const path = require('node:path');

/**
 * @param {{ isPackaged: boolean, resourcesPath: string, appRoot: string, userData: string }} o
 */
function resolveRuntime({ isPackaged, resourcesPath, appRoot, userData }) {
  if (isPackaged) {
    const serverCwd = path.join(resourcesPath, 'app-server');
    return {
      serverCwd,
      serverJs: path.join(serverCwd, 'server.js'),
      catalogDir: path.join(resourcesPath, 'catalog'),
      userDir: path.join(userData, 'user'),
      cacheDir: path.join(userData, 'cache'),
      logDir: path.join(userData, 'logs'),
    };
  }
  // Разработка (`electron .`): standalone-сборка и данные репозитория, как у `npm run app`.
  const serverCwd = path.join(appRoot, '.next', 'standalone');
  return {
    serverCwd,
    serverJs: path.join(serverCwd, 'server.js'),
    catalogDir: path.join(appRoot, 'catalog'),
    userDir: path.join(appRoot, 'user'),
    cacheDir: path.join(appRoot, '.cache'),
    logDir: path.join(userData, 'logs'),
  };
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** Первый свободный порт на 127.0.0.1 в диапазоне [start, end]. */
async function findFreePort(start, end) {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Нет свободного порта в диапазоне ${start}–${end}`);
}

// Терминалы VS Code выставляют ELECTRON_RUN_AS_NODE=1, и Electron тогда стартует как голый Node.
function envWithoutRunAsNode(env) {
  const copy = { ...env };
  delete copy.ELECTRON_RUN_AS_NODE;
  return copy;
}

module.exports = { resolveRuntime, findFreePort, envWithoutRunAsNode };

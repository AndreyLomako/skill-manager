import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { resolveRuntime, findFreePort, envWithoutRunAsNode, serverEnv } = require('../../electron/paths.cjs') as {
  resolveRuntime: (o: { isPackaged: boolean; resourcesPath: string; appRoot: string; userData: string }) => Record<string, string>;
  findFreePort: (start: number, end: number) => Promise<number>;
  envWithoutRunAsNode: (env: Record<string, string | undefined>) => Record<string, string | undefined>;
  serverEnv: (env: Record<string, string | undefined>) => Record<string, string | undefined>;
};

describe('serverEnv', () => {
  it('убирает ELECTRON_RUN_AS_NODE, NODE_OPTIONS и маркер перезапуска', () => {
    expect(
      serverEnv({ ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--inspect', SKILL_MANAGER_RELAUNCHED: '1', PATH: 'C:\\bin' }),
    ).toEqual({ PATH: 'C:\\bin' });
  });
});

describe('envWithoutRunAsNode', () => {
  it('убирает ELECTRON_RUN_AS_NODE (терминал VS Code), остальное не трогает и не мутирует исходник', () => {
    const env = { ELECTRON_RUN_AS_NODE: '1', PATH: 'C:\\bin', APPDATA: 'C:\\a' };
    expect(envWithoutRunAsNode(env)).toEqual({ PATH: 'C:\\bin', APPDATA: 'C:\\a' });
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
  });
});

describe('resolveRuntime', () => {
  const base = {
    resourcesPath: 'C:\\Apps\\Skill Manager\\resources',
    appRoot: 'C:\\repo',
    userData: 'C:\\Users\\u\\AppData\\Roaming\\Skill Manager',
  };

  it('в установленном приложении берёт сервер и каталог из resources, данные — из userData', () => {
    expect(resolveRuntime({ ...base, isPackaged: true })).toEqual({
      serverCwd: path.join(base.resourcesPath, 'app-server'),
      serverJs: path.join(base.resourcesPath, 'app-server', 'server.js'),
      catalogDir: path.join(base.resourcesPath, 'catalog'),
      userDir: path.join(base.userData, 'user'),
      cacheDir: path.join(base.userData, 'cache'),
      logDir: path.join(base.userData, 'logs'),
    });
  });

  it('в разработке берёт standalone-сборку и папки репозитория', () => {
    expect(resolveRuntime({ ...base, isPackaged: false })).toEqual({
      serverCwd: path.join(base.appRoot, '.next', 'standalone'),
      serverJs: path.join(base.appRoot, '.next', 'standalone', 'server.js'),
      catalogDir: path.join(base.appRoot, 'catalog'),
      userDir: path.join(base.appRoot, 'user'),
      cacheDir: path.join(base.appRoot, '.cache'),
      logDir: path.join(base.userData, 'logs'),
    });
  });
});

describe('findFreePort', () => {
  const servers: net.Server[] = [];

  function occupy(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      servers.push(s);
      s.once('error', reject);
      s.listen(port, '127.0.0.1', () => resolve());
    });
  }

  function freeBasePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once('error', reject);
      s.listen(0, '127.0.0.1', () => {
        const { port } = s.address() as net.AddressInfo;
        s.close(() => resolve(port));
      });
    });
  }

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(undefined)))));
  });

  it('возвращает первый порт, если он свободен', async () => {
    const port = await freeBasePort();
    expect(await findFreePort(port, port + 10)).toBe(port);
  });

  it('пропускает занятый порт', async () => {
    const port = await freeBasePort();
    await occupy(port);
    const found = await findFreePort(port, port + 10);
    expect(found).toBeGreaterThan(port);
    expect(found).toBeLessThanOrEqual(port + 10);
  });

  it('падает, если все порты диапазона заняты', async () => {
    const port = await freeBasePort();
    await occupy(port);
    await expect(findFreePort(port, port)).rejects.toThrow(/порт/i);
  });
});

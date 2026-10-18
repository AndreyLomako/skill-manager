// Запуск Electron в разработке без ELECTRON_RUN_AS_NODE (его выставляют терминалы VS Code).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron'); // в Node-контексте пакет electron отдаёт путь к бинарнику
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ['.'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));

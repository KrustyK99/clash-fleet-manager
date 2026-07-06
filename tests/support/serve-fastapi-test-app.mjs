import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const runtimeApp = join(root, 'tests', 'runtime-app');
const runtimeData = join(runtimeApp, 'data');

const pythonCandidates = [
  process.env.PYTHON,
  join(root, '.venv', 'Scripts', 'python.exe'),
  join(root, '.venv', 'Scripts', 'python'),
  join(root, '.venv', 'bin', 'python'),
  'python',
  'py'
].filter(Boolean);

function resolvePythonCommand() {
  const localCandidate = pythonCandidates.find(candidate => candidate.includes(root) && existsSync(candidate));
  return localCandidate || pythonCandidates.find(candidate => !candidate.includes(root));
}

const pythonCommand = resolvePythonCommand();

let isStopping = false;

const child = spawn(
  pythonCommand,
  [
    '-m',
    'uvicorn',
    'backend.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    '8001'
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      FLEET_DATA_DIR: runtimeData,
      FLEET_SERVE_APP: '1',
      FLEET_APP_DIR: runtimeApp
    },
    stdio: 'inherit'
  }
);

function stopChild() {
  isStopping = true;
  if (!child.killed) {
    child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  stopChild();
});

process.on('SIGTERM', () => {
  stopChild();
});

child.on('exit', (code, signal) => {
  if (signal && !isStopping) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

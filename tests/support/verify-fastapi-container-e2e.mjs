import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const serviceName = 'fastapi-json';
const baseUrl = 'http://127.0.0.1:8001';
const readinessUrl = new URL('/', baseUrl).toString();
const readinessTimeoutMs = Number.parseInt(
  process.env.CONTAINER_E2E_READY_TIMEOUT_MS || '120000',
  10
);
const readinessIntervalMs = 2000;

const playwrightCli = join(
  root,
  'node_modules',
  '@playwright',
  'test',
  'cli.js'
);

let activeChild = null;
let cleanupStarted = false;
let containerStartAttempted = false;
let interruptedSignal = null;

class CommandError extends Error {
  constructor(command, args, code, signal) {
    const outcome = signal ? `signal ${signal}` : `exit code ${code}`;
    super(`${command} ${args.join(' ')} failed with ${outcome}.`);
    this.name = 'CommandError';
    this.command = command;
    this.args = args;
    this.code = code;
    this.signal = signal;
  }
}

function formatCommand(command, args) {
  return [command, ...args]
    .map(value => (value.includes(' ') ? JSON.stringify(value) : value))
    .join(' ');
}

function runCommand(command, args, options = {}) {
  const {
    env = process.env,
    allowFailure = false,
    announce = true
  } = options;

  if (announce) {
    console.log(`\n> ${formatCommand(command, args)}`);
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: false
    });

    activeChild = child;

    child.once('error', error => {
      if (settled) {
        return;
      }

      settled = true;
      activeChild = null;
      reject(error);
    });

    child.once('exit', (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      activeChild = null;

      if (code === 0 || allowFailure) {
        resolve({ code, signal });
        return;
      }

      reject(new CommandError(command, args, code, signal));
    });
  });
}

async function runBestEffort(command, args, label) {
  try {
    const result = await runCommand(command, args, {
      allowFailure: true,
      announce: false
    });

    if (result.code !== 0) {
      console.warn(`${label} returned exit code ${result.code}.`);
    }
  } catch (error) {
    console.warn(`${label} could not be completed: ${error.message}`);
  }
}

async function waitForContainer() {
  const deadline = Date.now() + readinessTimeoutMs;
  let attempt = 0;
  let lastError = null;

  console.log(`\nWaiting for the container at ${readinessUrl} ...`);

  while (Date.now() < deadline) {
    if (interruptedSignal) {
      throw new Error(`Verification interrupted by ${interruptedSignal}.`);
    }

    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(readinessUrl, {
        method: 'GET',
        signal: controller.signal
      });

      if (response.ok) {
        console.log(`Container is ready after ${attempt} check${attempt === 1 ? '' : 's'}.`);
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt === 1 || attempt % 10 === 0) {
      console.log(`Still waiting for ${readinessUrl} (attempt ${attempt}) ...`);
    }

    await delay(readinessIntervalMs);
  }

  const detail = lastError ? ` Last result: ${lastError.message}` : '';
  throw new Error(
    `Container did not become ready within ${readinessTimeoutMs} ms.${detail}`
  );
}

async function showContainerLogs() {
  if (!containerStartAttempted) {
    return;
  }

  console.error('\nFastAPI container logs:');
  await runBestEffort(
    'docker',
    ['compose', 'logs', '--no-color', serviceName],
    'Container log collection'
  );
}

async function cleanup() {
  if (cleanupStarted) {
    return;
  }

  cleanupStarted = true;
  console.log('\nStopping and removing the disposable FastAPI container ...');
  await runBestEffort(
    'docker',
    ['compose', 'down', '--remove-orphans'],
    'Container cleanup'
  );
}

function requestInterruption(signal) {
  if (interruptedSignal) {
    return;
  }

  interruptedSignal = signal;
  console.error(`\nReceived ${signal}; stopping verification and cleaning up.`);

  if (activeChild && !activeChild.killed) {
    activeChild.kill(signal);
  }
}

process.on('SIGINT', () => requestInterruption('SIGINT'));
process.on('SIGTERM', () => requestInterruption('SIGTERM'));

async function main() {
  let failure = null;

  try {
    console.log('FastAPI container E2E verification');
    console.log(`Service: ${serviceName}`);
    console.log(`Target:  ${baseUrl}`);

    // Remove a stale Compose instance before building so the test cannot
    // accidentally reuse an older container or older image.
    await runBestEffort(
      'docker',
      ['compose', 'down', '--remove-orphans'],
      'Initial container cleanup'
    );

    await runCommand('docker', ['compose', 'build', serviceName]);
    await runCommand(process.execPath, ['tests/support/prepare-test-app.mjs']);
    containerStartAttempted = true;
    await runCommand('docker', [
      'compose',
      'up',
      '-d',
      '--force-recreate',
      serviceName
    ]);
    await waitForContainer();

    // Keep the existing lightweight packaging smoke test as an early,
    // explicit checkpoint before running the complete browser suite.
    await runCommand(process.execPath, [
      'tests/support/verify-container-runtime.mjs',
      '--base-url',
      baseUrl
    ]);

    const testEnvironment = {
      ...process.env,
      APP_E2E_TARGET: 'fastapi',
      API_CONTRACT_TARGET: 'fastapi',
      API_CONTRACT_FASTAPI_BASE_URL: baseUrl,
      PLAYWRIGHT_REUSE_EXISTING_SERVER: '1'
    };

    if (!existsSync(playwrightCli)) {
      throw new Error(
        'Playwright is not installed. Run npm install before container verification.'
      );
    }

    await runCommand(
      process.execPath,
      [playwrightCli, 'test', '--reporter=line'],
      { env: testEnvironment }
    );

    if (interruptedSignal) {
      throw new Error(`Verification interrupted by ${interruptedSignal}.`);
    }

    console.log('\nFastAPI container E2E verification passed.');
  } catch (error) {
    failure = error;
    console.error(`\nFastAPI container E2E verification failed: ${error.message}`);
    await showContainerLogs();
  } finally {
    await cleanup();
  }

  if (failure) {
    process.exitCode = interruptedSignal === 'SIGINT'
      ? 130
      : interruptedSignal === 'SIGTERM'
        ? 143
        : 1;
  }
}

await main();

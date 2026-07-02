import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtime = join(root, 'tests', 'runtime-app');

rmSync(runtime, { recursive: true, force: true });

mkdirSync(join(runtime, 'data'), { recursive: true });

copyFileSync(join(root, 'index.html'), join(runtime, 'index.html'));
copyFileSync(join(root, 'api.php'), join(runtime, 'api.php'));

copyFileSync(
  join(root, 'tests', 'fixtures', 'data', 'timers.json'),
  join(runtime, 'data', 'timers.json')
);

copyFileSync(
  join(root, 'tests', 'fixtures', 'data', 'account_views.json'),
  join(runtime, 'data', 'account_views.json')
);

console.log(`Prepared disposable test app at ${runtime}`);

if (!existsSync(join(runtime, 'index.html'))) {
  throw new Error('Runtime index.html was not created.');
}

if (!existsSync(join(runtime, 'api.php'))) {
  throw new Error('Runtime api.php was not created.');
}
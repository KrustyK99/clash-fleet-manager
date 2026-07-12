import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtime = join(root, 'tests', 'runtime-app');

rmSync(runtime, { recursive: true, force: true });

mkdirSync(join(runtime, 'data'), { recursive: true });

copyFileSync(join(root, 'index.html'), join(runtime, 'index.html'));
copyFileSync(join(root, 'styles.css'), join(runtime, 'styles.css'));
copyFileSync(join(root, 'coc-data-map.js'), join(runtime, 'coc-data-map.js'));
copyFileSync(join(root, 'app-config.js'), join(runtime, 'app-config.js'));
copyFileSync(join(root, 'app-state.js'), join(runtime, 'app-state.js'));
copyFileSync(join(root, 'app-utils.js'), join(runtime, 'app-utils.js'));
copyFileSync(join(root, 'app-snapshot-meta.js'), join(runtime, 'app-snapshot-meta.js'));
copyFileSync(join(root, 'app-account-views.js'), join(runtime, 'app-account-views.js'));
copyFileSync(join(root, 'app-snapshot-meta-actions.js'), join(runtime, 'app-snapshot-meta-actions.js'));
copyFileSync(join(root, 'app-saved-views-ui.js'), join(runtime, 'app-saved-views-ui.js'));
copyFileSync(join(root, 'app-timer-entry-ui.js'), join(runtime, 'app-timer-entry-ui.js'));
copyFileSync(join(root, 'app-timer-entry-actions-ui.js'), join(runtime, 'app-timer-entry-actions-ui.js'));
copyFileSync(join(root, 'app-account-controls-ui.js'), join(runtime, 'app-account-controls-ui.js'));
copyFileSync(join(root, 'app-ui-layout.js'), join(runtime, 'app-ui-layout.js'));
copyFileSync(join(root, 'app-snapshot-import-ui.js'), join(runtime, 'app-snapshot-import-ui.js'));
copyFileSync(join(root, 'app-snapshot-collector-ui.js'), join(runtime, 'app-snapshot-collector-ui.js'));
copyFileSync(join(root, 'app-snapshot-import-actions.js'), join(runtime, 'app-snapshot-import-actions.js'));
copyFileSync(join(root, 'app-timer-filters.js'), join(runtime, 'app-timer-filters.js'));
copyFileSync(join(root, 'app-account-summary.js'), join(runtime, 'app-account-summary.js'));
copyFileSync(join(root, 'app-account-summary-ui.js'), join(runtime, 'app-account-summary-ui.js'));
copyFileSync(join(root, 'app-timer-filter-ui.js'), join(runtime, 'app-timer-filter-ui.js'));
copyFileSync(join(root, 'app-timer-list-actions-ui.js'), join(runtime, 'app-timer-list-actions-ui.js'));
copyFileSync(join(root, 'app-timer-lifecycle-actions.js'), join(runtime, 'app-timer-lifecycle-actions.js'));
copyFileSync(join(root, 'app-timer-runtime.js'), join(runtime, 'app-timer-runtime.js'));
copyFileSync(join(root, 'app-timer-card-ui.js'), join(runtime, 'app-timer-card-ui.js'));
copyFileSync(join(root, 'app-fleet-summary-ui.js'), join(runtime, 'app-fleet-summary-ui.js'));
copyFileSync(join(root, 'app-timer-list-render-ui.js'), join(runtime, 'app-timer-list-render-ui.js'));
copyFileSync(join(root, 'app-backup-io-ui.js'), join(runtime, 'app-backup-io-ui.js'));
copyFileSync(join(root, 'app-api-client.js'), join(runtime, 'app-api-client.js'));
copyFileSync(join(root, 'app-main.js'), join(runtime, 'app-main.js'));
copyFileSync(join(root, 'app-bootstrap.js'), join(runtime, 'app-bootstrap.js'));
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

if (!existsSync(join(runtime, 'styles.css'))) {
  throw new Error('Runtime styles.css was not created.');
}

if (!existsSync(join(runtime, 'coc-data-map.js'))) {
  throw new Error('Runtime coc-data-map.js was not created.');
}

if (!existsSync(join(runtime, 'app-config.js'))) {
  throw new Error('Runtime app-config.js was not created.');
}

if (!existsSync(join(runtime, 'app-state.js'))) {
  throw new Error('Runtime app-state.js was not created.');
}

if (!existsSync(join(runtime, 'app-utils.js'))) {
  throw new Error('Runtime app-utils.js was not created.');
}

if (!existsSync(join(runtime, 'app-snapshot-meta.js'))) {
  throw new Error('Runtime app-snapshot-meta.js was not created.');
}

if (!existsSync(join(runtime, 'app-account-views.js'))) {
  throw new Error('Runtime app-account-views.js was not created.');
}

if (!existsSync(join(runtime, 'app-snapshot-meta-actions.js'))) {
  throw new Error('Runtime app-snapshot-meta-actions.js was not created.');
}

if (!existsSync(join(runtime, 'app-saved-views-ui.js'))) {
  throw new Error('Runtime app-saved-views-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-entry-ui.js'))) {
  throw new Error('Runtime app-timer-entry-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-entry-actions-ui.js'))) {
  throw new Error('Runtime app-timer-entry-actions-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-account-controls-ui.js'))) {
  throw new Error('Runtime app-account-controls-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-ui-layout.js'))) {
  throw new Error('Runtime app-ui-layout.js was not created.');
}

if (!existsSync(join(runtime, 'app-snapshot-import-ui.js'))) {
  throw new Error('Runtime app-snapshot-import-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-snapshot-collector-ui.js'))) {
  throw new Error('Runtime app-snapshot-collector-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-snapshot-import-actions.js'))) {
  throw new Error('Runtime app-snapshot-import-actions.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-filters.js'))) {
  throw new Error('Runtime app-timer-filters.js was not created.');
}

if (!existsSync(join(runtime, 'app-account-summary.js'))) {
  throw new Error('Runtime app-account-summary.js was not created.');
}

if (!existsSync(join(runtime, 'app-account-summary-ui.js'))) {
  throw new Error('Runtime app-account-summary-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-filter-ui.js'))) {
  throw new Error('Runtime app-timer-filter-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-list-actions-ui.js'))) {
  throw new Error('Runtime app-timer-list-actions-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-lifecycle-actions.js'))) {
  throw new Error('Runtime app-timer-lifecycle-actions.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-runtime.js'))) {
  throw new Error('Runtime app-timer-runtime.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-card-ui.js'))) {
  throw new Error('Runtime app-timer-card-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-fleet-summary-ui.js'))) {
  throw new Error('Runtime app-fleet-summary-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-timer-list-render-ui.js'))) {
  throw new Error('Runtime app-timer-list-render-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-backup-io-ui.js'))) {
  throw new Error('Runtime app-backup-io-ui.js was not created.');
}

if (!existsSync(join(runtime, 'app-api-client.js'))) {
  throw new Error('Runtime app-api-client.js was not created.');
}

if (!existsSync(join(runtime, 'app-main.js'))) {
  throw new Error('Runtime app-main.js was not created.');
}

if (!existsSync(join(runtime, 'app-bootstrap.js'))) {
  throw new Error('Runtime app-bootstrap.js was not created.');
}

if (!existsSync(join(runtime, 'api.php'))) {
  throw new Error('Runtime api.php was not created.');
}
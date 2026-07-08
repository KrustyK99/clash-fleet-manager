const baseUrl = process.env.CONTAINER_BASE_URL || 'http://127.0.0.1:8001';

function request(path) {
  const url = new URL(path, baseUrl);

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:'
      ? import('node:https')
      : import('node:http');

    client
      .then(module => {
        const req = module.request(url, { method: 'GET' }, res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, body });
          });
        });

        req.on('error', reject);
        req.end();
      })
      .catch(reject);
  });
}

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(path) {
  const response = await request(path);
  assertOk(response.statusCode === 200, `${path} returned HTTP ${response.statusCode}`);

  try {
    return JSON.parse(response.body);
  } catch (error) {
    throw new Error(`${path} did not return valid JSON: ${error.message}`);
  }
}

const indexResponse = await request('/');
assertOk(indexResponse.statusCode === 200, `/ returned HTTP ${indexResponse.statusCode}`);
assertOk(indexResponse.body.includes('<!DOCTYPE html>') || indexResponse.body.includes('<html'), '/ did not look like the app HTML');

const timers = await readJson('/api.php?action=load');
assertOk(Array.isArray(timers.timers), '/api.php?action=load did not return a timers array');

const views = await readJson('/api.php?action=loadViews');
assertOk(Array.isArray(views.views), '/api.php?action=loadViews did not return a views array');

console.log(`Container smoke test passed at ${baseUrl}`);
console.log(`Timers loaded: ${timers.timers.length}`);
console.log(`Views loaded: ${views.views.length}`);

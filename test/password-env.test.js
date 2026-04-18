const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const WebSocket = require('ws');

const REPO_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_DIR, 'server.js');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPort(port, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = spawnSync('bash', ['-lc', `ss -tln | grep -q ':${port} '`], { encoding: 'utf8' });
    if (probe.status === 0) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

async function startServer(env) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: REPO_DIR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  await waitForPort(env.PORT, 10000);
  return { child, stderr: () => stderr };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await sleep(300);
  if (child.exitCode === null) child.kill('SIGKILL');
  await sleep(200);
}

function connectWs(port, password) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', password }));
    });
    ws.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      messages.push(msg);
      if (msg.type === 'auth_result' && msg.success) {
        resolve({ ws, messages, authResult: msg });
      } else if (msg.type === 'auth_result' && !msg.success) {
        reject(new Error('Auth failed'));
      }
    });
    ws.on('error', reject);
  });
}

function nextMessage(messages, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const idx = messages.findIndex(predicate);
      if (idx !== -1) {
        clearInterval(timer);
        resolve(messages.splice(idx, 1)[0]);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for message. Recent types: ${messages.slice(-10).map((m) => m.type).join(', ')}`));
      }
    }, 25);
  });
}

test('migrates legacy auth.json into the env file', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-env-migrate-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  const envFile = path.join(tempRoot, '.env');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const legacyPassword = 'Legacy!234';
  fs.writeFileSync(path.join(configDir, 'auth.json'), JSON.stringify({
    password: legacyPassword,
    mustChange: true,
  }, null, 2));

  const port = await getFreePort();
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: '',
    CC_WEB_PASSWORD_MUST_CHANGE: '',
    CC_WEB_ENV_FILE: envFile,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws;
  t.after(async () => {
    try { ws?.close(); } catch {}
    await stopServer(server.child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client = await connectWs(port, legacyPassword);
  ws = client.ws;
  assert.equal(client.authResult.mustChangePassword, true);

  const envContents = fs.readFileSync(envFile, 'utf8');
  assert.match(envContents, /^CC_WEB_PASSWORD=Legacy!234$/m);
  assert.match(envContents, /^CC_WEB_PASSWORD_MUST_CHANGE=true$/m);
  assert.equal(fs.existsSync(path.join(configDir, 'auth.json')), false);
});

test('changing the password rewrites the env file', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-env-change-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  const envFile = path.join(tempRoot, '.env');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  fs.writeFileSync(envFile, [
    'CC_WEB_PASSWORD=OldPass!234',
    'CC_WEB_PASSWORD_MUST_CHANGE=true',
    '',
  ].join('\n'));

  const port = await getFreePort();
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: '',
    CC_WEB_PASSWORD_MUST_CHANGE: '',
    CC_WEB_ENV_FILE: envFile,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws;
  t.after(async () => {
    try { ws?.close(); } catch {}
    await stopServer(server.child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client = await connectWs(port, 'OldPass!234');
  ws = client.ws;
  assert.equal(client.authResult.mustChangePassword, true);

  ws.send(JSON.stringify({
    type: 'change_password',
    currentPassword: 'OldPass!234',
    newPassword: 'NewPass!678$',
  }));

  const changed = await nextMessage(client.messages, (msg) => msg.type === 'password_changed');
  assert.equal(changed.success, true);

  const envContents = fs.readFileSync(envFile, 'utf8');
  assert.match(envContents, /^CC_WEB_PASSWORD=NewPass!678\$$/m);
  assert.match(envContents, /^CC_WEB_PASSWORD_MUST_CHANGE=false$/m);

  ws.close();
  ws = null;
  const reconnected = await connectWs(port, 'NewPass!678$');
  ws = reconnected.ws;
  assert.equal(reconnected.authResult.mustChangePassword, false);
});

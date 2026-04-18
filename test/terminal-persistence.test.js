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
        resolve({ ws, messages });
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

function readTerminalRegistry(sessionsDir) {
  const file = path.join(sessionsDir, '_terminals.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeDevConfig(configDir, config) {
  fs.writeFileSync(path.join(configDir, 'dev.json'), JSON.stringify(config, null, 2));
}

function cleanupTmuxSessions(sessionsDir) {
  const registryPath = path.join(sessionsDir, '_terminals.json');
  if (!fs.existsSync(registryPath)) return;
  const registry = readTerminalRegistry(sessionsDir);
  for (const terminal of Array.isArray(registry.terminals) ? registry.terminals : []) {
    if (!terminal.tmuxSession) continue;
    spawnSync('tmux', ['kill-session', '-t', terminal.tmuxSession], { stdio: 'ignore' });
  }
}

test('global terminals are listed and shared across clients', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-terminals-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const port = await getFreePort();
  const password = 'Terminal!234';
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws1;
  let ws2;
  t.after(async () => {
    try { ws1?.close(); } catch {}
    try { ws2?.close(); } catch {}
    await stopServer(server.child);
    cleanupTmuxSessions(sessionsDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client1 = await connectWs(port, password);
  ws1 = client1.ws;
  await nextMessage(client1.messages, (msg) => msg.type === 'session_list');
  ws1.send(JSON.stringify({ type: 'list_terminals' }));

  const initialList = await nextMessage(client1.messages, (msg) => msg.type === 'terminal_list');
  assert.equal(initialList.terminals.length, 1);
  assert.equal(initialList.terminals[0].title, '终端 1');

  ws1.send(JSON.stringify({ type: 'terminal_create', cwd: tempRoot }));
  const grownList = await nextMessage(client1.messages, (msg) => msg.type === 'terminal_list' && msg.terminals.length === 2);
  assert.equal(grownList.terminals[1].title, '终端 2');

  const client2 = await connectWs(port, password);
  ws2 = client2.ws;
  await nextMessage(client2.messages, (msg) => msg.type === 'session_list');
  ws2.send(JSON.stringify({ type: 'list_terminals' }));

  const mirroredList = await nextMessage(client2.messages, (msg) => msg.type === 'terminal_list');
  assert.deepEqual(
    mirroredList.terminals.map((item) => item.id),
    grownList.terminals.map((item) => item.id),
  );

  const registry = readTerminalRegistry(sessionsDir);
  assert.equal(registry.terminals.length, 2);
  assert.equal(registry.terminals[0].title, '终端 1');
  assert.equal(registry.terminals[1].title, '终端 2');
});

test('terminals survive a server restart', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-terminals-restart-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const port = await getFreePort();
  const password = 'Terminal!234';
  const env = {
    PORT: String(port),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  };

  let server = await startServer(env);
  let client = await connectWs(port, password);

  t.after(async () => {
    try { client.ws?.close(); } catch {}
    await stopServer(server.child);
    cleanupTmuxSessions(sessionsDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await nextMessage(client.messages, (msg) => msg.type === 'session_list');
  client.ws.send(JSON.stringify({ type: 'list_terminals' }));
  const terminalList = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list');
  const terminal = terminalList.terminals[0];
  const marker = `persist-${Date.now()}`;

  client.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);
  client.ws.send(JSON.stringify({ type: 'terminal_input', termId: terminal.id, data: `export CCWEB_PERSIST_MARK=${marker}\n` }));
  await sleep(250);

  await stopServer(server.child);
  server = await startServer(env);
  client = await connectWs(port, password);
  await nextMessage(client.messages, (msg) => msg.type === 'session_list');
  client.ws.send(JSON.stringify({ type: 'list_terminals' }));
  const restartedList = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list');
  assert.equal(restartedList.terminals[0].id, terminal.id);

  client.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);
  client.ws.send(JSON.stringify({ type: 'terminal_input', termId: terminal.id, data: 'printf "$CCWEB_PERSIST_MARK\\n"\n' }));

  const persistedOutput = await nextMessage(
    client.messages,
    (msg) => msg.type === 'terminal_output' && typeof msg.data === 'string' && msg.data.includes(marker),
    15000,
  );
  assert.ok(persistedOutput.data.includes(marker));
});

test('multiple clients see the same terminal output', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-terminals-sync-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const port = await getFreePort();
  const password = 'Terminal!234';
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws1;
  let ws2;
  t.after(async () => {
    try { ws1?.close(); } catch {}
    try { ws2?.close(); } catch {}
    await stopServer(server.child);
    cleanupTmuxSessions(sessionsDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client1 = await connectWs(port, password);
  ws1 = client1.ws;
  await nextMessage(client1.messages, (msg) => msg.type === 'session_list');
  client1.ws.send(JSON.stringify({ type: 'list_terminals' }));
  const termList = await nextMessage(client1.messages, (msg) => msg.type === 'terminal_list');
  const terminal = termList.terminals[0];

  const client2 = await connectWs(port, password);
  ws2 = client2.ws;
  await nextMessage(client2.messages, (msg) => msg.type === 'session_list');

  client1.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  client2.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  await nextMessage(client1.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);
  await nextMessage(client2.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);

  const marker = `sync-${Date.now()}`;
  client1.ws.send(JSON.stringify({ type: 'terminal_input', termId: terminal.id, data: `printf '${marker}\\n'\n` }));

  const client1Output = await nextMessage(
    client1.messages,
    (msg) => msg.type === 'terminal_output' && typeof msg.data === 'string' && msg.data.includes(marker),
    15000,
  );
  const client2Output = await nextMessage(
    client2.messages,
    (msg) => msg.type === 'terminal_output' && typeof msg.data === 'string' && msg.data.includes(marker),
    15000,
  );

  assert.ok(client1Output.data.includes(marker));
  assert.ok(client2Output.data.includes(marker));
});

test('terminals are scoped by host', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-terminals-hosts-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);
  writeDevConfig(configDir, {
    github: { token: '', repos: [] },
    ssh: {
      hosts: [{
        id: 'h_remote',
        name: 'Remote A',
        host: '192.0.2.10',
        port: 22,
        user: 'root',
        authType: 'key',
        identityFile: '',
        password: '',
        description: '',
      }],
    },
  });

  const port = await getFreePort();
  const password = 'Terminal!234';
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws;
  t.after(async () => {
    try { ws?.close(); } catch {}
    await stopServer(server.child);
    cleanupTmuxSessions(sessionsDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client = await connectWs(port, password);
  ws = client.ws;
  await nextMessage(client.messages, (msg) => msg.type === 'session_list');

  client.ws.send(JSON.stringify({ type: 'list_terminals', hostId: 'local' }));
  const localBefore = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list' && msg.hostId === 'local');
  assert.equal(localBefore.terminals.length, 1);

  client.ws.send(JSON.stringify({ type: 'terminal_create', hostId: 'h_remote' }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_created' && msg.terminal.hostId === 'h_remote', 15000);

  client.ws.send(JSON.stringify({ type: 'list_terminals', hostId: 'h_remote' }));
  const remoteList = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list' && msg.hostId === 'h_remote');
  assert.equal(remoteList.terminals.length, 1);
  assert.equal(remoteList.terminals[0].hostId, 'h_remote');

  client.ws.send(JSON.stringify({ type: 'list_terminals', hostId: 'local' }));
  const localAfter = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list' && msg.hostId === 'local');
  assert.equal(localAfter.terminals.length, 1);
  assert.equal(localAfter.terminals[0].hostId, 'local');
});

test('reattaching a terminal does not emit stale terminal_exit', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-terminals-reattach-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const port = await getFreePort();
  const password = 'Terminal!234';
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws;
  t.after(async () => {
    try { ws?.close(); } catch {}
    await stopServer(server.child);
    cleanupTmuxSessions(sessionsDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client = await connectWs(port, password);
  ws = client.ws;
  await nextMessage(client.messages, (msg) => msg.type === 'session_list');
  client.ws.send(JSON.stringify({ type: 'list_terminals', hostId: 'local' }));
  const terminalList = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list' && msg.hostId === 'local');
  const terminal = terminalList.terminals[0];

  client.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);

  client.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);

  const staleExit = client.messages.find((msg) => msg.type === 'terminal_exit' && msg.termId === terminal.id);
  assert.equal(staleExit, undefined);
});

test('active terminal stays writable after terminal list refresh', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-terminals-refresh-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const port = await getFreePort();
  const password = 'Terminal!234';
  const server = await startServer({
    PORT: String(port),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  });

  let ws;
  t.after(async () => {
    try { ws?.close(); } catch {}
    await stopServer(server.child);
    cleanupTmuxSessions(sessionsDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const client = await connectWs(port, password);
  ws = client.ws;
  await nextMessage(client.messages, (msg) => msg.type === 'session_list');
  client.ws.send(JSON.stringify({ type: 'list_terminals', hostId: 'local' }));
  const terminalList = await nextMessage(client.messages, (msg) => msg.type === 'terminal_list' && msg.hostId === 'local');
  const terminal = terminalList.terminals[0];

  client.ws.send(JSON.stringify({ type: 'terminal_attach', termId: terminal.id, cols: 80, rows: 24 }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_attached' && msg.termId === terminal.id);

  client.ws.send(JSON.stringify({ type: 'list_terminals', hostId: 'local' }));
  await nextMessage(client.messages, (msg) => msg.type === 'terminal_list' && msg.hostId === 'local');

  const marker = `refresh-${Date.now()}`;
  client.ws.send(JSON.stringify({ type: 'terminal_input', termId: terminal.id, data: `printf '${marker}\\n'\n` }));

  const writableOutput = await nextMessage(
    client.messages,
    (msg) => msg.type === 'terminal_output' && typeof msg.data === 'string' && msg.data.includes(marker),
    15000,
  );
  assert.ok(writableOutput.data.includes(marker));
});

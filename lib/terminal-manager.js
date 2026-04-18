const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const pty = require('node-pty');

const TERMINAL_SESSION_PREFIX = 'supertermal';
const MAX_TERMINALS = 32;

const activeTerminalViewers = new Map(); // wsId -> Map<termId, { ws, pty, cols, rows }>

let ctx = {
  plog: () => {},
  wsSend: () => {},
  wss: null,
  loadDevConfig: () => ({}),
  sanitizeId: (id) => String(id).replace(/[^a-zA-Z0-9\-]/g, ''),
  TERMINAL_REGISTRY_PATH: ''
};

function init(context) {
  ctx = { ...ctx, ...context };
}

function defaultTerminalRegistry() {
  return { version: 1, counter: 0, order: [], terminals: [] };
}

function getTerminalHosts() {
  const devConfig = ctx.loadDevConfig();
  const sshHosts = Array.isArray(devConfig.ssh?.hosts) ? devConfig.ssh.hosts : [];
  return [
    { id: 'local', name: '本机', type: 'local' },
    ...sshHosts.map((host) => ({
      id: String(host.id || '').trim(),
      name: String(host.name || host.host || '未命名主机').trim(),
      type: 'ssh',
      host: String(host.host || '').trim(),
      port: parseInt(host.port, 10) || 22,
      user: String(host.user || '').trim(),
      authType: host.authType === 'password' ? 'password' : 'key',
      identityFile: String(host.identityFile || '').trim(),
      password: String(host.password || ''),
      description: String(host.description || '').trim(),
    })).filter((host) => host.id && host.host),
  ];
}

function findTerminalHost(hostId) {
  const id = String(hostId || 'local').trim() || 'local';
  return getTerminalHosts().find((host) => host.id === id) || null;
}

function shellEscape(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function buildRemoteTerminalCommand(host, remoteCwd = '') {
  const sshTarget = `${host.user || 'root'}@${host.host}`;
  const remoteCommand = remoteCwd
    ? `cd ${shellEscape(remoteCwd)} && exec \${SHELL:-/bin/bash} -l`
    : '';
  if (host.authType === 'password') {
    return `exec sshpass -p ${shellEscape(host.password || '')} ssh -tt -o StrictHostKeyChecking=no -p ${host.port || 22} ${shellEscape(sshTarget)}${remoteCommand ? ` ${shellEscape(remoteCommand)}` : ''}`;
  }
  return `exec ssh -tt -o StrictHostKeyChecking=no -p ${host.port || 22}${host.identityFile ? ` -i ${shellEscape(host.identityFile)}` : ''} ${shellEscape(sshTarget)}${remoteCommand ? ` ${shellEscape(remoteCommand)}` : ''}`;
}

function resolveTerminalCwd(cwd) {
  let resolved = cwd || process.env.HOME || '/root';
  if (cwd) {
    try {
      if (!fs.statSync(cwd).isDirectory()) resolved = process.env.HOME || '/root';
    } catch {
      resolved = process.env.HOME || '/root';
    }
  }
  return resolved;
}

function buildTerminalLaunchSpec(hostId, cwd, remoteCwd = '') {
  const host = findTerminalHost(hostId);
  if (!host) throw new Error('目标 Host 不存在，请先在 Host 设置中保存');
  if (host.type === 'local') {
    const resolvedCwd = resolveTerminalCwd(cwd);
    return {
      hostId: 'local',
      hostName: host.name,
      cwd: resolvedCwd,
      tmuxCwd: resolvedCwd,
      commandArgs: [process.env.SHELL || '/bin/bash'],
    };
  }
  return {
    hostId: host.id,
    hostName: host.name,
    cwd: remoteCwd || `${host.user || 'root'}@${host.host}`,
    tmuxCwd: process.env.HOME || '/root',
    commandArgs: [process.env.SHELL || '/bin/bash', '-lc', buildRemoteTerminalCommand(host, remoteCwd)],
  };
}

function loadTerminalRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ctx.TERMINAL_REGISTRY_PATH, 'utf8'));
    const terminals = Array.isArray(parsed?.terminals) ? parsed.terminals.filter((item) => item && item.id) : [];
    const order = Array.isArray(parsed?.order) ? parsed.order.filter((id) => terminals.some((item) => item.id === id)) : [];
    for (const terminal of terminals) {
      if (!order.includes(terminal.id)) order.push(terminal.id);
    }
    return {
      version: 1,
      counter: Number.isFinite(parsed?.counter) ? parsed.counter : terminals.length,
      order,
      terminals: terminals.map((terminal) => ({
        id: String(terminal.id),
        title: String(terminal.title || '终端'),
        tmuxSession: String(terminal.tmuxSession || ''),
        hostId: String(terminal.hostId || 'local'),
        hostName: String(terminal.hostName || '本机'),
        cwd: String(terminal.cwd || process.env.HOME || '/root'),
        created: terminal.created || new Date().toISOString(),
        updated: terminal.updated || new Date().toISOString(),
        status: terminal.status === 'missing' ? 'missing' : 'running',
      })),
    };
  } catch {
    return defaultTerminalRegistry();
  }
}

function saveTerminalRegistry(registry) {
  fs.writeFileSync(ctx.TERMINAL_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function buildTmuxSessionName(id) {
  return `${TERMINAL_SESSION_PREFIX}-${ctx.sanitizeId(id).slice(0, 24)}`;
}

function tmuxCommand(args) {
  return spawnSync('tmux', args, { encoding: 'utf8' });
}

function tmuxHasSession(sessionName) {
  return tmuxCommand(['has-session', '-t', sessionName]).status === 0;
}

function createTmuxSession(sessionName, launchSpec) {
  const result = tmuxCommand(['new-session', '-d', '-s', sessionName, '-c', launchSpec.tmuxCwd, ...launchSpec.commandArgs]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'tmux new-session failed').trim());
  }
}

function killTmuxSession(sessionName) {
  tmuxCommand(['kill-session', '-t', sessionName]);
}

function syncTerminalRegistryStatus() {
  const registry = loadTerminalRegistry();
  let changed = false;
  for (const terminal of registry.terminals) {
    const nextStatus = terminal.tmuxSession && tmuxHasSession(terminal.tmuxSession) ? 'running' : 'missing';
    if (terminal.status !== nextStatus) {
      terminal.status = nextStatus;
      terminal.updated = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) saveTerminalRegistry(registry);
  return registry;
}

function orderedTerminals(hostId = 'local', registry = syncTerminalRegistryStatus()) {
  const lookup = new Map(registry.terminals.map((item) => [item.id, item]));
  return registry.order
    .map((id) => lookup.get(id))
    .filter((item) => item && String(item.hostId || 'local') === String(hostId || 'local'));
}

function sendTerminalList(ws, hostId = 'local') {
  if (ws) ws._ccTerminalHostId = hostId;
  ctx.wsSend(ws, { type: 'terminal_list', hostId, terminals: orderedTerminals(hostId) });
}

function broadcastTerminalList() {
  if (!ctx.wss) return;
  for (const client of ctx.wss.clients) {
    if (client.readyState === 1 && client._ccAuthenticated) {
      const hostId = client._ccTerminalHostId || 'local';
      client.send(JSON.stringify({ type: 'terminal_list', hostId, terminals: orderedTerminals(hostId) }));
    }
  }
}

function findTerminalById(termId) {
  const registry = syncTerminalRegistryStatus();
  const terminal = registry.terminals.find((item) => item.id === termId) || null;
  return { registry, terminal };
}

function ensureInitialTerminalRegistry() {
  if (fs.existsSync(ctx.TERMINAL_REGISTRY_PATH)) {
    syncTerminalRegistryStatus();
    return;
  }
  const registry = defaultTerminalRegistry();
  saveTerminalRegistry(registry);
  try {
    const cwd = resolveTerminalCwd(process.cwd());
    const termId = crypto.randomUUID();
    registry.counter = 1;
    registry.order = [termId];
    registry.terminals = [{
      id: termId,
      title: '终端 1',
      tmuxSession: buildTmuxSessionName(termId),
      hostId: 'local',
      hostName: '本机',
      cwd,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'running',
    }];
    createTmuxSession(registry.terminals[0].tmuxSession, {
      tmuxCwd: cwd,
      commandArgs: [process.env.SHELL || '/bin/bash'],
    });
    saveTerminalRegistry(registry);
  } catch (err) {
    ctx.plog('WARN', 'terminal_registry_init_error', { error: err.message });
  }
}

function terminalViewersForWs(wsId, create = false) {
  let viewers = activeTerminalViewers.get(wsId);
  if (!viewers && create) {
    viewers = new Map();
    activeTerminalViewers.set(wsId, viewers);
  }
  return viewers || null;
}

function terminalDetach(wsId, termId) {
  const viewers = terminalViewersForWs(wsId);
  if (!viewers) return;
  if (termId) {
    const entry = viewers.get(termId);
    if (entry?.pty) {
      entry.suppressOutput = true;
      entry.suppressExit = true;
      try { entry.pty.kill(); } catch {}
      viewers.delete(termId);
    }
  } else {
    for (const entry of viewers.values()) {
      if (entry?.pty) {
        entry.suppressOutput = true;
        entry.suppressExit = true;
        try { entry.pty.kill(); } catch {}
      }
    }
    viewers.clear();
  }
  if (viewers.size === 0) activeTerminalViewers.delete(wsId);
}

function terminalCreate(ws, msg) {
  const registry = loadTerminalRegistry();
  if (registry.terminals.length >= MAX_TERMINALS) {
    return ctx.wsSend(ws, { type: 'error', message: `终端数量已达上限 (${MAX_TERMINALS})` });
  }
  const termId = crypto.randomUUID();
  let launchSpec;
  try {
    launchSpec = buildTerminalLaunchSpec(msg?.hostId || 'local', msg?.cwd, msg?.remoteCwd || '');
  } catch (err) {
    return ctx.wsSend(ws, { type: 'error', message: err.message });
  }
  const title = String(msg?.title || '').trim() || `终端 ${registry.counter + 1}`;
  const tmuxSession = buildTmuxSessionName(termId);
  try {
    createTmuxSession(tmuxSession, launchSpec);
  } catch (err) {
    ctx.plog('WARN', 'terminal_create_error', { termId, hostId: launchSpec.hostId, error: err.message });
    return ctx.wsSend(ws, { type: 'error', message: `创建终端失败: ${err.message}` });
  }
  const terminal = {
    id: termId,
    title,
    tmuxSession,
    hostId: launchSpec.hostId,
    hostName: launchSpec.hostName,
    cwd: launchSpec.cwd,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    status: 'running',
  };
  registry.counter += 1;
  registry.order.push(termId);
  registry.terminals.push(terminal);
  saveTerminalRegistry(registry);
  ctx.plog('INFO', 'terminal_create', { termId, tmuxSession, hostId: terminal.hostId, cwd: terminal.cwd });
  ctx.wsSend(ws, { type: 'terminal_created', terminal });
  broadcastTerminalList();
}

function terminalAttach(ws, wsId, msg) {
  const termId = String(msg?.termId || '').trim();
  if (!termId) return ctx.wsSend(ws, { type: 'error', message: '缺少终端 ID' });
  const { terminal } = findTerminalById(termId);
  if (!terminal) return ctx.wsSend(ws, { type: 'error', message: '终端不存在' });
  if (terminal.status !== 'running') return ctx.wsSend(ws, { type: 'error', message: '终端会话已丢失，请关闭后重建' });

  terminalDetach(wsId, termId);

  const cols = Math.max(20, Number(msg?.cols) || 80);
  const rows = Math.max(8, Number(msg?.rows) || 24);
  try {
    const ptyProcess = pty.spawn('tmux', ['attach-session', '-d', '-t', terminal.tmuxSession], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: terminal.cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    const viewers = terminalViewersForWs(wsId, true);
    const viewerEntry = { ws, pty: ptyProcess, cols, rows, suppressOutput: false, suppressExit: false };
    viewers.set(termId, viewerEntry);
    ptyProcess.onData((data) => {
      if (!viewerEntry.suppressOutput && ws && ws.readyState === 1) {
        ctx.wsSend(ws, { type: 'terminal_output', termId, data });
      }
    });
    ptyProcess.onExit(({ exitCode }) => {
      const active = terminalViewersForWs(wsId);
      if (active) {
        active.delete(termId);
        if (active.size === 0) activeTerminalViewers.delete(wsId);
      }
      if (!viewerEntry.suppressExit && ws && ws.readyState === 1) {
        ctx.wsSend(ws, { type: 'terminal_exit', termId, exitCode });
      }
    });
    ctx.wsSend(ws, { type: 'terminal_attached', termId });
    ctx.plog('INFO', 'terminal_attach', { wsId, termId, tmuxSession: terminal.tmuxSession });
  } catch (err) {
    ctx.plog('WARN', 'terminal_attach_error', { wsId, termId, error: err.message });
    ctx.wsSend(ws, { type: 'error', message: `连接终端失败: ${err.message}` });
  }
}

function terminalInput(wsId, msg) {
  const termId = String(msg?.termId || '').trim();
  const viewers = terminalViewersForWs(wsId);
  const entry = viewers ? viewers.get(termId) : null;
  if (entry?.pty) entry.pty.write(msg.data || '');
}

function terminalResize(wsId, msg) {
  const termId = String(msg?.termId || '').trim();
  const viewers = terminalViewersForWs(wsId);
  const entry = viewers ? viewers.get(termId) : null;
  if (entry?.pty) {
    const cols = Math.max(20, Number(msg?.cols) || 80);
    const rows = Math.max(8, Number(msg?.rows) || 24);
    entry.pty.resize(cols, rows);
    entry.cols = cols;
    entry.rows = rows;
  }
}

function terminalRename(ws, msg) {
  const termId = String(msg?.termId || '').trim();
  const title = String(msg?.title || '').trim().slice(0, 80);
  if (!termId || !title) return ctx.wsSend(ws, { type: 'error', message: '缺少终端名称' });
  const registry = loadTerminalRegistry();
  const terminal = registry.terminals.find((item) => item.id === termId);
  if (!terminal) return ctx.wsSend(ws, { type: 'error', message: '终端不存在' });
  terminal.title = title;
  terminal.updated = new Date().toISOString();
  saveTerminalRegistry(registry);
  broadcastTerminalList();
}

function terminalClose(ws, msg) {
  const termId = String(msg?.termId || '').trim();
  if (!termId) return ctx.wsSend(ws, { type: 'error', message: '缺少终端 ID' });
  const registry = loadTerminalRegistry();
  const terminal = registry.terminals.find((item) => item.id === termId);
  if (!terminal) return ctx.wsSend(ws, { type: 'error', message: '终端不存在' });

  for (const [viewerWsId] of activeTerminalViewers) {
    terminalDetach(viewerWsId, termId);
  }
  if (terminal.tmuxSession) {
    try { killTmuxSession(terminal.tmuxSession); } catch {}
  }
  registry.order = registry.order.filter((id) => id !== termId);
  registry.terminals = registry.terminals.filter((item) => item.id !== termId);
  saveTerminalRegistry(registry);
  ctx.plog('INFO', 'terminal_close', { termId, tmuxSession: terminal.tmuxSession });
  broadcastTerminalList();
}

module.exports = {
  init,
  activeTerminalViewers,
  sendTerminalList,
  broadcastTerminalList,
  ensureInitialTerminalRegistry,
  terminalDetach,
  terminalCreate,
  terminalAttach,
  terminalInput,
  terminalResize,
  terminalRename,
  terminalClose
};

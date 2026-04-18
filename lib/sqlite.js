const { spawnSync } = require('child_process');

let cachedSupport = null;

function detectCliSupport() {
  const probe = spawnSync('sqlite3', ['-version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function detectNodeSupport() {
  try {
    const mod = require('node:sqlite');
    return typeof mod.DatabaseSync === 'function';
  } catch {
    return false;
  }
}

function sqliteSupport() {
  if (cachedSupport) return cachedSupport;
  const cli = detectCliSupport();
  const node = cli ? false : detectNodeSupport();
  cachedSupport = { cli, node, available: cli || node };
  return cachedSupport;
}

function sqliteExec(dbPath, statement) {
  const support = sqliteSupport();
  if (support.cli) {
    const result = spawnSync('sqlite3', [dbPath, statement], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `sqlite3 failed: ${statement}`);
    return result.stdout.trim();
  }
  if (support.node) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(statement);
      return '';
    } finally {
      db.close();
    }
  }
  throw new Error('SQLite support unavailable: neither sqlite3 CLI nor node:sqlite is available');
}

function sqliteScalar(dbPath, statement) {
  const support = sqliteSupport();
  if (support.cli) {
    const result = spawnSync('sqlite3', [dbPath, statement], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `sqlite3 failed: ${statement}`);
    return result.stdout.trim();
  }
  if (support.node) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    try {
      const row = db.prepare(statement).get();
      if (!row || typeof row !== 'object') return '';
      const firstValue = Object.values(row)[0];
      return firstValue == null ? '' : String(firstValue);
    } finally {
      db.close();
    }
  }
  throw new Error('SQLite support unavailable: neither sqlite3 CLI nor node:sqlite is available');
}

module.exports = {
  sqliteExec,
  sqliteScalar,
  sqliteSupport,
};

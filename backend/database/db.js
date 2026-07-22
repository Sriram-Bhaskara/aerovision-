// =====================================================
// Database Layer — SQLite via sql.js (pure JS, no native deps)
// PostgreSQL-compatible query wrapper
// =====================================================
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'aerovision.db');

let db = null;
let dbReady = null;

// Auto-save to disk every 5 seconds if dirty
let dirty = false;
function saveToDisk() {
  if (db && dirty) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    dirty = false;
  }
}
setInterval(saveToDisk, 5000);

// Initialize database
dbReady = initSqlJs().then(SQL => {
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
    console.log('[DB] SQLite database loaded via sql.js');
    return db;
  } catch (err) {
    console.error('[DB] Failed to load database:', err.message);
    db = new SQL.Database();
    return db;
  }
});

// PostgreSQL-compatible query wrapper
async function query(text, params = []) {
  if (!db) throw new Error('Database not initialized yet');

  // Convert $1, $2 style params to ? style
  let sql = text;
  let idx = 1;
  while (sql.includes(`$${idx}`)) {
    sql = sql.replace(`$${idx}`, '?');
    idx++;
  }

  // Adapt PG-specific syntax to SQLite
  sql = sql.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  sql = sql.replace(/UUID PRIMARY KEY DEFAULT uuid_generate_v4\(\)/g, 'TEXT PRIMARY KEY');
  sql = sql.replace(/UUID REFERENCES/g, 'TEXT REFERENCES');
  sql = sql.replace(/VARCHAR\(\d+\)/g, 'TEXT');
  sql = sql.replace(/TIMESTAMP WITH TIME ZONE/g, 'TEXT');
  sql = sql.replace(/DECIMAL\([^)]+\)/g, 'REAL');
  sql = sql.replace(/JSONB?/g, 'TEXT');
  sql = sql.replace(/BOOLEAN/g, 'INTEGER');
  sql = sql.replace(/NOW\(\)/g, "datetime('now')");
  sql = sql.replace(/CURRENT_DATE/g, "date('now')");
  // Convert INTERVAL arithmetic: date('now') - INTERVAL 'N days' → date('now', '-N days')
  sql = sql.replace(/date\('now'\)\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "date('now', '-$1 days')");
  sql = sql.replace(/date\('now'\)\s*\+\s*INTERVAL\s*'(\d+)\s*days?'/gi, "date('now', '+$1 days')");

  // Fix params — convert undefined/null properly for sql.js
  const safeParams = params.map(p => (p === undefined ? null : p));

  try {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      const stmt = db.prepare(sql);
      stmt.bind(safeParams);
      const rows = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push(row);
      }
      stmt.free();
      return { rows };

    } else if (trimmed.startsWith('INSERT') && sql.toUpperCase().includes('RETURNING')) {
      // Handle RETURNING clause — run insert then select
      const returningSql = sql.replace(/\s+RETURNING\s+.*/i, '');
      const returningCols = sql.match(/RETURNING\s+(.*)/i)?.[1]?.trim();
      db.run(returningSql, safeParams);
      dirty = true;

      if (returningCols) {
        const tableName = sql.match(/INSERT\s+INTO\s+(\w+)/i)?.[1];
        if (tableName) {
          const lastId = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0];
          if (lastId) {
            const stmt = db.prepare(`SELECT ${returningCols} FROM ${tableName} WHERE rowid = ?`);
            stmt.bind([lastId]);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            stmt.free();
            return { rows };
          }
        }
      }
      return { rows: [], rowCount: 1 };

    } else {
      db.run(sql, safeParams);
      dirty = true;
      const changes = db.getRowsModified();
      return { rows: [], rowCount: changes };
    }
  } catch (err) {
    if (err.message.includes('UNIQUE constraint') || err.message.includes('ON CONFLICT')) {
      return { rows: [], rowCount: 0 };
    }
    // Skip non-critical errors silently in some cases
    if (err.message.includes('no such table') || err.message.includes('already exists')) {
      console.warn('[DB] Warning:', err.message.substring(0, 80));
      return { rows: [], rowCount: 0 };
    }
    throw err;
  }
}

function getClient() { return { query, release: () => {} }; }

// Save on process exit
process.on('exit', saveToDisk);
process.on('SIGINT', () => { saveToDisk(); process.exit(); });

module.exports = { get db() { return db; }, query, getClient, pool: { query }, dbReady };

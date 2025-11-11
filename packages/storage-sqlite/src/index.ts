import Database from 'better-sqlite3';
import type { DbApi, PaymentRecord } from 'z402';

export function initSqliteDb(path: string): DbApi {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      signature  TEXT PRIMARY KEY,
      status     TEXT NOT NULL CHECK(status IN ('pending')),
      "from"     TEXT NOT NULL,
      "to"       TEXT NOT NULL,
      amount     TEXT NOT NULL,
      mint       TEXT,
      route      TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TRIGGER IF NOT EXISTS payments_updated_at
    AFTER UPDATE ON payments FOR EACH ROW
    BEGIN
      UPDATE payments SET updated_at = strftime('%s','now') WHERE signature = OLD.signature;
    END;
    CREATE INDEX IF NOT EXISTS idx_payments_pending
      ON payments(created_at)
      WHERE status='pending';
  `);

  const stmtInsertPending = db.prepare(`
    INSERT OR IGNORE INTO payments
      (signature, status, "from", "to", amount, mint, route)
    VALUES (?, 'pending', ?, ?, ?, ?, ?)
  `);
  const stmtRemove       = db.prepare(`DELETE FROM payments WHERE signature=?`);
  const stmtGet          = db.prepare(`SELECT * FROM payments WHERE signature=?`);
  const stmtGetIntent    = db.prepare(`
    SELECT * FROM payments
    WHERE "from"=? AND "to"=? AND COALESCE(mint,'') = COALESCE(?, '') AND route=?
  `);
  const stmtGetPending   = db.prepare(`SELECT * FROM payments WHERE status='pending'`);
  const stmtGetAll       = db.prepare(`SELECT * FROM payments`);

  const api: DbApi = {
    insert: {
      insertPending: { run: (signature, from, to, amount, mint, route) => { void stmtInsertPending.run(signature, from, to, amount, mint, route); } },
      remove:        { run: (signature) => { void stmtRemove.run(signature); } },
    },
    read: {
      raw: db as unknown,
      get:                { get:  (signature) => stmtGet.get(signature) as PaymentRecord | undefined },
      getFromToMintRoute: { all:  (from, to, mint, route) => stmtGetIntent.all(from, to, mint, route) as PaymentRecord[] },
      getPending:         { all:  () => stmtGetPending.all() as PaymentRecord[] },
      getAll:             { all:  () => stmtGetAll.all() as PaymentRecord[] },
    },
  };
  return api;
}

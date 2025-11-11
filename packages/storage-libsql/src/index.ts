import { createClient, type Client } from '@libsql/client';
import type { DbApi, PaymentRecord } from 'z402';

// Keep helpers/types first (strict TS friendliness)
type LibsqlRow = {
  signature: string;
  status: 'pending';
  from: string;
  to: string;
  amount: string;
  mint: string | null;
  route: string;
  created_at: number; // unix seconds (INTEGER)
  updated_at: number; // unix seconds (INTEGER)
};

const mapRow = (r: LibsqlRow): PaymentRecord => ({
  signature: r.signature,
  status: r.status,
  from: r.from,
  to: r.to,
  amount: r.amount,
  mint: r.mint,
  route: r.route,
  created_at: r.created_at,
});

const schema = `
CREATE TABLE IF NOT EXISTS payments (
  signature  TEXT PRIMARY KEY,
  status     TEXT NOT NULL CHECK(status IN ('pending')),
  "from"     TEXT NOT NULL,
  "to"       TEXT NOT NULL,
  amount     TEXT NOT NULL,
  mint       TEXT,
  route      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE TRIGGER IF NOT EXISTS payments_updated_at
AFTER UPDATE ON payments
BEGIN
  UPDATE payments SET updated_at = unixepoch('now') WHERE signature = OLD.signature;
END;

-- narrow index that only accelerates the boot scan
CREATE INDEX IF NOT EXISTS idx_payments_pending_created
  ON payments(created_at)
  WHERE status='pending';
`;

async function execSchema(db: Client, ddl: string) {
  const chunks = ddl.split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of chunks) {
    await db.execute(sql);
  }
}

export async function initLibsqlDb(opts: { url: string; authToken?: string }): Promise<DbApi> {
  const db: Client = createClient(opts);

  await execSchema(db, schema);

  return {
    insert: {
      insertPending: {
        run: async (signature, from, to, amount, mint, route) => {
          await db.execute({
            sql: `INSERT OR IGNORE INTO payments
                  (signature, status, "from", "to", amount, mint, route)
                  VALUES (?, 'pending', ?, ?, ?, ?, ?)`,
            args: [signature, from, to, amount, mint, route],
          });
        },
      },
      remove: {
        run: async (signature) => {
          await db.execute({ sql: `DELETE FROM payments WHERE signature=?`, args: [signature] });
        },
      },
    },
    read: {
      raw: db,
      get: {
        get: async (signature) => {
          const r = await db.execute({ sql: `SELECT * FROM payments WHERE signature=?`, args: [signature] });
          const row = (r.rows[0] as unknown as LibsqlRow | undefined);
          return row ? mapRow(row) : undefined;
        },
      },
      getFromToMintRoute: {
        all: async (from, to, mint, route) => {
          const r = await db.execute({
            sql: `SELECT * FROM payments
                  WHERE "from"=? AND "to"=? AND COALESCE(mint,'')=COALESCE(?, '') AND route=?`,
            args: [from, to, mint, route],
          });
          return (r.rows as unknown as LibsqlRow[]).map(mapRow);
        },
      },
      getPending: {
        all: async () => {
          const r = await db.execute(`SELECT * FROM payments WHERE status='pending'`);
          return (r.rows as unknown as LibsqlRow[]).map(mapRow);
        },
      },
      getAll: {
        all: async () => {
          const r = await db.execute(`SELECT * FROM payments`);
          return (r.rows as unknown as LibsqlRow[]).map(mapRow);
        },
      },
    },
  };
}

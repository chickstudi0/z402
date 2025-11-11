import type { DbApi, PaymentRecord } from 'z402';

const schema = `
CREATE TABLE IF NOT EXISTS payments (
  signature  TEXT PRIMARY KEY,
  status     TEXT NOT NULL CHECK (status IN ('pending')),
  "from"     TEXT NOT NULL,
  "to"       TEXT NOT NULL,
  amount     TEXT NOT NULL,
  mint       TEXT,
  route      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payments_updated_at') THEN
    CREATE TRIGGER payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_payments_pending_created
  ON payments (created_at)
  WHERE status = 'pending';
`;

type PgRow = {
  signature: string;
  status: 'pending';
  from: string;
  to: string;
  amount: string;
  mint: string | null;
  route: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapRow(r: PgRow): PaymentRecord {
  const created =
    typeof r.created_at === 'string'
      ? Math.floor(new Date(r.created_at).getTime() / 1000)
      : Math.floor((r.created_at as Date).getTime() / 1000);
  return { signature: r.signature, status: r.status, from: r.from, to: r.to, amount: r.amount, mint: r.mint, route: r.route, created_at: created };
}


type Driver = 'neon' | 'pg';

async function loadNeon() {
  try {
    const m = await import('@neondatabase/serverless');
    return m.neon as (url: string) => any;
  } catch {
    return undefined;
  }
}

async function loadPgPool() {
  try {
    const m = await import('pg');
    return m.Pool as new (cfg: any) => {
      query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
    };
  } catch {
    return undefined;
  }
}

export async function initPostgresDb(opts: { url: string; driver?: Driver; ssl?: boolean }): Promise<DbApi> {
  const { url, driver = "pg", ssl = true } = opts;

  if (driver === 'neon') {
    const neon = await loadNeon();
    if (!neon) throw new Error('To use driver="neon", add @neondatabase/serverless');

    const sql = neon(url);
    await sql(schema);

    const q = async <T = any>(strings: TemplateStringsArray, ...params: any[]) => {
      const rows = await sql(strings, ...params);
      return rows as T[];
    };

    return {
      insert: {
        insertPending: {
          run: async (signature, from, to, amount, mint, route) => {
            await q`
          INSERT INTO payments (signature, status, "from", "to", amount, mint, route)
          VALUES (${signature}, 'pending', ${from}, ${to}, ${amount}, ${mint}, ${route})
          ON CONFLICT (signature) DO NOTHING
        `;
          },
        },
        remove: { run: async (signature) => { await q`DELETE FROM payments WHERE signature=${signature}`; } },
      },
      read: {
        raw: sql,
        get: {
          get: async (signature) => {
            const rows = await q<PgRow>`SELECT * FROM payments WHERE signature=${signature}`;
            return rows[0] ? mapRow(rows[0]) : undefined;
          },
        },
        getFromToMintRoute: {
          all: async (from, to, mint, route) => {
            const rows = await q<PgRow>`
          SELECT * FROM payments
          WHERE "from"=${from} AND "to"=${to}
            AND COALESCE(mint,'') = COALESCE(${mint},'')
            AND route=${route}
        `;
            return rows.map(mapRow);
          },
        },
        getPending: {
          all: async () => {
            const rows = await q<PgRow>`SELECT * FROM payments WHERE status='pending'`;
            return rows.map(mapRow);
          },
        },
        getAll: {
          all: async () => {
            const rows = await q<PgRow>`SELECT * FROM payments`;
            return rows.map(mapRow);
          },
        },
      },
    };

  }

  // driver === 'pg'
  const Pool = await loadPgPool();
  if (!Pool) throw new Error('To use driver="pg", add pg');

  const pool = new Pool({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  await pool.query(schema);

  const q = async <T = any>(text: string, values: any[] = []) => {
    const { rows } = await pool.query(text, values);
    return rows as T[];
  };

  const r = async (text: string, values: any[] = []) => {
    const rows = await q<PgRow>(text, values);
    return rows.map(mapRow);
  };

  return {
    insert: {
      insertPending: {
        run: async (signature, from, to, amount, mint, route) => {
          await q(
            `INSERT INTO payments (signature, status, "from", "to", amount, mint, route)
             VALUES ($1,'pending',$2,$3,$4,$5,$6)
             ON CONFLICT (signature) DO NOTHING`,
            [signature, from, to, amount, mint, route]
          );
        },
      },
      remove: { run: async (signature) => { await q(`DELETE FROM payments WHERE signature=$1`, [signature]); } },
    },
    read: {
      raw: pool,
      get: {
        get: async (signature) =>
          (await r(`SELECT * FROM payments WHERE signature=$1`, [signature]))[0],
      },
      getFromToMintRoute: {
        all: async (from, to, mint, route) => {
          return await r(
            `SELECT * FROM payments
             WHERE "from"=$1 AND "to"=$2 AND COALESCE(mint,'')=COALESCE($3,'') AND route=$4`,
            [from, to, mint, route]
          );
        },
      },
      getPending: { all: async () => await r(`SELECT * FROM payments WHERE status='pending'`) },
      getAll: { all: async () => await r(`SELECT * FROM payments`) },
    },
  };
}


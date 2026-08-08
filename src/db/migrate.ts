/**
 * Migration runner — applies migrations/*.sql in order, tracked in
 * schema_migrations. Usage: DATABASE_URL=... npm run migrate
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

export async function runMigrations(pool: Pool, dir: string): Promise<string[]> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((r: { name: string }) => r.name),
  );
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      ran.push(f);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return ran;
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  runMigrations(pool, path.join(__dirname, '..', '..', 'migrations'))
    .then((ran) => {
      console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Nothing to apply — schema up to date.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

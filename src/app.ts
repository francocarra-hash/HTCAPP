/**
 * HTC Platform — application entry point.
 * Loads + validates + compiles the Canonical on startup (fail loudly),
 * then serves the REST API.
 */
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import { Pool } from 'pg';
import { loadCanonical } from './canonical/loader';
import { compileCanonical } from './canonical/compiler';
import { InMemoryRepository, Repository } from './db/repository';
import { PgRepository } from './db/pg-repository';
import { runMigrations } from './db/migrate';
import { createRouter } from './api/router';
import { createRouterV3, loadCompiledV3 } from './api/router-v3';
import { InMemoryV3Repository, PgV3Repository } from './v3/repository';
import { authEnabled } from './api/auth';
import { createAuthRouter, createStudentRouter, createTrainingRouter } from './api/router-training';
import { InMemoryTrainingRepository, PgTrainingRepository } from './training/repository';

const CANONICAL_DIR = process.env.HTC_CANONICAL_DIR ?? path.join(__dirname, '..', 'canonical');
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');
const PORT = Number(process.env.PORT ?? 3000);

/** v2 y v3 comparten la misma conexión: un solo pool por proceso. */
async function buildRepository(): Promise<{ repo: Repository; pool: Pool | null }> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL not set — using in-memory repository (data is lost on restart; NOT for the pilot)');
    return { repo: new InMemoryRepository(), pool: null };
  }
  const pool = new Pool({ connectionString: url, ssl: process.env.PGSSL === 'disable' ? undefined : { rejectUnauthorized: false } });
  const ran = await runMigrations(pool, path.join(__dirname, '..', 'migrations'));
  console.log(`[db] PostgreSQL connected${ran.length ? `; migrations applied: ${ran.join(', ')}` : '; schema up to date'}`);
  return { repo: new PgRepository(pool), pool };
}

async function main(): Promise<void> {
  const { canonical, warnings } = loadCanonical(CANONICAL_DIR);
  for (const w of warnings) console.warn(`[canonical] ${w.file} ${w.id}: ${w.message}`);
  const compiled = compileCanonical(canonical);
  console.log(`[canonical] loaded v${canonical.version}: ${canonical.domains.length} domains, ${canonical.capacities.length} capacities, ${canonical.tests.length} tests, ${canonical.standards.length} standards`);
  console.log(`[auth] ${authEnabled() ? 'coach login ENABLED' : 'DISABLED (set HTC_AUTH_PASSWORD to enable — required for any hosted deploy)'}`);

  const { repo, pool } = await buildRepository();
  const app = express();
  app.use(express.json());

  // ── HTC v3 (OS v3.0 — C-1..C-5 resueltos). Se monta antes que /api para
  // que /api/v3/* no quede capturado por el router v2.
  try {
    const compiledV3 = loadCompiledV3();
    for (const w of compiledV3.warnings) console.warn(`[canonical-v3] ${w}`);
    // Misma política que v2: PostgreSQL si hay DATABASE_URL, memoria si no.
    const repoV3 = pool ? new PgV3Repository(pool) : new InMemoryV3Repository();
    console.log(`[v3] persistencia: ${pool ? 'PostgreSQL' : 'in-memory (los datos se pierden al reiniciar)'}`);
    app.use('/api/v3', createRouterV3(compiledV3, repoV3));
    console.log(
      `[canonical-v3] cargado OS v${compiledV3.raw.versions.os_version}: ` +
      `${compiledV3.raw.domains.length} dominios, ${compiledV3.raw.tests.length} tests, ` +
      `${compiledV3.movementLevelsOrdered.length} niveles de Movement`,
    );
  } catch (e) {
    console.error(`[canonical-v3] NO disponible: ${e instanceof Error ? e.message : e}`);
  }

  // Alumnos y sesiones de entrenamiento. Login con rol (coach / alumno) antes que
  // el router v2, que tiene su propio /login de un solo usuario.
  const trainingRepo = pool ? new PgTrainingRepository(pool) : new InMemoryTrainingRepository();
  app.use('/api', createAuthRouter(trainingRepo));
  app.use('/api/training', createTrainingRouter(trainingRepo));
  app.use('/api/me', createStudentRouter(trainingRepo));

  // Single mount point: everything under /api (auth middleware guards it).
  app.use('/api', createRouter(compiled, repo));

  // Serve the coach frontend (web/dist) when built.
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
    console.log('[web] serving coach frontend from web/dist');
  }

  app.listen(PORT, () => console.log(`HTC Platform listening on :${PORT}`));
}

main().catch((err) => {
  console.error('Startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

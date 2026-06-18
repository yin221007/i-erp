import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabasePool } from './db.js';
import { runMigrations } from './migrations.js';
import { RESOURCE_NAMES } from './policies.js';

export async function ensureResourceTables(pool) {
  for (const resource of RESOURCE_NAMES) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`${resource}\` (
        id varchar(255) NOT NULL,
        json_data json DEFAULT NULL,
        created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);
  }
}

export async function startServer(environment = process.env) {
  const config = loadConfig(environment);
  const pool = createDatabasePool(config.db);

  await ensureResourceTables(pool);
  await runMigrations(pool);

  const app = createApp({ pool, config });
  const server = app.listen(config.port, () => {
    console.log(`i ERP Server running on port ${config.port}`);
  });
  server.timeout = 3_600_000;
  return { app, pool, server };
}

startServer().catch(error => {
  console.error('[System] Startup aborted:', error);
  process.exitCode = 1;
});

import express from 'express';
import { MIGRATION_VERSIONS } from '../migrations.js';

export function createHealthRouter({ pool }) {
  const router = express.Router();

  router.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/health/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1 AS ok');
      const [rows] = await pool.query(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      const applied = new Set(rows.map(row => row.version));
      const pendingMigrations = MIGRATION_VERSIONS.filter(
        version => !applied.has(version)
      );
      if (pendingMigrations.length > 0) {
        return res.status(503).json({
          status: 'not_ready',
          pendingMigrations
        });
      }
      return res.json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'not_ready' });
    }
  });

  return router;
}

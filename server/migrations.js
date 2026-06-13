import {
  hashPassword,
  isPasswordHash
} from './auth/passwords.js';

function parseJson(value, context) {
  if (value && typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON data in ${context}`);
  }
}

async function createSecurityTables(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      user_agent VARCHAR(512) NOT NULL DEFAULT '',
      ip_address VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME(3) NOT NULL,
      last_seen_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      absolute_expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
      KEY idx_auth_sessions_user (user_id),
      KEY idx_auth_sessions_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function migrateUserPasswords(connection, { passwordHasher }) {
  const [rows] = await connection.query(
    'SELECT id, json_data FROM users ORDER BY id FOR UPDATE'
  );

  for (const row of rows) {
    const user = parseJson(row.json_data, `users/${row.id}`);
    if (typeof user.password !== 'string' || isPasswordHash(user.password)) {
      continue;
    }

    user.password = await passwordHasher(user.password);
    await connection.query(
      'UPDATE users SET json_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(user), row.id]
    );
  }
}

async function normalizeProductionIds(connection) {
  const [rows] = await connection.query(
    'SELECT id, json_data FROM production ORDER BY id FOR UPDATE'
  );
  const claimedIds = new Map();
  const records = rows.map(row => {
    const record = parseJson(row.json_data, `production/${row.id}`);
    const stableId = record.id || record.projectId;
    if (typeof stableId !== 'string' || !stableId.trim()) {
      throw new Error(`Production record ${row.id} has no stable ID`);
    }

    const existingRow = claimedIds.get(stableId);
    if (existingRow && existingRow !== row.id) {
      throw new Error(
        `Duplicate production stable ID ${stableId} in ${existingRow} and ${row.id}`
      );
    }
    claimedIds.set(stableId, row.id);
    return { row, record, stableId };
  });

  for (const { row, record, stableId } of records) {
    if (record.id === stableId) continue;
    record.id = stableId;
    await connection.query(
      'UPDATE production SET json_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(record), row.id]
    );
  }
}

const MIGRATIONS = Object.freeze([
  {
    version: '001_create_security_tables',
    transactional: false,
    up: createSecurityTables
  },
  {
    version: '002_hash_user_passwords',
    transactional: true,
    up: migrateUserPasswords
  },
  {
    version: '003_normalize_production_ids',
    transactional: true,
    up: normalizeProductionIds
  }
]);

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL,
      applied_at DATETIME(3) NOT NULL,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function recordMigration(connection, version) {
  await connection.query(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, CURRENT_TIMESTAMP(3))',
    [version]
  );
}

export async function runMigrations(
  pool,
  { passwordHasher = hashPassword } = {}
) {
  const connection = await pool.getConnection();
  try {
    await ensureMigrationTable(connection);
    const [rows] = await connection.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const applied = new Set(rows.map(row => row.version));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;

      if (migration.transactional) {
        await connection.beginTransaction();
      }

      try {
        await migration.up(connection, { passwordHasher });
        await recordMigration(connection, migration.version);
        if (migration.transactional) await connection.commit();
      } catch (error) {
        if (migration.transactional) await connection.rollback();
        throw new Error(
          `Migration ${migration.version} failed: ${error.message}`,
          {
          cause: error
          }
        );
      }
    }
  } finally {
    connection.release();
  }
}

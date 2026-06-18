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

async function createAiTables(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id VARCHAR(64) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      model_id VARCHAR(128) NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      reasoning TINYINT(1) NOT NULL DEFAULT 0,
      context_limit INT UNSIGNED NOT NULL,
      max_output_tokens INT UNSIGNED NOT NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ai_models_provider_model (provider, model_id),
      KEY idx_ai_models_enabled_sort (enabled, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      model_id VARCHAR(64) NOT NULL,
      prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0,
      completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL,
      error_code VARCHAR(64) NULL,
      started_at DATETIME(3) NOT NULL,
      completed_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      KEY idx_ai_usage_user_started (user_id, started_at),
      KEY idx_ai_usage_model_started (model_id, started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const defaultModels = [
    [
      'deepseek-v4-flash',
      'deepseek',
      'deepseek-v4-flash',
      'DeepSeek V4 Flash',
      1,
      1,
      1_000_000,
      384_000,
      10
    ],
    [
      'deepseek-v4-pro',
      'deepseek',
      'deepseek-v4-pro',
      'DeepSeek V4 Pro',
      1,
      1,
      1_000_000,
      384_000,
      20
    ]
  ];
  for (const model of defaultModels) {
    await connection.query(
      `INSERT IGNORE INTO ai_models (
        id,
        provider,
        model_id,
        display_name,
        enabled,
        reasoning,
        context_limit,
        max_output_tokens,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      model
    );
  }
}

async function createSystemSecretsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS system_secrets (
      name VARCHAR(64) NOT NULL,
      ciphertext TEXT NOT NULL,
      iv VARCHAR(64) NOT NULL,
      auth_tag VARCHAR(64) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function createMaintenanceJobsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS maintenance_jobs (
      id CHAR(36) NOT NULL,
      requested_by VARCHAR(255) NOT NULL,
      operation VARCHAR(16) NOT NULL,
      backup_id VARCHAR(64) NULL,
      status VARCHAR(32) NOT NULL,
      phase VARCHAR(80) NOT NULL,
      message VARCHAR(500) NOT NULL,
      requested_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      KEY idx_maintenance_jobs_requested (requested_by, requested_at),
      KEY idx_maintenance_jobs_status (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function seedMiniMaxModel(connection) {
  await connection.query(
    `INSERT IGNORE INTO ai_models (
      id,
      provider,
      model_id,
      display_name,
      enabled,
      reasoning,
      context_limit,
      max_output_tokens,
      sort_order,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    [
      'minimax-m3',
      'minimax',
      'MiniMax-M3',
      'MiniMax M3',
      1,
      1,
      1_000_000,
      128_000,
      30
    ]
  );
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
  },
  {
    version: '004_create_ai_tables',
    transactional: false,
    up: createAiTables
  },
  {
    version: '005_create_system_secrets',
    transactional: false,
    up: createSystemSecretsTable
  },
  {
    version: '006_create_maintenance_jobs',
    transactional: false,
    up: createMaintenanceJobsTable
  },
  {
    version: '007_seed_minimax_model',
    transactional: false,
    up: seedMiniMaxModel
  }
]);

export const MIGRATION_VERSIONS = Object.freeze(
  MIGRATIONS.map(migration => migration.version)
);

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

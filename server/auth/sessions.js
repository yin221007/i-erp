import {
  createHash,
  randomBytes,
  randomUUID
} from 'node:crypto';

export const SESSION_COOKIE_NAME = 'ierp_session';
export const SESSION_IDLE_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function parseUser(value) {
  if (value && typeof value === 'object') return value;
  return JSON.parse(value);
}

export async function createSession(
  pool,
  userId,
  { userAgent = '', ipAddress = '', now = new Date() } = {}
) {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_IDLE_MILLISECONDS);
  const absoluteExpiresAt = new Date(
    now.getTime() + SESSION_ABSOLUTE_MILLISECONDS
  );

  await pool.query(
    `INSERT INTO auth_sessions (
      id,
      token_hash,
      user_id,
      user_agent,
      ip_address,
      created_at,
      last_seen_at,
      expires_at,
      absolute_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tokenHash,
      userId,
      String(userAgent).slice(0, 512),
      String(ipAddress).slice(0, 64),
      now,
      now,
      expiresAt,
      absoluteExpiresAt
    ]
  );

  return { id, token, expiresAt, absoluteExpiresAt };
}

export async function findSessionByToken(pool, token, now = new Date()) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const [rows] = await pool.query(
    `SELECT
      sessions.id AS session_id,
      sessions.expires_at,
      sessions.absolute_expires_at,
      users.json_data
    FROM auth_sessions AS sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
      AND sessions.absolute_expires_at > ?
    LIMIT 1`,
    [tokenHash, now, now]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const absoluteExpiresAt = new Date(row.absolute_expires_at);
  const slidingExpiresAt = new Date(now.getTime() + SESSION_IDLE_MILLISECONDS);
  const expiresAt = new Date(
    Math.min(slidingExpiresAt.getTime(), absoluteExpiresAt.getTime())
  );

  await pool.query(
    `UPDATE auth_sessions
    SET last_seen_at = ?, expires_at = ?
    WHERE id = ?`,
    [now, expiresAt, row.session_id]
  );

  return {
    id: row.session_id,
    tokenHash,
    expiresAt,
    absoluteExpiresAt,
    user: parseUser(row.json_data)
  };
}

export async function revokeSessionByToken(pool, token, now = new Date()) {
  if (typeof token !== 'string' || token.length === 0) return;
  await pool.query(
    `UPDATE auth_sessions
    SET revoked_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL`,
    [now, hashSessionToken(token)]
  );
}

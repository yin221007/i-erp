import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';

const ENCRYPTION_CONTEXT = 'ierp:system-secrets:v1';

function validateMasterSecret(masterSecret) {
  if (typeof masterSecret !== 'string' || masterSecret.length < 32) {
    throw new Error('System secret encryption key is invalid');
  }
}

function validateName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9_]{1,64}$/.test(name)) {
    throw new Error('System secret name is invalid');
  }
}

function deriveEncryptionKey(masterSecret) {
  validateMasterSecret(masterSecret);
  return createHash('sha256')
    .update(ENCRYPTION_CONTEXT)
    .update('\0')
    .update(masterSecret)
    .digest();
}

export async function readSystemSecret(pool, name, masterSecret) {
  validateName(name);
  const [rows] = await pool.query(
    `SELECT ciphertext, iv, auth_tag
     FROM system_secrets
     WHERE name = ?
     LIMIT 1`,
    [name]
  );
  if (!rows[0]) return null;

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(masterSecret),
    Buffer.from(rows[0].iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(rows[0].auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(rows[0].ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export async function writeSystemSecret(
  pool,
  name,
  plaintext,
  masterSecret
) {
  validateName(name);
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('System secret value is invalid');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(masterSecret),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  await pool.query(
    `INSERT INTO system_secrets (
      name,
      ciphertext,
      iv,
      auth_tag,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      ciphertext = VALUES(ciphertext),
      iv = VALUES(iv),
      auth_tag = VALUES(auth_tag),
      updated_at = CURRENT_TIMESTAMP(3)`,
    [
      name,
      ciphertext.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64')
    ]
  );
}

export async function deleteSystemSecret(pool, name) {
  validateName(name);
  await pool.query('DELETE FROM system_secrets WHERE name = ?', [name]);
}

export function maskSecret(secret) {
  if (typeof secret !== 'string' || secret.length === 0) return '';
  return `********${secret.slice(-4)}`;
}

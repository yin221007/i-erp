import { randomUUID } from 'node:crypto';
import { getResourceDefinition } from '../policies.js';

function parseJson(value, context) {
  if (value && typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON data in ${context}`);
  }
}

function assertRecyclableResource(resource) {
  if (!getResourceDefinition(resource) || resource === 'recycle_bin') {
    const error = new Error('Resource cannot be recycled');
    error.statusCode = 400;
    throw error;
  }
}

export async function withTransaction(pool, operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function moveToRecycleBin(pool, { resource, id, user }) {
  assertRecyclableResource(resource);

  return withTransaction(pool, async connection => {
    const [rows] = await connection.query(
      `SELECT json_data FROM \`${resource}\` WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) return null;

    const record = parseJson(rows[0].json_data, `${resource}/${id}`);
    const recycleRecord = {
      id: randomUUID(),
      originalId: id,
      resourceType: resource,
      name:
        record.name ||
        record.title ||
        record.nickname ||
        record.projectName ||
        '未知',
      deletedAt: new Date().toISOString(),
      deletedBy: user?.nickname || user?.id || 'System',
      deletedById: user?.id || null,
      data: record
    };

    await connection.query(
      'INSERT INTO recycle_bin (id, json_data) VALUES (?, ?)',
      [recycleRecord.id, JSON.stringify(recycleRecord)]
    );
    await connection.query(
      `DELETE FROM \`${resource}\` WHERE id = ?`,
      [id]
    );
    return recycleRecord;
  });
}

export async function restoreRecycleItem(pool, recycleId) {
  return withTransaction(pool, async connection => {
    const [rows] = await connection.query(
      'SELECT json_data FROM recycle_bin WHERE id = ? FOR UPDATE',
      [recycleId]
    );
    if (rows.length === 0) {
      const error = new Error('Recycle item not found');
      error.statusCode = 404;
      throw error;
    }

    const recycleRecord = parseJson(
      rows[0].json_data,
      `recycle_bin/${recycleId}`
    );
    const resource = recycleRecord.resourceType;
    const originalId = recycleRecord.originalId;
    assertRecyclableResource(resource);

    const [conflicts] = await connection.query(
      `SELECT id FROM \`${resource}\` WHERE id = ? FOR UPDATE`,
      [originalId]
    );
    if (conflicts.length > 0) {
      const error = new Error('A live record with the same ID already exists');
      error.statusCode = 409;
      throw error;
    }

    const restored = {
      ...recycleRecord.data,
      id: recycleRecord.data?.id || originalId
    };
    await connection.query(
      `INSERT INTO \`${resource}\` (id, json_data) VALUES (?, ?)`,
      [originalId, JSON.stringify(restored)]
    );
    await connection.query(
      'DELETE FROM recycle_bin WHERE id = ?',
      [recycleId]
    );
    return restored;
  });
}

export async function permanentlyDeleteRecycleItem(pool, recycleId) {
  return withTransaction(pool, async connection => {
    const [rows] = await connection.query(
      'SELECT json_data FROM recycle_bin WHERE id = ? FOR UPDATE',
      [recycleId]
    );
    if (rows.length === 0) return false;

    await connection.query(
      'DELETE FROM recycle_bin WHERE id = ?',
      [recycleId]
    );
    return true;
  });
}

export async function emptyRecycleBin(pool) {
  return withTransaction(pool, async connection => {
    const [result] = await connection.query('DELETE FROM recycle_bin');
    return result.affectedRows || 0;
  });
}

import { randomUUID as defaultRandomUUID } from 'node:crypto';

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MANUAL_CODE_LENGTH = 100;
const GLOBAL_PROJECT_CODE_LOCK_YEAR = 0;

function createProjectIdentifierError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseProject(value, context) {
  if (value && typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON data in ${context}`);
  }
}

export function getBeijingYearMonth(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createProjectIdentifierError('Project creation time is invalid', 400);
  }
  const beijingTime = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return {
    year: beijingTime.getUTCFullYear(),
    month: beijingTime.getUTCMonth() + 1
  };
}

export function formatAutomaticProjectCode(value, sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new TypeError('Project contract sequence must be a positive integer');
  }
  const { year, month } = getBeijingYearMonth(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(sequence).padStart(3, '0')}`;
}

function normalizeManualProjectCode(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw createProjectIdentifierError('Internal contract number must be a string', 400);
  }
  const normalized = value.trim();
  if (normalized.length > MAX_MANUAL_CODE_LENGTH) {
    throw createProjectIdentifierError(
      `Internal contract number must not exceed ${MAX_MANUAL_CODE_LENGTH} characters`,
      400
    );
  }
  return normalized;
}

export async function assignProjectIdentifiers(
  connection,
  input,
  {
    now = new Date(),
    randomUUID = defaultRandomUUID
  } = {}
) {
  const createdAt = now instanceof Date ? now : new Date(now);
  const { year } = getBeijingYearMonth(createdAt);
  const manualCode = normalizeManualProjectCode(input.internalContractNo);

  // 所有建档先锁同一个哨兵行，再锁年度序号。这样跨年度并发录入的
  // 人工编号也会串行检查，避免两个事务同时通过全局唯一性校验。
  await connection.query(
    `INSERT IGNORE INTO project_contract_sequences
      (contract_year, last_number, updated_at)
    VALUES (?, 0, CURRENT_TIMESTAMP(3))`,
    [GLOBAL_PROJECT_CODE_LOCK_YEAR]
  );
  const [globalLockRows] = await connection.query(
    `SELECT last_number
       FROM project_contract_sequences
      WHERE contract_year = ?
      FOR UPDATE`,
    [GLOBAL_PROJECT_CODE_LOCK_YEAR]
  );
  if (globalLockRows.length !== 1) {
    throw new Error('Global project code lock row is unavailable');
  }

  await connection.query(
    `INSERT IGNORE INTO project_contract_sequences
      (contract_year, last_number, updated_at)
    VALUES (?, 0, CURRENT_TIMESTAMP(3))`,
    [year]
  );
  const [sequenceRows] = await connection.query(
    `SELECT last_number
       FROM project_contract_sequences
      WHERE contract_year = ?
      FOR UPDATE`,
    [year]
  );
  if (sequenceRows.length !== 1) {
    throw new Error('Project contract sequence row is unavailable');
  }

  const [projectRows] = await connection.query(
    'SELECT id, json_data FROM projects ORDER BY id FOR UPDATE'
  );
  const existingCodes = new Set(
    projectRows
      .map((row, index) => parseProject(row.json_data, `projects/${row.id || index}`))
      .map(project => typeof project.code === 'string' ? project.code.trim().toLowerCase() : '')
      .filter(Boolean)
  );

  let nextNumber = Number(sequenceRows[0].last_number) + 1;
  if (!Number.isSafeInteger(nextNumber) || nextNumber < 1) {
    throw new Error('Project contract sequence value is invalid');
  }

  let code = manualCode;
  if (manualCode) {
    if (existingCodes.has(manualCode.toLowerCase())) {
      throw createProjectIdentifierError('Project code already exists', 409);
    }
  } else {
    code = formatAutomaticProjectCode(createdAt, nextNumber);
    while (existingCodes.has(code.toLowerCase())) {
      nextNumber += 1;
      code = formatAutomaticProjectCode(createdAt, nextNumber);
    }
  }

  const id = randomUUID();
  if (typeof id !== 'string' || !UUID_V4_PATTERN.test(id)) {
    throw new Error('Project ID generator did not return a UUID v4');
  }

  await connection.query(
    `UPDATE project_contract_sequences
        SET last_number = ?,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE contract_year = ?`,
    [nextNumber, year]
  );

  return {
    ...input,
    id,
    code,
    internalContractNo: manualCode || code,
    createdAt: createdAt.toISOString()
  };
}

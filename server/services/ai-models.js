import { AI_PROVIDER_IDS } from './ai-providers.js';

const MODEL_FIELDS = new Set([
  'id',
  'provider',
  'modelId',
  'displayName',
  'enabled',
  'reasoning',
  'contextLimit',
  'maxOutputTokens',
  'sortOrder'
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function boundedInteger(value, name, { min, max }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw validationError(`${name} is invalid`);
  }
  return number;
}

export function normalizeAiModel(input, routeId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Model configuration is invalid');
  }
  for (const key of Object.keys(input)) {
    if (!MODEL_FIELDS.has(key)) {
      throw validationError(`Model field ${key} is not allowed`);
    }
  }

  const model = {
    id: String(routeId || input.id || '').trim(),
    provider: String(input.provider || '').trim().toLowerCase(),
    modelId: String(input.modelId || '').trim(),
    displayName: String(input.displayName || '').trim(),
    enabled: input.enabled === true,
    reasoning: input.reasoning === true,
    contextLimit: boundedInteger(input.contextLimit, 'contextLimit', {
      min: 1_024,
      max: 2_000_000
    }),
    maxOutputTokens: boundedInteger(
      input.maxOutputTokens,
      'maxOutputTokens',
      { min: 1, max: 500_000 }
    ),
    sortOrder: boundedInteger(input.sortOrder, 'sortOrder', {
      min: 0,
      max: 1_000_000
    })
  };

  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(model.id)) {
    throw validationError('Model id is invalid');
  }
  if (!AI_PROVIDER_IDS.includes(model.provider)) {
    throw validationError('AI provider is not supported');
  }
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(model.modelId)) {
    throw validationError('Provider model id is invalid');
  }
  if (!model.displayName || model.displayName.length > 100) {
    throw validationError('Display name is invalid');
  }
  if (model.maxOutputTokens > model.contextLimit) {
    throw validationError('maxOutputTokens cannot exceed contextLimit');
  }
  return model;
}

function rowToModel(row) {
  return {
    id: row.id,
    provider: row.provider,
    modelId: row.model_id,
    displayName: row.display_name,
    enabled: Boolean(row.enabled),
    reasoning: Boolean(row.reasoning),
    contextLimit: Number(row.context_limit),
    maxOutputTokens: Number(row.max_output_tokens),
    sortOrder: Number(row.sort_order)
  };
}

export async function listEnabledAiModels(pool) {
  const [rows] = await pool.query(`
    SELECT
      id,
      provider,
      model_id,
      display_name,
      enabled,
      reasoning,
      context_limit,
      max_output_tokens,
      sort_order
    FROM ai_models
    WHERE enabled = 1
    ORDER BY sort_order ASC, id ASC
  `);
  return rows.map(rowToModel);
}

export async function findEnabledAiModel(pool, id) {
  const [rows] = await pool.query(`
    SELECT
      id,
      provider,
      model_id,
      display_name,
      enabled,
      reasoning,
      context_limit,
      max_output_tokens,
      sort_order
    FROM ai_models
    WHERE id = ? AND enabled = 1
    LIMIT 1
  `, [id]);
  return rows.length > 0 ? rowToModel(rows[0]) : null;
}

export async function createAiModel(pool, input) {
  const model = normalizeAiModel(input);
  try {
    await pool.query(
      `INSERT INTO ai_models (
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
        model.id,
        model.provider,
        model.modelId,
        model.displayName,
        model.enabled,
        model.reasoning,
        model.contextLimit,
        model.maxOutputTokens,
        model.sortOrder
      ]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const conflict = new Error('Model already exists');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
  return model;
}

export async function updateAiModel(pool, id, input) {
  const model = normalizeAiModel(input, id);
  const [result] = await pool.query(
    `UPDATE ai_models SET
      provider = ?,
      model_id = ?,
      display_name = ?,
      enabled = ?,
      reasoning = ?,
      context_limit = ?,
      max_output_tokens = ?,
      sort_order = ?,
      updated_at = CURRENT_TIMESTAMP(3)
    WHERE id = ?`,
    [
      model.provider,
      model.modelId,
      model.displayName,
      model.enabled,
      model.reasoning,
      model.contextLimit,
      model.maxOutputTokens,
      model.sortOrder,
      id
    ]
  );
  if (result.affectedRows === 0) {
    const error = new Error('Model not found');
    error.statusCode = 404;
    throw error;
  }
  return model;
}

const RESOURCE_DEFINITIONS = Object.freeze({
  projects: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  clients: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  equipment: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  schedule: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  docs: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  archives: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  production: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  users: Object.freeze({ read: 'authenticated', write: 'admin' }),
  settings: Object.freeze({ read: 'authenticated', write: 'admin' }),
  payments: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  approvals: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  worklogs: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  messages: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  channels: Object.freeze({ read: 'authenticated', write: 'authenticated' }),
  email_configs: Object.freeze({ read: 'owner', write: 'owner' }),
  announcements: Object.freeze({
    read: 'authenticated',
    write: 'authenticated'
  }),
  ai_messages: Object.freeze({ read: 'owner', write: 'owner' }),
  recycle_bin: Object.freeze({ read: 'authenticated', write: 'admin' })
});

function isAdministrator(user) {
  return user?.isDefaultAdmin === true || user?.role === 'Admin';
}

function isOwnedRecord(resource, user, record) {
  if (!user || !record) return false;
  if (resource === 'email_configs') return record.id === user.id;
  return record.userId === user.id;
}

export function getResourceDefinition(resource) {
  return RESOURCE_DEFINITIONS[resource] || null;
}

export function getResourcePolicy(resource) {
  return getResourceDefinition(resource)?.read || null;
}

export function canWriteResource(resource, user, record) {
  const definition = getResourceDefinition(resource);
  if (!definition || !user) return false;
  if (isAdministrator(user)) return true;
  if (definition.write === 'authenticated') return true;
  if (definition.write === 'owner') return isOwnedRecord(resource, user, record);
  return false;
}

export function filterReadableRecords(resource, user, records) {
  const definition = getResourceDefinition(resource);
  if (!definition || !user) return [];
  if (definition.read === 'owner' && !isAdministrator(user)) {
    return records.filter(record => isOwnedRecord(resource, user, record));
  }
  return records;
}

function sanitizePreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') return preferences;
  const { webhooks: _webhooks, ...safePreferences } = preferences;
  return safePreferences;
}

export function sanitizeResourceRecord(resource, record) {
  if (!record || typeof record !== 'object') return record;

  if (resource === 'users') {
    const {
      password: _password,
      authCode: _authCode,
      preferences,
      ...safeUser
    } = record;
    return {
      ...safeUser,
      ...(preferences
        ? { preferences: sanitizePreferences(preferences) }
        : {})
    };
  }

  if (resource === 'email_configs') {
    const { authCode: _authCode, ...safeConfig } = record;
    return safeConfig;
  }

  if (resource === 'ai_messages' && Array.isArray(record.attachments)) {
    return {
      ...record,
      attachments: record.attachments.map(
        ({ base64Data: _base64Data, ...attachment }) => attachment
      )
    };
  }

  return record;
}

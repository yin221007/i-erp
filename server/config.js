function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value, name, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_ORIGINS entries must use http or https');
  }
  return url.origin;
}

function endpointAllowlist(value, defaults) {
  const entries = (value || defaults).split(',').map(entry => entry.trim());
  const result = new Map();
  for (const entry of entries) {
    const [hostValue, portValue] = entry.split(':');
    const host = hostValue?.trim().toLowerCase();
    const port = positiveInteger(portValue, 'mail endpoint port');
    if (!host || !/^[a-z0-9.-]+$/.test(host)) {
      throw new Error('Mail endpoint host is invalid');
    }
    if (!result.has(host)) result.set(host, new Set());
    result.get(host).add(port);
  }
  return result;
}

export function loadConfig(environment = process.env) {
  const sessionSecret = required(environment, 'SESSION_SECRET');
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  const publicOrigins = required(environment, 'PUBLIC_ORIGINS')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  return {
    environment: environment.NODE_ENV || 'development',
    port: positiveInteger(environment.PORT, 'PORT', 3000),
    trustProxy: positiveInteger(environment.TRUST_PROXY, 'TRUST_PROXY', 1),
    publicOrigins: [...new Set(publicOrigins)],
    db: {
      host: required(environment, 'DB_HOST'),
      port: positiveInteger(environment.DB_PORT, 'DB_PORT', 3306),
      user: required(environment, 'DB_USER'),
      password: required(environment, 'DB_PASSWORD'),
      database: required(environment, 'DB_NAME'),
      connectionLimit: positiveInteger(
        environment.DB_CONNECTION_LIMIT,
        'DB_CONNECTION_LIMIT',
        10
      )
    },
    deepseek: {
      apiKey: environment.DEEPSEEK_API_KEY?.trim() || '',
      baseUrl: 'https://api.deepseek.com'
    },
    uploads: {
      directory: environment.UPLOAD_DIR?.trim() || '/app/uploads',
      maxFileSize: positiveInteger(
        environment.UPLOAD_MAX_BYTES,
        'UPLOAD_MAX_BYTES',
        100 * 1024 * 1024
      )
    },
    mail: {
      allowedImapHosts: endpointAllowlist(
        environment.MAIL_ALLOWED_IMAP_ENDPOINTS,
        'imap.qq.com:993,hwimap.exmail.qq.com:993'
      ),
      allowedSmtpHosts: endpointAllowlist(
        environment.MAIL_ALLOWED_SMTP_ENDPOINTS,
        'smtp.qq.com:465,hwsmtp.exmail.qq.com:465'
      ),
      maxMessageBytes: positiveInteger(
        environment.MAIL_MAX_MESSAGE_BYTES,
        'MAIL_MAX_MESSAGE_BYTES',
        10 * 1024 * 1024
      )
    }
  };
}

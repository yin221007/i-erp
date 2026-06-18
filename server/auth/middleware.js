import {
  findSessionByToken,
  SESSION_COOKIE_NAME
} from './sessions.js';

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

export function authenticateSession({ pool, cookieName = SESSION_COOKIE_NAME }) {
  return async function sessionAuthentication(req, _res, next) {
    try {
      const token = parseCookies(req.headers.cookie)[cookieName];
      req.sessionToken = token || null;
      req.authSession = token
        ? await findSessionByToken(pool, token)
        : null;
      req.authUser = req.authSession?.user || null;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function enforceOrigin({ publicOrigins }) {
  const allowedOrigins = new Set(publicOrigins);
  const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return function originGuard(req, res, next) {
    if (!req.authUser || !stateChangingMethods.has(req.method)) return next();

    const origin = req.get('origin');
    if (!origin || !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Request origin is not allowed' });
    }
    next();
  };
}

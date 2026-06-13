import express from 'express';
import { verifyPassword } from '../auth/passwords.js';
import { requireAuth } from '../auth/middleware.js';
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_MILLISECONDS
} from '../auth/sessions.js';

function parseUser(value) {
  if (value && typeof value === 'object') return value;
  return JSON.parse(value);
}

export function toSafeUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    department: user.department,
    role: user.role,
    permission: user.permission,
    isDefaultAdmin: user.isDefaultAdmin === true,
    avatar: user.avatar || '',
    lastReadMap: user.lastReadMap,
    lastActive: user.lastActive
  };
}

function createLoginLimiter({
  maximumFailures = 5,
  windowMilliseconds = 15 * 60 * 1000
} = {}) {
  const attempts = new Map();

  function currentEntry(key, now) {
    const existing = attempts.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { failures: 0, resetAt: now + windowMilliseconds };
      attempts.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  return {
    isBlocked(key, now = Date.now()) {
      return currentEntry(key, now).failures >= maximumFailures;
    },
    recordFailure(key, now = Date.now()) {
      currentEntry(key, now).failures += 1;
    },
    clear(key) {
      attempts.delete(key);
    }
  };
}

export function createAuthRouter({ pool, loginLimiter = createLoginLimiter() }) {
  const router = express.Router();

  router.post('/login', async (req, res, next) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '').trim();
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const limiterKey = `${req.ip}:${username}`;
      if (loginLimiter.isBlocked(limiterKey)) {
        return res.status(429).json({ error: 'Too many login attempts' });
      }

      const [rows] = await pool.query(
        `SELECT id, json_data
        FROM users
        WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(json_data, '$.nickname'))) = ?
        LIMIT 1`,
        [username]
      );
      const user = rows.length > 0 ? parseUser(rows[0].json_data) : null;
      if (!user || !(await verifyPassword(password, user.password))) {
        loginLimiter.recordFailure(limiterKey);
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      loginLimiter.clear(limiterKey);
      const session = await createSession(pool, user.id, {
        userAgent: req.get('user-agent') || '',
        ipAddress: req.ip
      });
      res.cookie(SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_IDLE_MILLISECONDS
      });
      return res.json({ user: toSafeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: toSafeUser(req.authUser) });
  });

  router.post('/logout', requireAuth, async (req, res, next) => {
    try {
      await revokeSessionByToken(pool, req.sessionToken);
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/'
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

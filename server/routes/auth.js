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
    lastActive: user.lastActive,
    preferences: user.preferences
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLastReadMap(value) {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 500) return null;

  const normalized = {};
  for (const [channelId, timestamp] of entries) {
    if (
      channelId.length === 0 ||
      channelId.length > 200 ||
      typeof timestamp !== 'string' ||
      timestamp.length > 100
    ) {
      return null;
    }
    normalized[channelId] = timestamp;
  }
  return normalized;
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

  router.patch('/me', requireAuth, async (req, res, next) => {
    try {
      const updates = {};
      if ('preferences' in req.body) {
        if (!isRecord(req.body.preferences)) {
          return res.status(400).json({ error: 'Preferences must be an object' });
        }
        updates.preferences = req.body.preferences;
      }
      if ('lastReadMap' in req.body) {
        const lastReadMap = normalizeLastReadMap(req.body.lastReadMap);
        if (!lastReadMap) {
          return res.status(400).json({ error: 'Invalid chat read state' });
        }
        updates.lastReadMap = lastReadMap;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No supported profile fields' });
      }

      const updatedUser = { ...req.authUser, ...updates };
      const [result] = await pool.query(
        `UPDATE users
        SET json_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [JSON.stringify(updatedUser), req.authUser.id]
      );
      if (result.affectedRows !== 1) {
        return res.status(404).json({ error: 'User not found' });
      }

      req.authUser = updatedUser;
      return res.json({ user: toSafeUser(updatedUser) });
    } catch (error) {
      next(error);
    }
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

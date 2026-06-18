import express from 'express';
import sanitizeHtml from 'sanitize-html';
import { requireAuth } from '../auth/middleware.js';

export function sanitizeEmailHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
      'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead',
      'tbody', 'tr', 'th', 'td', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a'
    ],
    allowedAttributes: {
      a: ['href', 'title']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank'
      })
    }
  });
}

function safeDownloadName(value) {
  return String(value || 'attachment')
    .replace(/[\r\n/\\"]/g, '_')
    .slice(0, 180);
}

async function loadMailConfig(pool, userId) {
  const [rows] = await pool.query(
    'SELECT json_data FROM email_configs WHERE id = ?',
    [userId]
  );
  if (rows.length === 0) {
    const error = new Error('本账户未配置业务邮箱参数');
    error.statusCode = 404;
    throw error;
  }
  const value = rows[0].json_data;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function sendMailError(res, error) {
  const message = String(error?.message || 'Mail operation failed');
  const authenticationFailure =
    /login failed|authenticate|authentication/i.test(message);
  const statusCode = authenticationFailure ? 401 : error.statusCode || 500;
  return res.status(statusCode).json({
    error: authenticationFailure
      ? '邮箱认证失败，请核对授权码'
      : message
  });
}

export function createEmailRouter({ pool, mailService }) {
  if (!pool) throw new Error('pool is required');
  if (!mailService) throw new Error('mailService is required');
  const router = express.Router();

  router.get('/email/fetch', requireAuth, async (req, res) => {
    try {
      const config = await loadMailConfig(pool, req.authUser.id);
      res.json(await mailService.listMessages(config));
    } catch (error) {
      sendMailError(res, error);
    }
  });

  router.get('/email/messages/:id', requireAuth, async (req, res) => {
    try {
      const config = await loadMailConfig(pool, req.authUser.id);
      const message = await mailService.getMessage(config, req.params.id);
      res.json({
        ...message,
        html: sanitizeEmailHtml(message.html)
      });
    } catch (error) {
      sendMailError(res, error);
    }
  });

  router.get(
    '/email/messages/:id/attachments/:part',
    requireAuth,
    async (req, res, next) => {
      let download;
      try {
        const config = await loadMailConfig(pool, req.authUser.id);
        download = await mailService.downloadAttachment(
          config,
          req.params.id,
          req.params.part
        );
        res.set('Content-Type', download.meta?.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${safeDownloadName(download.filename)}"`);
        res.set('X-Content-Type-Options', 'nosniff');
        res.on('finish', () => download.cleanup());
        res.on('close', () => download.cleanup());
        download.content.on('error', next);
        download.content.pipe(res);
      } catch (error) {
        if (download?.cleanup) await download.cleanup();
        sendMailError(res, error);
      }
    }
  );

  router.post('/email/send', requireAuth, async (req, res) => {
    try {
      const config = await loadMailConfig(pool, req.authUser.id);
      await mailService.sendMessage(config, req.body);
      res.json({ success: true });
    } catch (error) {
      sendMailError(res, error);
    }
  });

  return router;
}

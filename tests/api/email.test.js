import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  createEmailRouter,
  sanitizeEmailHtml
} from '../../server/routes/email.js';
import {
  createImapOptions,
  createSmtpOptions,
  validateMailConfig
} from '../../server/services/mail.js';

const emailConfig = {
  id: 'u-1',
  email: 'user@qq.com',
  authCode: 'secret-code',
  imapHost: 'imap.qq.com',
  imapPort: 993,
  smtpHost: 'smtp.qq.com',
  smtpPort: 465
};

class EmailPool {
  async query(sql, parameters) {
    assert.match(sql, /FROM email_configs/);
    assert.deepEqual(parameters, ['u-1']);
    return [[{ json_data: JSON.stringify(emailConfig) }], []];
  }
}

function createEmailTestApp(mailService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.get('cookie') === 'authenticated=1') {
      req.authUser = { id: 'u-1', nickname: 'alice' };
    }
    next();
  });
  app.use(createEmailRouter({
    pool: new EmailPool(),
    mailService
  }));
  return app;
}

test('email operations reject unauthenticated requests', async () => {
  const app = createEmailTestApp({});
  await request(app).get('/email/fetch').expect(401);
  await request(app)
    .post('/email/send')
    .send({ to: 'test@example.com', subject: 'Subject', text: 'Body' })
    .expect(401);
});

test('mail transports retain certificate verification', () => {
  assert.equal(createImapOptions(emailConfig).tls.rejectUnauthorized, true);
  assert.equal(createSmtpOptions(emailConfig).tls.rejectUnauthorized, true);
});

test('unapproved mail hosts are rejected', () => {
  assert.throws(
    () => validateMailConfig({
      ...emailConfig,
      imapHost: '127.0.0.1',
      smtpHost: 'internal.example'
    }),
    /not allowed/
  );
});

test('message HTML is sanitized before it reaches the browser', async () => {
  const maliciousHtml =
    '<p onclick="steal()">Hello</p><script>alert(1)</script>' +
    '<img src="https://tracker.example/pixel" onerror="steal()">';
  const app = createEmailTestApp({
    async listMessages() {
      return [{ id: '42', subject: 'Test' }];
    },
    async getMessage() {
      return {
        id: '42',
        text: 'Hello',
        html: maliciousHtml,
        attachments: []
      };
    }
  });

  const response = await request(app)
    .get('/email/messages/42')
    .set('Cookie', 'authenticated=1')
    .expect(200);

  assert.equal(response.body.html, sanitizeEmailHtml(maliciousHtml));
  assert.doesNotMatch(response.body.html, /script|onclick|onerror|tracker/i);
});

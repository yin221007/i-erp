import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

const DEFAULT_IMAP_HOSTS = new Map([
  ['imap.qq.com', new Set([993])],
  ['hwimap.exmail.qq.com', new Set([993])]
]);
const DEFAULT_SMTP_HOSTS = new Map([
  ['smtp.qq.com', new Set([465])],
  ['hwsmtp.exmail.qq.com', new Set([465])]
]);
const DEFAULT_MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

function configurationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) ? port : 0;
}

function isAllowedEndpoint(host, port, endpoints) {
  return endpoints.get(host)?.has(port) === true;
}

export function validateMailConfig(
  config,
  {
    allowedImapHosts = DEFAULT_IMAP_HOSTS,
    allowedSmtpHosts = DEFAULT_SMTP_HOSTS
  } = {}
) {
  const normalized = {
    ...config,
    email: String(config?.email || '').trim(),
    authCode: String(config?.authCode || '').trim(),
    imapHost: normalizeHost(config?.imapHost),
    imapPort: normalizePort(config?.imapPort),
    smtpHost: normalizeHost(config?.smtpHost),
    smtpPort: normalizePort(config?.smtpPort)
  };

  if (
    !normalized.email ||
    !normalized.authCode ||
    /[\r\n]/.test(normalized.email) ||
    /[\r\n]/.test(normalized.authCode)
  ) {
    throw configurationError('Mail credentials are invalid');
  }
  if (!isAllowedEndpoint(
    normalized.imapHost,
    normalized.imapPort,
    allowedImapHosts
  )) {
    throw configurationError('IMAP host or port is not allowed');
  }
  if (!isAllowedEndpoint(
    normalized.smtpHost,
    normalized.smtpPort,
    allowedSmtpHosts
  )) {
    throw configurationError('SMTP host or port is not allowed');
  }
  return normalized;
}

function imapOptionsFromConfig(normalized) {
  return {
    host: normalized.imapHost,
    port: normalized.imapPort,
    secure: true,
    auth: {
      user: normalized.email,
      pass: normalized.authCode
    },
    tls: {
      rejectUnauthorized: true,
      servername: normalized.imapHost
    },
    connectionTimeout: 45_000,
    greetingTimeout: 45_000,
    socketTimeout: 60_000,
    logger: false
  };
}

export function createImapOptions(config) {
  return imapOptionsFromConfig(validateMailConfig(config));
}

function smtpOptionsFromConfig(normalized) {
  return {
    host: normalized.smtpHost,
    port: normalized.smtpPort,
    secure: true,
    auth: {
      user: normalized.email,
      pass: normalized.authCode
    },
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 60_000,
    tls: {
      rejectUnauthorized: true,
      servername: normalized.smtpHost,
      minVersion: 'TLSv1.2'
    }
  };
}

export function createSmtpOptions(config) {
  return smtpOptionsFromConfig(validateMailConfig(config));
}

function formatAddresses(addresses = []) {
  return addresses
    .map(address => address.name
      ? `${address.name} <${address.address || ''}>`
      : address.address || '')
    .filter(Boolean)
    .join(', ');
}

function attachmentMetadata(structure, results = []) {
  if (!structure) return results;
  const filename =
    structure.dispositionParameters?.filename ||
    structure.parameters?.name;
  const isAttachment =
    structure.disposition === 'attachment' ||
    structure.disposition === 'inline' ||
    Boolean(filename);
  if (isAttachment && structure.part) {
    results.push({
      part: structure.part,
      filename: filename || 'attachment',
      contentType: structure.type || 'application/octet-stream',
      size: structure.size || 0
    });
  }
  for (const child of structure.childNodes || []) {
    attachmentMetadata(child, results);
  }
  return results;
}

function toMessageSummary(message) {
  const envelope = message.envelope || {};
  return {
    id: String(message.uid),
    from: formatAddresses(envelope.from) || '未知发件人',
    to: formatAddresses(envelope.to),
    subject: envelope.subject || '(无主题)',
    date: envelope.date || message.internalDate || new Date(0),
    seen: message.flags?.has('\\Seen') || false,
    size: message.size || 0,
    attachments: attachmentMetadata(message.bodyStructure)
  };
}

function validateUid(value) {
  const uid = String(value || '');
  if (!/^[1-9][0-9]*$/.test(uid)) {
    throw configurationError('Invalid message id');
  }
  return uid;
}

async function closeClient(client, lock) {
  try {
    lock?.release();
  } catch {}
  try {
    await client.logout();
  } catch {
    client.close();
  }
}

export function createMailService({
  allowedImapHosts = DEFAULT_IMAP_HOSTS,
  allowedSmtpHosts = DEFAULT_SMTP_HOSTS,
  maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
  imapClientFactory = options => new ImapFlow(options),
  smtpTransportFactory = options => nodemailer.createTransport(options)
} = {}) {
  const validationOptions = { allowedImapHosts, allowedSmtpHosts };

  function validated(config) {
    return validateMailConfig(config, validationOptions);
  }

  function imapOptions(config) {
    const normalized = validated(config);
    return {
      ...imapOptionsFromConfig(normalized),
      tls: {
        rejectUnauthorized: true,
        servername: normalized.imapHost
      }
    };
  }

  function smtpOptions(config) {
    const normalized = validated(config);
    return {
      ...smtpOptionsFromConfig(normalized),
      tls: {
        rejectUnauthorized: true,
        servername: normalized.smtpHost,
        minVersion: 'TLSv1.2'
      }
    };
  }

  async function openInbox(config) {
    const client = imapClientFactory(imapOptions(config));
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    return { client, lock };
  }

  return {
    async listMessages(config) {
      const { client, lock } = await openInbox(config);
      try {
        const uids = await client.search({ all: true }, { uid: true });
        const latestUids = Array.isArray(uids) ? uids.slice(-30) : [];
        if (latestUids.length === 0) return [];

        const messages = [];
        for await (const message of client.fetch(latestUids, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          size: true,
          bodyStructure: true
        }, { uid: true })) {
          messages.push(toMessageSummary(message));
        }
        return messages.sort((left, right) => Number(right.id) - Number(left.id));
      } finally {
        await closeClient(client, lock);
      }
    },

    async getMessage(config, messageId) {
      const uid = validateUid(messageId);
      const { client, lock } = await openInbox(config);
      try {
        const metadata = await client.fetchOne(uid, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          size: true,
          bodyStructure: true
        }, { uid: true });
        if (!metadata) {
          const error = new Error('Message not found');
          error.statusCode = 404;
          throw error;
        }
        if ((metadata.size || 0) > maxMessageBytes) {
          const error = new Error('Message exceeds the readable size limit');
          error.statusCode = 413;
          throw error;
        }

        const download = await client.download(uid, false, {
          uid: true,
          maxBytes: maxMessageBytes
        });
        const parsed = await simpleParser(download.content, {
          skipHtmlToText: true,
          skipTextToHtml: true,
          maxHtmlLengthToParse: 2 * 1024 * 1024
        });
        return {
          ...toMessageSummary(metadata),
          text: parsed.text || '',
          html: typeof parsed.html === 'string' ? parsed.html : ''
        };
      } finally {
        await closeClient(client, lock);
      }
    },

    async downloadAttachment(config, messageId, part) {
      const uid = validateUid(messageId);
      const safePart = String(part || '');
      if (!/^[1-9][0-9]*(?:\.[1-9][0-9]*)*$/.test(safePart)) {
        throw configurationError('Invalid attachment part');
      }

      const { client, lock } = await openInbox(config);
      const metadata = await client.fetchOne(uid, {
        uid: true,
        bodyStructure: true
      }, { uid: true });
      const attachment = attachmentMetadata(metadata?.bodyStructure)
        .find(item => item.part === safePart);
      if (!attachment) {
        await closeClient(client, lock);
        const error = new Error('Attachment not found');
        error.statusCode = 404;
        throw error;
      }

      const download = await client.download(uid, safePart, { uid: true });
      let closed = false;
      return {
        ...download,
        filename: attachment.filename,
        async cleanup() {
          if (closed) return;
          closed = true;
          await closeClient(client, lock);
        }
      };
    },

    async sendMessage(config, message) {
      const normalized = validated(config);
      const to = String(message?.to || '').trim();
      const subject = String(message?.subject || '').trim();
      const text = String(message?.text || '');
      if (
        !to ||
        !subject ||
        !text ||
        /[\r\n]/.test(to) ||
        /[\r\n]/.test(subject) ||
        to.length > 512 ||
        subject.length > 998 ||
        text.length > 2 * 1024 * 1024
      ) {
        throw configurationError('Email fields are invalid');
      }

      const transporter = smtpTransportFactory(smtpOptions(normalized));
      await transporter.sendMail({
        from: normalized.email,
        to,
        subject,
        text
      });
    }
  };
}


import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { loadConfig } from './server/config.js';
import { createDatabasePool } from './server/db.js';
import { runMigrations } from './server/migrations.js';
import {
  authenticateSession,
  enforceOrigin
} from './server/auth/middleware.js';
import { createAuthRouter } from './server/routes/auth.js';
import { createAiRouter } from './server/routes/ai.js';
import { createEmailRouter } from './server/routes/email.js';
import { createRecycleBinRouter } from './server/routes/recycle-bin.js';
import { createResourceRouter } from './server/routes/resources.js';
import { createUploadsRouter } from './server/routes/uploads.js';
import { createMailService } from './server/services/mail.js';

const config = loadConfig();
const app = express();
const PORT = config.port;

app.set('trust proxy', config.trustProxy);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

const pool = createDatabasePool(config.db);
app.use(authenticateSession({ pool }));
app.use(enforceOrigin({ publicOrigins: config.publicOrigins }));
app.use('/auth', createAuthRouter({ pool }));
app.use(createAiRouter({ pool, deepseek: config.deepseek }));
app.use(createUploadsRouter(config.uploads));
const RESOURCES = ['projects', 'clients', 'equipment', 'schedule', 'docs', 'archives', 'production', 'users', 'settings', 'payments', 'approvals', 'worklogs', 'messages', 'channels', 'email_configs', 'announcements', 'ai_messages', 'recycle_bin'];

const DEFAULT_ADMIN = { 
    id: 'u-1', 
    nickname: 'admin', 
    password: 'password',
    department: '总经办', 
    role: 'Admin', 
    isDefaultAdmin: true,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
};

const safeParseJSON = (str) => {
    if (!str) return null;
    try {
        return typeof str === 'string' ? JSON.parse(str) : str;
    } catch (e) {
        return null;
    }
};

// --- 推送引擎工具函数 ---
async function sendPushNotification(userPrefs, title, content) {
    if (!userPrefs || !userPrefs.webhooks) return;
    const { pushPlusToken, wecomWebhook, dingtalkWebhook, dingtalkSecret } = userPrefs.webhooks;

    // 1. PushPlus 推送
    if (pushPlusToken) {
        try {
            await fetch('https://www.pushplus.plus/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: pushPlusToken, title, content, template: 'html' })
            });
        } catch (e) { console.error('PushPlus Error:', e); }
    }

    // 2. 企业微信 Webhook
    if (wecomWebhook) {
        try {
            await fetch(wecomWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgtype: 'markdown', markdown: { content: `### ${title}\n${content}` } })
            });
        } catch (e) { console.error('WeCom Webhook Error:', e); }
    }

    // 3. 钉钉 Webhook
    if (dingtalkWebhook) {
        try {
            let url = dingtalkWebhook;
            if (dingtalkSecret) {
                const timestamp = Date.now();
                const stringToSign = timestamp + "\n" + dingtalkSecret;
                const sign = crypto.createHmac('sha256', dingtalkSecret).update(stringToSign).digest('base64');
                url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
            }
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgtype: 'markdown', markdown: { title: title, text: `### ${title}\n${content}` } })
            });
        } catch (e) { console.error('DingTalk Webhook Error:', e); }
    }
}

const initDB = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log("[DB] Connection successful!");
    
    for (const resource of RESOURCES) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS \`${resource}\` (
          \`id\` varchar(255) NOT NULL,
          \`json_data\` json DEFAULT NULL,
          \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const [adminRows] = await connection.query('SELECT id FROM users WHERE id = ?', [DEFAULT_ADMIN.id]);
    if (adminRows.length === 0) {
        await connection.query('REPLACE INTO users (id, json_data) VALUES (?, ?)', [DEFAULT_ADMIN.id, JSON.stringify(DEFAULT_ADMIN)]);
    }

    const [settingRows] = await connection.query('SELECT id FROM settings WHERE id = ?', ['global_config']);
    if (settingRows.length === 0) {
        const DEFAULT_SETTINGS = { id: 'global_config', appName: 'i ERP', logoUrl: '', logoWidth: 40, erpBaseUrl: '' };
        await connection.query('INSERT INTO settings (id, json_data) VALUES (?, ?)', ['global_config', JSON.stringify(DEFAULT_SETTINGS)]);
    }

  } catch (err) {
    console.error("[DB] Initialization Error:", err);
    throw err;
  } finally {
    if (connection) connection.release();
  }

  await runMigrations(pool);
};

const authMiddleware = async (req, res, next) => {
    const userData = req.authUser;
    req.userId = userData?.id || null;
    req.isSuperAdmin = userData?.isDefaultAdmin === true;
    req.userNickname = userData?.nickname;
    req.userPreferences = userData?.preferences;
    next();
};

app.use(authMiddleware);
app.use(createEmailRouter({
    pool,
    mailService: createMailService(config.mail)
}));

// --- 推送测试路由 ---
app.post('/push/test', async (req, res) => {
    const { type, config } = req.body;
    const title = "i ERP 推送连接测试";
    const content = `恭喜！您的 ${type} 推送通道已成功建立连接。\n测试时间：${new Date().toLocaleString('zh-CN')}`;

    try {
        const tempPrefs = { webhooks: config };
        await sendPushNotification(tempPrefs, title, content);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/backup/export', async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ error: "权限不足" });
    try {
        const backupData = { timestamp: new Date().toISOString(), tables: {} };
        for (const resource of RESOURCES) {
            const [rows] = await pool.query(`SELECT id, json_data FROM \`${resource}\``);
            backupData.tables[resource] = rows.map(r => ({ id: r.id, json_data: safeParseJSON(r.json_data) }));
        }
        res.json(backupData);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/backup/import', (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ error: "权限不足" });
    return res.status(410).json({
        error: "浏览器数据还原已停用，请使用服务器隔离恢复演练流程",
        restoreProcedure: "scripts/restore-drill.sh"
    });
});

app.use(createRecycleBinRouter({ pool }));
app.use(createResourceRouter({ pool }));

initDB()
  .then(() => {
      const server = app.listen(PORT, () => console.log(`i ERP Server running on port ${PORT}`));
      server.timeout = 3600000;
  })
  .catch(error => {
      console.error('[System] Startup aborted:', error);
      process.exitCode = 1;
  });

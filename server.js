
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';
import { loadConfig } from './server/config.js';
import { createDatabasePool } from './server/db.js';
import { runMigrations } from './server/migrations.js';
import {
  authenticateSession,
  enforceOrigin
} from './server/auth/middleware.js';
import { createAuthRouter } from './server/routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const app = express();
const PORT = config.port;

app.set('trust proxy', config.trustProxy);
app.use(cors());
app.use(bodyParser.json({ limit: '51200mb' })); 
app.use(bodyParser.urlencoded({ limit: '51200mb', extended: true }));

const uploadDir = path.join(__dirname, 'uploads');

function ensureUploadDir() {
    if (!fs.existsSync(uploadDir)){
        try {
            fs.mkdirSync(uploadDir, { recursive: true, mode: 0o777 });
        } catch (e) { 
            console.error('[System] Error creating upload directory:', e); 
        }
    }
}
ensureUploadDir();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalName);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 * 1024 } // 50GB
});

app.use('/uploads', express.static(uploadDir));

const pool = createDatabasePool(config.db);
app.use(authenticateSession({ pool }));
app.use(enforceOrigin({ publicOrigins: config.publicOrigins }));
app.use('/auth', createAuthRouter({ pool }));
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

// --- 增强邮件抓取路由 (严格执行最新 30 封限制) ---
app.get('/email/fetch', async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: "权限认证失效" });
    
    let connection = null;
    try {
        const [configRows] = await pool.query('SELECT json_data FROM email_configs WHERE id = ?', [req.userId]);
        if (configRows.length === 0) return res.status(404).json({ error: "本账户未配置业务邮箱参数" });
        
        const config = safeParseJSON(configRows[0].json_data);
        
        // 针对腾讯邮箱服务器的特定安全策略优化
        const imapConfig = {
            imap: {
                user: config.email,
                password: config.authCode,
                host: config.imapHost,
                // 如果是腾讯相关服务，强制启用 993/TLS
                port: (config.imapHost.includes('qq.com') || config.imapHost.includes('tencent')) ? 993 : config.imapPort,
                tls: true,
                authTimeout: 45000, // 腾讯服务器认证有时较慢，增加时长
                connTimeout: 45000,
                // 忽略自签名证书错误（防止部分内网代理环境报错）
                tlsOptions: { rejectUnauthorized: false }
            }
        };

        connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');
        const searchCriteria = ['ALL'];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };
        const results = await connection.search(searchCriteria, fetchOptions);
        
        /**
         * 核心：严格限制仅抓取最近 30 封邮件
         * results.slice(-30) 提取数组末尾（最新的）30个元素
         */
        const emails = await Promise.all(results.slice(-30).map(async (item) => {
            try {
                const all = item.parts.find(part => part.which === '');
                const id = item.attributes.uid;
                const parsed = await simpleParser(all.body);
                
                const attachments = (parsed.attachments || []).map(att => ({
                    filename: att.filename || '未命名附件',
                    contentType: att.contentType,
                    size: att.size,
                    content: att.content ? att.content.toString('base64') : null
                }));

                return {
                    id: id.toString(),
                    from: parsed.from ? parsed.from.text : '未知发件人',
                    to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(',') : parsed.to.text) : '',
                    subject: parsed.subject || '(无主题)',
                    date: parsed.date || new Date().toISOString(),
                    text: parsed.text || '',
                    html: parsed.html || '',
                    seen: item.attributes.flags.includes('\\Seen'),
                    attachments
                };
            } catch (innerErr) {
                console.warn(`[Mail] 解析单封邮件 ID ${item.attributes.uid} 失败:`, innerErr.message);
                return null;
            }
        }));

        const validEmails = emails.filter(e => e !== null);
        res.json(validEmails.reverse()); // 保持展示顺序为最新在上
    } catch (err) {
        console.error("[IMAP Server Error]:", err);
        // 针对腾讯邮箱常见的授权失败返回友好提示
        const errMsg = err.message.toLowerCase();
        if (errMsg.includes('login failed') || errMsg.includes('authenticate')) {
            res.status(401).json({ error: "IMAP 认证失败：请核对是否使用的是 16 位授权码，而非普通密码。" });
        } else {
            res.status(500).json({ error: "邮件同步失败：" + err.message });
        }
    } finally {
        if (connection) {
            try { connection.end(); } catch(e) {}
        }
    }
});

// --- 邮件发送路由 ---
app.post('/email/send', async (req, res) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const { to, subject, text } = req.body;

    try {
        const [configRows] = await pool.query('SELECT json_data FROM email_configs WHERE id = ?', [req.userId]);
        if (configRows.length === 0) throw new Error("SMTP 未配置");
        const config = safeParseJSON(configRows[0].json_data);
        
        const transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpPort === 465,
            auth: { user: config.email, pass: config.authCode },
            timeout: 30000,
            tls: {
                ciphers: 'SSLv3',
                rejectUnauthorized: false
            }
        });

        await transporter.sendMail({ from: config.email, to, subject, text });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "发送失败：" + err.message });
    }
});

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

app.post('/backup/import', async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ error: "权限不足" });
    const backupData = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        for (const resource of RESOURCES) {
            const tableData = backupData.tables[resource];
            if (!tableData) continue;
            await connection.query(`TRUNCATE TABLE \`${resource}\``);
            for (const item of tableData) {
                await connection.query(`INSERT INTO \`${resource}\` (id, json_data) VALUES (?, ?)`, [item.id, JSON.stringify(item.json_data)]);
            }
        }
        await connection.commit();
        res.json({ success: true });
    } catch (err) { if (connection) await connection.rollback(); res.status(500).json({ error: err.message }); } finally { if (connection) connection.release(); }
});

app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ url: `/api/uploads/${req.file.filename}`, filename: req.file.filename });
  });
});

app.get('/:resource', async (req, res) => {
  const { resource } = req.params;
  if (!RESOURCES.includes(resource)) return res.status(404).json({});
  try {
    const [rows] = await pool.query(`SELECT json_data FROM \`${resource}\``);
    let data = rows.map(row => safeParseJSON(row.json_data)).filter(item => item !== null);
    res.json(data);
  } catch (err) { res.json([]); }
});

app.put('/:resource/:id', async (req, res) => {
    const { resource, id } = req.params;
    const updatedItem = req.body;
    
    if (resource === 'users' && updatedItem) {
        updatedItem.lastActive = new Date().toISOString();
    }

    try {
        const query = `REPLACE INTO \`${resource}\` (id, json_data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`;
        await pool.query(query, [id, JSON.stringify(updatedItem)]);

        if (resource === 'approvals' && updatedItem.status !== 'Draft') {
            const applicantId = updatedItem.applicantId;
            const [userRows] = await pool.query('SELECT json_data FROM users WHERE id = ?', [applicantId]);
            if (userRows.length > 0) {
                const applicant = safeParseJSON(userRows[0].json_data);
                if (updatedItem.status === 'Approved' || updatedItem.status === 'Rejected' || updatedItem.status === 'Returned') {
                    const statusText = updatedItem.status === 'Approved' ? '已核准 ✅' : updatedItem.status === 'Rejected' ? '已驳回 ❌' : '被退回补充资料 ⚠️';
                    sendPushNotification(applicant.preferences, `审批结果通知：${updatedItem.title}`, `您提交的审批单【${updatedItem.title}】当前状态更新为：${statusText}。`);
                }
            }
        }

        res.json(updatedItem);
    } catch(err) { 
        console.error(`[API Error] PUT ${resource}/${id}:`, err);
        res.status(500).json({ error: "服务器同步指令执行异常" }); 
    }
});

app.delete('/:resource/:id', async (req, res) => {
    const { resource, id } = req.params;
    try {
        const [targetRows] = await pool.query(`SELECT json_data FROM \`${resource}\` WHERE id = ?`, [id]);
        if (targetRows.length > 0) {
            const itemData = safeParseJSON(targetRows[0].json_data);
            const recycleItem = { id: Math.random().toString(36).substr(2, 9), originalId: id, resourceType: resource, name: itemData.name || itemData.title || '未知', deletedAt: new Date().toISOString(), deletedBy: req.userNickname || 'System', data: itemData };
            await pool.query(`INSERT INTO recycle_bin (id, json_data) VALUES (?, ?)`, [recycleItem.id, JSON.stringify(recycleItem)]);
            await pool.query(`DELETE FROM \`${resource}\` WHERE id = ?`, [id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/:resource', async (req, res) => {
    const { resource } = req.params;
    const newItem = req.body;
    try {
        const query = `REPLACE INTO \`${resource}\` (id, json_data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`;
        await pool.query(query, [newItem.id, JSON.stringify(newItem)]);

        if (resource === 'approvals' && newItem.status === 'Pending') {
            const approverIds = newItem.approverIds || [];
            for (const approverId of approverIds) {
                const [userRows] = await pool.query('SELECT json_data FROM users WHERE id = ?', [approverId]);
                if (userRows.length > 0) {
                    const approver = safeParseJSON(userRows[0].json_data);
                    sendPushNotification(approver.preferences, `新审批待办：${newItem.title}`, `收到来自 ${newItem.applicantName} (${newItem.department}) 的新申请。请进入 ERP 系统处理。`);
                }
            }
        }

        res.status(201).json(newItem);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

initDB()
  .then(() => {
      const server = app.listen(PORT, () => console.log(`i ERP Server running on port ${PORT}`));
      server.timeout = 3600000;
  })
  .catch(error => {
      console.error('[System] Startup aborted:', error);
      process.exitCode = 1;
  });

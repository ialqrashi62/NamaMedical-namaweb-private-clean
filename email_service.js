/**
 * email_service.js
 * Zero-dependency Email Service supporting SendGrid, Mailgun, and Mock modes.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'mock';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '';
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@jumanasoft.com';
const FROM_NAME = process.env.FROM_NAME || 'Nama Medical | مجمع نما الطبي';

const LOG_FILE = path.join(__dirname, 'backups', 'email_sent.log');

// Setup database pool for audit logging
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;
const dbName = process.env.DB_NAME || 'nama_medical_web';
const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'postgres';

const pool = new Pool({
    host: dbHost,
    port: parseInt(dbPort),
    database: dbName,
    user: dbUser,
    password: dbPassword
});

/**
 * Log the email to the audit trail
 */
async function logEmailAudit(toEmail, subject, provider, status, errorMsg = null) {
    try {
        const queryText = `
            INSERT INTO audit_trail (user_id, username, action, module, details, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const details = `Email to: ${toEmail} | Subject: ${subject} | Provider: ${provider} | Status: ${status}${errorMsg ? ' | Error: ' + errorMsg : ''}`;
        await pool.query(queryText, [null, 'SYSTEM_EMAIL', 'EMAIL_SEND', 'Notifications', details, '127.0.0.1']);
    } catch (e) {
        console.error('[EMAIL AUDIT ERROR] Failed to log email audit:', e.message);
    }
}

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML email body
 * @returns {Promise<boolean>}
 */
function sendEmail(to, subject, htmlContent) {
    return new Promise((resolve, reject) => {
        if (!to || !subject || !htmlContent) {
            return reject(new Error('Missing required email fields (to, subject, htmlContent)'));
        }

        if (EMAIL_PROVIDER === 'mock') {
            // Mock Mode: Write to log file
            try {
                const logDir = path.dirname(LOG_FILE);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
                const logEntry = `[${new Date().toISOString()}] TO: ${to} | FROM: "${FROM_NAME}" <${FROM_EMAIL}> | SUBJECT: ${subject}\n--- BODY ---\n${htmlContent}\n=============\n\n`;
                fs.appendFileSync(LOG_FILE, logEntry);
                console.log(`[EMAIL SERVICE] Sending email to ${to} using mock...`);
                console.log(`[EMAIL MOCK LOGGED] Subject: ${subject}`);
                
                logEmailAudit(to, subject, 'mock', 'success').then(() => resolve(true));
            } catch (err) {
                logEmailAudit(to, subject, 'mock', 'failed', err.message).then(() => reject(err));
            }
        } else if (EMAIL_PROVIDER === 'sendgrid') {
            // SendGrid HTTP API
            if (!SENDGRID_API_KEY) {
                const err = new Error('SENDGRID_API_KEY is not configured');
                return logEmailAudit(to, subject, 'sendgrid', 'failed', err.message).then(() => reject(err));
            }

            const data = {
                personalizations: [{ to: [{ email: to }] }],
                from: { email: FROM_EMAIL, name: FROM_NAME },
                subject: subject,
                content: [{ type: 'text/html', value: htmlContent }]
            };

            const payload = JSON.stringify(data);
            const options = {
                hostname: 'api.sendgrid.com',
                port: 443,
                path: '/v3/mail/send',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        logEmailAudit(to, subject, 'sendgrid', 'success').then(() => resolve(true));
                    } else {
                        const errMsg = `SendGrid returned status ${res.statusCode}: ${body}`;
                        logEmailAudit(to, subject, 'sendgrid', 'failed', errMsg).then(() => reject(new Error(errMsg)));
                    }
                });
            });

            req.on('error', (err) => {
                logEmailAudit(to, subject, 'sendgrid', 'failed', err.message).then(() => reject(err));
            });

            req.write(payload);
            req.end();
        } else if (EMAIL_PROVIDER === 'mailgun') {
            // Mailgun HTTP API
            if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
                const err = new Error('MAILGUN_API_KEY or MAILGUN_DOMAIN is not configured');
                return logEmailAudit(to, subject, 'mailgun', 'failed', err.message).then(() => reject(err));
            }

            const postData = new URLSearchParams({
                from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
                to: to,
                subject: subject,
                html: htmlContent
            }).toString();

            const options = {
                hostname: 'api.mailgun.net',
                port: 443,
                path: `/v3/${MAILGUN_DOMAIN}/messages`,
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('api:' + MAILGUN_API_KEY).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        logEmailAudit(to, subject, 'mailgun', 'success').then(() => resolve(true));
                    } else {
                        const errMsg = `Mailgun returned status ${res.statusCode}: ${body}`;
                        logEmailAudit(to, subject, 'mailgun', 'failed', errMsg).then(() => reject(new Error(errMsg)));
                    }
                });
            });

            req.on('error', (err) => {
                logEmailAudit(to, subject, 'mailgun', 'failed', err.message).then(() => reject(err));
            });

            req.write(postData);
            req.end();
        } else {
            const err = new Error(`Unsupported email provider: ${EMAIL_PROVIDER}`);
            logEmailAudit(to, subject, EMAIL_PROVIDER, 'failed', err.message).then(() => reject(err));
        }
    });
}

module.exports = { sendEmail };

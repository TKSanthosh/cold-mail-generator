/**
 * Multi-Device Push Notification & Alerting Service
 * Dispatches real-time alerts when mandatory screening questions arise, errors occur, or review queue items wait.
 * Channels supported:
 * 1. ntfy.sh (Free instant push to Android & iOS mobile devices / smartwatches)
 * 2. Telegram Bot Webhook (Real-time admin / alert push)
 * 3. Server-Sent Events (SSE) for instant browser/web-app alert + audio chime
 * 4. Gmail alert (via authenticated user Gmail)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Active Server-Sent Events (SSE) connections for live web app clients
const sseClients = new Map(); // userKey -> Set(res)

// In-memory notification history cache (last 50 notifications per user)
const notificationHistory = new Map(); // userKey -> Array

function getUserNotificationTopic(userKey = 'default_user') {
  const cleanKey = (userKey || 'default_user')
    .replace(/@/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase();
  return `coldmail-naukri-${cleanKey}`;
}

/**
 * Send instant mobile push notification via ntfy.sh (free, open source, no signup needed)
 */
async function sendNtfyPushNotification(topic, payload) {
  return new Promise((resolve) => {
    try {
      const url = new URL(`https://ntfy.sh/${topic}`);
      const bodyText = payload.message || payload.question || 'A new alert requires your attention.';

      // Strip non-ASCII characters from headers to conform to strict Node HTTP standards
      const toAsciiHeader = (str) => (str || '').replace(/[^\x20-\x7E]/g, '').trim();

      const headers = {
        'Title': toAsciiHeader(payload.title || 'Action Needed').slice(0, 100),
        'Priority': payload.priority || 'urgent',
        'Tags': toAsciiHeader(payload.tags || 'warning,briefcase,clipboard'),
        'Content-Type': 'text/plain; charset=utf-8'
      };

      if (payload.actionUrl) {
        headers['Click'] = toAsciiHeader(payload.actionUrl);
        headers['Actions'] = `view, Open Web App, ${toAsciiHeader(payload.actionUrl)}, clear=true`;
      }

      const req = https.request(url, {
        method: 'POST',
        headers,
        timeout: 8000
      }, (res) => {
        let respData = '';
        res.on('data', chunk => { respData += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[NTFY_PUSH] ✅ Mobile push successfully sent to https://ntfy.sh/${topic}`);
            resolve({ success: true, topic, statusCode: res.statusCode });
          } else {
            console.warn(`[NTFY_PUSH] Warning from ntfy.sh (status ${res.statusCode}):`, respData);
            resolve({ success: false, statusCode: res.statusCode, error: respData });
          }
        });
      });

      req.on('error', (err) => {
        console.warn(`[NTFY_PUSH] Network error posting to ntfy.sh:`, err.message);
        resolve({ success: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'ntfy.sh request timed out' });
      });

      req.write(bodyText);
      req.end();
    } catch (err) {
      console.warn(`[NTFY_PUSH] Failed to dispatch ntfy push:`, err.message);
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Send alert via Telegram Bot webhook if configured in environment
 */
async function sendTelegramAlert(messageHtml) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { sent: false, reason: 'Telegram bot token or chat ID not configured' };
  }

  return new Promise((resolve) => {
    try {
      const postData = JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 8000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('[TELEGRAM ALERT] ✅ Sent alert to Telegram chat');
            resolve({ sent: true });
          } else {
            console.warn('[TELEGRAM ALERT WARN]', data);
            resolve({ sent: false, error: data });
          }
        });
      });

      req.on('error', (e) => {
        console.warn('[TELEGRAM ALERT ERROR]', e.message);
        resolve({ sent: false, error: e.message });
      });

      req.write(postData);
      req.end();
    } catch (e) {
      resolve({ sent: false, error: e.message });
    }
  });
}

/**
 * Register an SSE client connection for real-time web alerts
 */
function registerSseClient(userKey, res) {
  if (!sseClients.has(userKey)) {
    sseClients.set(userKey, new Set());
  }
  sseClients.get(userKey).add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', userKey, topic: getUserNotificationTopic(userKey), timestamp: new Date().toISOString() })}\n\n`);

  res.on('close', () => {
    const clients = sseClients.get(userKey);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(userKey);
      }
    }
  });
}

/**
 * Broadcast event to all active SSE web clients for this user
 */
function broadcastToSseClients(userKey, eventName, data) {
  const clients = sseClients.get(userKey);
  if (!clients || clients.size === 0) return 0;

  const payloadStr = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  let sentCount = 0;

  for (const client of clients) {
    try {
      client.write(payloadStr);
      sentCount++;
    } catch (e) {
      clients.delete(client);
    }
  }
  return sentCount;
}

/**
 * Send email alert if user has active Gmail authentication
 */
async function sendEmailNotification(userKey, payload) {
  try {
    const { sendGmail } = require('./mail.service');
    const tokenPath = process.env.TOKEN_PATH || path.join(__dirname, '../../../server/token.json');
    if (!fs.existsSync(tokenPath)) {
      return { sent: false, reason: 'Gmail token.json not present on host' };
    }

    const subject = `⚡ Action Required: ${payload.title || 'Cold Mail Automation Alert'}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0056b3; margin-top: 0;">⚡ ${payload.title || 'Automation Notification'}</h2>
        <p>${payload.message || 'An alert was triggered by the automation engine.'}</p>
        
        ${payload.question ? `
          <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">Question:</p>
            <p style="margin: 0; font-size: 16px; color: #111;">"${payload.question}"</p>
          </div>
        ` : ''}

        <p style="margin: 25px 0;">
          <a href="${payload.actionUrl || 'http://localhost:5001'}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Open Dashboard
          </a>
        </p>
        <p style="font-size: 12px; color: #888; margin-top: 30px;">This automated notification was dispatched by your cold-mail-generator engine.</p>
      </div>
    `;

    const recipient = userKey && userKey.includes('@') ? userKey : (process.env.ALERT_EMAIL || 'tksanthosh494@gmail.com');
    await sendGmail(recipient, subject, htmlBody, null, userKey, 'notification.pdf', { isAlert: true });
    return { sent: true };
  } catch (err) {
    console.warn(`[EMAIL_ALERT] Notice:`, err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Main Centralized Mandatory Question Broadcast Method
 */
async function broadcastMandatoryQuestionNotification(userKey, questionRecord) {
  const topic = getUserNotificationTopic(userKey);
  const now = new Date().toISOString();
  const host = process.env.APP_BASE_URL || 'http://localhost:5001';

  const notificationData = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    type: 'MANDATORY_QUESTION',
    userKey,
    jobId: questionRecord.jobId,
    jobTitle: questionRecord.jobTitle || 'Target Role',
    company: questionRecord.company || 'Employer',
    jobUrl: questionRecord.jobUrl,
    question: questionRecord.question,
    options: questionRecord.options || [],
    inputType: questionRecord.inputType || 'text',
    title: `Action Required: ${questionRecord.company || 'Naukri'} Screening Question`,
    message: `"${questionRecord.question}" for ${questionRecord.company || 'Employer'} (${questionRecord.jobTitle || 'Role'})`,
    actionUrl: `${host}/?openPending=true&jobId=${encodeURIComponent(questionRecord.jobId || '')}`,
    timestamp: now,
    ntfyTopic: topic
  };

  if (!notificationHistory.has(userKey)) {
    notificationHistory.set(userKey, []);
  }
  const history = notificationHistory.get(userKey);
  history.unshift(notificationData);
  if (history.length > 50) history.pop();

  const telegramMsg = `🚨 <b>Naukri Screening Question Alert</b>\n<b>Company:</b> ${notificationData.company}\n<b>Role:</b> ${notificationData.jobTitle}\n<b>Question:</b> <i>${notificationData.question}</i>\n<a href="${notificationData.actionUrl}">👉 Tap here to answer</a>`;

  const results = await Promise.allSettled([
    sendNtfyPushNotification(topic, {
      title: `Naukri Question: ${notificationData.company}`,
      message: `Question: "${notificationData.question}"\nRole: ${notificationData.jobTitle}\n\nTap to answer instantly!`,
      priority: 'urgent',
      tags: 'warning,briefcase,question',
      actionUrl: notificationData.actionUrl
    }),
    sendTelegramAlert(telegramMsg),
    Promise.resolve(broadcastToSseClients(userKey, 'mandatory_question', notificationData)),
    sendEmailNotification(userKey, notificationData)
  ]);

  return {
    success: true,
    notificationData,
    ntfyTopic: topic
  };
}

/**
 * Broadcasts critical unhandled errors to mobile, Telegram, and SSE
 */
async function broadcastErrorAlert(title, message, errorDetails = null, userKey = 'default_user') {
  const topic = getUserNotificationTopic(userKey);
  const host = process.env.APP_BASE_URL || 'http://localhost:5001';

  console.error(`[CRITICAL AUTOMATION ALERT] ${title}: ${message}`, errorDetails || '');

  const telegramMsg = `❌ <b>Automation Error Alert: ${title}</b>\n<b>Details:</b> ${message}\n${errorDetails ? `<code>${String(errorDetails).slice(0, 300)}</code>` : ''}\n<a href="${host}">👉 Open Dashboard</a>`;

  await Promise.allSettled([
    sendNtfyPushNotification(topic, {
      title: `❌ Error: ${title}`,
      message: `${message}\n${errorDetails ? String(errorDetails).slice(0, 100) : ''}`,
      priority: 'high',
      tags: 'x,warning,skull',
      actionUrl: host
    }),
    sendTelegramAlert(telegramMsg),
    Promise.resolve(broadcastToSseClients(userKey, 'system_error', { title, message, errorDetails, timestamp: new Date().toISOString() }))
  ]);
}

/**
 * Broadcasts DOM selector drift alert when platforms update markup
 */
async function broadcastDomDriftAlert(platform, selector, pageUrl = '', userKey = 'default_user') {
  const title = `DOM Selector Drift Detected on ${platform}`;
  const message = `Critical selector "${selector}" failed to resolve on ${platform} (${pageUrl}). The site markup may have changed.`;
  await broadcastErrorAlert(title, message, { selector, pageUrl }, userKey);
}

async function sendTestNotification(userKey) {
  const testRecord = {
    jobId: 'test_job_001',
    jobTitle: 'Senior Full Stack Engineer',
    company: 'Google Cloud Innovations',
    jobUrl: 'https://www.naukri.com/job-listings-sample',
    question: 'How many years of hands-on experience do you have with Node.js and React?',
    options: ['1-2 Years', '3-5 Years', '5+ Years'],
    inputType: 'single_choice'
  };

  return await broadcastMandatoryQuestionNotification(userKey, testRecord);
}

function getNotificationHistory(userKey) {
  return notificationHistory.get(userKey) || [];
}

module.exports = {
  broadcastMandatoryQuestionNotification,
  broadcastErrorAlert,
  broadcastDomDriftAlert,
  sendTelegramAlert,
  sendTestNotification,
  registerSseClient,
  broadcastToSseClients,
  getUserNotificationTopic,
  getNotificationHistory,
  sendNtfyPushNotification
};


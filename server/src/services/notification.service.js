/**
 * Multi-Device Push Notification Service
 * Dispatches real-time alerts when mandatory screening questions arise on Naukri
 * Channels supported:
 * 1. ntfy.sh (Free, instant push to Android & iOS mobile devices / smartwatches)
 * 2. Server-Sent Events (SSE) for instant browser/web-app alert + audio chime
 * 3. Chrome Extension notification channel
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
      const bodyText = payload.message || payload.question || 'A new screening question requires your answer.';

      // Strip non-ASCII characters from headers to conform to strict Node HTTP standards
      const toAsciiHeader = (str) => (str || '').replace(/[^\x20-\x7E]/g, '').trim();

      const headers = {
        'Title': toAsciiHeader(payload.title || 'Action Needed: Naukri Question').slice(0, 100),
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

    const subject = `⚡ Action Required: Naukri Screening Question for ${payload.company || 'Job Application'}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0056b3; margin-top: 0;">⚡ Naukri Application Requires Your Answer</h2>
        <p>A mandatory recruiter screening question arose while applying to <strong>${payload.company || 'a company'}</strong> for <strong>${payload.jobTitle || 'Role'}</strong>.</p>
        
        <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">Question:</p>
          <p style="margin: 0; font-size: 16px; color: #111;">"${payload.question}"</p>
          ${Array.isArray(payload.options) && payload.options.length > 0 ? `
            <p style="margin: 12px 0 6px 0; font-weight: bold; color: #555;">Available Options:</p>
            <ul style="margin: 0; padding-left: 20px; color: #444;">
              ${payload.options.map(opt => `<li>${opt}</li>`).join('')}
            </ul>
          ` : ''}
        </div>

        <p style="margin: 25px 0;">
          <a href="${payload.actionUrl || 'http://localhost:5001'}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Open App to Answer Question & Continue
          </a>
        </p>
        <p style="font-size: 12px; color: #888; margin-top: 30px;">This automated notification was dispatched by your Naukri Auto-Apply Engine.</p>
      </div>
    `;

    const recipient = userKey.includes('@') ? userKey : 'tksanthosh494@gmail.com';
    await sendGmail(recipient, subject, htmlBody);
    return { sent: true };
  } catch (err) {
    console.warn(`[EMAIL_ALERT] Notice:`, err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Main Centralized Broadcast Method
 * Dispatches notification to all connected devices simultaneously
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

  console.log(`\n================================================================`);
  console.log(`[PUSH NOTIFICATION] 🚨 BROADCASTING TO ALL CONNECTED DEVICES!`);
  console.log(`  • Company:  ${notificationData.company}`);
  console.log(`  • Question: "${notificationData.question}"`);
  console.log(`  • Topic:    https://ntfy.sh/${topic}`);
  console.log(`================================================================\n`);

  const results = await Promise.allSettled([
    sendNtfyPushNotification(topic, {
      title: `Naukri Question: ${notificationData.company}`,
      message: `Question: "${notificationData.question}"\nRole: ${notificationData.jobTitle}\n\nTap to answer instantly from your phone!`,
      priority: 'urgent',
      tags: 'warning,briefcase,question',
      actionUrl: notificationData.actionUrl
    }),
    Promise.resolve(broadcastToSseClients(userKey, 'mandatory_question', notificationData)),
    sendEmailNotification(userKey, notificationData)
  ]);

  return {
    success: true,
    notificationData,
    ntfyTopic: topic,
    results: {
      ntfy: results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason },
      sseCount: results[1].status === 'fulfilled' ? results[1].value : 0,
      email: results[2].status === 'fulfilled' ? results[2].value : { error: results[2].reason }
    }
  };
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
  sendTestNotification,
  registerSseClient,
  broadcastToSseClients,
  getUserNotificationTopic,
  getNotificationHistory,
  sendNtfyPushNotification
};

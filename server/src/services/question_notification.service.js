const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getUserPaths } = require('./user.service');

function getQuestionRequestsFilePath(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  return path.join(paths.userDir, 'naukri_question_requests.json');
}

function loadQuestionRequests(userKey = 'default_user') {
  const filePath = getQuestionRequestsFilePath(userKey);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn(`[QUESTION_NOTIF] Warning reading requests for ${userKey}:`, e.message);
  }
  return [];
}

function saveQuestionRequests(userKey = 'default_user', requests) {
  try {
    const filePath = getQuestionRequestsFilePath(userKey);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(requests, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`[QUESTION_NOTIF] Error saving requests for ${userKey}:`, e.message);
    return false;
  }
}

/**
 * Format human-readable prompt for WhatsApp / SMS / Push
 */
function formatQuestionMessage(request) {
  const company = request.company || 'Employer';
  const role = request.jobTitle || 'Target Role';
  const question = request.question || '';
  const options = Array.isArray(request.options) ? request.options : [];

  let msg = `📋 *Naukri Screening Question*\n*Company:* ${company}\n*Role:* ${role}\n*Question:* ${question}\n`;
  if (options.length > 0) {
    msg += `\n*Options:*\n`;
    options.forEach((opt, idx) => {
      msg += `${idx + 1}. ${opt}\n`;
    });
    msg += `\n_Reply with option number (e.g. 1) or type your answer._\n`;
  } else {
    msg += `\n_Reply directly with your answer._\n`;
  }
  msg += `\n*ID:* \`${request.requestId}\``;
  return msg;
}

/**
 * WhatsApp Notification Provider Interface
 */
async function sendWhatsAppAlert(userKey, request) {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  const toWhatsApp = process.env.USER_WHATSAPP_NUMBER;
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;

  const bodyText = formatQuestionMessage(request);

  // If generic outbound webhook is configured
  if (webhookUrl) {
    try {
      const parsedUrl = new URL(webhookUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const payload = JSON.stringify({
        userKey,
        requestId: request.requestId,
        jobId: request.jobId,
        company: request.company,
        jobTitle: request.jobTitle,
        question: request.question,
        options: request.options,
        message: bodyText
      });

      await new Promise((resolve) => {
        const req = client.request(parsedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 6000
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(payload);
        req.end();
      });
    } catch (e) {}
  }

  // If Twilio is configured
  if (twilioSid && twilioAuth && toWhatsApp) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
      const postParams = new URLSearchParams({
        From: fromWhatsApp.startsWith('whatsapp:') ? fromWhatsApp : `whatsapp:${fromWhatsApp}`,
        To: toWhatsApp.startsWith('whatsapp:') ? toWhatsApp : `whatsapp:${toWhatsApp}`,
        Body: bodyText
      }).toString();

      await new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.twilio.com',
          path: `/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postParams)
          },
          timeout: 8000
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postParams);
        req.end();
      });
      return { sent: true, provider: 'twilio' };
    } catch (e) {
      console.warn('[WHATSAPP_PROVIDER] Twilio error:', e.message);
    }
  }

  return { sent: false, reason: 'WhatsApp credentials not configured (fallback to push/SSE)' };
}

/**
 * Dispatch Question Request to candidate and save to pending requests
 */
async function dispatchQuestionRequest(userKey = 'default_user', questionData) {
  const requestId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const host = process.env.APP_BASE_URL || 'http://localhost:5001';

  const request = {
    requestId,
    userKey,
    jobId: questionData.jobId,
    jobTitle: questionData.jobTitle || 'Target Role',
    company: questionData.company || 'Employer',
    jobUrl: questionData.jobUrl || '',
    questionId: questionData.questionId || null,
    question: questionData.question,
    normKey: questionData.normKey || null,
    type: questionData.type || 'text',
    options: questionData.options || [],
    mandatory: questionData.isMandatory !== false,
    status: 'WAITING_FOR_USER',
    answer: null,
    answeredAt: null,
    source: null,
    actionUrl: `${host}/?openPending=true&requestId=${encodeURIComponent(requestId)}&jobId=${encodeURIComponent(questionData.jobId || '')}`,
    createdAt: new Date().toISOString()
  };

  // Persist request
  const requests = loadQuestionRequests(userKey);
  requests.unshift(request);
  if (requests.length > 100) requests.pop();
  saveQuestionRequests(userKey, requests);

  // Dispatch multi-channel alerts (Push, Telegram, SSE, Email, WhatsApp)
  const notificationService = require('./notification.service');
  if (notificationService && typeof notificationService.broadcastMandatoryQuestionNotification === 'function') {
    await notificationService.broadcastMandatoryQuestionNotification(userKey, {
      ...questionData,
      requestId,
      actionUrl: request.actionUrl
    }).catch(() => {});
  }

  // Dispatch WhatsApp provider alert
  sendWhatsAppAlert(userKey, request).catch(() => {});

  console.log(`[QUESTION_NOTIF] 🔔 Dispatched QuestionRequest ${requestId} for job "${request.jobId}" at ${request.company}`);
  return request;
}

/**
 * Handle incoming remote answer (e.g. from WhatsApp webhook, REST API, or Push action)
 */
async function handleRemoteAnswer(userKey = 'default_user', requestId, rawAnswer, source = 'REMOTE') {
  if (!requestId || rawAnswer === undefined || rawAnswer === null) {
    return { success: false, error: 'Missing requestId or answer' };
  }

  const requests = loadQuestionRequests(userKey);
  const reqIdx = requests.findIndex(r => r.requestId === requestId || r.jobId === requestId);

  if (reqIdx === -1) {
    return { success: false, error: `Question request "${requestId}" not found` };
  }

  const request = requests[reqIdx];
  if (request.status === 'ANSWERED') {
    return { success: true, alreadyAnswered: true, answer: request.answer, message: 'Question already answered' };
  }

  let finalAnswer = String(rawAnswer).trim();

  // If question has options and user provided a numeric choice "1", "2", etc.
  if (Array.isArray(request.options) && request.options.length > 0) {
    const num = parseInt(finalAnswer, 10);
    if (!isNaN(num) && num >= 1 && num <= request.options.length) {
      finalAnswer = request.options[num - 1];
    } else {
      // Check for case-insensitive option match
      const matchedOpt = request.options.find(opt =>
        opt.toLowerCase().trim() === finalAnswer.toLowerCase() ||
        opt.toLowerCase().includes(finalAnswer.toLowerCase()) ||
        finalAnswer.toLowerCase().includes(opt.toLowerCase())
      );
      if (matchedOpt) {
        finalAnswer = matchedOpt;
      }
    }
  }

  request.status = 'ANSWERED';
  request.answer = finalAnswer;
  request.answeredAt = new Date().toISOString();
  request.source = source;
  requests[reqIdx] = request;
  saveQuestionRequests(userKey, requests);

  // Sync to QA Database and Batch Screening Answers
  const {
    saveBatchScreeningAnswersAsync,
    saveQaItemAsync,
    getBatchScreeningData,
    saveBatchScreeningData,
    updateQueueItemState,
    ApplicationState
  } = require('./naukri_apply.service');

  const answerPayload = {};
  if (request.questionId) answerPayload[request.questionId] = finalAnswer;
  if (request.normKey) answerPayload[request.normKey] = finalAnswer;
  answerPayload[request.question] = finalAnswer;

  await saveBatchScreeningAnswersAsync(userKey, answerPayload).catch(() => {});

  // Save to persistent Q&A Knowledge database
  await saveQaItemAsync(userKey, {
    question: request.question,
    answer: finalAnswer,
    category: 'Remote Screening Answers'
  }).catch(() => {});

  // Update batch state: mark this specific job READY_TO_RESUME or READY_TO_APPLY
  const batchData = getBatchScreeningData(userKey);
  if (batchData.jobQuestionsMap && batchData.jobQuestionsMap[request.jobId]) {
    batchData.jobQuestionsMap[request.jobId].status = 'READY_TO_APPLY';
    batchData.jobQuestionsMap[request.jobId].lastSuccessfulStep = 'REMOTE_ANSWER_RECEIVED';
    delete batchData.jobQuestionsMap[request.jobId].lastError;
    saveBatchScreeningData(userKey, batchData);
  }

  // Update Queue Item State
  updateQueueItemState(userKey, request.jobId, {
    state: ApplicationState.READY_TO_RESUME,
    stage: 'Answer Received remotely - Ready to Apply'
  });

  console.log(`[QUESTION_NOTIF] ✅ Successfully resolved QuestionRequest ${requestId} for job "${request.jobId}" with answer "${finalAnswer}" via ${source}`);

  // Trigger non-blocking asynchronous auto-resume if enabled
  triggerBackgroundJobResume(userKey, request.jobId).catch(err => {
    console.warn(`[QUESTION_NOTIF] Warning during background job resume for ${request.jobId}:`, err.message);
  });

  return {
    success: true,
    requestId,
    jobId: request.jobId,
    resolvedAnswer: finalAnswer,
    status: 'ANSWERED'
  };
}

/**
 * Trigger background job resume without blocking the caller or requiring frontend to be active
 */
async function triggerBackgroundJobResume(userKey = 'default_user', jobId) {
  const { retryAndApplySingleJobInstantAsync } = require('./naukri_apply.service');
  if (typeof retryAndApplySingleJobInstantAsync === 'function') {
    // Schedule asynchronous execution after short tick
    setTimeout(async () => {
      try {
        console.log(`[BACKGROUND_RESUME] 🚀 Auto-resuming job "${jobId}" after remote answer received...`);
        await retryAndApplySingleJobInstantAsync(userKey, jobId);
      } catch (err) {
        console.warn(`[BACKGROUND_RESUME] Auto-resume completed/handled for "${jobId}":`, err.message);
      }
    }, 500);
  }
}

/**
 * Get all pending question requests for a user
 */
function getPendingQuestionRequests(userKey = 'default_user') {
  const all = loadQuestionRequests(userKey);
  return all.filter(r => r.status === 'WAITING_FOR_USER');
}

/**
 * Get specific question request by ID
 */
function getQuestionRequestById(userKey = 'default_user', requestId) {
  const all = loadQuestionRequests(userKey);
  return all.find(r => r.requestId === requestId || r.jobId === requestId) || null;
}

module.exports = {
  dispatchQuestionRequest,
  handleRemoteAnswer,
  getPendingQuestionRequests,
  getQuestionRequestById,
  formatQuestionMessage,
  sendWhatsAppAlert
};

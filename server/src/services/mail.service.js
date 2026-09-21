const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getOAuth2Client } = require('./oauth.service');
const { getUserOAuthClient } = require('./user.service');

/**
 * Converts Markdown formatting to clean, elegant HTML for Gmail rendering.
 */
function markdownToHtml(text) {
  if (!text) return '';

  let html = text
    // Replace **bold** with <strong>bold</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Replace *italic* with <em>italic</em>
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    // Replace [label](url) with <a href="url">label</a>
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" style="color: #0b57d0; text-decoration: underline;">$1</a>')
    // Replace bare URLs (not already inside href) with clickable links
    .replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color: #0b57d0; text-decoration: underline;">$1</a>');

  const paragraphs = html.split(/\n\s*\n/);
  const formattedSections = [];

  for (const para of paragraphs) {
    const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
    const bulletLines = [];
    const regularLines = [];

    for (const line of lines) {
      if (line.startsWith('•') || line.startsWith('* ') || line.startsWith('- ')) {
        bulletLines.push(line.replace(/^[•\*\-]\s*/, '').trim());
      } else {
        if (bulletLines.length > 0) {
          const items = bulletLines.map(b => `<li style="margin-bottom: 6px; line-height: 1.5;">${b}</li>`).join('\n');
          formattedSections.push(`<ul style="margin: 6px 0 14px 20px; padding: 0; color: #202124;">\n${items}\n</ul>`);
          bulletLines.length = 0;
        }
        regularLines.push(line);
      }
    }

    if (regularLines.length > 0) {
      formattedSections.push(`<p style="margin: 0 0 14px 0; line-height: 1.6; color: #202124;">${regularLines.join('<br/>')}</p>`);
    }

    if (bulletLines.length > 0) {
      const items = bulletLines.map(b => `<li style="margin-bottom: 6px; line-height: 1.5;">${b}</li>`).join('\n');
      formattedSections.push(`<ul style="margin: 6px 0 14px 20px; padding: 0; color: #202124;">\n${items}\n</ul>`);
    }
  }

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #202124; line-height: 1.6; max-width: 650px;">
${formattedSections.join('\n')}
</div>`;
}

/**
 * Builds a MIME message string containing headers, HTML body, and a file attachment.
 */
function buildMimeMessage(to, subject, rawOrHtmlBody, attachmentPath, attachmentDisplayName = 'santhosh_t_k.pdf') {
  const boundary = 'cold_email_boundary_xxxxxx';
  const filename = attachmentDisplayName || (attachmentPath ? path.basename(attachmentPath) : 'santhosh_t_k.pdf');

  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ].join('\r\n');

  // Convert plain text / markdown to elegant HTML
  let formattedBody = rawOrHtmlBody;
  if (!formattedBody.includes('<p>') && !formattedBody.includes('<div>')) {
    formattedBody = markdownToHtml(formattedBody);
  }

  const bodySection = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(formattedBody).toString('base64'),
    ''
  ].join('\r\n');

  let attachmentSection = '';
  if (attachmentPath && fs.existsSync(attachmentPath)) {
    const fileContent = fs.readFileSync(attachmentPath).toString('base64');
    attachmentSection = [
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      fileContent,
      ''
    ].join('\r\n');
  }

  const closing = `--${boundary}--`;
  const rawMessage = [headers, '', bodySection, attachmentSection, closing].join('\r\n');

  // Base64Url encoding
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends a single email with PDF attachment using the authorized Gmail client.
 */
async function sendGmail(to, subject, htmlBody, attachmentPath, userKey = null, attachmentName = 'santhosh_t_k.pdf', options = {}) {
  const cleanTo = (to || '').trim().toLowerCase();
  if (!cleanTo || !cleanTo.includes('@')) {
    throw new Error('Invalid recipient email address format.');
  }

  // 1. Guard against sending cold outreach to candidate's own email address (bypassed for system alerts)
  if (!options.isAlert && (cleanTo === 'tksanthosh494@gmail.com' || (userKey && cleanTo === userKey.replace(/_/g, '@')))) {
    throw new Error(`Self-Email Blocked: Cold outreach cannot be sent to your own email address (${cleanTo}). Please provide a recruiter's work email.`);
  }

  // 2. Guard against sending cold outreach to generic company inboxes (hr@, careers@, jobs@, talent@, etc.)
  if (!options.isAlert) {
    const { isGenericHrEmail } = require('./email_verifier.service');
    if (isGenericHrEmail(cleanTo)) {
      const err = new Error(`Generic HR Email Blocked: Sending cold outreach to generic inboxes (${cleanTo}) is strictly prohibited. Emails must be sent directly to real, individual recruiters (e.g. anjana.v@juspay.com) to ensure visibility.`);
      err.code = 'GENERIC_HR_BLOCKED';
      throw err;
    }
  }

  // 3. Deliverability & Anti-Bounce verification (for cold outreach)
  if (!options.isAlert) {
    try {
      const { verifyEmailDeliverability } = require('./email_verifier.service');
      const deliverability = await verifyEmailDeliverability(cleanTo, userKey);
      if (!deliverability.isValid) {
        throw new Error(`Undeliverable Email Blocked: ${deliverability.reason} (${cleanTo}). Email was not sent to protect your Gmail reputation.`);
      }
    } catch (err) {
      if (err.message.includes('Undeliverable Email Blocked') || err.code === 'GENERIC_HR_BLOCKED') throw err;
    }
  }

  // 4. Pre-send Duplicate Check: Stop sending duplicate emails to the same HR multiple times!
  if (!options.isAlert && !options.bypassDedup) {
    const { assertNotSentToHr } = require('./dedup.service');
    assertNotSentToHr(userKey, cleanTo, {
      company: options.company,
      hrName: options.hrName,
      subject
    });
  }

  const { isTestModeActive, shouldMockEmails, blockDestructiveAction } = require('./safety_guard.service');
  if (isTestModeActive() || shouldMockEmails()) {
    blockDestructiveAction('GMAIL_SEND_EMAIL', { to: cleanTo, subject, attachmentName });
    const mockId = `mock_msg_${Date.now()}`;
    if (!options.isAlert) {
      try {
        const { recordSentHr } = require('./dedup.service');
        recordSentHr(userKey, {
          email: cleanTo,
          hrName: options.hrName || 'HR Recruiter',
          company: options.company || 'Company',
          subject,
          messageId: mockId,
          sourceUrl: options.sourceUrl || options.careerPageUrl || ''
        });
      } catch (e) {}
    }
    return {
      id: mockId,
      threadId: `mock_thread_${Date.now()}`,
      labelIds: ['SENT'],
      isMock: true,
      status: 'BLOCKED_TEST_ACTION'
    };
  }

  let oauth2Client;
  if (userKey) {
    oauth2Client = getUserOAuthClient(userKey);
  } else {
    oauth2Client = getOAuth2Client();
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const raw = buildMimeMessage(to, subject, htmlBody, attachmentPath, attachmentName);

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: raw
    }
  });

  // 5. Post-Send Logging: Record sent HR immediately in persistent registry
  if (!options.isAlert) {
    try {
      const { recordSentHr } = require('./dedup.service');
      recordSentHr(userKey, {
        email: cleanTo,
        hrName: options.hrName || 'HR Recruiter',
        company: options.company || 'Company',
        subject,
        messageId: res.data?.id,
        sourceUrl: options.sourceUrl || options.careerPageUrl || ''
      });
    } catch (e) {
      console.warn('[DEDUP LOG WARN] Failed to record sent HR:', e.message);
    }
  }

  return res.data;
}

/**
 * Creates a ready-to-send draft directly in the user's Gmail app with PDF attached.
 */
async function createGmailDraft(to, subject, htmlBody, attachmentPath, userKey = null, attachmentName = 'santhosh_t_k.pdf') {
  const cleanTo = (to || '').trim().toLowerCase();
  if (!cleanTo || !cleanTo.includes('@')) {
    throw new Error('Invalid recipient email address format.');
  }

  // 1. Guard against sending cold outreach to candidate's own email address
  if (cleanTo === 'tksanthosh494@gmail.com' || (userKey && cleanTo === userKey.replace(/_/g, '@'))) {
    throw new Error(`Self-Email Blocked: Cold outreach cannot be sent to your own email address (${cleanTo}).`);
  }

  // 2. Guard against drafting cold outreach to generic company inboxes
  const { isGenericHrEmail } = require('./email_verifier.service');
  if (isGenericHrEmail(cleanTo)) {
    const err = new Error(`Generic HR Email Blocked: Cold outreach drafts to generic inboxes (${cleanTo}) are prohibited. Please use a verified personal recruiter email (e.g. anjana.v@juspay.com).`);
    err.code = 'GENERIC_HR_BLOCKED';
    throw err;
  }

  // 3. Pre-draft Duplicate Check: Stop drafting emails to already contacted HRs
  const { hasAlreadySentToHr } = require('./dedup.service');
  const hrCheck = hasAlreadySentToHr(userKey, cleanTo);
  if (hrCheck.alreadySent) {
    const err = new Error(hrCheck.reason);
    err.code = 'DUPLICATE_HR_EMAIL_BLOCKED';
    throw err;
  }

  let oauth2Client;
  if (userKey) {
    oauth2Client = getUserOAuthClient(userKey);
  } else {
    oauth2Client = getOAuth2Client();
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const raw = buildMimeMessage(to, subject, htmlBody, attachmentPath, attachmentName);

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: raw
      }
    }
  });

  return res.data;
}

module.exports = {
  sendGmail,
  createGmailDraft
};

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getOAuth2Client } = require('./oauth.service');
const { getUserOAuthClient } = require('./user.service');

/**
 * Builds a MIME message string containing headers, HTML body, and a file attachment.
 */
function buildMimeMessage(to, subject, htmlBody, attachmentPath, attachmentDisplayName = 'santhosh_t_k.pdf') {
  const boundary = 'cold_email_boundary_xxxxxx';
  const filename = attachmentDisplayName || (attachmentPath ? path.basename(attachmentPath) : 'santhosh_t_k.pdf');

  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ].join('\r\n');

  // Convert plain text breaks to elegant HTML paragraphs
  let formattedBody = htmlBody;
  if (!formattedBody.includes('<p>') && !formattedBody.includes('<div>')) {
    const parts = formattedBody.split(/\n\s*\n/);
    const htmlParagraphs = parts.map(p => `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #222222;">${p.replace(/\n/g, '<br/>')}</p>`);
    formattedBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; color: #222222; max-width: 650px;">
      ${htmlParagraphs.join('\n')}
    </div>`;
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
async function sendGmail(to, subject, htmlBody, attachmentPath, userKey = null, attachmentName = 'santhosh_t_k.pdf') {
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

  return res.data;
}

/**
 * Creates a ready-to-send draft directly in the user's Gmail app with PDF attached.
 */
async function createGmailDraft(to, subject, htmlBody, attachmentPath, userKey = null, attachmentName = 'santhosh_t_k.pdf') {
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

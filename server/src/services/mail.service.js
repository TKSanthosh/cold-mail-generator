const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getOAuth2Client } = require('./oauth.service');

/**
 * Builds a MIME message string containing headers, HTML body, and a file attachment.
 * 
 * @param {string} to 
 * @param {string} subject 
 * @param {string} htmlBody 
 * @param {string} attachmentPath 
 * @returns {string} Base64url encoded MIME message
 */
function buildMimeMessage(to, subject, htmlBody, attachmentPath) {
  const boundary = 'cold_email_boundary_xxxxxx';
  const filename = attachmentPath ? path.basename(attachmentPath) : 'Resume.pdf';

  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ].join('\r\n');

  // Convert plain text breaks to HTML breaks if needed, or wrap in paragraphs
  const formattedBody = htmlBody.includes('<') ? htmlBody : htmlBody.replace(/\n/g, '<br/>');

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
 * 
 * @param {string} to 
 * @param {string} subject 
 * @param {string} htmlBody 
 * @param {string} attachmentPath 
 * @returns {Promise<object>} Send response details
 */
async function sendGmail(to, subject, htmlBody, attachmentPath) {
  const oauth2Client = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const raw = buildMimeMessage(to, subject, htmlBody, attachmentPath);

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
async function createGmailDraft(to, subject, htmlBody, attachmentPath) {
  const oauth2Client = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const raw = buildMimeMessage(to, subject, htmlBody, attachmentPath);

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

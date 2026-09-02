const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { isSupabaseConfigured, supabaseGetResume, supabaseSaveResume } = require('./supabase.service');
const { getUserPaths, ensureUserSandbox, getUserProfile } = require('./user.service');

const MASTER_RESUME_PATH = path.join(__dirname, '../../resume.json');

/**
 * Validates that a file exists on disk, is non-empty, and is a valid PDF
 */
function validatePdfFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Resume file does not exist at path: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error(`Resume file is empty (0 bytes) at path: ${filePath}`);
  }

  // Check magic bytes for PDF format (%PDF)
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(5);
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);
    const magicHeader = buffer.toString('utf8');
    if (!magicHeader.startsWith('%PDF')) {
      console.warn(`[RESUME RESOLVER WARNING] File at ${filePath} magic header is "${magicHeader}" (expected %PDF).`);
    }
  } catch (err) {
    console.warn(`[RESUME RESOLVER WARNING] Could not verify PDF magic bytes: ${err.message}`);
  }

  return stat.size;
}

/**
 * Downloads a remote file from a URL to a local destination
 */
async function downloadFileFromUrl(url, destPath, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };

    if (options.apiKey) {
      headers['apikey'] = options.apiKey;
      headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} when downloading resume from ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      throw new Error(`Downloaded resume file from ${url} is empty (0 bytes)`);
    }

    fs.writeFileSync(destPath, buffer);
    return buffer.length;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sanitizes candidate name for clean filename generation
 */
function sanitizeFileNamePart(str) {
  if (!str || typeof str !== 'string') return 'candidate';
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase();
}

/**
 * Dynamically resolves, retrieves, and prepares the user's resume from the database.
 * Supports:
 *  1. Structured JSON Resume (renders dynamic 1-page PDF)
 *  2. Remote HTTP/HTTPS File URL (downloads and caches PDF)
 *  3. Supabase Cloud Storage bucket/path references
 *  4. Base64 encoded PDF string / Data URI
 *  5. Local sandbox cached files
 *
 * @param {string} userKey - Unique user identifier (e.g., 'tksanthosh494_gmail_com')
 * @param {object} options - Optional overrides (targetDir, forceRefresh, etc.)
 * @returns {Promise<{ filePath: string, fileName: string, fileSize: number, source: string, candidateName: string, userKey: string, resumeData: object|null }>}
 */
async function resolveUserResumeFile(userKey = 'default_user', options = {}) {
  const startTime = Date.now();
  console.log(`[RESUME RESOLVER] 🔍 Resolving resume for user "${userKey}"...`);

  ensureUserSandbox(userKey);
  const userPaths = getUserPaths(userKey);
  const uploadsDir = options.targetDir || userPaths.uploadsDir;
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  let rawResumeData = null;
  let source = 'unknown';

  // 1. Database Query: Attempt to fetch from Supabase Cloud Database first
  if (isSupabaseConfigured()) {
    try {
      console.log(`[RESUME] Loading from DB for user "${userKey}"...`);
      const dbResult = await supabaseGetResume(userKey);
      if (dbResult) {
        rawResumeData = dbResult;
        source = 'supabase_database';
        console.log(`[RESUME] Resume found in DB for user "${userKey}".`);
      } else {
        console.log(`[RESUME] No record found in DB for user "${userKey}".`);
      }
    } catch (dbErr) {
      console.warn(`[RESUME WARNING] Failed to query DB for resume: ${dbErr.message}`);
    }
  }

  // 2. Fallback: Local Sandbox Resume
  if (!rawResumeData) {
    if (fs.existsSync(userPaths.resumePath)) {
      try {
        const localContent = fs.readFileSync(userPaths.resumePath, 'utf8');
        rawResumeData = JSON.parse(localContent);
        source = 'local_sandbox_json';
        console.log(`[RESUME RESOLVER] Loaded resume from local sandbox: ${userPaths.resumePath}`);
      } catch (e) {
        console.warn(`[RESUME RESOLVER WARNING] Failed parsing local sandbox resume: ${e.message}`);
      }
    }
  }

  // 3. Fallback: Master Global Resume Template (if available)
  if (!rawResumeData && fs.existsSync(MASTER_RESUME_PATH)) {
    try {
      rawResumeData = JSON.parse(fs.readFileSync(MASTER_RESUME_PATH, 'utf8'));
      source = 'master_template_json';
      console.log(`[RESUME RESOLVER] Falling back to master resume template at ${MASTER_RESUME_PATH}`);
    } catch (e) {}
  }

  if (!rawResumeData) {
    throw new Error(
      `No resume record found in database or local storage for user "${userKey}". ` +
      `Please save or upload a resume in the profile/resume settings tab.`
    );
  }

  // 4. Determine Candidate Name & Output File Name dynamically (Zero hardcoding)
  let candidateName = '';
  let customFileName = '';

  if (typeof rawResumeData === 'object' && rawResumeData !== null) {
    candidateName = rawResumeData.personalInfo?.name ||
                    rawResumeData.name ||
                    rawResumeData.candidateName ||
                    '';
    customFileName = rawResumeData.fileName ||
                     rawResumeData.file_name ||
                     rawResumeData.filename ||
                     rawResumeData.originalName ||
                     '';
  }

  if (!candidateName) {
    const profile = getUserProfile(userKey);
    candidateName = profile?.name || '';
  }

  if (!candidateName) {
    const cleanKey = userKey.replace(/_gmail_com$|_com$|_org$/, '');
    candidateName = cleanKey || 'candidate';
  }

  let finalFileName = '';
  if (customFileName && customFileName.endsWith('.pdf')) {
    finalFileName = customFileName;
  } else {
    const cleanName = sanitizeFileNamePart(candidateName);
    finalFileName = `${cleanName}_resume.pdf`;
  }

  const outputPdfPath = path.join(uploadsDir, finalFileName);

  // 5. Multi-Format Resolution
  let resolutionFormat = '';

  // Format A: Remote URL string or Object with fileUrl / url / storageUrl
  const remoteUrl = (typeof rawResumeData === 'string' && (rawResumeData.startsWith('http://') || rawResumeData.startsWith('https://')))
    ? rawResumeData
    : (rawResumeData.fileUrl || rawResumeData.file_url || rawResumeData.url || rawResumeData.downloadUrl || rawResumeData.storageUrl || rawResumeData.storage_url || rawResumeData.pdfUrl);

  if (remoteUrl && typeof remoteUrl === 'string') {
    resolutionFormat = 'remote_url';
    console.log(`[RESUME RESOLVER] Resolving remote resume file from URL: ${remoteUrl}...`);
    await downloadFileFromUrl(remoteUrl, outputPdfPath);
  }

  // Format B: Base64 String or Data URI
  else if (
    (typeof rawResumeData === 'string' && (rawResumeData.startsWith('data:application/pdf;base64,') || rawResumeData.startsWith('data:;base64,'))) ||
    (rawResumeData.fileBase64 || rawResumeData.pdfBase64 || rawResumeData.base64 || (typeof rawResumeData.data === 'string' && rawResumeData.data.startsWith('data:application/pdf')))
  ) {
    resolutionFormat = 'base64_payload';
    const base64Str = typeof rawResumeData === 'string'
      ? rawResumeData
      : (rawResumeData.fileBase64 || rawResumeData.pdfBase64 || rawResumeData.base64 || rawResumeData.data);

    const cleanBase64 = base64Str.replace(/^data:application\/pdf;base64,|^data:;base64,|^data:[^;]+;base64,/, '').trim();
    console.log(`[RESUME RESOLVER] Decoding base64 PDF resume payload (${cleanBase64.length} chars)...`);
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(outputPdfPath, buffer);
  }

  // Format C: Raw Binary Buffer
  else if (Buffer.isBuffer(rawResumeData) || (rawResumeData.buffer && Buffer.isBuffer(rawResumeData.buffer))) {
    resolutionFormat = 'binary_buffer';
    const buf = Buffer.isBuffer(rawResumeData) ? rawResumeData : rawResumeData.buffer;
    console.log(`[RESUME RESOLVER] Writing binary PDF buffer (${buf.length} bytes)...`);
    fs.writeFileSync(outputPdfPath, buf);
  }

  // Format D: Structured JSON Resume Schema (personalInfo, skills, experience, summary, education)
  else if (typeof rawResumeData === 'object' && rawResumeData !== null) {
    resolutionFormat = 'structured_json';
    console.log(`[RESUME RESOLVER] Generating executive 1-page PDF from structured resume data (${candidateName})...`);

    // Ensure local sandbox JSON is kept in sync
    try {
      fs.writeFileSync(userPaths.resumePath, JSON.stringify(rawResumeData, null, 2), 'utf8');
    } catch (e) {}

    await generateResumePdf(rawResumeData, outputPdfPath);
  }

  // Format E: Local File Path String
  else if (typeof rawResumeData === 'string' && fs.existsSync(rawResumeData)) {
    resolutionFormat = 'local_file_path';
    console.log(`[RESUME RESOLVER] Copying existing local file from ${rawResumeData}...`);
    fs.copyFileSync(rawResumeData, outputPdfPath);
  }

  else {
    throw new Error(`Unrecognized resume data format for user "${userKey}". Expected structured JSON, file URL, or PDF base64.`);
  }

  // 6. Verify file integrity and size
  const fileSize = validatePdfFile(outputPdfPath);
  const elapsedMs = Date.now() - startTime;

  console.log(`[RESUME] File ready: ${finalFileName} (${(fileSize / 1024).toFixed(1)} KB, source: ${source}:${resolutionFormat})`);
  console.log(
    `[RESUME] ✅ Successfully resolved and verified resume file:\n` +
    `  • User: ${userKey}\n` +
    `  • Candidate: ${candidateName}\n` +
    `  • Path: ${outputPdfPath}\n` +
    `  • File Name: ${finalFileName}\n` +
    `  • Size: ${(fileSize / 1024).toFixed(1)} KB (${fileSize} bytes)\n` +
    `  • Source: ${source} (${resolutionFormat})\n` +
    `  • Elapsed: ${elapsedMs}ms`
  );

  return {
    filePath: outputPdfPath,
    fileName: finalFileName,
    fileSize,
    source: `${source}:${resolutionFormat}`,
    candidateName,
    userKey,
    resumeData: typeof rawResumeData === 'object' ? rawResumeData : null
  };
}

module.exports = {
  resolveUserResumeFile,
  validatePdfFile,
  sanitizeFileNamePart
};

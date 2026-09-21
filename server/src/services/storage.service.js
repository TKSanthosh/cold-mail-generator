const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

/**
 * Storage Service: High-efficiency Gzip Compressed Storage Engine (Level 9).
 * Guarantees zero blind saving, content-hash deduplication, and maximum compression (85-95% reduction).
 */

const contentHashes = new Map();

/**
 * Compresses data using Level 9 (maximum compression) Gzip.
 */
function compressBuffer(bufferOrString) {
  const buf = Buffer.isBuffer(bufferOrString) ? bufferOrString : Buffer.from(bufferOrString, 'utf8');
  return zlib.gzipSync(buf, {
    level: 9,
    memLevel: 9,
    strategy: zlib.constants.Z_DEFAULT_STRATEGY
  });
}

/**
 * Decompresses Gzip buffer with safe fallbacks.
 */
function decompressBuffer(buffer) {
  try {
    return zlib.gunzipSync(buffer);
  } catch (e) {
    try {
      return zlib.inflateSync(buffer);
    } catch (e2) {
      return buffer; // return raw if not compressed
    }
  }
}

/**
 * Reads compressed json. Checks gzPath first, then jsonFallbackPath.
 * Auto-compresses fallback uncompressed json if found.
 */
function readCompressedJson(gzPath, jsonFallbackPath = null, defaultValue = []) {
  try {
    if (gzPath && fs.existsSync(gzPath)) {
      const buffer = fs.readFileSync(gzPath);
      const decompressed = decompressBuffer(buffer);
      return JSON.parse(decompressed.toString('utf8'));
    }
  } catch (e) {
    console.warn(`[STORAGE] Gzip read error for ${gzPath}:`, e.message);
  }

  // Fallback to legacy uncompressed .json if present
  if (jsonFallbackPath && fs.existsSync(jsonFallbackPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonFallbackPath, 'utf8'));
      // Auto-migrate to compressed format immediately with maximum compression
      if (gzPath) {
        writeCompressedJson(gzPath, jsonFallbackPath, data);
      }
      return data;
    } catch (e) {
      console.warn(`[STORAGE] Fallback json read error for ${jsonFallbackPath}:`, e.message);
    }
  }

  return defaultValue;
}

/**
 * Writes data with Level 9 compression and content-hash dirty checking to avoid blind repetitive disk writes.
 */
function writeCompressedJson(gzPath, jsonFallbackPath = null, data = [], options = {}) {
  if (data === undefined) {
    console.warn(`[STORAGE] Refusing to blindly write undefined data to ${gzPath || jsonFallbackPath}`);
    return false;
  }

  try {
    // 1. Minify data with zero indentation whitespace
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);

    // 2. Anti-blind saving: Content hash check
    const hash = crypto.createHash('sha256').update(jsonStr).digest('hex');
    const checkPath = gzPath || jsonFallbackPath;
    const lastHash = contentHashes.get(checkPath);

    const targetDir = path.dirname(checkPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (lastHash === hash && fs.existsSync(checkPath)) {
      // Content is identical: skip redundant disk I/O
      return true;
    }

    // 3. Maximum Compression (Gzip Level 9)
    if (gzPath) {
      const compressed = compressBuffer(jsonStr);
      fs.writeFileSync(gzPath, compressed);
      contentHashes.set(gzPath, hash);
    }

    // 4. Minified fallback JSON (Zero indentation, strictly compact)
    if (jsonFallbackPath) {
      fs.writeFileSync(jsonFallbackPath, jsonStr, 'utf8');
      contentHashes.set(jsonFallbackPath, hash);
    }

    return true;
  } catch (e) {
    console.error(`[STORAGE] Failed to write compressed data to ${gzPath}:`, e);
    return false;
  }
}

/**
 * Universal safe JSON reader: automatically resolves .gz companion or falls back.
 */
function readSafeJson(filePath, defaultValue = null) {
  const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
  const jsonPath = filePath.endsWith('.gz') ? filePath.replace(/\.gz$/, '') : filePath;
  return readCompressedJson(gzPath, jsonPath, defaultValue);
}

/**
 * Universal safe JSON writer: writes maximum level 9 .gz and minified .json fallback.
 */
function writeSafeJson(filePath, data, options = {}) {
  const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
  const jsonPath = filePath.endsWith('.gz') ? filePath.replace(/\.gz$/, '') : filePath;
  return writeCompressedJson(gzPath, jsonPath, data, options);
}

/**
 * Scans a directory and compresses all uncompressed .json files to Level 9 .json.gz,
 * minifying the .json in-place to save disk space.
 */
function compressDirectoryFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return { compressedCount: 0, bytesSaved: 0 };
  let compressedCount = 0;
  let bytesSaved = 0;

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.json') && !file.endsWith('.json.gz')) {
        const fullJsonPath = path.join(dirPath, file);
        const fullGzPath = `${fullJsonPath}.gz`;
        try {
          const stats = fs.statSync(fullJsonPath);
          const rawContent = fs.readFileSync(fullJsonPath, 'utf8');
          const parsed = JSON.parse(rawContent);
          const minified = JSON.stringify(parsed);

          // Write compressed Level 9
          const gzBuf = compressBuffer(minified);
          fs.writeFileSync(fullGzPath, gzBuf);

          // Minify json in place if it had whitespace bloat
          if (rawContent.length > minified.length) {
            fs.writeFileSync(fullJsonPath, minified, 'utf8');
          }

          const originalSize = stats.size;
          const newSize = gzBuf.length;
          bytesSaved += Math.max(0, originalSize - newSize);
          compressedCount++;
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn(`[STORAGE] Error compressing files in ${dirPath}:`, err.message);
  }

  return { compressedCount, bytesSaved };
}

/**
 * Prunes orphaned / obsolete temporary PDF files from user uploads directory.
 * Keeps all PDFs referenced in user applications or created within the last 2 hours.
 */
function pruneOrphanUploads(userDir, validPdfFilenames = []) {
  const uploadsDir = path.join(userDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) return 0;

  let prunedCount = 0;
  const validSet = new Set(validPdfFilenames);
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file.endsWith('.pdf')) {
        const filePath = path.join(uploadsDir, file);
        try {
          const stat = fs.statSync(filePath);
          const ageMs = now - stat.mtimeMs;
          // If older than 2 hours and not in active applications list, safely prune!
          if (ageMs > TWO_HOURS_MS && !validSet.has(file)) {
            fs.unlinkSync(filePath);
            prunedCount++;
          }
        } catch (e) {}
      }
    }
  } catch (err) {}

  return prunedCount;
}

/**
 * Global sweep: compresses all user sandboxes with level 9 and prunes orphaned bloat.
 */
function compressAndPruneAllSandboxes(usersDir) {
  if (!fs.existsSync(usersDir)) return;
  try {
    const userFolders = fs.readdirSync(usersDir).filter(f => {
      try { return fs.statSync(path.join(usersDir, f)).isDirectory(); } catch (e) { return false; }
    });

    let totalCompressed = 0;
    let totalPruned = 0;

    for (const folder of userFolders) {
      const userDir = path.join(usersDir, folder);
      const { compressedCount } = compressDirectoryFiles(userDir);
      totalCompressed += compressedCount;

      // Get valid application PDFs
      const appsGz = path.join(userDir, 'applications.json.gz');
      const appsJson = path.join(userDir, 'applications.json');
      const apps = readCompressedJson(appsGz, appsJson, []);
      const validPdfs = apps.map(a => a.pdfFilename).filter(Boolean);

      const pruned = pruneOrphanUploads(userDir, validPdfs);
      totalPruned += pruned;
    }

    console.log(`[STORAGE] 🗜️ Maximum Compression Sweep: Compressed ${totalCompressed} JSON file(s) to Level 9 Gzip, pruned ${totalPruned} orphaned PDF(s).`);
  } catch (e) {
    console.warn('[STORAGE] Sweep error:', e.message);
  }
}

/**
 * Generates an aggregated, compressed backup snapshot of all user sandboxes.
 */
function createFullBackup(usersDir) {
  const backup = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    users: {}
  };

  if (!fs.existsSync(usersDir)) return backup;

  const userFolders = fs.readdirSync(usersDir).filter(f => {
    try { return fs.statSync(path.join(usersDir, f)).isDirectory(); } catch (e) { return false; }
  });

  for (const userKey of userFolders) {
    const userDir = path.join(usersDir, userKey);
    const logsGz = path.join(userDir, 'logs.json.gz');
    const logsJson = path.join(userDir, 'logs.json');
    const appsGz = path.join(userDir, 'applications.json.gz');
    const appsJson = path.join(userDir, 'applications.json');
    const resumeGz = path.join(userDir, 'resume.json.gz');
    const resumeJson = path.join(userDir, 'resume.json');
    const profileGz = path.join(userDir, 'profile.json.gz');
    const profileJson = path.join(userDir, 'profile.json');
    const tokenGz = path.join(userDir, 'token.json.gz');
    const tokenJson = path.join(userDir, 'token.json');
    const discGz = path.join(userDir, 'enterprise_discovered_jobs.json.gz');
    const discJson = path.join(userDir, 'enterprise_discovered_jobs.json');

    backup.users[userKey] = {
      profile: readCompressedJson(profileGz, profileJson, null),
      token: readCompressedJson(tokenGz, tokenJson, null),
      resume: readCompressedJson(resumeGz, resumeJson, null),
      logs: readCompressedJson(logsGz, logsJson, []),
      applications: readCompressedJson(appsGz, appsJson, []),
      discoveredJobs: readCompressedJson(discGz, discJson, null)
    };
  }

  return backup;
}

/**
 * Restores a full backup snapshot into the users directory.
 */
function restoreFullBackup(usersDir, backupData) {
  if (!backupData || !backupData.users) return false;

  for (const [userKey, userData] of Object.entries(backupData.users)) {
    const userDir = path.join(usersDir, userKey);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    if (userData.profile) {
      writeCompressedJson(path.join(userDir, 'profile.json.gz'), path.join(userDir, 'profile.json'), userData.profile);
    }
    if (userData.token) {
      writeCompressedJson(path.join(userDir, 'token.json.gz'), path.join(userDir, 'token.json'), userData.token);
      const globalToken = path.join(usersDir, '../token.json');
      try {
        writeCompressedJson(globalToken + '.gz', globalToken, userData.token);
      } catch (e) {}
    }
    if (userData.resume) {
      writeCompressedJson(path.join(userDir, 'resume.json.gz'), path.join(userDir, 'resume.json'), userData.resume);
    }
    if (userData.logs) {
      writeCompressedJson(path.join(userDir, 'logs.json.gz'), path.join(userDir, 'logs.json'), userData.logs);
    }
    if (userData.applications) {
      writeCompressedJson(path.join(userDir, 'applications.json.gz'), path.join(userDir, 'applications.json'), userData.applications);
    }
    if (userData.discoveredJobs) {
      writeCompressedJson(path.join(userDir, 'enterprise_discovered_jobs.json.gz'), path.join(userDir, 'enterprise_discovered_jobs.json'), userData.discoveredJobs);
    }
  }

  return true;
}

/**
 * Global compressed archive storage for all outreach history.
 */
const DATA_DIR = path.join(__dirname, '../../data');
const GLOBAL_LOGS_GZ = path.join(DATA_DIR, 'global_outreach_logs.json.gz');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

function getGlobalLogs() {
  return readCompressedJson(GLOBAL_LOGS_GZ, null, []);
}

function appendGlobalLog(entry) {
  try {
    const logs = getGlobalLogs();
    logs.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Cap global logs to 1000 items to prevent unbounded memory growth
    const capped = logs.slice(0, 1000);
    writeCompressedJson(GLOBAL_LOGS_GZ, null, capped);
  } catch (e) {
    console.error('[STORAGE] Failed to append global log:', e.message);
  }
}

module.exports = {
  readCompressedJson,
  writeCompressedJson,
  readSafeJson,
  writeSafeJson,
  compressBuffer,
  decompressBuffer,
  compressDirectoryFiles,
  pruneOrphanUploads,
  compressAndPruneAllSandboxes,
  createFullBackup,
  restoreFullBackup,
  getGlobalLogs,
  appendGlobalLog,
  GLOBAL_LOGS_GZ
};

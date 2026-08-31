const fs = require('fs');
const path = require('path');

async function installBrowser() {
  console.log('[INSTALL-BROWSER] Checking/installing Chrome browser for Puppeteer on Render...');
  try {
    const browsers = require('@puppeteer/browsers');
    let buildId = '121.0.6167.85';
    try {
      const { PUPPETEER_REVISIONS } = require('puppeteer-core/internal/revisions.js');
      if (PUPPETEER_REVISIONS && PUPPETEER_REVISIONS.chrome) {
        buildId = PUPPETEER_REVISIONS.chrome;
      }
    } catch (e) {}

    const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '../.cache/puppeteer');
    fs.mkdirSync(cacheDir, { recursive: true });

    console.log(`[INSTALL-BROWSER] Installing Chrome build (${buildId}) to: ${cacheDir}`);
    const installed = await browsers.install({
      browser: browsers.Browser.CHROME,
      buildId: buildId,
      cacheDir: cacheDir
    });

    console.log(`[INSTALL-BROWSER] Chrome successfully installed at: ${installed.executablePath}`);
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(installed.executablePath, 0o755);
      } catch (e) {}
    }
    return installed.executablePath;
  } catch (err) {
    console.warn('[INSTALL-BROWSER] Pre-install notice (will fallback to runtime install):', err.message);
    return null;
  }
}

if (require.main === module) {
  installBrowser().then(() => process.exit(0)).catch(() => process.exit(0));
}

module.exports = { installBrowser };

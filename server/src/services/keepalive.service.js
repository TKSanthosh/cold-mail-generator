/**
 * 24/7 Keep-Alive Anti-Sleep Heartbeat Service for Render & Cloud Hosts
 * 
 * Render Free Tier puts web services to sleep after 15 minutes of inbound HTTP inactivity.
 * This service automatically self-pings the public application URL every 5-8 minutes to
 * generate active inbound traffic, keeping the background schedulers running 24/7!
 */

const https = require('https');
const http = require('http');

let keepAliveTimer = null;
let lastPingTime = null;
let lastPingStatus = null;
let pingCount = 0;

function getAppUrl(port = 5001) {
  // Only target external Render cloud URL if this process is ACTUALLY running on Render
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
    if (process.env.RENDER_EXTERNAL_URL) {
      return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
    }
    return 'https://cold-mail-generator-6n7t.onrender.com';
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  return `http://localhost:${port}`;
}

function pingSelf(url) {
  const pingUrl = `${url}/api/health`;
  const client = pingUrl.startsWith('https') ? https : http;

  // Use HTTP HEAD method to avoid downloading response bodies (0 bytes egress bandwidth!)
  const req = client.request(pingUrl, { method: 'HEAD', timeout: 15000 }, (res) => {
    lastPingTime = new Date().toISOString();
    lastPingStatus = res.statusCode === 200 ? 'Active (200 OK)' : `HTTP ${res.statusCode}`;
    pingCount++;
    console.log(`[KEEP-ALIVE HEARTBEAT #${pingCount}] Self-pinged (HEAD) ${pingUrl} - Status: ${lastPingStatus} (0 bytes egress bandwidth)`);
  });

  req.on('error', (err) => {
    lastPingTime = new Date().toISOString();
    lastPingStatus = `Error: ${err.message}`;
    console.warn(`[KEEP-ALIVE WARN] Self-ping failed (${pingUrl}):`, err.message);
  });

  req.on('timeout', () => {
    req.destroy();
    console.warn(`[KEEP-ALIVE WARN] Self-ping timed out for ${pingUrl}`);
  });

  req.end();
}

function initKeepAliveService(port = 5001) {
  if (keepAliveTimer) clearInterval(keepAliveTimer);

  const targetUrl = getAppUrl(port);
  console.log(`[KEEP-ALIVE SERVICE] Initialized 24/7 Anti-Sleep Heartbeat (13-min interval, 0-byte HEAD) targeting: ${targetUrl}`);

  // Initial ping after 30 seconds
  setTimeout(() => {
    pingSelf(targetUrl);
  }, 30000);

  // Recurring ping every 13 minutes (780,000ms) - safely under Render's 15-min timeout, reducing requests by 69%
  keepAliveTimer = setInterval(() => {
    const currentUrl = getAppUrl(port);
    pingSelf(currentUrl);
  }, 13 * 60 * 1000);
}

function getKeepAliveStatus(port = 5001) {
  return {
    enabled: true,
    targetUrl: getAppUrl(port),
    isRender: Boolean(process.env.RENDER_EXTERNAL_URL || process.env.RENDER),
    pingInterval: '13 minutes (HEAD, 0-byte)',
    pingCount,
    lastPingTime,
    lastPingStatus,
    renderUrl: process.env.RENDER_EXTERNAL_URL || null
  };
}

module.exports = {
  initKeepAliveService,
  getKeepAliveStatus,
  pingSelf
};
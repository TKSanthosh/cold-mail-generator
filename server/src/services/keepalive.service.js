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
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  return `http://localhost:${port}`;
}

function pingSelf(url) {
  const pingUrl = `${url}/api/health`;
  const client = pingUrl.startsWith('https') ? https : http;

  const req = client.get(pingUrl, { timeout: 15000 }, (res) => {
    lastPingTime = new Date().toISOString();
    lastPingStatus = res.statusCode === 200 ? 'Active (200 OK)' : `HTTP ${res.statusCode}`;
    pingCount++;
    console.log(`[KEEP-ALIVE HEARTBEAT #${pingCount}] Self-pinged ${pingUrl} - Status: ${lastPingStatus} (Container Awake 24/7)`);
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
}

function initKeepAliveService(port = 5001) {
  if (keepAliveTimer) clearInterval(keepAliveTimer);

  const targetUrl = getAppUrl(port);
  console.log(`[KEEP-ALIVE SERVICE] Initialized 24/7 Anti-Sleep Heartbeat targeting: ${targetUrl}`);

  // Initial ping after 15 seconds
  setTimeout(() => {
    pingSelf(targetUrl);
  }, 15000);

  // Recurring ping every 5 minutes (300,000ms) - strictly under Render's 15-min timeout
  keepAliveTimer = setInterval(() => {
    const currentUrl = getAppUrl(port);
    pingSelf(currentUrl);
  }, 5 * 60 * 1000);
}

function getKeepAliveStatus(port = 5001) {
  return {
    enabled: true,
    targetUrl: getAppUrl(port),
    isRender: Boolean(process.env.RENDER_EXTERNAL_URL),
    pingInterval: '5 minutes',
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
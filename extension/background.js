// AI Resume Tailor & ATS Optimizer - Background Service Worker

const DEFAULT_SETTINGS = {
  serverMode: 'auto', // 'auto' | 'local' | 'cloud'
  serverUrl: 'http://localhost:5001',
  localUrl: 'http://localhost:5001',
  renderUrl: 'https://ai-resume-tailor-backend-gldn.onrender.com',
  userKey: 'tksanthosh494_gmail_com',
  autoShowWidget: true,
  autoDownloadPdf: false,
  autoPilotMode: false
};

// Initialize extension defaults on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), (stored) => {
    const updated = { ...DEFAULT_SETTINGS, ...stored };
    chrome.storage.sync.set(updated);
  });

  // Context menu for selected text
  chrome.contextMenus.create({
    id: 'air_optimize_selection',
    title: '⚡ Optimize Resume for Selected JD',
    contexts: ['selection']
  });
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'air_optimize_selection' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'PROCESS_SELECTED_JD',
      selectedText: info.selectionText || ''
    }).catch(err => {
      console.warn('Could not send message to tab:', err);
    });
  }
});

// Centralized message dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TAILOR_RESUME') {
    handleTailorResume(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'DOWNLOAD_PDF') {
    handleDownloadPdf(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'CHECK_SERVER_HEALTH' || request.action === 'PING_SERVER') {
    checkServerHealth(request.serverUrl, request.serverMode)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ online: false, error: err.message }));
    return true;
  }

  if (request.action === 'SEND_EMAIL') {
    handleSendEmail(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'CREATE_DRAFT') {
    handleCreateDraft(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'GET_QA_ITEMS') {
    handleGetQaItems(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'SAVE_QA_ITEM') {
    handleSaveQaItem(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function getStoredSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

async function checkUrlOnline(url, timeoutMs = null) {
  if (!url) return false;
  let timer;
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const isLocal = cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1');
    const timeout = timeoutMs || (isLocal ? 2000 : 8000);
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), timeout);
    
    // First try health check
    const resp = await fetch(`${cleanUrl}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal
    }).catch(() => null);

    if (resp && resp.ok) {
      if (timer) clearTimeout(timer);
      return true;
    }

    // Fallback try applications endpoint
    const appResp = await fetch(`${cleanUrl}/api/applications`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal
    }).catch(() => null);

    if (appResp && appResp.ok) {
      if (timer) clearTimeout(timer);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Smart URL Resolver:
 * Mode 'local': Forces Localhost connection (e.g. http://localhost:5001).
 * Mode 'cloud': Forces 24/7 Cloud connection (e.g. Render backend).
 * Mode 'auto':  Prefers Localhost if online, seamlessly falls back to Cloud backend if offline.
 */
async function resolveLiveServerUrl(preferredUrl, explicitMode) {
  const settings = await getStoredSettings();
  const mode = explicitMode || settings.serverMode || 'auto';
  const renderUrl = (settings.renderUrl || 'https://ai-resume-tailor-backend-gldn.onrender.com').replace(/\/+$/, '');
  const localUrl = (settings.localUrl || 'http://localhost:5001').replace(/\/+$/, '');

  // 1. FORCED LOCAL MODE
  if (mode === 'local') {
    const localCandidates = [
      preferredUrl,
      localUrl,
      'http://localhost:5001',
      'http://127.0.0.1:5001',
      'http://localhost:5000',
      'http://127.0.0.1:5000'
    ].filter(u => u && (u.includes('localhost') || u.includes('127.0.0.1')));

    for (const local of localCandidates) {
      if (await checkUrlOnline(local, 1500)) {
        return local;
      }
    }
    return preferredUrl || localUrl;
  }

  // 2. FORCED CLOUD MODE
  if (mode === 'cloud') {
    const cloudCandidates = [
      preferredUrl,
      renderUrl,
      'https://ai-resume-tailor-backend-gldn.onrender.com'
    ].filter(u => u && !u.includes('localhost') && !u.includes('127.0.0.1'));

    for (const cloud of cloudCandidates) {
      if (await checkUrlOnline(cloud, 8000)) {
        return cloud;
      }
    }
    return preferredUrl || renderUrl;
  }

  // 3. AUTO MODE (Smart Failover)
  // Check local development server FIRST
  const localCandidates = [
    preferredUrl,
    localUrl,
    'http://localhost:5001',
    'http://127.0.0.1:5001',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ].filter(u => u && (u.includes('localhost') || u.includes('127.0.0.1')));

  for (const local of localCandidates) {
    if (await checkUrlOnline(local, 1500)) {
      return local;
    }
  }

  // Localhost is offline -> Use Production Cloud Backend (Render)
  const cloudCandidates = [
    preferredUrl,
    renderUrl,
    'https://ai-resume-tailor-backend-gldn.onrender.com',
    'https://ai-resume-tailor-backend.onrender.com',
    'https://cold-mail-generator.onrender.com'
  ].filter(u => u && !u.includes('localhost') && !u.includes('127.0.0.1'));

  for (const cloud of cloudCandidates) {
    const clean = cloud.replace(/\/+$/, '');
    if (await checkUrlOnline(clean, 8000)) {
      return clean;
    }
  }

  return preferredUrl || localUrl;
}

async function handleTailorResume(data) {
  const settings = await getStoredSettings();
  const rawUrl = data.serverUrl || settings.serverUrl || 'http://localhost:5001';
  const serverUrl = await resolveLiveServerUrl(rawUrl);
  const userKey = data.userKey || settings.userKey || 'tksanthosh494_gmail_com';

  const payload = {
    role: data.role || '',
    company: data.company || '',
    jd: data.jd || '',
    userKey
  };

  const response = await fetch(`${serverUrl}/api/applications/tailor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-key': userKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let errMsg = `Server returned HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(errorText);
      if (errObj.error) errMsg = errObj.error;
    } catch (_) {
      if (errorText) errMsg += `: ${errorText.slice(0, 120)}`;
    }
    throw new Error(errMsg);
  }

  const result = await response.json();
  const app = result.application || {};
  const downloadEndpoint = result.downloadUrl || `/api/applications/${app.id}/pdf?userKey=${encodeURIComponent(userKey)}`;
  const fullDownloadUrl = `${serverUrl}${downloadEndpoint.startsWith('/') ? '' : '/'}${downloadEndpoint}`;

  return {
    success: true,
    application: app,
    atsScore: result.atsScore || 92,
    matchedSkills: result.matchedSkills || [],
    downloadUrl: fullDownloadUrl,
    pdfFilename: result.pdfFilename || app.downloadName || app.pdfFilename || 'Santhosh_TK_Tailored_Resume.pdf',
    serverUrl
  };
}

async function handleDownloadPdf({ url, filename }) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename: filename || 'Tailored_Resume.pdf',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ success: true, downloadId });
      }
    });
  });
}

async function checkServerHealth(serverUrl, serverMode) {
  const liveUrl = await resolveLiveServerUrl(serverUrl, serverMode);
  const isOnline = await checkUrlOnline(liveUrl);
  return { online: isOnline, detectedUrl: liveUrl };
}

async function handleGetQaItems(data = {}) {
  const settings = await getStoredSettings();
  const rawUrl = data.serverUrl || settings.serverUrl || 'http://localhost:5001';
  const serverUrl = await resolveLiveServerUrl(rawUrl);
  const userKey = data.userKey || settings.userKey || 'tksanthosh494_gmail_com';

  const res = await fetch(`${serverUrl}/api/naukri/qa?userKey=${encodeURIComponent(userKey)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const result = await res.json();
  return { success: true, qaItems: result.qaItems || [] };
}

async function handleSaveQaItem(data = {}) {
  const settings = await getStoredSettings();
  const rawUrl = data.serverUrl || settings.serverUrl || 'http://localhost:5001';
  const serverUrl = await resolveLiveServerUrl(rawUrl);
  const userKey = data.userKey || settings.userKey || 'tksanthosh494_gmail_com';

  const res = await fetch(`${serverUrl}/api/naukri/qa`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-key': userKey
    },
    body: JSON.stringify({
      id: data.id,
      question: data.question,
      answer: String(data.answer).trim(),
      category: data.category || 'Recruiter Screening'
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const result = await res.json();
  return { success: true, item: result.item, qaItems: result.qaItems };
}

async function handleSendEmail(data) {
  const settings = await getStoredSettings();
  const rawUrl = data.serverUrl || settings.serverUrl || 'http://localhost:5001';
  const serverUrl = await resolveLiveServerUrl(rawUrl);
  const userKey = data.userKey || settings.userKey || 'tksanthosh494_gmail_com';

  const payload = {
    email: data.email,
    subject: data.subject,
    body: data.body,
    resume: data.resume,
    company: data.company || 'Company',
    hrName: data.hrName || 'Hiring Manager',
    userKey
  };

  const response = await fetch(`${serverUrl}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-key': userKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let errMsg = `Server returned HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(errorText);
      if (errObj.error) errMsg = errObj.error;
    } catch (_) {
      if (errorText) errMsg += `: ${errorText.slice(0, 120)}`;
    }
    throw new Error(errMsg);
  }

  const result = await response.json();
  return { success: true, message: result.message || 'Email sent successfully via Gmail!', result };
}

async function handleCreateDraft(data) {
  const settings = await getStoredSettings();
  const rawUrl = data.serverUrl || settings.serverUrl || 'http://localhost:5001';
  const serverUrl = await resolveLiveServerUrl(rawUrl);
  const userKey = data.userKey || settings.userKey || 'tksanthosh494_gmail_com';

  const payload = {
    email: data.email,
    subject: data.subject,
    body: data.body,
    resume: data.resume,
    company: data.company || 'Company',
    hrName: data.hrName || 'Hiring Manager',
    userKey
  };

  const response = await fetch(`${serverUrl}/api/draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-key': userKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let errMsg = `Server returned HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(errorText);
      if (errObj.error) errMsg = errObj.error;
    } catch (_) {
      if (errorText) errMsg += `: ${errorText.slice(0, 120)}`;
    }
    throw new Error(errMsg);
  }

  const result = await response.json();
  return { success: true, message: result.message || 'Draft saved in Gmail!', result };
}

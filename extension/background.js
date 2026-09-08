// AI Resume Tailor & ATS Optimizer - Background Service Worker

const DEFAULT_SETTINGS = {
  serverUrl: 'http://localhost:5001',
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

  if (request.action === 'PING_SERVER') {
    checkServerHealth(request.serverUrl || 'http://localhost:5001')
      .then(online => sendResponse({ online }))
      .catch(() => sendResponse({ online: false }));
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

async function checkUrlOnline(url) {
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const resp = await fetch(`${cleanUrl}/api/applications`, {
      method: 'GET',
      signal: ctrl.signal
    });
    clearTimeout(timer);
    return resp.ok;
  } catch (e) {
    return false;
  }
}

async function resolveLiveServerUrl(preferredUrl) {
  const clean = (preferredUrl || 'http://localhost:5001').replace(/\/+$/, '');
  if (await checkUrlOnline(clean)) {
    return clean;
  }

  // Auto-failover between port 5001 and 5000
  const alternates = ['http://localhost:5001', 'http://localhost:5000', 'http://127.0.0.1:5001', 'http://127.0.0.1:5000'];
  for (const alt of alternates) {
    if (alt !== clean && await checkUrlOnline(alt)) {
      console.log(`[AI Resume Tailor] Auto-switched server from ${clean} to live server: ${alt}`);
      chrome.storage.sync.set({ serverUrl: alt });
      return alt;
    }
  }
  return clean;
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

async function checkServerHealth(serverUrl) {
  const liveUrl = await resolveLiveServerUrl(serverUrl);
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

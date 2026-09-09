// AI Resume Tailor - Extension Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const serverStatus = document.getElementById('server-status');
  const serverStatusLabel = document.getElementById('server-status-label');
  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');

  const badgeSource = document.getElementById('badge-source');
  const labelDetectedStatus = document.getElementById('label-detected-status');
  const btnRescan = document.getElementById('btn-rescan');
  const btnTogglePause = document.getElementById('btn-toggle-pause');
  const inputRole = document.getElementById('input-role');
  const inputCompany = document.getElementById('input-company');
  const inputJd = document.getElementById('input-jd');
  const badgeJdCount = document.getElementById('badge-jd-count');

  const wrapAction = document.getElementById('wrap-action');
  const btnGenerate = document.getElementById('btn-generate');
  const stateLoading = document.getElementById('state-loading');
  const stateResult = document.getElementById('state-result');
  const stateError = document.getElementById('state-error');
  const errorMessage = document.getElementById('error-message');

  const resScore = document.getElementById('res-score');
  const resSkills = document.getElementById('res-skills');
  const resSummary = document.getElementById('res-summary');
  const btnCopySummary = document.getElementById('btn-copy-summary');
  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  const btnOpenEmail = document.getElementById('btn-open-email');

  const stateEmailDrawer = document.getElementById('state-email-drawer');
  const emailTo = document.getElementById('email-to');
  const emailSubject = document.getElementById('email-subject');
  const emailBody = document.getElementById('email-body');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const btnSendEmail = document.getElementById('btn-send-email');
  const btnDraftEmail = document.getElementById('btn-draft-email');
  const btnCopyEmail = document.getElementById('btn-copy-email');
  const drawerAttachedPdfName = document.getElementById('drawer-attached-pdf-name');
  const drawerStatusBox = document.getElementById('drawer-status-box');

  // Settings inputs
  const setServerUrl = document.getElementById('set-server-url');
  const setUserKey = document.getElementById('set-user-key');
  const setAutoPilot = document.getElementById('set-auto-pilot');
  const setAutoWidget = document.getElementById('set-auto-widget');
  const setAutoDownload = document.getElementById('set-auto-download');
  const btnTestServer = document.getElementById('btn-test-server');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const testResultBox = document.getElementById('test-result-box');

  let currentSettings = {
    serverUrl: 'http://localhost:5001',
    userKey: 'tksanthosh494_gmail_com',
    autoShowWidget: true,
    autoDownloadPdf: false,
    autoPilotMode: false
  };

  let generatedPdfUrl = '';
  let generatedPdfFilename = '';
  let currentTailoredResumeData = null;

  // Load stored settings
  chrome.storage.sync.get(currentSettings, (stored) => {
    currentSettings = { ...currentSettings, ...stored };
    setServerUrl.value = currentSettings.serverUrl;
    setUserKey.value = currentSettings.userKey;
    if (setAutoPilot) setAutoPilot.checked = currentSettings.autoPilotMode !== false;
    setAutoWidget.checked = currentSettings.autoShowWidget;
    setAutoDownload.checked = currentSettings.autoDownloadPdf;

    checkServerConnection();
    scanActiveTab();
  });

  // Check server connection with automatic port failover
  async function checkServerConnection() {
    chrome.runtime.sendMessage({
      action: 'PING_SERVER',
      serverUrl: currentSettings.serverUrl
    }, (resp) => {
      const dot = serverStatus.querySelector('.status-dot');
      if (resp && resp.online) {
        dot.className = 'status-dot online';
        serverStatusLabel.innerText = 'Connected';
        if (resp.detectedUrl && resp.detectedUrl !== currentSettings.serverUrl) {
          currentSettings.serverUrl = resp.detectedUrl;
          setServerUrl.value = resp.detectedUrl;
          chrome.storage.sync.set({ serverUrl: resp.detectedUrl });
        }
        serverStatus.title = `Connected to ${currentSettings.serverUrl}`;
      } else {
        dot.className = 'status-dot offline';
        serverStatusLabel.innerText = 'Offline';
        serverStatus.title = `Cannot reach server. Run 'node server/src/index.js' on port 5001.`;
      }
    });
  }

  // Scan active tab for JD
  async function scanActiveTab() {
    labelDetectedStatus.innerText = 'Scanning page...';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        labelDetectedStatus.innerText = 'No active tab found';
        return;
      }

      if (tab && tab.url) {
        updatePauseButtonState(tab.url);
      }

      const applyJobData = (d) => {
        if (!d) {
          labelDetectedStatus.innerText = 'No JD found on page (paste below)';
          return;
        }
        if (d.role) inputRole.value = d.role;
        if (d.company) inputCompany.value = d.company;
        if (d.jd) {
          inputJd.value = d.jd;
          badgeSource.innerText = d.source || 'Detected';
          labelDetectedStatus.innerText = `${d.source || 'Job details'} detected!`;
        } else {
          labelDetectedStatus.innerText = 'No JD found on page (paste below)';
        }
        updateCharCount();
      };

      chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_JD' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.data) {
          // If content script was not yet injected into this tab, inject dynamically
          if (chrome.scripting && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            }, () => {
              if (chrome.runtime.lastError) {
                labelDetectedStatus.innerText = 'Manual input mode';
                badgeSource.innerText = 'Ready';
                return;
              }
              // Retry after short delay
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_JD' }, (retryResp) => {
                  if (retryResp && retryResp.data) {
                    applyJobData(retryResp.data);
                  } else {
                    labelDetectedStatus.innerText = 'No JD found on page (paste below)';
                  }
                });
              }, 400);
            });
            return;
          }

          labelDetectedStatus.innerText = 'Manual input mode';
          badgeSource.innerText = 'Ready';
          return;
        }

        applyJobData(response.data);
      });
    } catch (e) {
      labelDetectedStatus.innerText = 'Paste JD below';
    }
  }

  let activeDomain = '';

  function updatePauseButtonState(tabUrl) {
    if (!btnTogglePause) return;
    try {
      const urlObj = new URL(tabUrl || '');
      activeDomain = urlObj.hostname.toLowerCase();
    } catch (e) {
      activeDomain = '';
    }

    if (!activeDomain) {
      btnTogglePause.style.display = 'none';
      return;
    }

    btnTogglePause.style.display = 'inline-block';
    chrome.storage.sync.get({ pausedSites: [] }, (data) => {
      const list = data.pausedSites || [];
      const isPaused = list.some(d => d.toLowerCase() === activeDomain);
      if (isPaused) {
        btnTogglePause.classList.add('paused');
        btnTogglePause.innerText = `▶️ Resume on ${activeDomain}`;
        btnTogglePause.title = `Click to resume AI features on ${activeDomain}`;
      } else {
        btnTogglePause.classList.remove('paused');
        btnTogglePause.innerText = `⏸️ Stop for ${activeDomain}`;
        btnTogglePause.title = `Click to stop/pause AI features on ${activeDomain}`;
      }
    });
  }

  if (btnTogglePause) {
    btnTogglePause.addEventListener('click', () => {
      if (!activeDomain) return;
      chrome.storage.sync.get({ pausedSites: [] }, (data) => {
        let list = data.pausedSites || [];
        const index = list.findIndex(d => d.toLowerCase() === activeDomain);
        if (index >= 0) {
          list.splice(index, 1);
        } else {
          list.push(activeDomain);
        }
        chrome.storage.sync.set({ pausedSites: list }, () => {
          updatePauseButtonState(`https://${activeDomain}`);
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'SITE_PAUSE_UPDATED' }).catch(() => {});
            }
          });
        });
      });
    });
  }

  function updateCharCount() {
    const len = (inputJd.value || '').length;
    badgeJdCount.innerText = `${len} characters`;
  }

  inputJd.addEventListener('input', updateCharCount);
  btnRescan.addEventListener('click', scanActiveTab);

  // Settings toggle
  btnToggleSettings.addEventListener('click', () => {
    const isSettingsHidden = viewSettings.classList.contains('hidden');
    if (isSettingsHidden) {
      viewMain.classList.add('hidden');
      viewSettings.classList.remove('hidden');
      btnToggleSettings.innerText = '✕';
    } else {
      viewSettings.classList.add('hidden');
      viewMain.classList.remove('hidden');
      btnToggleSettings.innerText = '⚙️';
    }
  });

  // Test Server Connection button
  btnTestServer.addEventListener('click', async () => {
    testResultBox.className = 'test-result';
    testResultBox.innerText = 'Testing connection...';
    testResultBox.classList.remove('hidden');

    const url = setServerUrl.value.trim();
    chrome.runtime.sendMessage({ action: 'PING_SERVER', serverUrl: url }, (resp) => {
      if (resp && resp.online) {
        testResultBox.className = 'test-result success';
        testResultBox.innerText = `✅ Successfully connected to ${url}`;
      } else {
        testResultBox.className = 'test-result failed';
        testResultBox.innerText = `❌ Could not connect to ${url}. Make sure server is running.`;
      }
    });
  });

  // Save Settings
  btnSaveSettings.addEventListener('click', () => {
    currentSettings.serverUrl = setServerUrl.value.trim();
    currentSettings.userKey = setUserKey.value.trim();
    if (setAutoPilot) currentSettings.autoPilotMode = setAutoPilot.checked;
    currentSettings.autoShowWidget = setAutoWidget.checked;
    currentSettings.autoDownloadPdf = setAutoDownload.checked;

    chrome.storage.sync.set(currentSettings, () => {
      checkServerConnection();
      viewSettings.classList.add('hidden');
      viewMain.classList.remove('hidden');
      btnToggleSettings.innerText = '⚙️';
    });
  });

  // Generate button click
  function formatTailoredPdfName(candidateName, rawCompany, rawRole) {
    let candidate = (candidateName || 'Santhosh_TK').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').replace(/_+/g, '_');
    if (candidate === 'Santhosh_T_K') candidate = 'Santhosh_TK';

    let comp = (rawCompany || 'Company').trim().replace(/^(the|inc|corp|corporation|llc|ltd|pvt|technologies|solutions)\s+/i, '').replace(/[\,\|\-].*$/, '').replace(/\s+(inc|corp|corporation|llc|ltd|pvt|technologies|solutions|india|usa)\.?$/i, '').trim();
    const compUpper = comp.toUpperCase();
    if (compUpper.includes('GOOGLE')) comp = 'Google';
    else if (compUpper.includes('AMAZON') || compUpper.includes('AWS')) comp = 'Amazon';
    else if (compUpper.includes('MICROSOFT')) comp = 'Microsoft';
    else if (compUpper.includes('META') || compUpper.includes('FACEBOOK')) comp = 'Meta';
    else if (compUpper.includes('APPLE')) comp = 'Apple';
    else if (compUpper.includes('NETFLIX')) comp = 'Netflix';
    else if (compUpper.includes('SIFY')) comp = 'Sify';
    else if (compUpper.includes('IQVIA')) comp = 'IQVIA';
    else if (compUpper.includes('LINKEDIN')) comp = 'LinkedIn';
    else if (compUpper.includes('ORACLE')) comp = 'Oracle';
    else comp = comp.split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    comp = comp.replace(/[^a-zA-Z0-9]/g, '') || 'Company';

    const roleStr = (rawRole || 'SWE').trim();
    const rLower = roleStr.toLowerCase();

    // Junk role blacklist
    const junkRoles = [
      'job details', 'job detail', 'details', 'early', 'early career', 'mid', 'advanced',
      'intern', 'internship', 'apply', 'career', 'careers', 'search', 'overview',
      'responsibilities', 'qualifications', 'heading'
    ];
    const isJunk = junkRoles.includes(rLower) || junkRoles.some(j => rLower === j || rLower === `${j} career`);

    let shortRole = 'SWE';

    if (!isJunk) {
      if (rLower.includes('full stack') || rLower.includes('fullstack')) {
        shortRole = 'FullStack_SWE';
      } else if (rLower.includes('backend')) {
        shortRole = 'Backend_SWE';
      } else if (rLower.includes('frontend') || rLower.includes('ui developer') || rLower.includes('web developer')) {
        shortRole = 'Frontend_SWE';
      } else if (rLower.includes('machine learning') || rLower.includes('ml ') || rLower.endsWith(' ml') || rLower.includes('ai ') || rLower.includes('deep learning')) {
        shortRole = 'AI_MLE';
      } else if (rLower.includes('data engineer') || rLower.includes('data platform')) {
        shortRole = 'Data_Eng';
      } else if (rLower.includes('devops') || rLower.includes('sre') || rLower.includes('site reliability')) {
        shortRole = 'DevOps';
      } else if (rLower.includes('cloud')) {
        shortRole = 'Cloud_SWE';
      } else if (rLower.includes('security')) {
        shortRole = 'Security_Eng';
      } else if (rLower.includes('system') || rLower.includes('architect')) {
        shortRole = 'SysArch';
      } else if (rLower.includes('software development engineer') || rLower.includes('sde')) {
        const numMatch = roleStr.match(/\b(viii|vii|iii|vi|iv|ix|ii|v|i|[1-9])\b/i);
        shortRole = numMatch ? `SDE_${numMatch[1].toUpperCase()}` : 'SDE';
      } else if (rLower.includes('software engineer') || rLower.includes('swe')) {
        const numMatch = roleStr.match(/\b(viii|vii|iii|vi|iv|ix|ii|v|i|[1-9])\b/i);
        shortRole = numMatch ? `SWE_${numMatch[1].toUpperCase()}` : 'SWE';
      } else {
        shortRole = roleStr
          .replace(/[,|-].*$/, '')
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('_')
          .replace(/[^a-zA-Z0-9_]/g, '');
      }
    }

    if (!shortRole || junkRoles.includes(shortRole.toLowerCase())) {
      shortRole = 'SWE';
    }

    return `${candidate}_${comp}_${shortRole}.pdf`;
  }

  // Generate button click
  btnGenerate.addEventListener('click', async () => {
    const role = inputRole.value.trim();
    const company = inputCompany.value.trim();
    const jd = inputJd.value.trim();

    if (!jd) {
      showError('Please provide a Job Description (JD) to tailor your resume.');
      return;
    }

    hideError();
    stateResult.classList.add('hidden');
    stateEmailDrawer.classList.add('hidden');
    wrapAction.classList.add('hidden');
    stateLoading.classList.remove('hidden');

    chrome.runtime.sendMessage({
      action: 'TAILOR_RESUME',
      role,
      company,
      jd,
      serverUrl: currentSettings.serverUrl,
      userKey: currentSettings.userKey
    }, (resp) => {
      stateLoading.classList.add('hidden');
      wrapAction.classList.remove('hidden');

      if (!resp || !resp.success) {
        showError(resp?.error || 'Failed to generate tailored resume. Check your server connection.');
        return;
      }

      generatedPdfUrl = resp.downloadUrl;
      generatedPdfFilename = resp.pdfFilename || formatTailoredPdfName('Santhosh_TK', company, role);
      currentTailoredResumeData = resp.application?.tailoredResume || null;

      // Render results
      resScore.innerText = `${resp.atsScore || 95}%`;
      resSummary.innerText = resp.application?.tailoredResume?.summary || 'ATS-tailored professional summary.';

      // Chips
      resSkills.innerHTML = '';
      (resp.matchedSkills || []).forEach(skill => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerText = skill;
        resSkills.appendChild(chip);
      });

      stateResult.classList.remove('hidden');

      // Auto download if enabled
      if (currentSettings.autoDownloadPdf && generatedPdfUrl) {
        downloadPdf();
      }
    });
  });

  function downloadPdf() {
    if (!generatedPdfUrl) return;
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_PDF',
      url: generatedPdfUrl,
      filename: generatedPdfFilename
    }, (res) => {
      if (!res || !res.success) {
        const a = document.createElement('a');
        a.href = generatedPdfUrl;
        a.download = generatedPdfFilename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    });
  }

  btnDownloadPdf.addEventListener('click', downloadPdf);

  btnCopySummary.addEventListener('click', () => {
    const text = resSummary.innerText;
    if (text) {
      navigator.clipboard.writeText(text);
      btnCopySummary.innerText = '✅ Copied!';
      setTimeout(() => { btnCopySummary.innerText = '📋 Copy'; }, 2000);
    }
  });

  // Cold Email Drawer
  btnOpenEmail.addEventListener('click', () => {
    const role = inputRole.value.trim() || 'Software Developer';
    const company = inputCompany.value.trim() || 'your team';
    const candidateName = 'Santhosh T K';

    if (drawerAttachedPdfName) {
      drawerAttachedPdfName.innerText = generatedPdfFilename || `${candidateName.replace(/\s+/g, '_')}_${company.replace(/\s+/g, '')}_Tailored.pdf`;
    }

    emailSubject.value = `${role} | 4+ Years Experience | Interested in ${company}`;
    emailBody.value = `Hi Hiring Team,

I came across the ${role} opening at ${company} and wanted to reach out directly. With 4+ years of software development experience specializing in full-stack engineering (React.js, Node.js, Express, databases, and microservices), I am confident I can make an immediate positive impact on your engineering initiatives.

I have attached my tailored resume for the ${role} position for your review.

I would welcome the opportunity to discuss how my technical background aligns with ${company}'s goals.

Best regards,
${candidateName}
tksanthosh494@gmail.com | +91 8825802707
LinkedIn: https://linkedin.com/in/santhosh-tk`;

    if (drawerStatusBox) {
      drawerStatusBox.className = 'drawer-status hidden';
      drawerStatusBox.innerText = '';
    }

    stateEmailDrawer.classList.toggle('hidden');
    if (!stateEmailDrawer.classList.contains('hidden') && emailTo) {
      emailTo.focus();
    }
  });

  btnCloseDrawer.addEventListener('click', () => {
    stateEmailDrawer.classList.add('hidden');
  });

  function showDrawerStatus(type, msg) {
    if (!drawerStatusBox) return;
    drawerStatusBox.className = `drawer-status ${type}`;
    drawerStatusBox.innerText = msg;
    drawerStatusBox.classList.remove('hidden');
  }

  // Send Email via Gmail
  if (btnSendEmail) {
    btnSendEmail.addEventListener('click', () => {
      const to = emailTo ? emailTo.value.trim() : '';
      const subject = emailSubject.value.trim();
      const body = emailBody.value.trim();
      const role = inputRole.value.trim() || 'Software Developer';
      const company = inputCompany.value.trim() || 'Company';

      if (!to) {
        showDrawerStatus('error', '⚠️ Please enter a recipient email (e.g. recruiter@company.com).');
        if (emailTo) emailTo.focus();
        return;
      }

      if (!subject || !body) {
        showDrawerStatus('error', '⚠️ Email subject and body cannot be empty.');
        return;
      }

      btnSendEmail.disabled = true;
      if (btnDraftEmail) btnDraftEmail.disabled = true;
      showDrawerStatus('loading', '⏳ Sending email with tailored PDF attached via Gmail...');

      chrome.runtime.sendMessage({
        action: 'SEND_EMAIL',
        email: to,
        subject,
        body,
        resume: currentTailoredResumeData,
        role,
        company,
        serverUrl: currentSettings.serverUrl,
        userKey: currentSettings.userKey
      }, (resp) => {
        btnSendEmail.disabled = false;
        if (btnDraftEmail) btnDraftEmail.disabled = false;

        if (!resp || !resp.success) {
          showDrawerStatus('error', `⚠️ ${resp?.error || 'Failed to send email. Check your connection or Gmail auth.'}`);
          return;
        }

        showDrawerStatus('success', '✅ Email sent successfully via Gmail with tailored PDF attached!');
      });
    });
  }

  // Save as Draft in Gmail
  if (btnDraftEmail) {
    btnDraftEmail.addEventListener('click', () => {
      const to = emailTo ? emailTo.value.trim() : '';
      const subject = emailSubject.value.trim();
      const body = emailBody.value.trim();
      const role = inputRole.value.trim() || 'Software Developer';
      const company = inputCompany.value.trim() || 'Company';

      if (!to) {
        showDrawerStatus('error', '⚠️ Please enter a recipient email.');
        if (emailTo) emailTo.focus();
        return;
      }

      btnSendEmail.disabled = true;
      btnDraftEmail.disabled = true;
      showDrawerStatus('loading', '⏳ Saving draft in Gmail with tailored PDF attached...');

      chrome.runtime.sendMessage({
        action: 'CREATE_DRAFT',
        email: to,
        subject,
        body,
        resume: currentTailoredResumeData,
        role,
        company,
        serverUrl: currentSettings.serverUrl,
        userKey: currentSettings.userKey
      }, (resp) => {
        btnSendEmail.disabled = false;
        btnDraftEmail.disabled = false;

        if (!resp || !resp.success) {
          showDrawerStatus('error', `⚠️ ${resp?.error || 'Failed to create draft in Gmail.'}`);
          return;
        }

        showDrawerStatus('success', '✅ Draft saved in Gmail with tailored PDF attached!');
      });
    });
  }

  btnCopyEmail.addEventListener('click', () => {
    const to = emailTo ? emailTo.value.trim() : '';
    const toLine = to ? `To: ${to}\n` : '';
    const fullText = `${toLine}Subject: ${emailSubject.value}\n\n${emailBody.value}`;
    navigator.clipboard.writeText(fullText);
    btnCopyEmail.innerText = '✅ Copied to Clipboard!';
    setTimeout(() => { btnCopyEmail.innerText = '📋 Copy Text'; }, 2000);
  });

  function showError(msg) {
    errorMessage.innerText = msg;
    stateError.classList.remove('hidden');
  }

  function hideError() {
    stateError.classList.add('hidden');
  }
});

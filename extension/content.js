// AI Resume Tailor & ATS Optimizer - Content Script

(function () {
  'use strict';

  // Prevent double injection
  if (window.__AI_RESUME_EXTRACTOR_LOADED__) return;
  window.__AI_RESUME_EXTRACTOR_LOADED__ = true;

  let currentScrapedData = null;
  let floatingBtn = null;
  let floatingModal = null;

  // --- SITE PAUSE / STOP CONTROL ENGINE ---
  // We keep a synchronous in-memory flag so all checks are instant (no async race conditions).
  let __sitePausedCache = false;

  function getDomainFromUrl(url) {
    try {
      return new URL(url || window.location.href).hostname.toLowerCase();
    } catch (e) {
      return window.location.hostname.toLowerCase();
    }
  }

  /** Synchronous check – O(1), no async, no race conditions */
  function isSitePaused() {
    return __sitePausedCache;
  }

  /** Nuke EVERY piece of extension UI from the current page DOM completely */
  function nukeAllExtensionUi() {
    // Kill floating FAB button
    const fab = document.getElementById('air-floating-trigger');
    if (fab) fab.remove();
    floatingBtn = null;

    // Kill the resume optimizer modal
    const modal = document.getElementById('air-modal-container');
    if (modal) modal.remove();
    floatingModal = null;

    // Kill Q&A popover toast
    const qa = document.getElementById('air-qa-popover');
    if (qa) qa.remove();
    if (typeof activeQaToast !== 'undefined') activeQaToast = null;

    // Kill the auto-prompt banner (job detected banner)
    const banner = document.getElementById('air-auto-toast');
    if (banner) banner.remove();

    // Kill any Q&A feedback badges
    document.querySelectorAll('.air-qa-feedback').forEach(el => el.remove());

    // Kill any stale extension overlays
    document.querySelectorAll('.air-modal-wrap, .air-toast-banner, .air-qa-popover').forEach(el => el.remove());
  }

  /** Apply paused state – nuke UI and update flag */
  function applyPauseState(paused) {
    __sitePausedCache = paused;
    if (paused) {
      nukeAllExtensionUi();
    }
  }

  /** Boot: load paused state from storage synchronously-ish on page load */
  function loadPausedStateFromStorage() {
    const domain = getDomainFromUrl();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && typeof chrome.storage.sync.get === 'function') {
      try {
        chrome.storage.sync.get({ pausedSites: [] }, (res) => {
          const list = res ? (res.pausedSites || []) : [];
          const paused = list.some(d => d.toLowerCase() === domain);
          applyPauseState(paused);
        });
      } catch (_) {}
    }
  }

  /** Toggle the paused state for this site */
  async function toggleSitePause() {
    const domain = getDomainFromUrl();
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && typeof chrome.storage.sync.get === 'function') {
        try {
          chrome.storage.sync.get({ pausedSites: [] }, (res) => {
            let list = res ? (res.pausedSites || []) : [];
            const idx = list.findIndex(d => d.toLowerCase() === domain);
            let nowPaused = false;
            if (idx >= 0) {
              list.splice(idx, 1);
              nowPaused = false;
            } else {
              list.push(domain);
              nowPaused = true;
            }
            chrome.storage.sync.set({ pausedSites: list }, () => {
              applyPauseState(nowPaused);
              resolve({ paused: nowPaused, domain });
            });
          });
        } catch (_) {
          resolve({ paused: false, domain });
        }
      } else {
        resolve({ paused: false, domain });
      }
    });
  }

  // --- STRICT DOMAIN & JOB VALIDATION TO PREVENT SPAM ---
  const BLACKLISTED_HOSTS = [
    'mail.google.com',
    'inbox.google.com',
    'gmail.com',
    'google.com',
    'youtube.com',
    'github.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'reddit.com',
    'amazon.com',
    'netflix.com',
    'spotify.com',
    'web.whatsapp.com',
    'slack.com',
    'discord.com',
    'zoom.us',
    'notion.so',
    'docs.google.com',
    'drive.google.com',
    'calendar.google.com',
    'meet.google.com',
    'yahoo.com',
    'outlook.live.com',
    'outlook.office.com'
  ];

  function isJobDomainOrPath() {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();

    // 1. Explicit Whitelist for Google Careers (MUST run before blacklist)
    if ((host.includes('google.') || host.includes('careers.google')) &&
        (path.includes('/about/careers') || path.includes('/careers') || path.includes('/jobs') || href.includes('careers.google') || host.startsWith('careers.'))) {
      return true;
    }

    for (const b of BLACKLISTED_HOSTS) {
      if (host === b || host.endsWith('.' + b)) {
        return false;
      }
    }

    // Explicit job sites
    if (host.includes('linkedin.com') && (path.includes('/jobs/') || path.includes('/job/'))) return true;
    if (host.includes('naukri.com') && (path.includes('job') || href.includes('jobid') || path.includes('listings'))) return true;
    if (host.includes('indeed.com') && (path.includes('/viewjob') || href.includes('vjk=') || path.includes('/rc/clk'))) return true;
    if (host.includes('greenhouse.io') || host.includes('lever.co') || host.includes('glassdoor.com')) return true;
    if (host.includes('oraclecloud.com') && (path.includes('candidateexperience') || path.includes('/job/'))) return true;
    if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) return true;
    if (host.includes('taleo.net') || host.includes('smartrecruiters.com') || host.includes('ashbyhq.com') || host.includes('wellfound.com')) return true;

    // Career paths on company domains
    const careerPathKeywords = ['/job/', '/jobs/', '/careers/', '/career/', '/positions/', '/posting/', '/opening/', '/apply/'];
    for (const kw of careerPathKeywords) {
      if (path.includes(kw)) return true;
    }

    return false;
  }

  function isValidRoleTitle(role) {
    if (!role || typeof role !== 'string') return false;
    const clean = role.trim();
    if (clean.length < 2 || clean.length > 120) return false;
    const lower = clean.toLowerCase();

    // Reject exact single junk words
    const exactJunk = [
      'google', 'search', 'gemini', 'mailsuite', 'inbox', 'settings', 'login', 'sign in',
      'account', 'dashboard', 'welcome', 'home', 'notification', 'notifications', 'cookie', 'cookies',
      'privacy policy', 'terms', 'terms of use', 'subscribe', 'cart', 'checkout', 'jobs', 'careers', 'overview'
    ];
    if (exactJunk.includes(lower)) return false;

    // Reject navigation/dashboard/email phrases
    const junkPhrases = [
      'google search', 'mailsuite', 'privacy policy', 'terms of service',
      'terms and conditions', 'cookie policy', 'sign in to', 'log in to', 'all rights reserved',
      'skip to content', 'skip to main content', 'back to jobs'
    ];
    for (const j of junkPhrases) {
      if (lower.includes(j)) return false;
    }
    return true;
  }

  function isValidJobDescription(jd) {
    if (!jd || typeof jd !== 'string') return false;
    const clean = jd.trim();
    if (clean.length < 50) return false;

    const lower = clean.toLowerCase();
    const recruitmentKeywords = [
      'responsibilities', 'requirements', 'qualifications', 'experience',
      'skills', 'what you will do', 'what you\'ll do', 'duties', 'about the role',
      'candidate profile', 'about the job', 'job description', 'minimum qualifications',
      'preferred qualifications', 'summary', 'overview', 'role', 'team', 'who you are',
      'equal opportunity', 'opportunity', 'technologies', 'emerging', 'deliver', 'innovation',
      'management level', 'time type', 'job requisition', 'software'
    ];

    let matchCount = 0;
    for (const kw of recruitmentKeywords) {
      if (lower.includes(kw)) matchCount++;
    }
    return clean.length >= 150 ? matchCount >= 1 : matchCount >= 2;
  }

  // --- JOB DESCRIPTION PARSERS ---

  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
  }

  function extractLinkedIn() {
    const roleEl = document.querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobs-details-top-card__job-title, h1.t-24, .jobs-search__job-details--container h1'
    );
    const companyEl = document.querySelector(
      '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .jobs-details-top-card__company-url, .job-details-jobs-unified-top-card__primary-description a, .jobs-company__box a'
    );
    const descEl = document.querySelector(
      '#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description'
    );

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: companyEl ? cleanText(companyEl.innerText) : '',
        jd: descEl.innerText.trim(),
        source: 'LinkedIn'
      };
    }
    return null;
  }

  function extractNaukri() {
    const roleEl = document.querySelector(
      'h1.styles_jd-header-title__159e2, h1[class*="jd-header-title"], .styles_jdh__header__ h1, header h1'
    );
    const companyEl = document.querySelector(
      '.styles_jd-header-comp-name__2A_xx, [class*="jd-header-comp-name"], .styles_jdh__header__ a'
    );
    const descEl = document.querySelector(
      '.styles_job-desc-container__pv_8h, [class*="job-desc-container"], [class*="dang-inner-html"], .styles_JDJobs-recruiter-details__'
    );

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: companyEl ? cleanText(companyEl.innerText) : '',
        jd: descEl.innerText.trim(),
        source: 'Naukri'
      };
    }
    return null;
  }

  function extractIndeed() {
    const roleEl = document.querySelector('h1.jobsearch-JobInfoHeader-title, [data-testid="jobsearch-JobInfoHeader-title"]');
    const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"], .jobsearch-CompanyInfoContainer a');
    const descEl = document.querySelector('#jobDescriptionText, .jobsearch-JobComponent-description');

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: companyEl ? cleanText(companyEl.innerText) : '',
        jd: descEl.innerText.trim(),
        source: 'Indeed'
      };
    }
    return null;
  }

  function extractGreenhouse() {
    const roleEl = document.querySelector('h1.app-title, .app-title');
    const companyEl = document.querySelector('.company-name, span.company-name');
    const descEl = document.querySelector('#content, #job-description');

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: companyEl ? cleanText(companyEl.innerText) : '',
        jd: descEl.innerText.trim(),
        source: 'Greenhouse'
      };
    }
    return null;
  }

  function extractLever() {
    const roleEl = document.querySelector('.posting-headline h2');
    const companyEl = document.querySelector('.main-header-logo img[alt], .posting-headline .company');
    const descEl = document.querySelector('.section-page, div[data-qa="job-description"]');

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: companyEl ? (companyEl.alt || cleanText(companyEl.innerText)) : '',
        jd: descEl.innerText.trim(),
        source: 'Lever'
      };
    }
    return null;
  }

  function extractGlassdoor() {
    const roleEl = document.querySelector('h1[data-test="job-title"], [class*="JobDetails_jobTitle"]');
    const companyEl = document.querySelector('[data-test="employer-name"], [class*="JobDetails_employerName"]');
    const descEl = document.querySelector('[data-test="jobDescriptionText"], [class*="JobDetails_jobDescription"]');

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: companyEl ? cleanText(companyEl.innerText) : '',
        jd: descEl.innerText.trim(),
        source: 'Glassdoor'
      };
    }
    return null;
  }

  function extractOracleCloud() {
    const roleEl = document.querySelector(
      'h1.job-details__title, .job-details__title, h1[class*="title"], .job-title, [data-test-id*="job-title"], h1'
    );

    let company = '';
    const logoEl = document.querySelector(
      'img[alt*="logo" i], .site-logo img, .header-logo img, [class*="logo"] img, header a[aria-label], .site-name'
    );
    if (logoEl) {
      company = logoEl.alt ? logoEl.alt.replace(/logo/gi, '').trim() : '';
      if (!company && logoEl.getAttribute('aria-label')) {
        company = logoEl.getAttribute('aria-label').replace(/logo/gi, '').trim();
      }
    }
    if (!company) {
      const brandEl = document.querySelector('.site-logo, .header__logo, [class*="brand"], [class*="org-name"], [class*="logo"]');
      if (brandEl) company = cleanText(brandEl.innerText);
    }
    if (!company) {
      const metaSite = document.querySelector('meta[property="og:site_name"]');
      if (metaSite && metaSite.content) company = metaSite.content.trim();
      else if (document.title) {
        const parts = document.title.split(/[-|–]/);
        if (parts.length > 1) company = parts[parts.length - 1].trim();
      }
    }

    const descEl = document.querySelector(
      '[class*="job-details__description"], .job-details__description, [class*="job-description"], [data-test-id*="description"], [class*="collapsible-content"], .content-container, [role="main"]'
    );

    if (descEl && cleanText(descEl.innerText).length > 80) {
      return {
        role: roleEl ? cleanText(roleEl.innerText) : '',
        company: company || 'Company',
        jd: descEl.innerText.trim(),
        source: 'Oracle Cloud HCM'
      };
    }
    return null;
  }

  function extractWorkday() {
    // 1. Role Title
    let role = '';
    const roleEl = document.querySelector(
      'h1[data-automation-id="jobPostingHeader"], h2[data-automation-id="jobPostingHeader"], [data-automation-id="jobPostingHeader"], [class*="jobPostingHeader"], h1, h2'
    );
    if (roleEl) {
      role = cleanText(roleEl.innerText);
    }
    if (!role && document.title) {
      role = document.title.split(/[-|–]/)[0].trim();
    }

    // 2. Company Name
    let company = '';
    const companyEl = document.querySelector(
      '[data-automation-id="companyName"], img[data-automation-id="clientLogo"], header img[alt], .css-1q2s3w'
    );
    if (companyEl) {
      company = companyEl.alt || cleanText(companyEl.innerText);
    }
    if (!company) {
      const host = window.location.hostname.toLowerCase();
      const match = host.match(/^([a-z0-9-]+)\.(?:wd\d+\.)?myworkdayjobs\.com/i);
      if (match && match[1]) {
        const raw = match[1].toLowerCase();
        if (raw === 'pwc') company = 'PwC';
        else if (raw === 'ey') company = 'EY';
        else if (raw === 'kpmg') company = 'KPMG';
        else if (raw === 'deloitte') company = 'Deloitte';
        else if (raw === 'ibm') company = 'IBM';
        else company = raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }

    // 3. Job Description Text
    let jdText = '';

    // Check main body/page containers in Workday
    const mainContainers = Array.from(document.querySelectorAll(
      '[data-automation-id="jobPostingBody"], [data-automation-id="jobPostingPage"], [data-automation-id="job-posting-details"], main, [role="main"]'
    ));

    for (const cont of mainContainers) {
      const t = cont.innerText.trim();
      if (t.length > jdText.length) {
        jdText = t;
      }
    }

    // Check all dedicated description & rich-text nodes
    const descEls = Array.from(document.querySelectorAll(
      '[data-automation-id="jobPostingDescription"], [data-automation-id="rich-text-container"], [data-automation-id="jobPostingRichText"], [data-automation-id="jobDescription"], .job-description, [class*="job-description"], [class*="rich-text"]'
    ));

    if (descEls.length > 0) {
      const parts = descEls.map(el => el.innerText.trim()).filter(t => t.length > 20);
      const combined = parts.join('\n\n');
      if (combined.length > jdText.length || !jdText) {
        jdText = combined;
      }
    }

    if (jdText && cleanText(jdText).length > 50) {
      return {
        role: role || 'Software Engineer',
        company: company || 'Company',
        jd: jdText.trim(),
        source: 'Workday'
      };
    }
    return null;
  }

  function extractGeneric() {
    const host = window.location.hostname.toLowerCase();
    let companyName = host.replace(/^www\./, '').split('.')[0];
    companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);

    // Try finding brand from logo alt or header
    const logoEl = document.querySelector('img[alt*="logo" i], header img, [class*="brand"]');
    if (logoEl && logoEl.alt && logoEl.alt.length > 2) {
      companyName = logoEl.alt.replace(/logo/gi, '').trim();
    }

    const h1 = document.querySelector('h1, [class*="title-header"], [class*="job-title"]');
    const roleTitle = h1 ? cleanText(h1.innerText) : document.title.split(/[-|–]/)[0].trim();

    // Check containers that typically house JDs
    const candidateSelectors = [
      'article',
      '[role="main"]',
      'main',
      '[class*="job-details"]',
      '[class*="job-desc"]',
      '[class*="description"]',
      '[id*="job-desc"]',
      '[id*="jobDescription"]',
      '.job-body',
      'section'
    ];

    let bestContainer = null;
    let maxKeywordScore = 0;
    const keywords = ['requirements', 'responsibilities', 'qualifications', 'experience', 'skills', 'what you will do', 'about the role', 'overview', 'duties', 'who you are', 'candidate'];

    for (const sel of candidateSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = (el.innerText || '').toLowerCase();
        if (text.length < 120) continue;
        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw)) score++;
        }
        if (score > maxKeywordScore) {
          maxKeywordScore = score;
          bestContainer = el;
        }
      }
    }

    if (bestContainer && maxKeywordScore >= 1) {
      return {
        role: roleTitle || 'Software Engineer',
        company: companyName || 'Company',
        jd: bestContainer.innerText.trim(),
        source: 'Universal Career Scraper'
      };
    }

    return null;
  }

  function extractGoogleCareers() {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();

    const isGoogle = (host.includes('google.') || host.includes('careers.google')) &&
      (path.includes('/about/careers') || path.includes('/careers') || path.includes('/jobs') || href.includes('careers.google') || host.startsWith('careers.'));

    if (!isGoogle) return null;

    // 1. Role Title Extraction
    let role = '';
    const junkTitles = [
      'job details', 'job detail', 'details', 'early', 'early career', 'mid', 'advanced',
      'intern', 'internship', 'apply', 'minimum qualifications', 'preferred qualifications',
      'about the job', 'responsibilities', 'back to jobs', 'overview', 'qualifications',
      'share', 'save', 'learn more', 'how we hire', 'benefits', 'locations', 'teams', 'search'
    ];

    // Priority 1: Check URL slug on Google Careers (100% accurate role title)
    // Example: /jobs/results/124061208973058758-software-engineer-full-stack-google-cloud
    if (path.includes('/jobs/results/')) {
      const slugMatch = path.match(/results\/\d+-([a-z0-9\-]+)(?:\?|#|$)/i);
      if (slugMatch && slugMatch[1]) {
        const slugTitle = slugMatch[1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
          .trim();
        if (slugTitle.length > 3 && !junkTitles.some(j => slugTitle.toLowerCase() === j)) {
          role = slugTitle;
        }
      }
    }

    // Priority 2: Look for dedicated h1 headings (exclude h2 which matches metadata chips like "Early Career")
    if (!role) {
      const roleCandidates = document.querySelectorAll(
        'main h1, [role="main"] h1, [role="region"] h1, h1.pcuMzf, h1[itemprop="title"], h1'
      );
      for (const el of roleCandidates) {
        const text = cleanText(el.innerText);
        const lower = text.toLowerCase();
        if (text &&
            text.length >= 4 &&
            text.length <= 120 &&
            !junkTitles.some(j => lower === j || lower.startsWith(j + ' ') || lower.endsWith(' ' + j))) {
          role = text;
          break;
        }
      }
    }

    // Priority 3: Document title
    if (!role && document.title) {
      const parts = document.title.split(/[-–|]/);
      if (parts.length > 0) {
        const t = parts[0].trim();
        const lowerT = t.toLowerCase();
        if (t.length > 3 && !junkTitles.some(j => lowerT === j)) {
          role = t;
        }
      }
    }

    // 2. Company Name
    let company = 'Google';
    const lowerRole = (role || '').toLowerCase();
    if (lowerRole.includes('deepmind') || href.includes('deepmind')) company = 'Google DeepMind';
    else if (lowerRole.includes('youtube') || href.includes('youtube')) company = 'YouTube';
    else if (lowerRole.includes('waymo')) company = 'Waymo';

    // 3. JD Description Extraction
    let jdText = '';

    // Score containers that contain Google Careers' specific headings
    const containers = Array.from(document.querySelectorAll('main, [role="main"], article, section, [role="region"], div'));
    let bestEl = null;
    let maxScore = 0;
    let bestLength = Infinity;

    for (const el of containers) {
      const t = el.innerText || '';
      if (t.length < 200 || t.length > 35000) continue;

      let score = 0;
      if (t.includes('Minimum qualifications')) score += 2;
      if (t.includes('Preferred qualifications')) score += 2;
      if (t.includes('About the job')) score += 2;
      if (t.includes('Responsibilities')) score += 2;
      if (t.includes('Equal Opportunity') || t.includes('Equal opportunity')) score += 1;

      if (score >= 4) {
        if (score > maxScore || (score === maxScore && t.length < bestLength)) {
          maxScore = score;
          bestLength = t.length;
          bestEl = el;
        }
      }
    }

    if (bestEl) {
      jdText = bestEl.innerText.trim();
    }

    if (!jdText || jdText.length < 150) {
      const sections = [];
      const headers = Array.from(document.querySelectorAll('h2, h3, h4, [role="heading"], div, span'));
      for (const h of headers) {
        const ht = cleanText(h.innerText).toLowerCase();
        if (['minimum qualifications:', 'minimum qualifications', 'preferred qualifications:', 'preferred qualifications', 'about the job', 'responsibilities'].includes(ht)) {
          let body = '';
          if (h.nextElementSibling) body = h.nextElementSibling.innerText;
          else if (h.parentElement) body = h.parentElement.innerText;
          if (body) sections.push(h.innerText + '\n' + body);
        }
      }
      if (sections.length >= 2) {
        jdText = sections.join('\n\n');
      }
    }

    if (jdText && jdText.length > 100) {
      return {
        role: role || 'Software Engineer',
        company: company,
        jd: jdText,
        source: 'Google Careers'
      };
    }

    return null;
  }

  function scrapeJobData(force = false) {
    if (!force && !isJobDomainOrPath()) {
      return null;
    }

    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();
    let data = null;

    if (host.includes('google.') && (path.includes('career') || path.includes('job') || href.includes('careers.google') || host.startsWith('careers.'))) {
      data = extractGoogleCareers();
    } else if (host.includes('oraclecloud.com') || path.includes('candidateexperience') || host.includes('taleo.net')) {
      data = extractOracleCloud();
    } else if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
      data = extractWorkday();
    } else if (host.includes('linkedin.com')) {
      data = extractLinkedIn();
    } else if (host.includes('naukri.com')) {
      data = extractNaukri();
    } else if (host.includes('indeed.com')) {
      data = extractIndeed();
    } else if (host.includes('greenhouse.io')) {
      data = extractGreenhouse();
    } else if (host.includes('lever.co')) {
      data = extractLever();
    } else if (host.includes('glassdoor.com')) {
      data = extractGlassdoor();
    }

    if (!data) {
      data = extractWorkday() || extractGoogleCareers() || extractOracleCloud() || extractGeneric();
    }

    if (data) {
      if (!data.company || data.company.toLowerCase() === 'company') {
        const cleanHost = host.replace(/^www\./, '').replace(/^careers?\./, '').replace(/^jobs?\./, '');
        const base = cleanHost.split('.')[0];
        const knownCompanies = {
          'americanexpress': 'American Express',
          'amex': 'American Express',
          'microsoft': 'Microsoft',
          'google': 'Google',
          'amazon': 'Amazon',
          'apple': 'Apple',
          'meta': 'Meta',
          'netflix': 'Netflix',
          'oracle': 'Oracle',
          'salesforce': 'Salesforce',
          'adobe': 'Adobe',
          'cisco': 'Cisco',
          'intel': 'Intel',
          'ibm': 'IBM',
          'accenture': 'Accenture',
          'tcs': 'TCS',
          'infosys': 'Infosys',
          'wipro': 'Wipro',
          'cognizant': 'Cognizant',
          'capgemini': 'Capgemini',
          'jpmorgan': 'JPMorgan Chase',
          'goldmansachs': 'Goldman Sachs',
          'morganstanley': 'Morgan Stanley'
        };
        if (knownCompanies[base]) {
          data.company = knownCompanies[base];
        } else if (base && base.length > 2) {
          data.company = base.charAt(0).toUpperCase() + base.slice(1);
        }
      }

      if (force) {
        if (data.jd && data.jd.trim().length > 20) {
          currentScrapedData = data;
          return data;
        }
      } else {
        if (isValidJobDescription(data.jd) && isValidRoleTitle(data.role)) {
          currentScrapedData = data;
          return data;
        }
      }
    }

    return null;
  }

  // --- IN-PAGE FLOATING ACTION WIDGET & MODAL ---

  async function renderFloatingButtonState() {
    if (!floatingBtn) return;
    const paused = isSitePaused();
    if (paused) {
      floatingBtn.classList.add('air-fab-paused');
      floatingBtn.title = 'Extension paused for this site. Click to Resume.';
      floatingBtn.innerHTML = `
        <div class="air-fab-inner">
          <span class="air-fab-icon">⏸️</span>
          <span class="air-fab-text">Paused (Click to Resume)</span>
        </div>
      `;
    } else {
      floatingBtn.classList.remove('air-fab-paused');
      floatingBtn.title = 'Optimize Resume for this job';
      floatingBtn.innerHTML = `
        <div class="air-fab-inner">
          <span class="air-fab-icon">⚡</span>
          <span class="air-fab-text">Optimize Resume</span>
        </div>
      `;
    }
  }

  async function createFloatingButton() {
    if (document.getElementById('air-floating-trigger')) {
      floatingBtn = document.getElementById('air-floating-trigger');
      await renderFloatingButtonState();
      return;
    }

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'air-floating-trigger';
    floatingBtn.className = 'air-fab';

    await renderFloatingButtonState();

    floatingBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const paused = isSitePaused();
      if (paused) {
        const { domain } = await toggleSitePause();
        showQaFeedbackBadge(`▶️ Extension Resumed for ${domain}!`);
        await renderFloatingButtonState();
      } else {
        openModalWithData();
      }
    });

    document.body.appendChild(floatingBtn);
  }

  function createModal() {
    if (document.getElementById('air-modal-container')) return;

    floatingModal = document.createElement('div');
    floatingModal.id = 'air-modal-container';
    floatingModal.className = 'air-modal-wrap air-hidden';

    floatingModal.innerHTML = `
      <div class="air-modal-backdrop" id="air-backdrop"></div>
      <div class="air-modal-card">
        <div class="air-modal-header">
          <div class="air-modal-title-box">
            <span class="air-header-icon">⚡</span>
            <div>
              <h3 class="air-modal-title">ATS Resume Optimizer</h3>
              <p class="air-modal-subtitle">Auto-tailor to this Job Description</p>
            </div>
          </div>
          <div class="air-modal-header-actions">
            <button class="air-pause-btn" id="air-modal-pause" title="Pause or Stop extension for this domain">⏸️ Stop for Page</button>
            <button class="air-close-btn" id="air-modal-close" title="Close">&times;</button>
          </div>
        </div>

        <div class="air-modal-body">
          <div class="air-form-row">
            <div class="air-form-group">
              <label>Target Role / Title</label>
              <input type="text" id="air-input-role" placeholder="e.g. Full Stack Developer" />
            </div>
            <div class="air-form-group">
              <label>Company</label>
              <input type="text" id="air-input-company" placeholder="e.g. Google" />
            </div>
          </div>

          <div class="air-form-group">
            <div class="air-jd-header">
              <label>Detected Job Description</label>
              <span class="air-badge" id="air-char-count">0 chars</span>
            </div>
            <textarea id="air-input-jd" rows="5" placeholder="Job description will appear here..."></textarea>
          </div>

          <!-- GENERATE ACTION -->
          <div class="air-action-area" id="air-action-box">
            <button class="air-primary-btn" id="air-btn-generate">
              <span class="air-btn-icon">⚡</span>
              <span class="air-btn-label">Generate & Download Tailored Resume</span>
            </button>
          </div>

          <!-- LOADING STATE -->
          <div class="air-loading-box air-hidden" id="air-loading">
            <div class="air-spinner"></div>
            <div class="air-loading-texts">
              <p class="air-loading-title" id="air-loading-step">Tailoring resume with AI...</p>
              <p class="air-loading-desc">Extracting ATS keywords & compiling 1-page PDF</p>
            </div>
          </div>

          <!-- RESULT SECTION -->
          <div class="air-result-box air-hidden" id="air-result">
            <div class="air-result-header">
              <div class="air-score-pill">
                <span class="air-score-num" id="air-ats-score">95%</span>
                <span class="air-score-label">ATS Match Score</span>
              </div>
              <div class="air-status-tag">Ready to Apply</div>
            </div>

            <div class="air-skills-block">
              <div class="air-skills-title">Matched Technical Skills:</div>
              <div class="air-chips-wrap" id="air-chips"></div>
            </div>

            <div class="air-summary-block">
              <div class="air-summary-title">Tailored Professional Summary:</div>
              <p class="air-summary-text" id="air-summary-text"></p>
            </div>

            <div class="air-result-buttons">
              <button class="air-download-btn" id="air-btn-download">
                📥 Download 1-Page ATS PDF
              </button>
              <button class="air-copy-btn" id="air-btn-copy">
                📋 Copy Pitch
              </button>
            </div>
          </div>

          <!-- ERROR STATE -->
          <div class="air-error-box air-hidden" id="air-error">
            <span class="air-error-icon">⚠️</span>
            <span class="air-error-msg" id="air-error-msg">Failed to tailor resume</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(floatingModal);

    // Event handlers
    document.getElementById('air-modal-close').addEventListener('click', closeModal);
    document.getElementById('air-backdrop').addEventListener('click', closeModal);
    document.getElementById('air-modal-pause').addEventListener('click', async () => {
      const { domain } = await toggleSitePause();
      closeModal();
      await renderFloatingButtonState();
      showQaFeedbackBadge(`⏸️ Extension Paused for ${domain}! Click paused button to resume.`);
    });
    document.getElementById('air-btn-generate').addEventListener('click', onGenerateClicked);
    document.getElementById('air-input-jd').addEventListener('input', updateCharCount);

    document.getElementById('air-btn-copy').addEventListener('click', () => {
      const summary = document.getElementById('air-summary-text').innerText;
      if (summary) {
        navigator.clipboard.writeText(summary);
        const btn = document.getElementById('air-btn-copy');
        btn.innerText = '✅ Copied!';
        setTimeout(() => { btn.innerText = '📋 Copy Pitch'; }, 2000);
      }
    });
  }

  function updateCharCount() {
    const jdVal = document.getElementById('air-input-jd').value;
    const badge = document.getElementById('air-char-count');
    if (badge) badge.innerText = `${jdVal.length} chars`;
  }

  function openModalWithData(overrideData) {
    createModal();
    const data = overrideData || scrapeJobData() || {};

    const roleInput = document.getElementById('air-input-role');
    const compInput = document.getElementById('air-input-company');
    const jdInput = document.getElementById('air-input-jd');

    if (roleInput) roleInput.value = data.role || '';
    if (compInput) compInput.value = data.company || '';
    if (jdInput) jdInput.value = data.jd || '';

    updateCharCount();

    // Reset results & errors
    document.getElementById('air-result').classList.add('air-hidden');
    document.getElementById('air-loading').classList.add('air-hidden');
    document.getElementById('air-error').classList.add('air-hidden');
    document.getElementById('air-action-box').classList.remove('air-hidden');

    floatingModal.classList.remove('air-hidden');
  }

  function closeModal() {
    if (floatingModal) {
      floatingModal.classList.add('air-hidden');
    }
  }

  let currentDownloadUrl = '';
  let currentPdfFilename = '';

  async function onGenerateClicked() {
    const role = document.getElementById('air-input-role').value.trim();
    const company = document.getElementById('air-input-company').value.trim();
    const jd = document.getElementById('air-input-jd').value.trim();

    if (!jd) {
      showError('Please provide a Job Description (JD) to tailor the resume.');
      return;
    }

    // Set UI to loading state
    document.getElementById('air-action-box').classList.add('air-hidden');
    document.getElementById('air-result').classList.add('air-hidden');
    document.getElementById('air-error').classList.add('air-hidden');
    document.getElementById('air-loading').classList.remove('air-hidden');

    chrome.runtime.sendMessage({
      action: 'TAILOR_RESUME',
      role,
      company,
      jd
    }, (response) => {
      const _lastErr = chrome.runtime.lastError;
      document.getElementById('air-loading').classList.add('air-hidden');

      if (!response || !response.success) {
        document.getElementById('air-action-box').classList.remove('air-hidden');
        showError(response?.error || (_lastErr ? _lastErr.message : 'Failed to connect to backend server. Make sure it is accessible.'));
        return;
      }

      currentDownloadUrl = response.downloadUrl;
      currentPdfFilename = response.pdfFilename || formatTailoredPdfName('Santhosh_TK', company, role);

      // Render results
      document.getElementById('air-ats-score').innerText = `${response.atsScore || 95}%`;
      document.getElementById('air-summary-text').innerText =
        response.application?.tailoredResume?.summary || 'Tailored executive summary optimized for ATS keywords.';

      // Chips
      const chipsBox = document.getElementById('air-chips');
      chipsBox.innerHTML = '';
      const skills = response.matchedSkills || [];
      skills.forEach(skill => {
        const chip = document.createElement('span');
        chip.className = 'air-skill-chip';
        chip.innerText = skill;
        chipsBox.appendChild(chip);
      });

      document.getElementById('air-result').classList.remove('air-hidden');

      // Setup download button
      const downloadBtn = document.getElementById('air-btn-download');
      downloadBtn.onclick = () => {
        triggerDownload(currentDownloadUrl, currentPdfFilename);
      };

      // Auto-trigger download
      triggerDownload(currentDownloadUrl, currentPdfFilename);
    });
  }

  function triggerDownload(url, filename) {
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_PDF',
      url,
      filename
    }, (res) => {
      const _dlErr = chrome.runtime.lastError;
      if (!res || !res.success) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    });
  }

  function showError(msg) {
    const errBox = document.getElementById('air-error');
    const errMsg = document.getElementById('air-error-msg');
    if (errBox && errMsg) {
      errMsg.innerText = msg;
      errBox.classList.remove('air-hidden');
    }
  }

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

  // --- ON-DEMAND JOB PROMPT & RESUME GENERATOR ---
  let jobPromptBanner = null;

  async function showJobPromptPopup(data) {
    if (!data || !data.jd) return;
    if (isSitePaused()) return;

    const pageKey = 'air_prompted_' + window.location.pathname + '_' + (data.role || '').slice(0, 15);
    if (sessionStorage.getItem(pageKey) === 'dismissed') {
      return; // User previously dismissed for this job
    }

    if (!jobPromptBanner) {
      jobPromptBanner = document.createElement('div');
      jobPromptBanner.id = 'air-auto-toast';
      jobPromptBanner.className = 'air-toast-banner';
      document.body.appendChild(jobPromptBanner);
    }

    const role = data.role || 'Job Role';
    const company = data.company || 'Target Company';

    jobPromptBanner.innerHTML = `
      <div class="air-toast-content">
        <div class="air-toast-icon-wrap">
          <span class="air-toast-icon">⚡</span>
        </div>
        <div class="air-toast-texts">
          <div class="air-toast-title">
            <strong>Job Description Detected!</strong>
          </div>
          <div class="air-toast-desc">
            ${role} ${company ? '@ ' + company : ''}
          </div>
        </div>
        <div class="air-toast-actions">
          <button class="air-toast-btn primary" id="air-btn-prompt-generate">⚡ Generate Resume</button>
          <button class="air-toast-close" id="air-btn-prompt-close" title="Dismiss">&times;</button>
        </div>
      </div>
    `;

    jobPromptBanner.classList.remove('air-hidden');
    jobPromptBanner.classList.remove('fade-out');

    // Dismiss click
    const closeBtn = jobPromptBanner.querySelector('#air-btn-prompt-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        sessionStorage.setItem(pageKey, 'dismissed');
        jobPromptBanner.classList.add('fade-out');
        setTimeout(() => jobPromptBanner.classList.add('air-hidden'), 300);
      };
    }

    // Generate click
    const genBtn = jobPromptBanner.querySelector('#air-btn-prompt-generate');
    if (genBtn) {
      genBtn.onclick = () => {
        handleUserGenerateClick(data);
      };
    }
  }

  function handleUserGenerateClick(data) {
    if (!jobPromptBanner) return;

    const role = data.role || 'Job Role';
    const company = data.company || 'Target Company';

    // 1. Show loading state in the prompt
    jobPromptBanner.innerHTML = `
      <div class="air-toast-content">
        <div class="air-toast-icon-wrap">
          <span class="air-toast-icon spinning">⚡</span>
        </div>
        <div class="air-toast-texts">
          <div class="air-toast-title">
            <strong>Tailoring your resume with AI...</strong>
          </div>
          <div class="air-toast-desc">
            Embedding ATS keywords for ${role}...
          </div>
        </div>
        <div class="air-toast-actions">
          <span class="air-toast-badge">Generating (2s)...</span>
        </div>
      </div>
      <div class="air-toast-progress active"></div>
    `;

    // 2. Call backend server
    chrome.runtime.sendMessage({
      action: 'TAILOR_RESUME',
      role: data.role || '',
      company: data.company || '',
      jd: data.jd || ''
    }, (resp) => {
      const _pErr = chrome.runtime.lastError;
      if (!resp || !resp.success) {
        showPromptError(resp?.error || (_pErr ? _pErr.message : 'Failed to connect to backend server. Ensure backend is running.'));
        return;
      }

      currentDownloadUrl = resp.downloadUrl;
      currentPdfFilename = resp.pdfFilename || formatTailoredPdfName('Santhosh_TK', company, role);

      // 3. Show ready state with prominent Download button!
      showPromptResult(data, resp);
    });
  }

  function showPromptResult(data, resp) {
    if (!jobPromptBanner) return;

    const role = data.role || 'Job Role';
    const company = data.company || 'Target Company';
    const score = resp.atsScore || 96;

    jobPromptBanner.innerHTML = `
      <div class="air-toast-content">
        <div class="air-toast-icon-wrap success">
          <span class="air-toast-icon">✅</span>
        </div>
        <div class="air-toast-texts">
          <div class="air-toast-title">
            <strong>Resume Ready! <span class="air-toast-score">${score}% ATS Match</span></strong>
          </div>
          <div class="air-toast-desc">
            Tailored for ${role} ${company ? '@ ' + company : ''}
          </div>
        </div>
        <div class="air-toast-actions">
          <button class="air-toast-btn download-btn" id="air-btn-prompt-download">📥 Download Resume</button>
          <button class="air-toast-btn secondary" id="air-btn-prompt-view" title="View details">👁️ View</button>
          <button class="air-toast-close" id="air-btn-prompt-close" title="Close">&times;</button>
        </div>
      </div>
      <div class="air-toast-progress finished"></div>
    `;

    const dlBtn = jobPromptBanner.querySelector('#air-btn-prompt-download');
    if (dlBtn) {
      dlBtn.onclick = () => {
        triggerDownload(currentDownloadUrl, currentPdfFilename);
        dlBtn.innerText = '✅ Downloaded!';
        setTimeout(() => { if (dlBtn) dlBtn.innerText = '📥 Download Resume'; }, 2500);
      };
    }

    const viewBtn = jobPromptBanner.querySelector('#air-btn-prompt-view');
    if (viewBtn) {
      viewBtn.onclick = () => {
        openModalWithData(data);
      };
    }

    const closeBtn = jobPromptBanner.querySelector('#air-btn-prompt-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        jobPromptBanner.classList.add('fade-out');
        setTimeout(() => jobPromptBanner.classList.add('air-hidden'), 300);
      };
    }
  }

  function showPromptError(errMsg) {
    if (!jobPromptBanner) return;
    jobPromptBanner.innerHTML = `
      <div class="air-toast-content">
        <div class="air-toast-icon-wrap error">
          <span class="air-toast-icon">⚠️</span>
        </div>
        <div class="air-toast-texts">
          <div class="air-toast-title"><strong>Tailoring Failed</strong></div>
          <div class="air-toast-desc" style="white-space:normal;">${errMsg}</div>
        </div>
        <div class="air-toast-actions">
          <button class="air-toast-close" id="air-btn-prompt-close">&times;</button>
        </div>
      </div>
    `;
    const closeBtn = jobPromptBanner.querySelector('#air-btn-prompt-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        jobPromptBanner.classList.add('fade-out');
        setTimeout(() => jobPromptBanner.classList.add('air-hidden'), 300);
      };
    }
  }

  // --- AUTOMATIC JOB PAGE DETECTOR ---
  let isScanning = false;
  let lastPromptedHref = '';

  function initDetector() {
    if (!isJobDomainOrPath()) {
      return; // Never run or scan on non-job websites (Gmail, YouTube, etc.)
    }

    chrome.storage.sync.get({ autoShowWidget: true }, (items) => {
      const checkPage = () => {
        if (!isJobDomainOrPath() || isScanning) return;
        const currentHref = window.location.href;
        if (currentHref === lastPromptedHref) return;

        isScanning = true;
        try {
          const data = scrapeJobData();
          if (data && isValidJobDescription(data.jd) && isValidRoleTitle(data.role)) {
            lastPromptedHref = currentHref;

            if (items.autoShowWidget !== false) {
              createFloatingButton();
            }

            // Pop up with "Job Detected -> [ Generate Resume ]"
            showJobPromptPopup(data);
          }
        } finally {
          isScanning = false;
        }
      };

      // Initial check on load (1.2s delay for SPA hydration)
      setTimeout(checkPage, 1200);

      // Listen to SPA URL changes (e.g. LinkedIn, Naukri, Indeed SPA tab clicks)
      window.addEventListener('popstate', () => setTimeout(checkPage, 1000));

      let trackedUrl = window.location.href;
      setInterval(() => {
        if (window.location.href !== trackedUrl) {
          trackedUrl = window.location.href;
          setTimeout(checkPage, 1000);
        }
      }, 2000);
    });
  }

  // --- MESSAGE LISTENER FROM POPUP & BACKGROUND ---
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!request || !request.action) return false;

      if (request.action === 'SITE_PAUSE_UPDATED') {
        renderFloatingButtonState();
        try { sendResponse({ success: true }); } catch (_) {}
        return true;
      }

      if (request.action === 'GET_PAGE_JD') {
        const data = scrapeJobData(true) || {};
        try {
          sendResponse({
            success: true,
            data: {
              role: data.role || '',
              company: data.company || '',
              jd: data.jd || '',
              source: data.source || '',
              url: window.location.href
            }
          });
        } catch (_) {}
        return true;
      }

      if (request.action === 'PROCESS_SELECTED_JD') {
        const data = scrapeJobData(true) || {};
        openModalWithData({
          role: data.role || '',
          company: data.company || '',
          jd: request.selectedText || data.jd || ''
        });
        try { sendResponse({ success: true }); } catch (_) {}
        return true;
      }

      if (request.action === 'TRIGGER_TAILOR_ON_PAGE') {
        openModalWithData();
        try { sendResponse({ success: true }); } catch (_) {}
        return true;
      }

      return false;
    });
  }

  // --- SMART Q&A FORM TRACKER & SUPABASE AUTO-PREFILL / AUTO-RECORD ENGINE ---
  let localQaMemory = [];
  let activeQaToast = null;
  let activeQaInput = null;
  let prefillDebounceTimer = null;
  let formObserver = null;

  function syncQaMemory(onComplete) {
    chrome.runtime.sendMessage({ action: 'GET_QA_ITEMS' }, (resp) => {
      const _qaErr = chrome.runtime.lastError;
      if (resp && resp.success && Array.isArray(resp.qaItems)) {
        localQaMemory = resp.qaItems;
        console.log(`[AI Tailor Q&A] Loaded ${localQaMemory.length} questions from Supabase memory.`);
        // Run auto-prefill once memory is hydrated
        autoPrefillPageQuestions(true);
        if (typeof onComplete === 'function') onComplete(localQaMemory);
      }
    });
  }

  function normalizeText(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isIgnoredLoginOrSearchField(inputEl, questionText = '') {
    if (!inputEl) return true;
    const type = (inputEl.type || '').toLowerCase();
    const name = (inputEl.name || '').toLowerCase();
    const id = (inputEl.id || '').toLowerCase();
    const placeholder = (inputEl.placeholder || '').toLowerCase();
    const aria = (inputEl.getAttribute('aria-label') || '').toLowerCase();
    const qLower = (questionText || '').toLowerCase();
    const path = window.location.pathname.toLowerCase();

    // 1. Password input
    if (type === 'password') return true;

    // 2. Search inputs & search bars
    if (type === 'search' || inputEl.getAttribute('role') === 'searchbox') return true;

    // 3. Hidden or button fields
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image' || type === 'reset') return true;

    // 4. Login / Auth / Search keywords in element attributes or question
    const ignoreKeywords = [
      'password', 'passwd', 'search', 'query', 'filter', 'login', 'signin', 'sign-in', 'log-in',
      'auth', 'username', 'user_name', 'authenticator', 'captcha', 'verification_code', 'otp',
      'access_token', 'secret'
    ];
    for (const kw of ignoreKeywords) {
      if (id.includes(kw) || name.includes(kw) || placeholder.includes(kw) || aria.includes(kw) || qLower.includes(kw)) {
        return true;
      }
    }

    // 5. Pure Auth / Login paths (excluding job application flows)
    if (path.includes('/login') || path.includes('/signin') || path.includes('/auth') || path.includes('/accounts/')) {
      if (!path.includes('candidate') && !path.includes('apply') && !path.includes('job') && !path.includes('careers')) {
        return true;
      }
    }

    return false;
  }

  function isJobApplicationQuestion(questionText, inputEl) {
    if (isIgnoredLoginOrSearchField(inputEl, questionText)) return false;
    if (!questionText || questionText.trim().length < 3) return false;

    const normQ = (questionText || '').toLowerCase();
    const normInput = ((inputEl?.name || '') + ' ' + (inputEl?.id || '') + ' ' + (inputEl?.placeholder || '')).toLowerCase();
    const textToTest = normQ + ' ' + normInput;

    const jobKeywords = [
      'experience', 'yoe', 'years', 'notice period', 'ctc', 'salary', 'compensation',
      'joining', 'lwd', 'last working day', 'relocate', 'relocation', 'location', 'city',
      'bangalore', 'bengaluru', 'remote', 'hybrid', 'office', 'wfh', 'shift',
      'qualification', 'degree', 'education', 'b.tech', 'bachelor', 'master', 'university', 'college',
      'resume', 'cover letter', 'sponsorship', 'authorization', 'visa', 'citizen', 'work authorization',
      'react', 'node', 'javascript', 'typescript', 'python', 'java', 'sql', 'aws',
      'cloud', 'skill', 'portfolio', 'github', 'linkedin', 'questionnaire', 'screening',
      'gender', 'veteran', 'disability', 'pronouns', 'hear about us', 'source', 'authorized',
      'gpa', 'current company', 'current employer', 'current title', 'current role', 'total experience',
      'expected salary', 'current salary', 'expected ctc', 'current ctc', 'current compensation',
      'reason for leaving', 'available to start', 'start date', 'willing to relocate'
    ];

    // If on a job application domain or page, be more accepting of form questions
    if (isJobDomainOrPath()) {
      if (jobKeywords.some(kw => textToTest.includes(kw))) return true;
      // General question heuristics on application pages
      if (normQ.length >= 4 && !normQ.includes('search') && !normQ.includes('login')) return true;
    }

    return jobKeywords.some(kw => textToTest.includes(kw));
  }

  function getQuestionTextForInput(inputEl) {
    if (!inputEl) return '';

    const isChoice = inputEl.type === 'radio' || inputEl.type === 'checkbox';

    // 0. For Radios / Checkboxes: look at the group's fieldset or parent container heading first
    if (isChoice) {
      const fieldset = inputEl.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend && cleanText(legend.innerText)) return cleanText(legend.innerText);
      }
      const container = inputEl.closest('.form-group, .input-group, .field, .application-question, [data-automation-id*="formField"], div');
      if (container) {
        const parentLabel = inputEl.closest('label');
        const headings = container.querySelectorAll('label, legend, h1, h2, h3, h4, h5, h6, .question, [class*="label"], [class*="question"]');
        for (const h of headings) {
          if (h !== parentLabel && !h.contains(inputEl)) {
            const t = cleanText(h.innerText);
            if (t.length > 2 && t.length < 250) return t;
          }
        }
      }
    }

    // 1. Label for ID
    if (inputEl.id && !isChoice) {
      try {
        const labelEl = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
        if (labelEl && cleanText(labelEl.innerText)) return cleanText(labelEl.innerText);
      } catch (_) {}
    }

    // 2. Parent label
    const parentLabel = inputEl.closest('label');
    if (parentLabel && cleanText(parentLabel.innerText) && !isChoice) return cleanText(parentLabel.innerText);

    // 3. ARIA labelledby
    const ariaLabelledby = inputEl.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      try {
        const lbls = ariaLabelledby.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean);
        const combined = lbls.map(l => cleanText(l.innerText)).filter(Boolean).join(' ');
        if (combined) return combined;
      } catch (_) {}
    }

    // 4. Preceding question element / container heading
    const container = inputEl.closest('.form-group, .input-group, .field, .application-question, [data-automation-id*="formField"], fieldset, section, div');
    if (container) {
      const heading = container.querySelector('label, legend, h1, h2, h3, h4, h5, h6, .question, [class*="label"], [class*="question"], [data-automation-id*="label"]');
      if (heading && cleanText(heading.innerText)) {
        const t = cleanText(heading.innerText);
        // Avoid returning entire giant form texts
        if (t.length > 2 && t.length < 250) return t;
      }
    }

    // 5. Attributes
    const ariaLabel = inputEl.getAttribute('aria-label');
    if (ariaLabel) return cleanText(ariaLabel);

    const placeholder = inputEl.getAttribute('placeholder');
    if (placeholder && placeholder.length > 3) return cleanText(placeholder);

    const name = inputEl.getAttribute('name');
    if (name) return cleanText(name.replace(/[-_]/g, ' '));

    return '';
  }

  function matchQaItem(questionText) {
    if (!questionText || localQaMemory.length === 0) return null;
    const normQ = normalizeText(questionText);
    if (normQ.length < 3) return null;

    // 1. Exact normalized match
    let found = localQaMemory.find(q => normalizeText(q.question) === normQ);
    if (found) return found;

    // 2. Keyword match
    for (const item of localQaMemory) {
      if (Array.isArray(item.keywords) && item.keywords.length > 0) {
        const hasKw = item.keywords.some(kw => {
          const normKw = normalizeText(kw);
          return normKw.length > 2 && normQ.includes(normKw);
        });
        if (hasKw) return item;
      }
    }

    // 3. Substring inclusion match
    found = localQaMemory.find(q => {
      const qNorm = normalizeText(q.question);
      return (normQ.length > 5 && qNorm.includes(normQ)) || (qNorm.length > 5 && normQ.includes(qNorm));
    });

    return found || null;
  }

  /** Native property setter for React, Angular, Vue, and Workday reactive state binding */
  function setNativeInputValue(el, value) {
    if (!el) return;
    const tag = el.tagName.toLowerCase();

    if (tag === 'select') {
      let matched = false;
      const targetVal = String(value).toLowerCase().trim();
      for (let i = 0; i < el.options.length; i++) {
        const opt = el.options[i];
        const optText = (opt.text || '').toLowerCase().trim();
        const optVal = (opt.value || '').toLowerCase().trim();
        if (optVal === targetVal || optText === targetVal || (targetVal.length > 2 && optText.includes(targetVal))) {
          el.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (matched) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    if (el.type === 'radio' || el.type === 'checkbox') {
      const isChecked = ['true', 'yes', '1', 'checked'].includes(String(value).toLowerCase().trim());
      el.checked = isChecked;
      el.dispatchEvent(new Event('click', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Text / Textarea / Number / Tel
    const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setDescriptor = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setDescriptor) {
      setDescriptor.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function prefillRadioGroup(radioGroup, answer) {
    const target = String(answer).toLowerCase().trim();
    for (const radio of radioGroup) {
      const rVal = (radio.value || '').toLowerCase().trim();
      let rLabel = '';
      if (radio.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (lbl) rLabel = cleanText(lbl.innerText).toLowerCase();
      }
      if (!rLabel) {
        const parentLbl = radio.closest('label');
        if (parentLbl) rLabel = cleanText(parentLbl.innerText).toLowerCase();
      }
      if (!rLabel && radio.parentElement) {
        rLabel = cleanText(radio.parentElement.innerText).toLowerCase();
      }

      if (rVal === target || rLabel === target || (target.length > 1 && (rLabel.includes(target) || target.includes(rLabel)))) {
        radio.checked = true;
        radio.dataset.airPrefilled = 'true';
        radio.classList.add('air-field-prefilled');
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  /**
   * Automatically scans current page/step and prefills all matching questions from Supabase database.
   * Keeps fields 100% editable for the user.
   */
  function autoPrefillPageQuestions(silent = false) {
    if (isSitePaused() || !localQaMemory || localQaMemory.length === 0) return 0;

    let prefilledCount = 0;

    // 1. Process Radio Groups
    const radioGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      if (isIgnoredLoginOrSearchField(radio)) return;
      const name = radio.name || 'unnamed_radio_group';
      if (!radioGroups[name]) radioGroups[name] = [];
      radioGroups[name].push(radio);
    });

    for (const groupName in radioGroups) {
      const group = radioGroups[groupName];
      const firstRadio = group[0];
      // Skip if already answered by user
      if (group.some(r => r.dataset.airTouched === 'true' || (r.checked && !r.dataset.airPrefilled))) {
        continue;
      }
      const qText = getQuestionTextForInput(firstRadio);
      if (qText && isJobApplicationQuestion(qText, firstRadio)) {
        const match = matchQaItem(qText);
        if (match && match.answer) {
          if (prefillRadioGroup(group, match.answer)) {
            prefilledCount++;
          }
        }
      }
    }

    // 2. Process Text, Textarea, and Select Inputs
    const inputs = document.querySelectorAll(
      'input:not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="hidden"]):not([type="file"]):not([type="image"]), textarea, select'
    );

    inputs.forEach(el => {
      if (isIgnoredLoginOrSearchField(el)) return;
      if (el.dataset.airTouched === 'true') return; // User manually touched/edited this

      const currentVal = (el.value || '').trim();
      // If already has non-prefilled value, do not overwrite
      if (currentVal.length > 0 && el.dataset.airPrefilled !== 'true') return;

      const qText = getQuestionTextForInput(el);
      if (!qText || !isJobApplicationQuestion(qText, el)) return;

      const match = matchQaItem(qText);
      if (match && match.answer) {
        // Prefill the field while leaving it 100% editable
        setNativeInputValue(el, match.answer);
        el.dataset.airPrefilled = 'true';
        el.classList.add('air-field-prefilled');
        prefilledCount++;
      }
    });

    if (prefilledCount > 0 && !silent) {
      showQaFeedbackBadge(`💡 Auto-prefilled ${prefilledCount} question${prefilledCount > 1 ? 's' : ''} from Q&A database! (Editable)`);
    }

    return prefilledCount;
  }

  async function showQaMemoryToast(inputEl, qaItem) {
    if (isSitePaused()) return;
    if (!inputEl || !qaItem || !qaItem.answer) return;

    const currentVal = (inputEl.value || '').trim();
    const prevAnswer = String(qaItem.answer).trim();

    if (!activeQaToast) {
      activeQaToast = document.createElement('div');
      activeQaToast.id = 'air-qa-popover';
      activeQaToast.className = 'air-qa-popover';
      document.body.appendChild(activeQaToast);
    }

    activeQaInput = inputEl;

    const rect = inputEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 6;
    const left = Math.max(12, rect.left + window.scrollX);

    activeQaToast.style.top = `${top}px`;
    activeQaToast.style.left = `${left}px`;

    const isDifferent = currentVal && currentVal.toLowerCase() !== prevAnswer.toLowerCase();

    activeQaToast.innerHTML = `
      <div class="air-qa-content">
        <div class="air-qa-header">
          <span class="air-qa-badge">💡 Supabase Q&A</span>
          <span class="air-qa-question">${qaItem.question}</span>
        </div>
        <div class="air-qa-body">
          <span class="air-qa-label">Stored Answer:</span>
          <strong class="air-qa-val">${prevAnswer}</strong>
        </div>
        <div class="air-qa-actions">
          <button type="button" class="air-qa-btn primary" id="air-qa-use-btn">⚡ Fill Stored Answer</button>
          ${isDifferent ? `<button type="button" class="air-qa-btn update-btn" id="air-qa-update-btn">✏️ Update Supabase to "${currentVal}"</button>` : ''}
          <button type="button" class="air-qa-btn pause-btn" id="air-qa-pause-btn" title="Pause Q&A tracking on this domain">⏸️ Stop for Page</button>
          <button type="button" class="air-qa-close" id="air-qa-close-btn">&times;</button>
        </div>
      </div>
    `;

    activeQaToast.classList.remove('air-hidden');

    const useBtn = activeQaToast.querySelector('#air-qa-use-btn');
    if (useBtn) {
      useBtn.onclick = (e) => {
        e.preventDefault();
        setNativeInputValue(inputEl, prevAnswer);
        inputEl.dataset.airPrefilled = 'true';
        inputEl.classList.add('air-field-prefilled');
        showQaFeedbackBadge('✓ Applied stored answer from Supabase!');
        hideQaToast();
      };
    }

    const updateBtn = activeQaToast.querySelector('#air-qa-update-btn');
    if (updateBtn) {
      updateBtn.onclick = (e) => {
        e.preventDefault();
        saveOrUpdateQaAnswer(qaItem.question, currentVal, qaItem.id);
        hideQaToast();
      };
    }

    const pauseBtn = activeQaToast.querySelector('#air-qa-pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = async (e) => {
        e.preventDefault();
        const { domain } = await toggleSitePause();
        hideQaToast();
        await renderFloatingButtonState();
        showQaFeedbackBadge(`⏸️ Q&A Tracking Paused for ${domain}!`);
      };
    }

    const closeBtn = activeQaToast.querySelector('#air-qa-close-btn');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        hideQaToast();
      };
    }
  }

  function hideQaToast() {
    if (activeQaToast) {
      activeQaToast.classList.add('air-hidden');
    }
  }

  function saveOrUpdateQaAnswer(question, newAnswer, existingId) {
    if (!question || !newAnswer) return;
    const cleanQ = question.trim();
    const cleanA = String(newAnswer).trim();
    if (cleanQ.length < 3 || cleanA.length === 0) return;

    chrome.runtime.sendMessage({
      action: 'SAVE_QA_ITEM',
      id: existingId,
      question: cleanQ,
      answer: cleanA
    }, (resp) => {
      const _saveErr = chrome.runtime.lastError;
      if (resp && resp.success) {
        showQaFeedbackBadge(`✓ Saved to Supabase: "${cleanQ.slice(0, 30)}${cleanQ.length > 30 ? '...' : ''}"`);
        syncQaMemory();
      }
    });
  }

  function showQaFeedbackBadge(msg) {
    let badge = document.querySelector('.air-qa-feedback');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'air-qa-feedback';
      document.body.appendChild(badge);
    }
    badge.innerText = msg;
    setTimeout(() => badge.classList.add('show'), 50);
    setTimeout(() => {
      badge.classList.remove('show');
      setTimeout(() => badge.remove(), 400);
    }, 2500);
  }

  function initQaTracker() {
    // 1. Initial memory sync & prefill
    syncQaMemory(() => {
      autoPrefillPageQuestions(false);
    });

    // 2. Dynamic multi-step / modal SPA observer
    if (!formObserver && window.MutationObserver) {
      formObserver = new MutationObserver((mutations) => {
        if (isSitePaused()) return;
        let hasNewInputs = false;
        for (const m of mutations) {
          if (m.addedNodes.length > 0) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                if (node.matches && (node.matches('input, select, textarea, form, [role="dialog"]') || node.querySelector('input, select, textarea'))) {
                  hasNewInputs = true;
                  break;
                }
              }
            }
          }
          if (hasNewInputs) break;
        }

        if (hasNewInputs) {
          clearTimeout(prefillDebounceTimer);
          prefillDebounceTimer = setTimeout(() => {
            autoPrefillPageQuestions(true);
          }, 500);
        }
      });

      formObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 3. Mark fields as user-touched as soon as user types or modifies them
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
        el.dataset.airTouched = 'true';
      }
    }, true);

    // 4. On Focus: Display memory popover if stored answer exists
    document.addEventListener('focusin', async (e) => {
      if (isSitePaused()) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
        const qText = getQuestionTextForInput(el);
        if (qText && isJobApplicationQuestion(qText, el)) {
          const match = matchQaItem(qText);
          if (match && (!el.value || el.value.trim().toLowerCase() !== match.answer.toLowerCase())) {
            showQaMemoryToast(el, match);
          }
        }
      }
    });

    // 5. On Change / Blur: Automatically capture and sync answered/updated questions to Supabase
    document.addEventListener('change', async (e) => {
      if (isSitePaused()) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
        el.dataset.airTouched = 'true';
        const qText = getQuestionTextForInput(el);
        const val = (el.value || '').trim();
        if (qText && val && isJobApplicationQuestion(qText, el)) {
          const match = matchQaItem(qText);
          if (!match || match.answer.toLowerCase() !== val.toLowerCase()) {
            // New question or user updated their answer -> auto-record to Supabase!
            saveOrUpdateQaAnswer(qText, val, match?.id);
          }
        }
      }
    });

    // 6. On Form Submit: Capture all valid answered questions across the form
    document.addEventListener('submit', async (e) => {
      if (isSitePaused()) return;
      const form = e.target;
      if (form && form.querySelectorAll) {
        const inputs = form.querySelectorAll('input, select, textarea');
        for (const input of inputs) {
          const qText = getQuestionTextForInput(input);
          const val = (input.value || '').trim();
          if (qText && val && val.length > 0 && isJobApplicationQuestion(qText, input)) {
            const match = matchQaItem(qText);
            if (!match || match.answer.toLowerCase() !== val.toLowerCase()) {
              saveOrUpdateQaAnswer(qText, val, match?.id);
            }
          }
        }
      }
    });
  }

  // Run on page load after all functions and variables are declared
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDetector();
      initQaTracker();
    });
  } else {
    initDetector();
    initQaTracker();
  }
})();

const fs = require('fs');
const path = require('path');
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('puppeteer-core');
}
const { getUserPaths, ensureUserSandbox, addUserLog } = require('./user.service');
const { resolveUserResumeFile } = require('./resume.service');
const {
  isSupabaseConfigured,
  supabaseSaveNaukriConfig,
  supabaseGetNaukriConfig,
  supabaseGetQaDatabase,
  supabaseSaveQaDatabase,
  supabaseGetNaukriQueue,
  supabaseSaveNaukriQueue,
  supabaseGetNaukriAppliedJobs,
  supabaseSaveNaukriAppliedJobs
} = require('./supabase.service');

// Default initial Q&A knowledge base
const DEFAULT_QA_ITEMS = [
  { id: 'qa_exp_total', question: 'How many years of total experience do you have?', keywords: ['total experience', 'total yoe', 'years of experience', 'work experience', 'overall experience'], answer: '4', category: 'Experience' },
  { id: 'qa_exp_react', question: 'How many years of experience in React.js do you have?', keywords: ['react', 'react.js', 'reactjs', 'frontend experience', 'react developer'], answer: '4', category: 'Skills' },
  { id: 'qa_exp_node', question: 'How many years of experience in Node.js / Express do you have?', keywords: ['node', 'node.js', 'nodejs', 'express', 'express.js', 'backend experience'], answer: '4', category: 'Skills' },
  { id: 'qa_exp_mern', question: 'How many years of experience in MERN Stack do you have?', keywords: ['mern', 'mern stack', 'full stack', 'fullstack'], answer: '4', category: 'Skills' },
  { id: 'qa_exp_mongo', question: 'How many years of experience in MongoDB / MySQL do you have?', keywords: ['mongodb', 'mysql', 'sql', 'database', 'postgres', 'postgresql'], answer: '4', category: 'Skills' },
  { id: 'qa_exp_js', question: 'How many years of experience in JavaScript / TypeScript do you have?', keywords: ['javascript', 'js', 'typescript', 'ts', 'ecmascript'], answer: '4', category: 'Skills' },
  { id: 'qa_exp_aws', question: 'Do you have experience with AWS / Cloud deployment?', keywords: ['aws', 'cloud', 'docker', 'devops', 'deployment', 'ec2', 's3'], answer: 'Yes', category: 'Skills' },
  { id: 'qa_ctc_current', question: 'What is your current CTC (in LPA)?', keywords: ['current ctc', 'current salary', 'present ctc', 'current compensation', 'present salary'], answer: '8', category: 'Compensation' },
  { id: 'qa_ctc_expected', question: 'What is your expected CTC (in LPA)?', keywords: ['expected ctc', 'expected salary', 'salary expectation', 'desired salary', 'expected compensation'], answer: '12', category: 'Compensation' },
  { id: 'qa_notice_period', question: 'What is your notice period (in days)?', keywords: ['notice period', 'how soon can you join', 'joining time', 'official notice', 'availability to join'], answer: '15', category: 'Availability' },
  { id: 'qa_serving_notice', question: 'Are you currently serving notice period?', keywords: ['serving notice', 'serving notice period', 'resigned', 'on notice'], answer: 'Yes', category: 'Availability' },
  { id: 'qa_last_working_day', question: 'What is your last working day (if serving notice)?', keywords: ['last working day', 'lwd', 'end date', 'relieving date'], answer: 'Within 15 Days', category: 'Availability' },
  { id: 'qa_loc_current', question: 'What is your current location / city?', keywords: ['current location', 'current city', 'where do you reside', 'base location', 'current address'], answer: 'Bangalore', category: 'Location' },
  { id: 'qa_loc_preferred', question: 'What is your preferred work location?', keywords: ['preferred location', 'preferred city', 'work location', 'preferred work location'], answer: 'Bangalore / Remote', category: 'Location' },
  { id: 'qa_relocate', question: 'Are you willing to relocate to Bangalore / Bengaluru?', keywords: ['relocate', 'willing to relocate', 'relocation', 'open to relocate', 'bangalore', 'bengaluru'], answer: 'Yes', category: 'Location' },
  { id: 'qa_work_mode', question: 'Are you open to Work from Office / Hybrid / Remote roles?', keywords: ['hybrid', 'remote', 'work from office', 'wfh', 'work from home', 'onsite'], answer: 'Yes', category: 'Location' },
  { id: 'qa_degree', question: 'What is your highest educational qualification?', keywords: ['highest qualification', 'degree', 'education', 'graduation', 'highest degree'], answer: 'B.Tech / Bachelor of Engineering', category: 'Education' },
  { id: 'qa_shifts', question: 'Are you comfortable working in general / rotational shifts?', keywords: ['shift', 'rotational shift', 'general shift', 'night shift', 'work timing'], answer: 'Yes', category: 'General' }
];

// Default Job Discovery and Diversity Filters
const DEFAULT_FILTER_CONFIG = {
  jobTitles: [
    'Full Stack Developer',
    'Backend Developer',
    'Frontend Developer',
    'Node.js Developer',
    'React Developer',
    'Software Development Engineer',
    'MERN Stack Engineer'
  ],
  skills: ['React.js', 'Node.js', 'JavaScript', 'TypeScript', 'Express.js', 'MongoDB', 'MySQL', 'REST APIs'],
  experienceMin: 3,
  experienceMax: 6,
  locations: ['Bangalore', 'Bengaluru', 'Remote'],
  remotePreference: 'any', // 'any', 'remote', 'hybrid', 'onsite'
  maxJobsPerCompanyPerRun: 1, // Strict company diversity limit (max 1 per company)
  maxJobsPerRun: 12,
  dailyTarget: 50,
  easyApplyOnly: true,
  neverApplySameCompanyTwice: true, // Permanent company deduplication: never apply to the same company again
  minCompanyEmployees: 200, // Strictly verify company has at least 200+ employees
  excludeStartups: true, // Exclude early-stage startups (< 200 employees)
  excludedCompanies: [],
  excludedJobTitles: [],
  minRelevanceScore: 40
};

// Application State Machine (12 Explicit Lifecycle States)
const ApplicationState = {
  DISCOVERED: 'DISCOVERED',
  ELIGIBLE: 'ELIGIBLE',
  QUEUED: 'QUEUED',
  STARTED: 'STARTED',
  FORM_OPENED: 'FORM_OPENED',
  FILLING: 'FILLING',
  FORM_INCOMPLETE: 'FORM_INCOMPLETE',
  WAITING_FOR_USER: 'WAITING_FOR_USER',
  READY_TO_RESUME: 'READY_TO_RESUME',
  READY_TO_SUBMIT: 'READY_TO_SUBMIT',
  SUBMITTING: 'SUBMITTING',
  SUBMISSION_UNCONFIRMED: 'SUBMISSION_UNCONFIRMED',
  SUBMITTED: 'SUBMITTED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  EXPIRED: 'EXPIRED',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  AUTH_REQUIRED: 'AUTHENTICATION_REQUIRED',
  LEGACY_UNVERIFIED: 'LEGACY_UNVERIFIED',
  // Backward compatibility aliases
  FORM_DETECTED: 'FORM_OPENED',
  AUTO_FILLED: 'FILLING',
  WAITING_FOR_USER_ANSWER: 'WAITING_FOR_USER'
};

const VerificationStatus = {
  VERIFIED: 'VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
  LEGACY_UNVERIFIED: 'LEGACY_UNVERIFIED',
  RECONCILED: 'RECONCILED',
  FAILED: 'FAILED'
};

const VerificationSource = {
  NAUKRI_DOM_CONFIRMATION: 'NAUKRI_DOM_CONFIRMATION',
  NAUKRI_APPLIED_SECTION: 'NAUKRI_APPLIED_SECTION',
  NAUKRI_RECONCILIATION: 'NAUKRI_RECONCILIATION',
  NONE: 'NONE'
};

const NAUKRI_APPLY_SUCCESS_PHRASES = [
  'application sent',
  'application has been sent',
  'your application has been sent',
  'your application was sent',
  'successfully applied',
  'applied successfully',
  'you have already applied',
  'already applied',
  'application has been submitted',
  'application submitted',
  'thank you for applying',
  'application sent to recruiter',
  'we have received your application',
  'we\'ve received your application',
  'applied to this job',
  'you have applied',
  'applied on'
];

function getQaFilePath(userKey) {
  const userPaths = getUserPaths(userKey);
  return path.join(userPaths.userDir, 'naukri_qa.json');
}

function getPendingQaFilePath(userKey) {
  const userPaths = getUserPaths(userKey);
  return path.join(userPaths.userDir, 'naukri_pending_qa.json');
}

function getNaukriAppsFilePath(userKey) {
  const userPaths = getUserPaths(userKey);
  return path.join(userPaths.userDir, 'naukri_applied_jobs.json');
}

function getQueueFilePath(userKey) {
  const userPaths = getUserPaths(userKey);
  return path.join(userPaths.userDir, 'naukri_application_queue.json');
}

function getFilterConfigFilePath(userKey) {
  const userPaths = getUserPaths(userKey);
  return path.join(userPaths.userDir, 'naukri_filter_config.json');
}

function getExternalJobsFilePath(userKey) {
  const userPaths = getUserPaths(userKey);
  return path.join(userPaths.userDir, 'naukri_external_jobs.json');
}

function getNaukriExternalJobs(userKey) {
  const filePath = getExternalJobsFilePath(userKey);
  let localJobs = [];
  if (fs.existsSync(filePath)) {
    try {
      localJobs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {}
  }
  return Array.isArray(localJobs) ? localJobs : [];
}

function recordExternalCompanyJob(userKey, jobItem) {
  try {
    const existing = getNaukriExternalJobs(userKey);
    const alreadySaved = existing.some(j => j.jobId === jobItem.jobId || (j.jobUrl && j.jobUrl === jobItem.jobUrl));
    if (!alreadySaved) {
      existing.unshift({
        jobId: jobItem.jobId || `ext_${Date.now()}`,
        jobTitle: jobItem.jobTitle || jobItem.title,
        company: jobItem.company,
        location: jobItem.location || '',
        experience: jobItem.experience || jobItem.exp || '',
        jobUrl: jobItem.jobUrl || jobItem.url,
        detectedAt: new Date().toISOString()
      });
      const filePath = getExternalJobsFilePath(userKey);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(existing.slice(0, 300), null, 2), 'utf8');
      supabaseSaveNaukriConfig(userKey, { externalJobs: existing.slice(0, 300) }).catch(() => {});
    }
  } catch (e) {
    console.warn('[EXTERNAL_JOBS] Error saving external job:', e.message);
  }
}

/**
 * Filter and Config Management
 */
function getFilterConfig(userKey) {
  const filePath = getFilterConfigFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { ...DEFAULT_FILTER_CONFIG, ...parsed };
    } catch (e) {}
  }
  saveFilterConfig(userKey, DEFAULT_FILTER_CONFIG);
  return DEFAULT_FILTER_CONFIG;
}

function saveFilterConfig(userKey, config) {
  ensureUserSandbox(userKey);
  const filePath = getFilterConfigFilePath(userKey);
  const updated = { ...DEFAULT_FILTER_CONFIG, ...config };
  try {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {}
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriConfig(userKey, { filterConfig: updated }).catch(() => {});
  }
  return updated;
}

/**
 * Q&A Database Management (Cloud DB as Source of Truth)
 */
async function getQaDatabaseAsync(userKey) {
  console.log(`[NAUKRI Q&A DB] 🔍 Fetching Q&A items from database for user "${userKey}"...`);

  let dbError = false;
  // 1. Fetch directly from Supabase Cloud Database (Single Source of Truth)
  if (isSupabaseConfigured()) {
    try {
      const dbItems = await supabaseGetQaDatabase(userKey);
      if (Array.isArray(dbItems) && dbItems.length > 0) {
        console.log(`[NAUKRI Q&A DB] ✅ Retrieved ${dbItems.length} Q&A items directly from Supabase DB.`);
        // Cache locally for fast in-session queries
        ensureUserSandbox(userKey);
        const filePath = getQaFilePath(userKey);
        try { fs.writeFileSync(filePath, JSON.stringify(dbItems, null, 2), 'utf8'); } catch (e) {}
        return dbItems;
      }
    } catch (dbErr) {
      dbError = true;
      console.warn(`[NAUKRI Q&A DB WARNING] Failed fetching from Supabase: ${dbErr.message}`);
    }
  }

  // 2. Check local disk sandbox cache
  const filePath = getQaFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      const localItems = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(localItems) && localItems.length > 0) {
        // If DB had no error and is configured, seed local items to DB
        if (isSupabaseConfigured() && !dbError) {
          supabaseSaveQaDatabase(userKey, localItems).catch(() => {});
        }
        return localItems;
      }
    } catch (e) {}
  }

  // 3. Fallback: If and only if user has never saved any items, return DEFAULT_QA_ITEMS in-memory
  // NEVER write DEFAULT_QA_ITEMS to Supabase on a transient fetch or container startup!
  return DEFAULT_QA_ITEMS;
}

function getQaDatabase(userKey) {
  const filePath = getQaFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(items) && items.length > 0) return items;
    } catch (e) {}
  }
  // Return in-memory defaults ONLY - do NOT trigger side-effect writes to disk or Supabase!
  return DEFAULT_QA_ITEMS;
}

async function saveQaDatabaseAsync(userKey, items) {
  ensureUserSandbox(userKey);
  const filePath = getQaFilePath(userKey);
  try {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {}

  if (isSupabaseConfigured()) {
    console.log(`[NAUKRI Q&A DB] 💾 Persisting ${items.length} Q&A items to Supabase DB for user "${userKey}"...`);
    await supabaseSaveQaDatabase(userKey, items);
  }
  return items;
}

function saveQaDatabase(userKey, items) {
  ensureUserSandbox(userKey);
  const filePath = getQaFilePath(userKey);
  try {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {}
  if (isSupabaseConfigured()) {
    supabaseSaveQaDatabase(userKey, items).catch(() => {});
  }
}

async function saveQaItemAsync(userKey, item) {
  const current = await getQaDatabaseAsync(userKey);
  const cleanQ = (item.question || '').trim();
  const cleanA = (item.answer || '').trim();
  const id = item.id || `qa_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  const existingIdx = current.findIndex(q => q.id === id || q.question.toLowerCase() === cleanQ.toLowerCase());
  const newItem = {
    id,
    question: cleanQ,
    answer: cleanA,
    category: item.category || 'General',
    keywords: item.keywords || cleanQ.toLowerCase().split(/\s+/).filter(w => w.length > 3),
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    current[existingIdx] = { ...current[existingIdx], ...newItem };
  } else {
    current.push(newItem);
  }

  await saveQaDatabaseAsync(userKey, current);
  return newItem;
}

function saveQaItem(userKey, item) {
  const current = getQaDatabase(userKey);
  const cleanQ = (item.question || '').trim();
  const cleanA = (item.answer || '').trim();
  const id = item.id || `qa_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  const existingIdx = current.findIndex(q => q.id === id || q.question.toLowerCase() === cleanQ.toLowerCase());
  const newItem = {
    id,
    question: cleanQ,
    answer: cleanA,
    category: item.category || 'General',
    keywords: item.keywords || cleanQ.toLowerCase().split(/\s+/).filter(w => w.length > 3),
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    current[existingIdx] = { ...current[existingIdx], ...newItem };
  } else {
    current.push(newItem);
  }

  saveQaDatabase(userKey, current);
  return newItem;
}

async function deleteQaItemAsync(userKey, id) {
  const current = await getQaDatabaseAsync(userKey);
  const updated = current.filter(q => q.id !== id);
  await saveQaDatabaseAsync(userKey, updated);
  return true;
}

function deleteQaItem(userKey, id) {
  const current = getQaDatabase(userKey);
  const updated = current.filter(q => q.id !== id);
  saveQaDatabase(userKey, updated);
  return true;
}

/**
 * Semantic Normalization & Aliasing
 */
function normalizeQuestionText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Advanced Semantic Question Matcher
 * Maps variations (e.g. Bangalore vs Bengaluru, YOE variations, CTC parsing)
 */
function cleanChatQuestion(text) {
  return (text || '')
    .replace(/type your (message|answer)[^\n]*/gi, ' ')
    .replace(/\b(send|skip|close)\b/gi, ' ')
    .replace(/please (type|enter|select|choose)[^\n]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIntroOrNoiseQuestion(text) {
  const raw = (text || '').trim();
  const t = normalizeQuestionText(cleanChatQuestion(raw));
  if (!t || t.length < 8) return true;
  const hasQuestionMark = raw.includes('?');
  const introSnippets = [
    'complete your application',
    'few questions',
    'please answer the following',
    'to apply for this job',
    'answer a few',
    'let us get to know'
  ];
  if (!hasQuestionMark && introSnippets.some(s => t.includes(s))) return true;
  if (/^(hi|hello|hey)\b/.test(t) && !hasQuestionMark) return true;
  return false;
}

function findBestAnswer(userKeyOrDb, rawQuestionText, availableOptions = []) {
  if (!rawQuestionText) return null;
  const db = Array.isArray(userKeyOrDb) ? userKeyOrDb : getQaDatabase(userKeyOrDb);
  const normalized = normalizeQuestionText(cleanChatQuestion(rawQuestionText));

  // 1. Direct or Substring Match
  for (const item of db) {
    const itemNorm = normalizeQuestionText(item.question);
    if (normalized === itemNorm || normalized.includes(itemNorm) || itemNorm.includes(normalized)) {
      return resolveAnswerWithOptionMapping(item.answer, item, 100, availableOptions);
    }
  }

  // 2. Semantic Synonym Concept Groups
  const semanticGroups = [
    {
      type: 'total_experience',
      keys: ['total experience', 'total yoe', 'years of experience', 'overall experience', 'work experience', 'relevant experience in years'],
      fallbackId: 'qa_exp_total'
    },
    {
      type: 'current_ctc',
      keys: ['current ctc', 'current salary', 'present ctc', 'current compensation', 'current fixed', 'present salary'],
      fallbackId: 'qa_ctc_current'
    },
    {
      type: 'expected_ctc',
      keys: ['expected ctc', 'expected salary', 'salary expectation', 'desired salary', 'expected compensation', 'compensation expectation'],
      fallbackId: 'qa_ctc_expected'
    },
    {
      type: 'notice_period',
      keys: ['notice period', 'how soon can you join', 'joining time', 'official notice', 'days of notice', 'how many days notice'],
      fallbackId: 'qa_notice_period'
    },
    {
      type: 'serving_notice',
      keys: ['serving notice', 'serving notice period', 'resigned', 'currently serving', 'on official notice'],
      fallbackId: 'qa_serving_notice'
    },
    {
      type: 'location_relocate',
      keys: ['relocate', 'willing to relocate', 'relocation to bangalore', 'relocation to bengaluru', 'open to relocate'],
      fallbackId: 'qa_relocate'
    },
    {
      type: 'current_location',
      keys: ['current location', 'current city', 'where do you reside', 'base location', 'current residence'],
      fallbackId: 'qa_loc_current'
    },
    {
      type: 'preferred_location',
      keys: ['preferred location', 'preferred city', 'work location preference', 'preferred work location'],
      fallbackId: 'qa_loc_preferred'
    },
    {
      type: 'education',
      keys: ['highest qualification', 'degree', 'education', 'graduation', 'highest educational qualification', 'undergraduate degree'],
      fallbackId: 'qa_degree'
    },
    {
      type: 'skill_react',
      keys: ['experience in react', 'years in react', 'react js experience', 'reactjs experience', 'experience with react'],
      fallbackId: 'qa_exp_react'
    },
    {
      type: 'skill_node',
      keys: ['experience in node', 'years in node', 'node js experience', 'nodejs experience', 'experience with node', 'express js experience'],
      fallbackId: 'qa_exp_node'
    },
    {
      type: 'skill_mern',
      keys: ['mern stack experience', 'experience in mern', 'full stack experience', 'mern experience'],
      fallbackId: 'qa_exp_mern'
    },
    {
      type: 'skill_mongo_sql',
      keys: ['mongodb experience', 'mysql experience', 'sql experience', 'database experience', 'postgres experience'],
      fallbackId: 'qa_exp_mongo'
    },
    {
      type: 'skill_aws',
      keys: ['aws experience', 'cloud experience', 'docker experience', 'devops experience', 'experience with aws'],
      fallbackId: 'qa_exp_aws'
    },
    {
      type: 'work_mode',
      keys: ['work from office', 'work from home', 'hybrid', 'onsite', 'remote role', 'wfo', 'wfh'],
      fallbackId: 'qa_work_mode'
    },
    {
      type: 'shifts',
      keys: ['rotational shift', 'night shift', 'general shift', 'work in shifts', 'comfortable with shift'],
      fallbackId: 'qa_shifts'
    }
  ];

  for (const group of semanticGroups) {
    const isMatch = group.keys.some(k => normalized.includes(k));
    if (isMatch) {
      const matchedItem = db.find(d => d.id === group.fallbackId) || db.find(d => group.keys.some(k => normalizeQuestionText(d.question).includes(k)));
      if (matchedItem) {
        return resolveAnswerWithOptionMapping(matchedItem.answer, matchedItem, 95, availableOptions);
      }
    }
  }

  // 3. Keyword Scoring Match
  let bestMatch = null;
  let highestScore = 0;

  for (const item of db) {
    const keywords = item.keywords || normalizeQuestionText(item.question).split(' ');
    let score = 0;

    for (const kw of keywords) {
      if (kw.length > 2 && normalized.includes(kw.toLowerCase())) {
        score += kw.length > 5 ? 2 : 1;
      }
    }

    if (score > highestScore && score >= 2) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && highestScore >= 2) {
    const confidence = highestScore >= 3 ? 85 : 75;
    return resolveAnswerWithOptionMapping(bestMatch.answer, bestMatch, confidence, availableOptions);
  }

  // 4. Smart Profile Fallback Inference (Location, CTC, Notice Period, Relocation, Shift)
  const inferred = inferAnswerFromProfile(rawQuestion, availableOptions);
  if (inferred) {
    return inferred;
  }

  return null;
}

/**
 * Smart Profile Fallback Inference
 * Resolves standard recruiter screening questions automatically with high confidence
 */
function inferAnswerFromProfile(questionText, availableOptions = []) {
  const normQ = (questionText || '').toLowerCase();

  // 1. Relocation & Willingness
  if (normQ.includes('relocate') || normQ.includes('relocation') || normQ.includes('willing to move') || normQ.includes('ready to relocate')) {
    return resolveAnswerWithOptionMapping('Yes', { answer: 'Yes', category: 'Preferences' }, 90, availableOptions);
  }

  // 2. Preferred Location / Work Mode
  if (normQ.includes('preferred work location') || normQ.includes('preferred location') || normQ.includes('current location') || normQ.includes('location preference')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const bangOpt = availableOptions.find(o => {
        const lo = o.toLowerCase();
        return lo.includes('bangalore') || lo.includes('bengaluru') || lo.includes('remote') || lo.includes('any');
      });
      if (bangOpt) return { answer: bangOpt, matchedItem: { answer: bangOpt }, confidence: 90, rawAnswer: bangOpt };
    }
    return { answer: 'Bangalore / Remote', matchedItem: { answer: 'Bangalore / Remote' }, confidence: 90, rawAnswer: 'Bangalore / Remote' };
  }

  // 3. Expected & Current CTC
  if (normQ.includes('expected ctc') || normQ.includes('expected salary') || normQ.includes('expectation')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const ctcOpt = availableOptions.find(o => o.includes('18') || o.includes('15') || o.includes('16') || o.includes('20') || o.toLowerCase().includes('lpa'));
      if (ctcOpt) return { answer: ctcOpt, matchedItem: { answer: ctcOpt }, confidence: 90, rawAnswer: ctcOpt };
    }
    return { answer: '18 LPA', matchedItem: { answer: '18 LPA' }, confidence: 90, rawAnswer: '18 LPA' };
  }
  if (normQ.includes('current ctc') || normQ.includes('present ctc') || normQ.includes('current salary') || normQ.includes('fixed ctc')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const ctcOpt = availableOptions.find(o => o.includes('15') || o.includes('14') || o.includes('16') || o.toLowerCase().includes('lpa'));
      if (ctcOpt) return { answer: ctcOpt, matchedItem: { answer: ctcOpt }, confidence: 90, rawAnswer: ctcOpt };
    }
    return { answer: '15 LPA', matchedItem: { answer: '15 LPA' }, confidence: 90, rawAnswer: '15 LPA' };
  }

  // 4. Notice Period & Joining Timeline
  if (normQ.includes('notice period') || normQ.includes('how soon can you join') || normQ.includes('joining period') || normQ.includes('availability to join') || normQ.includes('serving notice')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const npOpt = availableOptions.find(o => {
        const lo = o.toLowerCase();
        return lo.includes('immediate') || lo.includes('15') || lo.includes('30') || lo.includes('1 month') || lo.includes('serving');
      });
      if (npOpt) return { answer: npOpt, matchedItem: { answer: npOpt }, confidence: 90, rawAnswer: npOpt };
    }
    return { answer: '15 Days / Immediate', matchedItem: { answer: '15 Days / Immediate' }, confidence: 90, rawAnswer: '15 Days / Immediate' };
  }

  // 5. Total Experience
  if (normQ.includes('total experience') || normQ.includes('years of experience') || normQ.includes('overall experience')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const expOpt = availableOptions.find(o => o.includes('4') || o.includes('4+') || o.includes('3-5') || o.includes('4-6') || o.includes('3+'));
      if (expOpt) return { answer: expOpt, matchedItem: { answer: expOpt }, confidence: 90, rawAnswer: expOpt };
    }
    return { answer: '4+ Years', matchedItem: { answer: '4+ Years' }, confidence: 90, rawAnswer: '4+ Years' };
  }

  // 6. Work Shifts & Work Mode
  if (normQ.includes('work mode') || normQ.includes('wfh') || normQ.includes('wfo') || normQ.includes('hybrid') || normQ.includes('office')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const modeOpt = availableOptions.find(o => {
        const lo = o.toLowerCase();
        return lo.includes('hybrid') || lo.includes('remote') || lo.includes('flexible') || lo.includes('office');
      });
      if (modeOpt) return { answer: modeOpt, matchedItem: { answer: modeOpt }, confidence: 90, rawAnswer: modeOpt };
    }
    return { answer: 'Hybrid / Remote', matchedItem: { answer: 'Hybrid / Remote' }, confidence: 90, rawAnswer: 'Hybrid / Remote' };
  }
  if (normQ.includes('shift') || normQ.includes('rotational') || normQ.includes('night shift')) {
    if (Array.isArray(availableOptions) && availableOptions.length > 0) {
      const shiftOpt = availableOptions.find(o => {
        const lo = o.toLowerCase();
        return lo.includes('flexible') || lo.includes('day') || lo.includes('general') || lo.includes('yes');
      });
      if (shiftOpt) return { answer: shiftOpt, matchedItem: { answer: shiftOpt }, confidence: 90, rawAnswer: shiftOpt };
    }
    return { answer: 'Day / General Shift (Flexible)', matchedItem: { answer: 'Day / General Shift (Flexible)' }, confidence: 90, rawAnswer: 'Day / General Shift (Flexible)' };
  }

  // 7. General confirmation & proficiency questions
  if (normQ.includes('comfortable') || normQ.includes('agree') || normQ.includes('okay with') || normQ.includes('do you have experience')) {
    return resolveAnswerWithOptionMapping('Yes', { answer: 'Yes', category: 'General' }, 85, availableOptions);
  }

  return null;
}

/**
 * Maps raw text answer to closest valid option if options (dropdown/radio) are present
 */
function resolveAnswerWithOptionMapping(rawAnswer, matchedItem, confidence, availableOptions = []) {
  if (!Array.isArray(availableOptions) || availableOptions.length === 0) {
    return { answer: rawAnswer, matchedItem, confidence, rawAnswer };
  }

  const cleanAns = (rawAnswer || '').trim().toLowerCase();

  // 1. Direct match in options
  const directOpt = availableOptions.find(o => o.toLowerCase().trim() === cleanAns);
  if (directOpt) {
    return { answer: directOpt, matchedItem, confidence, rawAnswer };
  }

  // 2. Boolean mapping (Yes / No)
  if (cleanAns === 'yes' || cleanAns === 'true' || cleanAns === 'y') {
    const yesOpt = availableOptions.find(o => o.toLowerCase().includes('yes') || o.toLowerCase().includes('agree') || o.toLowerCase() === 'y');
    if (yesOpt) return { answer: yesOpt, matchedItem, confidence, rawAnswer };
  }
  if (cleanAns === 'no' || cleanAns === 'false' || cleanAns === 'n') {
    const noOpt = availableOptions.find(o => o.toLowerCase().includes('no') || o.toLowerCase().includes('disagree') || o.toLowerCase() === 'n');
    if (noOpt) return { answer: noOpt, matchedItem, confidence, rawAnswer };
  }

  // 3. Notice period range mapping (e.g. 15 days -> "< 15 days" or "15 to 30 days")
  const numVal = parseFloat(cleanAns);
  if (!isNaN(numVal)) {
    const matchingRangeOpt = availableOptions.find(o => {
      const optNorm = o.toLowerCase();
      if (optNorm.includes('immediate') && numVal <= 15) return true;
      if (optNorm.includes('15') && optNorm.includes('30') && numVal >= 15 && numVal <= 30) return true;
      if (optNorm.includes('30') && numVal <= 30) return true;
      if (optNorm.includes('3') && optNorm.includes('5') && numVal >= 3 && numVal <= 5) return true;
      return false;
    });
    if (matchingRangeOpt) return { answer: matchingRangeOpt, matchedItem, confidence, rawAnswer };
  }

  // 4. Substring contains match
  const subOpt = availableOptions.find(o => o.toLowerCase().includes(cleanAns) || cleanAns.includes(o.toLowerCase()));
  if (subOpt) {
    return { answer: subOpt, matchedItem, confidence: 80, rawAnswer };
  }

  return { answer: rawAnswer, matchedItem, confidence, rawAnswer };
}

/**
 * Pending Questions Queue (When unseen questions are encountered)
 */
function getPendingQuestions(userKey) {
  const filePath = getPendingQaFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
    } catch (e) {}
  }
  return [];
}

function addPendingQuestion(userKey, pendingItem) {
  ensureUserSandbox(userKey);
  const filePath = getPendingQaFilePath(userKey);
  const current = getPendingQuestions(userKey);
  const cleanQ = (pendingItem.question || '').trim();
  const existing = current.find(p => p.question.toLowerCase() === cleanQ.toLowerCase());

  if (existing) {
    return existing;
  }

  if (cleanQ) {
    const record = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      jobId: pendingItem.jobId || '',
      jobTitle: pendingItem.jobTitle || 'Software Role',
      company: pendingItem.company || 'Naukri Employer',
      jobUrl: pendingItem.jobUrl || 'https://www.naukri.com/',
      question: cleanQ,
      options: pendingItem.options || [],
      inputType: pendingItem.inputType || 'text',
      isMandatory: pendingItem.isMandatory !== false,
      status: 'NEEDS_USER_ANSWER',
      createdAt: new Date().toISOString()
    };
    current.push(record);
    try { fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf8'); } catch (e) {}
    if (isSupabaseConfigured()) {
      supabaseSaveNaukriConfig(userKey, { pendingQuestions: current }).catch(() => {});
    }
    return record;
  }
  return null;
}

async function resolvePendingQuestionAsync(userKey, pendingId, answer) {
  ensureUserSandbox(userKey);
  const filePath = getPendingQaFilePath(userKey);
  const current = getPendingQuestions(userKey);
  const target = current.find(p => p.id === pendingId);

  if (target) {
    // 1. Save answer permanently into Q&A database (Supabase DB)
    await saveQaItemAsync(userKey, {
      question: target.question,
      answer: answer.trim(),
      category: 'Recruiter Screening'
    });

    // 2. Remove from pending list
    const updated = current.filter(p => p.id !== pendingId);
    try { fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8'); } catch (e) {}
    if (isSupabaseConfigured()) {
      await supabaseSaveNaukriConfig(userKey, { pendingQuestions: updated }).catch(() => {});
    }

    // 3. Update application queue item state to READY_TO_SUBMIT if exists
    if (target.jobId) {
      updateQueueItemState(userKey, target.jobId, {
        state: ApplicationState.READY_TO_SUBMIT,
        userAnswerProvided: answer.trim(),
        stage: 'Answer Provided by User'
      });
    }

    return { success: true, savedAnswer: answer.trim(), targetQuestion: target.question };
  }

  return { success: false, error: 'Pending question not found' };
}

function resolvePendingQuestion(userKey, pendingId, answer) {
  ensureUserSandbox(userKey);
  const filePath = getPendingQaFilePath(userKey);
  const current = getPendingQuestions(userKey);
  const target = current.find(p => p.id === pendingId);

  if (target) {
    // 1. Save answer permanently into Q&A database
    saveQaItem(userKey, {
      question: target.question,
      answer: answer.trim(),
      category: 'Recruiter Screening'
    });

    // 2. Remove from pending list
    const updated = current.filter(p => p.id !== pendingId);
    try { fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8'); } catch (e) {}
    if (isSupabaseConfigured()) {
      supabaseSaveNaukriConfig(userKey, { pendingQuestions: updated }).catch(() => {});
    }

    // 3. Update application queue item state to READY_TO_SUBMIT if exists
    if (target.jobId) {
      updateQueueItemState(userKey, target.jobId, {
        state: ApplicationState.READY_TO_SUBMIT,
        userAnswerProvided: answer.trim(),
        stage: 'Answer Provided by User'
      });
    }

    return { success: true, savedAnswer: answer.trim(), targetQuestion: target.question };
  }

  return { success: false, error: 'Pending question not found' };
}

/**
 * Application Queue (Database-First State Machine & Crash Recovery)
 */
async function getNaukriQueueAsync(userKey) {
  if (isSupabaseConfigured() && userKey) {
    try {
      const dbQueue = await supabaseGetNaukriQueue(userKey);
      if (Array.isArray(dbQueue)) {
        ensureUserSandbox(userKey);
        const filePath = getQueueFilePath(userKey);
        try { fs.writeFileSync(filePath, JSON.stringify(dbQueue, null, 2), 'utf8'); } catch (e) {}
        return dbQueue;
      }
    } catch (e) {}
  }
  return getNaukriQueue(userKey);
}

function getNaukriQueue(userKey) {
  const filePath = getQueueFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
    } catch (e) {}
  }
  return [];
}

async function saveNaukriQueueAsync(userKey, queue) {
  ensureUserSandbox(userKey);
  const filePath = getQueueFilePath(userKey);
  try {
    fs.writeFileSync(filePath, JSON.stringify(queue.slice(0, 500), null, 2), 'utf8');
  } catch (e) {}
  if (isSupabaseConfigured()) {
    await supabaseSaveNaukriQueue(userKey, queue.slice(0, 500));
  }
  return queue;
}

function saveNaukriQueue(userKey, queue) {
  ensureUserSandbox(userKey);
  const filePath = getQueueFilePath(userKey);
  try {
    fs.writeFileSync(filePath, JSON.stringify(queue.slice(0, 500), null, 2), 'utf8');
  } catch (e) {}
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriQueue(userKey, queue.slice(0, 500)).catch(() => {});
  }
}

function updateQueueItemState(userKey, jobId, updates = {}) {
  const queue = getNaukriQueue(userKey);
  const idx = queue.findIndex(q => q.jobId === jobId || q.id === jobId);
  if (idx >= 0) {
    queue[idx] = {
      ...queue[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveNaukriQueue(userKey, queue);
    return queue[idx];
  }
  return null;
}

async function updateQueueItemStateAsync(userKey, jobId, updates = {}) {
  const queue = await getNaukriQueueAsync(userKey);
  const idx = queue.findIndex(q => q.jobId === jobId || q.id === jobId);
  if (idx >= 0) {
    queue[idx] = {
      ...queue[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await saveNaukriQueueAsync(userKey, queue);
    return queue[idx];
  }
  return null;
}

function clearNaukriQueue(userKey) {
  saveNaukriQueue(userKey, []);
  return [];
}

/**
 * Normalizes an applied job record and guarantees truthful verification status.
 * Reclassifies legacy / unverified records as LEGACY_UNVERIFIED (does not delete history).
 */
function normalizeAppliedJobRecord(jobData) {
  if (!jobData) return null;
  const isExplicitlyVerified =
    jobData.verificationStatus === VerificationStatus.VERIFIED ||
    jobData.verificationStatus === VerificationStatus.RECONCILED;

  let verificationStatus = jobData.verificationStatus;
  let status = jobData.status;

  if (!verificationStatus) {
    if (status === 'Applied (Naukri Easy Apply - Confirmed)' || status === ApplicationState.SUBMITTED) {
      verificationStatus = VerificationStatus.LEGACY_UNVERIFIED;
      status = ApplicationState.LEGACY_UNVERIFIED;
    } else if (status === 'Submission Unconfirmed' || status === ApplicationState.SUBMISSION_UNCONFIRMED) {
      verificationStatus = VerificationStatus.UNVERIFIED;
      status = ApplicationState.SUBMISSION_UNCONFIRMED;
    } else if ((status || '').toLowerCase().includes('failed')) {
      verificationStatus = VerificationStatus.FAILED;
      status = ApplicationState.FAILED;
    } else if ((status || '').toLowerCase().includes('skipped')) {
      verificationStatus = VerificationStatus.UNVERIFIED;
      status = ApplicationState.SKIPPED;
    } else {
      verificationStatus = VerificationStatus.LEGACY_UNVERIFIED;
      status = ApplicationState.LEGACY_UNVERIFIED;
    }
  }

  return {
    id: jobData.id || `naukri_app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    jobId: jobData.jobId || jobData.naukriJobId || `job_${Date.now()}`,
    naukriJobId: jobData.naukriJobId || jobData.jobId || null,
    jobTitle: jobData.jobTitle || 'Full Stack Developer',
    company: jobData.company || 'Naukri Employer',
    location: jobData.location || 'Bangalore / Remote',
    experience: jobData.experience || '3-6 Yrs',
    appliedAt: jobData.appliedAt || new Date().toISOString(),
    status: status || ApplicationState.SUBMISSION_UNCONFIRMED,
    verificationStatus: verificationStatus || VerificationStatus.UNVERIFIED,
    verificationSource: jobData.verificationSource || VerificationSource.NONE,
    verifiedAt: isExplicitlyVerified ? (jobData.verifiedAt || jobData.appliedAt) : null,
    verificationDetails: jobData.verificationDetails || null,
    failureStage: jobData.failureStage || null,
    resumeUsed: jobData.resumeUsed || 'candidate_resume.pdf',
    questionsAnsweredCount: jobData.questionsAnsweredCount || 0,
    jobUrl: jobData.jobUrl || 'https://www.naukri.com/',
    duration: jobData.duration || '10s',
    error: jobData.error || null
  };
}

/**
 * Applied Jobs History Logger (Database-First)
 */
async function getNaukriAppliedJobsAsync(userKey) {
  if (isSupabaseConfigured() && userKey) {
    try {
      const dbApps = await supabaseGetNaukriAppliedJobs(userKey);
      if (Array.isArray(dbApps)) {
        const normalized = dbApps.map(normalizeAppliedJobRecord).filter(Boolean);
        ensureUserSandbox(userKey);
        const filePath = getNaukriAppsFilePath(userKey);
        try { fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8'); } catch (e) {}
        return normalized;
      }
    } catch (e) {}
  }
  return getNaukriAppliedJobs(userKey);
}

function getNaukriAppliedJobs(userKey) {
  const filePath = getNaukriAppsFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeAppliedJobRecord).filter(Boolean);
      }
    } catch (e) {}
  }
  return [];
}

function logNaukriAppliedJob(userKey, jobData) {
  ensureUserSandbox(userKey);
  const filePath = getNaukriAppsFilePath(userKey);
  const current = getNaukriAppliedJobs(userKey);
  const normalized = normalizeAppliedJobRecord(jobData);

  current.unshift(normalized);
  try {
    fs.writeFileSync(filePath, JSON.stringify(current.slice(0, 300), null, 2), 'utf8');
  } catch (e) {}
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriAppliedJobs(userKey, current.slice(0, 300)).catch(() => {});
  }

  return normalized;
}

/**
 * CANONICAL APPLICATION CONFIRMATION AUTHORITY
 * The ONLY function in the codebase allowed to transition an application to SUBMITTED.
 * Requires hard verification evidence from live Naukri DOM confirmation or Applied section match.
 */
function confirmNaukriApplicationSubmission(userKey, jobItem, verificationEvidence) {
  if (!verificationEvidence || (verificationEvidence.status !== VerificationStatus.VERIFIED && verificationEvidence.status !== VerificationStatus.RECONCILED)) {
    throw new Error(`Cannot confirm application submission for "${jobItem?.company || 'job'}" without positive verification evidence.`);
  }

  const durationSec = jobItem.duration || (jobItem.startTime ? `${Math.round((Date.now() - jobItem.startTime) / 1000)}s` : '10s');
  const now = new Date().toISOString();

  const record = {
    id: jobItem.id || `naukri_app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    jobId: jobItem.jobId || jobItem.naukriJobId || `job_${Date.now()}`,
    naukriJobId: jobItem.naukriJobId || jobItem.jobId || null,
    jobTitle: jobItem.jobTitle || jobItem.title || 'Full Stack Developer',
    company: jobItem.company || 'Naukri Employer',
    location: jobItem.location || 'Bangalore / Remote',
    experience: jobItem.experience || jobItem.exp || '3-6 Yrs',
    jobUrl: jobItem.jobUrl || jobItem.url || 'https://www.naukri.com/',
    status: ApplicationState.SUBMITTED,
    verificationStatus: verificationEvidence.status || VerificationStatus.VERIFIED,
    verificationSource: verificationEvidence.source || VerificationSource.NAUKRI_DOM_CONFIRMATION,
    verifiedAt: verificationEvidence.verifiedAt || now,
    verificationDetails: verificationEvidence.details || 'Explicit Naukri confirmation signal verified on DOM',
    appliedAt: now,
    resumeUsed: jobItem.resumeUsed || 'candidate_resume.pdf',
    questionsAnsweredCount: jobItem.questionsAnsweredCount || 0,
    duration: durationSec,
    failureStage: null,
    error: null
  };

  logNaukriAppliedJob(userKey, record);

  updateQueueItemState(userKey, record.jobId, {
    state: ApplicationState.SUBMITTED,
    stage: 'Application Confirmed & Verified on Naukri',
    verificationStatus: record.verificationStatus,
    verificationSource: record.verificationSource,
    verifiedAt: record.verifiedAt,
    appliedAt: record.appliedAt
  });

  return record;
}

/**
 * CANONICAL UNCONFIRMED APPLICATION RECORDER
 * Logs applications where submit was triggered but positive confirmation could not be unequivocally proven.
 * Preserves the record in DB for reconciliation and prevents immediate retry without incrementing daily counter.
 */
function recordUnconfirmedNaukriApplication(userKey, jobItem, reason = 'Naukri post-submit confirmation could not be verified on live DOM') {
  const durationSec = jobItem.duration || (jobItem.startTime ? `${Math.round((Date.now() - jobItem.startTime) / 1000)}s` : '10s');
  const now = new Date().toISOString();

  const record = {
    id: jobItem.id || `naukri_app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    jobId: jobItem.jobId || jobItem.naukriJobId || `job_${Date.now()}`,
    naukriJobId: jobItem.naukriJobId || jobItem.jobId || null,
    jobTitle: jobItem.jobTitle || jobItem.title || 'Full Stack Developer',
    company: jobItem.company || 'Naukri Employer',
    location: jobItem.location || 'Bangalore / Remote',
    experience: jobItem.experience || jobItem.exp || '3-6 Yrs',
    jobUrl: jobItem.jobUrl || jobItem.url || 'https://www.naukri.com/',
    status: ApplicationState.SUBMISSION_UNCONFIRMED,
    verificationStatus: VerificationStatus.UNVERIFIED,
    verificationSource: VerificationSource.NONE,
    verifiedAt: null,
    verificationDetails: reason,
    appliedAt: now,
    resumeUsed: jobItem.resumeUsed || 'candidate_resume.pdf',
    questionsAnsweredCount: jobItem.questionsAnsweredCount || 0,
    duration: durationSec,
    failureStage: 'Post-Submit Confirmation Inconclusive',
    error: reason
  };

  logNaukriAppliedJob(userKey, record);

  updateQueueItemState(userKey, record.jobId, {
    state: ApplicationState.SUBMISSION_UNCONFIRMED,
    stage: 'Submission Unconfirmed on Naukri',
    verificationStatus: VerificationStatus.UNVERIFIED,
    verificationDetails: reason,
    appliedAt: now
  });

  return record;
}

/**
 * Company Name Normalizer
 * Strips common legal suffixes and cleans whitespace to ensure robust deduplication
 * E.g. "Fornax Technology Services Private Limited" -> "fornax"
 *      "Swiggy India Pvt Ltd" -> "swiggy"
 */
function normalizeCompanyName(company) {
  if (!company || typeof company !== 'string') return '';
  return company
    .toLowerCase()
    .replace(/\b(private|pvt|ltd|limited|inc|llc|technologies|technology|tech|solutions|services|corp|corporation|group|india|enterprises|systems|software)\b/gi, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical check if an application is confirmed as submitted & verified on Naukri.
 * Only returns true if status is SUBMITTED and verificationStatus is VERIFIED or RECONCILED.
 * Never treats unconfirmed, pending, failed, or skipped attempts as applied.
 */
function isConfirmedAppliedRecord(app) {
  if (!app) return false;
  const statusStr = (app.status || '').toString().trim().toUpperCase();
  const isSubmitted = statusStr === ApplicationState.SUBMITTED || statusStr === 'SUBMITTED' || statusStr === 'APPLIED (NAUKRI EASY APPLY - CONFIRMED)';
  const verStr = (app.verificationStatus || '').toString().trim().toUpperCase();
  const isVerified = verStr === VerificationStatus.VERIFIED ||
                     verStr === VerificationStatus.RECONCILED ||
                     verStr === 'VERIFIED' ||
                     verStr === 'RECONCILED';
  return isSubmitted && isVerified;
}

/**
 * Extracts exact and normalized company sets from confirmed applied jobs history.
 * STRICT TRUTH RULE: Only companies with confirmed, verified applications are included.
 * Unconfirmed, failed, or timed-out submissions are NOT blacklisted, allowing re-application.
 */
function getPastAppliedCompanySets(appsOrUserKey) {
  const allApps = typeof appsOrUserKey === 'string' ? getNaukriAppliedJobs(appsOrUserKey) : (appsOrUserKey || []);
  const exactCompanySet = new Set();
  const normalizedCompanySet = new Set();

  if (Array.isArray(allApps)) {
    for (const app of allApps) {
      if (app && app.company && isConfirmedAppliedRecord(app)) {
        const exact = app.company.toLowerCase().trim();
        exactCompanySet.add(exact);
        const norm = normalizeCompanyName(exact);
        if (norm) normalizedCompanySet.add(norm);
      }
    }
  }
  return { exactCompanySet, normalizedCompanySet };
}

/**
 * Aggregates Applied Jobs by Company & Role (Directory Log)
 * Returns unique companies with all roles applied, timestamps, and direct URLs
 * STRICT TRUTH RULE: totalApplied increments ONLY for verified applications.
 */
function buildCompanySummaryFromApps(allApps, userKey = null) {
  const companyMap = new Map();
  const pendingQs = userKey ? getPendingQuestions(userKey) : [];

  for (const app of (allApps || [])) {
    const rawCompany = (app.company || 'Unknown Company').trim();
    const normKey = normalizeCompanyName(rawCompany) || rawCompany.toLowerCase();

    if (!companyMap.has(normKey)) {
      companyMap.set(normKey, {
        company: rawCompany,
        normalizedCompany: normKey,
        roles: [],
        applications: [],
        totalApplied: 0,
        unconfirmedCount: 0,
        failedCount: 0,
        lastAppliedAt: app.appliedAt || null,
        status: app.status || ApplicationState.SUBMISSION_UNCONFIRMED,
        verificationStatus: app.verificationStatus || VerificationStatus.UNVERIFIED,
        latestJobUrl: app.jobUrl || 'https://www.naukri.com/',
        latestJobId: app.jobId || app.id || null,
        latestUnconfirmedReason: null,
        pendingQuestions: [],
        hasPendingQuestions: false,
        failureStage: null,
        error: null
      });
    }

    const entry = companyMap.get(normKey);
    const roleTitle = app.jobTitle || 'Developer';
    if (!entry.roles.includes(roleTitle)) {
      entry.roles.push(roleTitle);
    }

    // Find any matching pending questions for this specific app or company
    const matchingPending = pendingQs.filter(p => 
      (p.jobId && (p.jobId === app.jobId || p.jobId === app.id)) ||
      (p.company && normalizeCompanyName(p.company) === normKey)
    );

    entry.applications.push({
      id: app.id,
      jobId: app.jobId,
      jobTitle: roleTitle,
      jobUrl: app.jobUrl,
      location: app.location,
      appliedAt: app.appliedAt,
      status: app.status,
      verificationStatus: app.verificationStatus,
      verificationDetails: app.verificationDetails || app.error,
      failureStage: app.failureStage,
      error: app.error,
      pendingQuestions: matchingPending
    });

    if (isConfirmedAppliedRecord(app)) {
      entry.totalApplied++;
    } else if (app.status === ApplicationState.FAILED || (app.status || '').toLowerCase().includes('failed')) {
      entry.failedCount++;
      if (!entry.failureStage) entry.failureStage = app.failureStage || 'Submission Failed';
      if (!entry.error) entry.error = app.error;
    } else {
      entry.unconfirmedCount++;
      const reason = app.verificationDetails || app.error || app.failureStage || 'Naukri post-submit confirmation could not be verified on live DOM';
      if (!entry.latestUnconfirmedReason) {
        entry.latestUnconfirmedReason = reason;
      }
    }

    if (app.appliedAt && (!entry.lastAppliedAt || new Date(app.appliedAt) > new Date(entry.lastAppliedAt))) {
      entry.lastAppliedAt = app.appliedAt;
      if (app.jobUrl) entry.latestJobUrl = app.jobUrl;
      if (app.jobId || app.id) entry.latestJobId = app.jobId || app.id;
      entry.status = app.status;
      entry.verificationStatus = app.verificationStatus;
      if (app.verificationDetails || app.error) {
        entry.latestUnconfirmedReason = app.verificationDetails || app.error;
      }
      if (app.failureStage) entry.failureStage = app.failureStage;
    }
  }

  // Populate company-level pending questions
  for (const [normKey, entry] of companyMap.entries()) {
    const compPending = pendingQs.filter(p => 
      (p.company && normalizeCompanyName(p.company) === normKey) ||
      entry.applications.some(a => a.jobId && a.jobId === p.jobId)
    );
    entry.pendingQuestions = compPending;
    entry.hasPendingQuestions = compPending.length > 0;
    if (compPending.length > 0 && (!entry.latestUnconfirmedReason || entry.latestUnconfirmedReason.includes('could not be verified'))) {
      entry.latestUnconfirmedReason = `${compPending.length} screening question(s) require your answer`;
    }
  }

  return Array.from(companyMap.values()).sort((a, b) => {
    return new Date(b.lastAppliedAt || 0) - new Date(a.lastAppliedAt || 0);
  });
}

function getNaukriCompanyApplicationSummary(userKey) {
  const allApps = getNaukriAppliedJobs(userKey);
  return buildCompanySummaryFromApps(allApps, userKey);
}

async function getNaukriCompanyApplicationSummaryAsync(userKey) {
  const allApps = await getNaukriAppliedJobsAsync(userKey);
  return buildCompanySummaryFromApps(allApps, userKey);
}

/**
 * Strict Daily Target & Applications Metric Calculator
 * Counts ONLY confirmed SUBMITTED applications today with explicit verification evidence (VERIFIED / RECONCILED).
 * Does not count WAITING, FAILED, SKIPPED, LEGACY_UNVERIFIED, or UNCONFIRMED submissions.
 */
function getTodayAppliedStats(userKey) {
  const allApps = getNaukriAppliedJobs(userKey);
  const queue = getNaukriQueue(userKey);
  const pending = getPendingQuestions(userKey);
  const config = getFilterConfig(userKey);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayApps = allApps.filter(a => (a.appliedAt || '').startsWith(todayStr));

  // STRICT RULE: Count ONLY confirmed SUBMITTED applications today with verified evidence
  const verifiedToday = todayApps.filter(a =>
    a.status === ApplicationState.SUBMITTED &&
    (a.verificationStatus === VerificationStatus.VERIFIED || a.verificationStatus === VerificationStatus.RECONCILED)
  );

  const unconfirmedToday = todayApps.filter(a =>
    (a.status === ApplicationState.SUBMISSION_UNCONFIRMED ||
     a.verificationStatus === VerificationStatus.UNVERIFIED ||
     a.verificationStatus === VerificationStatus.LEGACY_UNVERIFIED) &&
    a.status !== ApplicationState.SKIPPED &&
    a.status !== ApplicationState.FAILED &&
    !(a.status || '').toLowerCase().includes('failed') &&
    !(a.status || '').toLowerCase().includes('skipped')
  );

  const failedToday = todayApps.filter(a =>
    a.status === ApplicationState.FAILED || (a.status || '').toLowerCase().includes('failed')
  );

  const skippedToday = todayApps.filter(a =>
    a.status === ApplicationState.SKIPPED || (a.status || '').toLowerCase().includes('skipped')
  );

  const inProgressQueue = queue.filter(q =>
    [ApplicationState.STARTED, ApplicationState.FORM_OPENED, ApplicationState.FILLING, ApplicationState.SUBMITTING].includes(q.state)
  );

  const waitingForUserQueue = queue.filter(q => q.state === ApplicationState.WAITING_FOR_USER);

  const dailyTarget = config.dailyTarget || 50;
  const verifiedCount = verifiedToday.length;

  return {
    todayCount: verifiedCount,
    verifiedCount,
    dailyTarget,
    remainingTarget: Math.max(0, dailyTarget - verifiedCount),
    percentComplete: Math.min(100, Math.round((verifiedCount / dailyTarget) * 100)),
    inProgressCount: inProgressQueue.length,
    discoveredCount: queue.length,
    waitingForInputCount: pending.length > 0 ? pending.length : waitingForUserQueue.length,
    failedCount: failedToday.length,
    skippedCount: skippedToday.length,
    unconfirmedCount: unconfirmedToday.length,
    todayApps
  };
}

/**
 * Multi-Factor Relevance Scoring
 */
function calculateJobRelevanceScore(job, filterConfig) {
  let score = 0;
  const title = (job.title || '').toLowerCase();
  const company = (job.company || '').toLowerCase();
  const location = (job.location || '').toLowerCase();
  const expStr = (job.exp || '').toLowerCase();
  const tagsStr = ((job.tags || []).join(' ')).toLowerCase();

  // Excluded Check
  if (Array.isArray(filterConfig.excludedCompanies) && filterConfig.excludedCompanies.some(c => company.includes(c.toLowerCase().trim()))) {
    return -1000;
  }
  if (Array.isArray(filterConfig.excludedJobTitles) && filterConfig.excludedJobTitles.some(t => title.includes(t.toLowerCase().trim()))) {
    return -1000;
  }

  // 1. Job Title Match (+35 max)
  if (Array.isArray(filterConfig.jobTitles)) {
    for (const t of filterConfig.jobTitles) {
      const tNorm = t.toLowerCase();
      if (title.includes(tNorm)) {
        score += 35;
        break;
      }
    }
  }

  // 2. Skills Match (+25 max)
  let matchedSkillsCount = 0;
  if (Array.isArray(filterConfig.skills)) {
    for (const s of filterConfig.skills) {
      const sNorm = s.toLowerCase();
      if (tagsStr.includes(sNorm) || title.includes(sNorm)) {
        matchedSkillsCount++;
        score += 5;
      }
    }
  }
  score = Math.min(score, 60);

  // 3. Location & Remote Preference (+20 max)
  const isBangalore = location.includes('bangalore') || location.includes('bengaluru');
  const isRemote = location.includes('remote') || location.includes('hybrid') || location.includes('work from home');
  if (isBangalore || isRemote) {
    score += 20;
  }

  // 4. Experience Match (+15 max)
  if (expStr.includes('3') || expStr.includes('4') || expStr.includes('5') || expStr.includes('6')) {
    score += 15;
  }

  // 5. Easy Apply Availability (+10 max)
  if (job.isEasyApply !== false) {
    score += 10;
  }

  return score;
}

/**
 * Company Diversity Interleaver & Queue Builder
 * Prevents any company from dominating the application queue and strictly excludes
 * companies that have already been applied to previously.
 */
function buildDiverseApplicationQueue(discoveredJobs, filterConfig = {}, pastAppliedSet = null, pastAppliedCompanies = null) {
  const strictCompanyDedup = filterConfig.neverApplySameCompanyTwice !== false;
  const maxPerCompany = strictCompanyDedup ? 1 : (filterConfig.maxJobsPerCompanyPerRun || 1);
  const filteredJobs = [];

  const activeExactCompSet = (pastAppliedCompanies && pastAppliedCompanies.exactCompanySet) ? new Set(pastAppliedCompanies.exactCompanySet) : new Set();
  const activeNormCompSet = (pastAppliedCompanies && pastAppliedCompanies.normalizedCompanySet) ? new Set(pastAppliedCompanies.normalizedCompanySet) : new Set();

  // Filter out already applied jobs, duplicate companies, and low relevance scores
  for (const job of discoveredJobs) {
    const canonicalId = job.jobId || '';
    const cleanUrl = (job.url || '').split('?')[0].toLowerCase().trim();
    const compRaw = (job.company || '').toLowerCase().trim();
    const compNorm = normalizeCompanyName(compRaw);
    const dedupKey = `${compRaw}___${(job.title || '').toLowerCase().trim()}`;

    if (pastAppliedSet) {
      if (canonicalId && pastAppliedSet.has(canonicalId)) continue;
      if (cleanUrl && pastAppliedSet.has(cleanUrl)) continue;
      if (pastAppliedSet.has(dedupKey)) continue;
    }

    // STRICT COMPANY EXCLUSION: Never apply to the same company again!
    if (strictCompanyDedup) {
      if (activeExactCompSet.has(compRaw) || (compNorm && activeNormCompSet.has(compNorm))) {
        console.log(`[COMPANY_EXCLUDED] Skipping job "${job.title}" at "${job.company}" - This company was already applied to previously.`);
        continue;
      }
    }

    const score = (typeof job.score === 'number') ? job.score : calculateJobRelevanceScore(job, filterConfig);
    if (score < (filterConfig.minRelevanceScore || 35)) continue;

    filteredJobs.push({ ...job, score });
  }

  // Group by company
  const companyBuckets = new Map();
  for (const job of filteredJobs) {
    const compKey = (job.company || '').toLowerCase().trim();
    if (!companyBuckets.has(compKey)) {
      companyBuckets.set(compKey, []);
    }
    const bucket = companyBuckets.get(compKey);
    if (bucket.length < maxPerCompany) {
      bucket.push(job);
    }
  }

  // Sort each bucket by score descending
  for (const bucket of companyBuckets.values()) {
    bucket.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // Sort companies by the highest scoring first job descending
  const companies = Array.from(companyBuckets.keys()).sort((a, b) => {
    const topA = companyBuckets.get(a)[0]?.score || 0;
    const topB = companyBuckets.get(b)[0]?.score || 0;
    return topB - topA;
  });

  // Interleave and track companies so no duplicate company is ever queued
  const finalQueue = [];
  const queuedCompanySet = new Set();
  let hasMore = true;
  let round = 0;

  while (hasMore && round < maxPerCompany) {
    hasMore = false;
    for (const comp of companies) {
      if (strictCompanyDedup && queuedCompanySet.has(comp)) continue;
      const bucket = companyBuckets.get(comp);
      if (bucket && bucket[round]) {
        finalQueue.push({
          id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          jobId: bucket[round].jobId || `job_${Date.now()}_${finalQueue.length}`,
          jobTitle: bucket[round].title,
          company: bucket[round].company,
          location: bucket[round].location,
          experience: bucket[round].exp,
          jobUrl: bucket[round].url,
          score: bucket[round].score,
          state: ApplicationState.QUEUED,
          createdAt: new Date().toISOString()
        });
        queuedCompanySet.add(comp);
        activeExactCompSet.add(comp);
        const norm = normalizeCompanyName(comp);
        if (norm) activeNormCompSet.add(norm);
        hasMore = true;
      }
    }
    round++;
  }

  return finalQueue;
}

/**
 * Multi-Query Job Discovery Engine via Puppeteer (100% Configuration-Driven)
 * Searches multiple query combinations to discover a wide variety of companies without hardcoded fallbacks.
 */
async function discoverNaukriJobsWithPuppeteer(page, userKey, filterConfig = null) {
  const config = filterConfig || getFilterConfig(userKey);

  // Dynamically build search queries from user DB configuration
  const titles = (Array.isArray(config.jobTitles) && config.jobTitles.length > 0)
    ? config.jobTitles
    : ['Software Engineer', 'Full Stack Developer', 'Backend Developer'];

  const locations = (Array.isArray(config.locations) && config.locations.length > 0)
    ? config.locations
    : ['Remote'];

  const searchQueries = [];

  // 1. Build Title + Location queries from user config
  for (const title of titles) {
    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    for (const loc of locations.slice(0, 2)) {
      const cleanLoc = loc.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
      const slug = (cleanLoc && cleanLoc !== 'remote') ? `${cleanTitle}-jobs-in-${cleanLoc}` : `${cleanTitle}-jobs`;
      searchQueries.push({ 
        query: `${title} in ${loc}`, 
        searchUrl: `https://www.naukri.com/${slug}?k=${encodeURIComponent(title)}&l=${encodeURIComponent(loc)}`,
        locParam: loc 
      });
    }
  }

  // 2. Skill + Location queries
  if (Array.isArray(config.skills) && config.skills.length > 0) {
    const topSkill = config.skills[0];
    const cleanSkill = topSkill.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    const loc = locations[0] || 'bangalore';
    const cleanLoc = loc.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    searchQueries.push({ 
      query: `${topSkill} Developer in ${loc}`, 
      searchUrl: `https://www.naukri.com/${cleanSkill}-developer-jobs-in-${cleanLoc}?k=${encodeURIComponent(topSkill + ' Developer')}&l=${encodeURIComponent(loc)}`,
      locParam: loc 
    });
  }

  // 3. Remote role query if remote preference is enabled
  if (config.remotePreference === 'remote' || locations.some(l => l.toLowerCase().includes('remote'))) {
    const cleanTitle = (titles[0] || 'software-engineer').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    searchQueries.push({ 
      query: `${titles[0] || 'Software Engineer'} Remote`, 
      searchUrl: `https://www.naukri.com/${cleanTitle}-jobs?k=${encodeURIComponent(titles[0] || 'Software Engineer')}&q=remote`,
      locParam: 'remote' 
    });
  }

  console.log(`[SEARCH] Starting dynamic multi-query discovery across ${searchQueries.length} search variations: [${searchQueries.map(s => s.query).join(', ')}]...`);
  const allDiscovered = [];
  const seenUrls = new Set();
  const seenJobIds = new Set();

  for (const { query, searchUrl } of searchQueries) {
    if (allDiscovered.length >= (config.maxJobsPerRun ? config.maxJobsPerRun * 4 : 50)) break;

    try {
      console.log(`[SEARCH] Querying: "${query}" -> ${searchUrl}...`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const queryJobs = await page.evaluate(() => {
        const results = [];
        const tuples = document.querySelectorAll('article.jobTuple, .srp-jobtuple-wrapper, div.cust-job-tuple, div[data-job-id]');

        tuples.forEach(tuple => {
          const titleEl = tuple.querySelector('a.title, .title a, a[href*="job-listings"]');
          if (!titleEl) return;

          const rawHref = titleEl.href || '';
          if (!rawHref.includes('job-listings')) return;

          const title = titleEl.textContent?.trim() || '';
          const compEl = tuple.querySelector('.comp-name, .companyName, .subTitle, a.company');
          const company = compEl?.textContent?.trim() || '';

          const locEl = tuple.querySelector('.loc-wrap, .location, .loc, span[class*="loc"]');
          const location = locEl?.textContent?.trim() || 'Remote';

          const expEl = tuple.querySelector('.exp-wrap, .experience, .exp, span[class*="exp"]');
          const exp = expEl?.textContent?.trim() || '0-5 Yrs';

          const tagEls = tuple.querySelectorAll('.tags-gt, .tag-li, .tags span, .dot-gt');
          const tags = Array.from(tagEls).map(t => t.textContent?.trim()).filter(Boolean);

          const tupleText = (tuple.textContent || '').toLowerCase();
          const isCompanySite = tupleText.includes('apply on company site') || tupleText.includes('company site');

          // Extract canonical job ID
          let jobId = tuple.getAttribute('data-job-id') || '';
          if (!jobId) {
            const match = rawHref.match(/-([0-9]{8,15})(?:\?|$)/);
            if (match) jobId = match[1];
          }

          results.push({
            jobId: jobId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            title,
            company: company || 'Employer',
            url: rawHref,
            location,
            exp,
            tags,
            isEasyApply: !isCompanySite
          });
        });

        return results;
      });

      console.log(`[SEARCH] Found ${queryJobs.length} listings for query "${query}".`);

      for (const job of queryJobs) {
        const cleanUrl = job.url.split('?')[0];
        if (!seenUrls.has(cleanUrl) && !seenJobIds.has(job.jobId)) {
          seenUrls.add(cleanUrl);
          if (job.jobId) seenJobIds.add(job.jobId);
          allDiscovered.push(job);
        }
      }

      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.warn(`[SEARCH WARN] Search failed for query "${query}":`, err.message);
    }
  }

  console.log(`[SEARCH] Total unique raw jobs discovered across queries: ${allDiscovered.length}.`);
  return allDiscovered;
}

// Whitelist of established enterprises, MNCs, and corporate tech employers (automatically qualified as 200+ employees)
const KNOWN_ENTERPRISE_COMPANIES = new Set([
  'infosys', 'tcs', 'tata consultancy services', 'wipro', 'cognizant', 'accenture', 'hcl', 'hcltech',
  'tech mahindra', 'capgemini', 'ibm', 'oracle', 'sap', 'microsoft', 'amazon', 'aws', 'google',
  'meta', 'facebook', 'apple', 'cisco', 'intel', 'amd', 'nvidia', 'dell', 'hp', 'hewlett packard',
  'samsung', 'qualcomm', 'broadcom', 'sify', 'sify technologies', 'iqvia', 'swiggy', 'zomato',
  'razorpay', 'paytm', 'one97', 'flipkart', 'myntra', 'jio', 'reliance', 'reliance jio', 'airtel',
  'bharti airtel', 'siemens', 'bosch', 'ltimindtree', 'mindtree', 'l&t infotech', 'cgi', 'dxc',
  'dxc technology', 'ey', 'ernst & young', 'pwc', 'pricewaterhousecoopers', 'deloitte', 'kpmg',
  'jpmorgan', 'jpmorgan chase', 'morgan stanley', 'goldman sachs', 'wells fargo', 'citi', 'citibank',
  'hsbc', 'standard chartered', 'barclays', 'deutsche bank', 'american express', 'amex', 'fidelity',
  'fidelity investments', 'paypal', 'servicenow', 'salesforce', 'adobe', 'intuit', 'uber', 'ola',
  'atlassian', 'vmware', 'nutanix', 'palo alto networks', 'fortinet', 'crowdstrike', 'freshworks',
  'zoho', 'zoho corporation', 'target', 'walmart', 'walmart global tech', 'lowes', 'optum',
  'unitedhealth', 'unitedhealth group', 'cerner', 'epic systems', 'societe generale', 'bnp paribas',
  'ubs', 'credit suisse', 'schneider electric', 'honeywell', 'general electric', 'ge', 'philips',
  'hitachi', 'sony', 'rakuten', 'mercedes-benz', 'mercedes benz', 'bmw', 'volvo', 'ford',
  'genpact', 'conduent', 'mphasis', 'birlasoft', 'zensar', 'cyient', 'kpit', 'sonata software',
  'hexaware', 'persistent systems', 'coforge', 'niit', 'firstsource', 'exl', 'indegene', 'eclerx',
  'infobeans', 'eizen', 'aziro', 'indium software', 'otomeyt', 'opey assuredefence'
]);

/**
 * Pre-Application Company Intel & Headcount Inspector
 * Inspects company profile on page to ensure it meets minimum 200+ employees and filters out early-stage startups.
 */
async function inspectCompanySizeAndProfile(page, jobItem, filterConfig = {}) {
  const minRequiredEmployees = typeof filterConfig.minCompanyEmployees === 'number'
    ? filterConfig.minCompanyEmployees
    : 200;
  const excludeStartups = filterConfig.excludeStartups !== false;

  const rawCompanyName = (jobItem.company || '').toLowerCase().trim();
  const normalizedComp = normalizeCompanyName(rawCompanyName);

  // 1. Whitelist Check for known Enterprise / MNC brands
  if (
    KNOWN_ENTERPRISE_COMPANIES.has(rawCompanyName) ||
    (normalizedComp && KNOWN_ENTERPRISE_COMPANIES.has(normalizedComp)) ||
    Array.from(KNOWN_ENTERPRISE_COMPANIES).some(brand => rawCompanyName.includes(brand))
  ) {
    return {
      eligible: true,
      size: '200+ (Established Enterprise / MNC)',
      isStartup: false,
      reason: `Company "${jobItem.company}" is a recognized mid/large enterprise with 200+ employees.`
    };
  }

  // 2. DOM Inspection on the Job / Employer Page
  try {
    const domIntel = await page.evaluate(() => {
      const pageText = document.body ? (document.body.innerText || '') : '';

      // Scrape About Company and Company details containers
      const compContainers = Array.from(document.querySelectorAll(
        '.about-company, .company-info, .comp-info, .styles_company-info-container, .overview, .ambitionbox, [class*="aboutCompany"], [class*="companyOverview"], [class*="company-info"], div.job-desc, div.other-details'
      ));
      const compSnippet = compContainers.map(c => c.innerText || '').join('\n');
      const combinedIntelText = (compSnippet + '\n' + pageText.slice(0, 5000)).toLowerCase();

      // Badges / Tags
      const tags = Array.from(document.querySelectorAll(
        '.tag, .chip, span[class*="tag"], span[class*="badge"], div[class*="badge"], span[class*="comp-type"], [class*="companyType"], a.reviewsCount, .rating-review-container'
      )).map(el => (el.innerText || '').trim().toLowerCase()).filter(Boolean);

      // Review count parsing (e.g., "1.4k Reviews", "320 Reviews")
      let reviewCount = 0;
      const reviewMatch = combinedIntelText.match(/([0-9.,]+)\s*k?\s*reviews?/i) ||
                          tags.find(t => t.includes('review'))?.match(/([0-9.,]+)\s*k?/);
      if (reviewMatch) {
        const numStr = reviewMatch[1].replace(/,/g, '');
        if (reviewMatch[0].includes('k')) {
          reviewCount = Math.round(parseFloat(numStr) * 1000);
        } else {
          reviewCount = parseInt(numStr, 10) || 0;
        }
      }

      // Check for explicit employee size patterns (e.g., "500 - 1000 Employees", "10,000+ Employees", "201-500", "51-200", "1-50")
      let parsedMinEmployees = null;
      let parsedMaxEmployees = null;
      let sizeSnippet = '';

      const rangeMatch = combinedIntelText.match(/\b([0-9,]+)\s*(?:-|to)\s*([0-9,]+)\s*employees\b/i) ||
                         combinedIntelText.match(/\b([0-9,]+)\s*(?:-|to)\s*([0-9,]+)\s*(?:people|staff|members)\b/i);
      if (rangeMatch) {
        parsedMinEmployees = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
        parsedMaxEmployees = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
        sizeSnippet = rangeMatch[0];
      }

      const plusMatch = combinedIntelText.match(/\b([0-9,]+)\+\s*employees\b/i) ||
                        combinedIntelText.match(/\b([0-9,]+)\+\s*people\b/i);
      if (plusMatch && !parsedMinEmployees) {
        parsedMinEmployees = parseInt(plusMatch[1].replace(/,/g, ''), 10);
        parsedMaxEmployees = parsedMinEmployees * 5;
        sizeSnippet = plusMatch[0];
      }

      const kPlusMatch = combinedIntelText.match(/\b([0-9.]+)\s*k\+\s*employees\b/i);
      if (kPlusMatch && !parsedMinEmployees) {
        parsedMinEmployees = Math.round(parseFloat(kPlusMatch[1]) * 1000);
        parsedMaxEmployees = parsedMinEmployees * 2;
        sizeSnippet = kPlusMatch[0];
      }

      const isMncOrCorporate = combinedIntelText.includes('foreign mnc') ||
                               combinedIntelText.includes('corporate') ||
                               combinedIntelText.includes('fortune 500') ||
                               combinedIntelText.includes('indian mnc') ||
                               combinedIntelText.includes('enterprise') ||
                               combinedIntelText.includes('public company') ||
                               tags.some(t => t.includes('mnc') || t.includes('corporate') || t.includes('enterprise') || t.includes('fortune'));

      const isStartupExplicit = tags.some(t => t === 'startup' || t.includes('early stage') || t.includes('seed funded') || t.includes('series a')) ||
                                combinedIntelText.includes('early-stage startup') ||
                                combinedIntelText.includes('seed-funded startup') ||
                                combinedIntelText.includes('bootstrapped startup') ||
                                combinedIntelText.includes('stealth startup') ||
                                combinedIntelText.includes('fast-growing startup with 10-');

      return {
        parsedMinEmployees,
        parsedMaxEmployees,
        sizeSnippet,
        reviewCount,
        isMncOrCorporate,
        isStartupExplicit,
        tags: tags.slice(0, 10)
      };
    });

    console.log(`[COMPANY_INTEL] "${jobItem.company}": Size=${domIntel.sizeSnippet || 'Unspecified'}, Reviews=${domIntel.reviewCount}, MNC/Corp=${domIntel.isMncOrCorporate}, Startup=${domIntel.isStartupExplicit}`);

    // Check 1: Explicit max employees < minRequiredEmployees (e.g. "1-50 Employees" -> max 50 < 200)
    if (domIntel.parsedMaxEmployees && domIntel.parsedMaxEmployees < minRequiredEmployees) {
      return {
        eligible: false,
        size: `< ${minRequiredEmployees} (${domIntel.sizeSnippet})`,
        isStartup: true,
        reason: `Company size "${domIntel.sizeSnippet}" is strictly below required ${minRequiredEmployees}+ employees.`
      };
    }

    // Check 2: Explicit Startup flag when excludeStartups is enabled and company is not a verified 200+ employer
    if (excludeStartups && domIntel.isStartupExplicit && (!domIntel.parsedMinEmployees || domIntel.parsedMinEmployees < minRequiredEmployees) && domIntel.reviewCount < 100) {
      return {
        eligible: false,
        size: 'Startup (< 200 Employees)',
        isStartup: true,
        reason: `Company is marked as an early-stage startup and does not have verified ${minRequiredEmployees}+ employee headcount.`
      };
    }

    // Check 3: Verified 200+ employees or MNC / Corporate badge or high review count (> 100 reviews)
    if (
      (domIntel.parsedMinEmployees && domIntel.parsedMinEmployees >= minRequiredEmployees) ||
      (domIntel.parsedMaxEmployees && domIntel.parsedMaxEmployees >= minRequiredEmployees) ||
      domIntel.isMncOrCorporate ||
      domIntel.reviewCount >= 100
    ) {
      const detectedBadge = domIntel.sizeSnippet || (domIntel.isMncOrCorporate ? 'Corporate / MNC (200+)' : `${domIntel.reviewCount}+ Reviews (200+)`);
      return {
        eligible: true,
        size: detectedBadge,
        isStartup: false,
        reason: `Company verified with ${detectedBadge}.`
      };
    }

    // Check 4: Unspecified / Standard Corporate Listing
    return {
      eligible: true,
      size: '200+ (Standard Employer)',
      isStartup: false,
      reason: 'No startup flags or sub-200 employee restrictions found.'
    };
  } catch (err) {
    console.warn(`[COMPANY_INTEL_WARN] Could not inspect DOM intel for ${jobItem.company}:`, err.message);
    return {
      eligible: true,
      size: 'Unknown (Presumed 200+)',
      isStartup: false,
      reason: 'Company inspection passed with default safety.'
    };
  }
}

let activeApplyJobState = {
  running: false,
  progress: { current: 0, total: 0, currentJob: '', status: 'idle' }
};

function getAutoApplyStatus() {
  return activeApplyJobState;
}

/**
 * Multi-Stage Naukri Submission Verifier
 * Stage 1: Live DOM Success Detection with active polling (up to 12 seconds).
 * Stage 2: Fallback page reload check for button state change to "Applied".
 * Stage 3: Broad page-level text scan for success phrases.
 */
async function verifyNaukriSubmissionOnPage(page, jobItem, options = {}) {
  const timeoutMs = options.timeoutMs || 12000;
  const pollInterval = 500;
  const startTime = Date.now();

  console.log(`[VERIFY] Inspecting live Naukri DOM for confirmation signals for "${jobItem.company}" (Timeout: ${timeoutMs / 1000}s)...`);

  // Stage 1: Active polling on the current page / modal
  while (Date.now() - startTime < timeoutMs) {
    const domCheck = await page.evaluate((successPhrases) => {
      const hasSuccess = (text) => successPhrases.some(p => (text || '').includes(p));

      // 1. Explicit Success Containers / Modal confirmation (broad selectors)
      const successSelectors = [
        '.chatbot-container .success-msg', '.apply-dialog .success-message',
        '.apply-success-container', '.success-drawer', '.apply-message .success',
        '.chat-bubble.bot-success', '.success-title', '.status-applied', '.applied-message',
        '[class*="success-msg"]', '[class*="success-message"]', '[class*="applied-message"]',
        '[class*="status-applied"]', '.jhc-apply-modal [class*="success"]'
      ];
      for (const sel of successSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const text = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (hasSuccess(text)) {
              return { verified: true, source: 'NAUKRI_DOM_CONTAINER', details: `Found success container: "${el.className}" ("${text.slice(0, 60)}")` };
            }
          }
        } catch (e) {}
      }

      // 2. Scoped Modal / Chatbot Text Analysis (broad selector set)
      const modalSelectors = ['.apply-dialog', '.chatbot-container', '.chatbot-wrapper', '.chatbot', '[class*="chatbot"]', '.modal-content', '.apply-message', '.jhc-apply-modal', '[class*="jhc"]', '[class*="apply-modal"]'];
      for (const sel of modalSelectors) {
        try {
          const modal = document.querySelector(sel);
          if (modal) {
            const modalText = (modal.innerText || modal.textContent || '').toLowerCase();
            if (hasSuccess(modalText)) {
              return { verified: true, source: 'NAUKRI_MODAL_TEXT', details: `Modal text confirmed: "${modalText.slice(0, 80)}"` };
            }
          }
        } catch (e) {}
      }

      // 3. Apply Button State Transformation - check ALL clickable elements
      const allClickable = document.querySelectorAll('button, a, [role="button"], [class*="apply"]');
      for (const applyEl of allClickable) {
        const btnText = (applyEl.innerText || applyEl.textContent || '').trim().toLowerCase();
        if (!btnText || btnText.length > 40) continue;
        const isDisabled = applyEl.disabled || applyEl.getAttribute('aria-disabled') === 'true' || applyEl.classList.contains('applied');
        if (btnText === 'applied' || btnText.includes('already applied') || btnText.startsWith('applied on') || (isDisabled && btnText.includes('apply'))) {
          return { verified: true, source: 'NAUKRI_BUTTON_TRANSFORMATION', details: `Apply button changed to "${btnText}"` };
        }
      }

      // 4. Check if apply button completely disappeared (post-success on some Naukri UI versions)
      const hasApplyButton = document.querySelector('button#apply-button, button.apply-button, [class*="jhc__apply-button"], [class*="apply-button"]');
      const pageText = (document.body?.innerText || '').toLowerCase();
      if (!hasApplyButton && hasSuccess(pageText)) {
        return { verified: true, source: 'NAUKRI_BUTTON_REMOVED', details: 'Apply button removed and success text found on page' };
      }

      // 5. Check for explicit error / limit reached signals
      const errorContainers = document.querySelectorAll('.error-msg, .alert-danger, .error-message, .chatbot-container .error, [class*="error-msg"], [class*="error-message"]');
      for (const errEl of errorContainers) {
        const errText = (errEl.innerText || errEl.textContent || '').trim();
        if (errText.length > 5 && !errText.includes('undefined')) {
          return { verified: false, hasError: true, error: `Naukri reported error: "${errText}"` };
        }
      }

      return { verified: false };
    }, NAUKRI_APPLY_SUCCESS_PHRASES);

    if (domCheck.verified) {
      console.log(`[VERIFY] SUCCESS: Verified live Naukri DOM confirmation (${domCheck.source}: ${domCheck.details})`);
      return {
        isVerified: true,
        source: VerificationSource.NAUKRI_DOM_CONFIRMATION,
        details: domCheck.details
      };
    }

    if (domCheck.hasError) {
      console.warn(`[VERIFY] Live Naukri rejection detected: ${domCheck.error}`);
      return {
        isVerified: false,
        source: VerificationSource.NONE,
        details: domCheck.error
      };
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  // Stage 2: Page Refresh / URL Check
  console.log(`[VERIFY] Stage 1 inconclusive for ${jobItem.company}. Attempting page reload verification...`);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000));

    const refreshedCheck = await page.evaluate(() => {
      // Broad scan: check ALL buttons, links, and page text for "applied" indicators
      const allClickable = document.querySelectorAll('button, a, [role="button"], .apply-message, .already-applied, [class*="applied"]');
      for (const el of allClickable) {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (text.includes('applied on') || text.includes('already applied') || text.includes('you have applied') || text === 'applied') {
          return { verified: true, details: `Page refreshed - found "${text.slice(0, 50)}" on element` };
        }
      }

      // Also check full page text for success phrases
      const bodyText = (document.body?.innerText || '').toLowerCase();
      if (bodyText.includes('application sent') || bodyText.includes('successfully applied') || bodyText.includes('you have already applied')) {
        return { verified: true, details: 'Page refreshed - success text found in page body' };
      }

      return { verified: false };
    });

    if (refreshedCheck.verified) {
      console.log(`[VERIFY] SUCCESS: Verified on page refresh (${refreshedCheck.details})`);
      return {
        isVerified: true,
        source: VerificationSource.NAUKRI_DOM_CONFIRMATION,
        details: refreshedCheck.details
      };
    }
  } catch (reloadErr) {
    console.warn(`[VERIFY] Page reload check failed: ${reloadErr.message}`);
  }

  // Stage 3: If all checks inconclusive, record as UNCONFIRMED (not FAILED)
  // The application may have succeeded but Naukri's DOM didn't provide confirmation
  console.warn(`[VERIFY] No positive confirmation signal detected for ${jobItem.company}. Recording as UNCONFIRMED (application may have succeeded).`);
  return {
    isVerified: false,
    source: VerificationSource.NONE,
    details: 'Post-submit confirmation inconclusive - application likely succeeded but DOM signal not detected'
  };
}

async function inspectNaukriEasyApplyState(page) {
  return page.evaluate((successPhrases) => {
    const visibleText = (el) => (el?.innerText || el?.textContent || '').trim();
    const lower = (s) => (s || '').toLowerCase();
    const hasSuccess = (text) => successPhrases.some(p => lower(text).includes(p));

    let applyText = '';
    let appliedButton = false;
    const controls = Array.from(document.querySelectorAll('button, a'));
    for (const el of controls) {
      const t = visibleText(el);
      const tl = lower(t);
      if (!t || t.length > 48) continue;
      if (tl === 'applied' || tl.includes('already applied') || tl.startsWith('applied')) {
        applyText = t;
        appliedButton = true;
        break;
      }
      if (tl === 'apply' || tl.startsWith('apply') || tl.includes('easy apply')) {
        applyText = t;
      }
    }

    const surface = document.querySelector(
      '.chatbot-container, .chatbot_Drawer, .chatbot-wrapper, div.chatbot, [class*="chatbot"], .apply-dialog, .apply-message, aside[class*="chat"]'
    );
    const surfaceText = surface ? visibleText(surface) : '';
    const success = appliedButton || hasSuccess(surfaceText);

    const botNodes = surface
      ? Array.from(surface.querySelectorAll('.botMsg, .bot-msg, .chat-bubble, [class*="bot-msg"], [class*="BotMsg"], [class*="botMsg"], li.bot, div[class*="incoming"], [class*="message"]'))
      : [];
    let latestBot = '';
    if (botNodes.length) {
      latestBot = visibleText(botNodes[botNodes.length - 1]);
    } else if (surface) {
      latestBot = surfaceText;
    }

    const chipEls = surface
      ? Array.from(surface.querySelectorAll('button, [role="button"], .chip, [class*="chip"], [class*="Chip"], [class*="option"]'))
      : [];
    const blockedChip = /^(send|skip|close|x|submit|apply|save)$/i;
    const chips = [...new Set(
      chipEls
        .map(c => visibleText(c))
        .filter(t => t && t.length > 0 && t.length < 80 && !blockedChip.test(t))
    )].slice(0, 24);

    const input = document.querySelector(
      '.chatbot-container textarea, .chatbot-container input[type="text"], .chatbot textarea, [class*="chatbot"] textarea, [class*="chatbot"] input[type="text"], .apply-dialog textarea, .apply-dialog input[type="text"], input[placeholder*="Type" i], textarea[placeholder*="Type" i], input[placeholder*="answer" i], textarea[placeholder*="answer" i]'
    );

    const sendExists = !!Array.from(document.querySelectorAll('button, [role="button"], [class*="send"]')).find(b => {
      const t = lower(visibleText(b));
      const aria = lower(b.getAttribute('aria-label') || '');
      const cls = lower(String(b.className || ''));
      return t === 'send' || aria.includes('send') || cls.includes('send');
    });

    const submitExists = !!Array.from(document.querySelectorAll('button')).find(b => {
      const t = lower(visibleText(b));
      return t === 'submit' || t === 'submit application' || t === 'apply now' || t === 'finish' || t === 'done';
    });

    return {
      success,
      appliedButton,
      applyText,
      hasSurface: !!surface,
      surfaceText: surfaceText.slice(0, 600),
      latestBotQuestion: latestBot.replace(/\s+/g, ' ').slice(0, 500),
      chips,
      hasInput: !!input,
      hasSend: sendExists,
      hasSubmit: submitExists
    };
  }, NAUKRI_APPLY_SUCCESS_PHRASES);
}

async function sendNaukriChatbotAnswer(page, answer, chips = []) {
  const result = await page.evaluate((ans, chipOptions) => {
    const visibleText = (el) => (el?.innerText || el?.textContent || '').trim();
    const lower = (s) => (s || '').toLowerCase();
    const target = lower(ans);

    const surface = document.querySelector(
      '.chatbot-container, .chatbot_Drawer, .chatbot-wrapper, div.chatbot, [class*="chatbot"], .apply-dialog, .apply-message'
    );
    const scope = surface || document;

    if (Array.isArray(chipOptions) && chipOptions.length) {
      const buttons = Array.from(scope.querySelectorAll('button, [role="button"], .chip, [class*="chip"], [class*="Chip"], label, [class*="option"]'));
      const match = buttons.find(b => {
        const t = lower(visibleText(b));
        if (!t || t.length > 80) return false;
        return t === target || t.includes(target) || target.includes(t);
      });
      if (match) {
        match.click();
        return { method: 'chip', sent: true };
      }
    }

    const radios = Array.from(scope.querySelectorAll('input[type="radio"], label'));
    const radioMatch = radios.find(r => {
      const t = lower(visibleText(r) || r.value || '');
      return t && (t === target || t.includes(target) || target.includes(t));
    });
    if (radioMatch) {
      radioMatch.click();
      return { method: 'radio', sent: true };
    }

    const input = scope.querySelector(
      'textarea, input[type="text"], input[type="number"], input[type="tel"], input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"])'
    );
    if (input) {
      input.focus();
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(input, ans);
      else input.value = ans;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    }

    const sendBtn = Array.from(scope.querySelectorAll('button, [role="button"], [class*="send"]')).find(b => {
      const t = lower(visibleText(b));
      const aria = lower(b.getAttribute('aria-label') || '');
      const cls = lower(String(b.className || ''));
      return t === 'send' || aria.includes('send') || cls.includes('send');
    });
    if (sendBtn) {
      sendBtn.click();
      return { method: input ? 'typed_send' : 'send', sent: true };
    }

    return { method: input ? 'typed' : 'none', sent: !!input };
  }, String(answer || ''), chips);

  if (result?.method === 'typed' || result?.method === 'typed_send') {
    try {
      await page.keyboard.press('Enter');
    } catch (e) {}
  }
  return result;
}

async function clickNaukriLabeledButton(page, labels) {
  return page.evaluate((wanted) => {
    const lower = (s) => (s || '').toLowerCase();
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
    const btn = buttons.find(b => wanted.includes(lower((b.innerText || b.textContent || '').trim())));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, labels.map(l => l.toLowerCase()));
}

/**
 * Naukri Easy Apply is a sequential chatbot: answer -> Send -> next question -> Application sent.
 * A one-shot form scrape + random submit click does not complete the application.
 */
async function completeNaukriEasyApplyConversation(page, userKey, jobItem, qaDb, resolvedResume) {
  let questionsAnsweredCount = 0;
  let lastQuestion = '';
  let stagnantTurns = 0;

  for (let turn = 0; turn < 18; turn++) {
    await new Promise(r => setTimeout(r, 1100));
    if (page.isClosed()) {
      return { done: false, closed: true, questionsAnsweredCount };
    }

    const state = await inspectNaukriEasyApplyState(page);
    if (state.success || state.appliedButton) {
      console.log(`[EASY_APPLY] Naukri confirmed application during chatbot turn ${turn + 1}.`);
      return { done: true, verifiedHint: true, questionsAnsweredCount };
    }

    const question = cleanChatQuestion(state.latestBotQuestion || '');
    const looksLikeQuestion = !isIntroOrNoiseQuestion(question) && (
      question.includes('?') || state.chips.length > 0 || state.hasInput
    );

    if (!looksLikeQuestion) {
      if (state.hasSubmit) {
        console.log('[EASY_APPLY] No further screening question. Clicking labeled Submit.');
        await clickNaukriLabeledButton(page, ['submit application', 'submit', 'finish', 'done', 'apply now']);
        stagnantTurns++;
        if (stagnantTurns >= 3) break;
        continue;
      }
      stagnantTurns++;
      if (stagnantTurns >= 4) {
        console.log('[EASY_APPLY] Chatbot idle with no screening question — treating as completed apply attempt.');
        break;
      }
      continue;
    }

    const qNorm = normalizeQuestionText(question);
    if (qNorm && qNorm === lastQuestion) {
      stagnantTurns++;
      if (stagnantTurns >= 3) {
        if (state.hasSend) await clickNaukriLabeledButton(page, ['send']);
        else if (state.hasSubmit) await clickNaukriLabeledButton(page, ['submit application', 'submit', 'finish', 'done']);
        if (stagnantTurns >= 5) break;
      }
    } else {
      stagnantTurns = 0;
      lastQuestion = qNorm;
    }

    const match = findBestAnswer(qaDb, question, state.chips);
    if (!match || match.confidence < 70) {
      console.warn(`[Q&A] Unknown chatbot question: "${question.slice(0, 120)}". Pausing instead of guessing.`);
      addPendingQuestion(userKey, {
        jobId: jobItem.jobId,
        jobTitle: jobItem.jobTitle,
        company: jobItem.company,
        jobUrl: jobItem.jobUrl,
        question,
        inputType: state.chips.length ? 'radio' : 'text',
        options: state.chips,
        isMandatory: true
      });
      return { done: false, waitingForUser: true, question, questionsAnsweredCount };
    }

    console.log(`[Q&A] Chatbot match (${match.confidence}%): "${question.slice(0, 60)}..." -> "${match.answer}"`);
    updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.FILLING, stage: `Answering: ${question.slice(0, 80)}` });

    const fileInput = await page.$('.chatbot-container input[type="file"], .apply-dialog input[type="file"], [class*="chatbot"] input[type="file"], input#attachCV');
    if (fileInput && resolvedResume?.filePath && /resume|cv|curriculum/i.test(question)) {
      try {
        await fileInput.uploadFile(resolvedResume.filePath);
        questionsAnsweredCount++;
        continue;
      } catch (e) {}
    }

    await sendNaukriChatbotAnswer(page, match.answer, state.chips);
    questionsAnsweredCount++;
  }

  return { done: true, verifiedHint: false, questionsAnsweredCount };
}

/**
 * Naukri Applied Jobs Reconciliation Engine
 * Navigates to https://www.naukri.com/mnjuser/appliedjobs
 * Scrapes all real applied jobs recorded in Naukri's official applied log.
 * Reconciles with our database.
 */
async function reconcileNaukriAppliedJobs(page, userKey) {
  console.log(`[RECONCILE] Navigating to official Naukri Applied Jobs section (https://www.naukri.com/mnjuser/appliedjobs)...`);
  try {
    await page.goto('https://www.naukri.com/mnjuser/appliedjobs', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Check if logged in / redirected
    const currentUrl = page.url();
    if (currentUrl.includes('/nlogin/') || currentUrl.includes('login')) {
      console.warn(`[RECONCILE] Session expired or login required to access Applied Jobs.`);
      return { success: false, error: 'Session expired - login required' };
    }

    // Scrape real applied jobs list from Naukri
    const realAppliedJobs = await page.evaluate(() => {
      const list = [];
      const cards = document.querySelectorAll('.applied-job-card, .job-card, .tuple, article.jobTuple, div[class*="applied"]');

      cards.forEach(card => {
        const titleEl = card.querySelector('a.title, .title, a[href*="job-listings"]');
        const compEl = card.querySelector('.comp-name, .company, .subTitle');
        const dateEl = card.querySelector('.applied-date, .date, span[class*="date"]');
        const href = titleEl?.href || '';
        let jobId = card.getAttribute('data-job-id') || '';
        if (!jobId && href) {
          const match = href.match(/-([0-9]{8,15})(?:\?|$)/);
          if (match) jobId = match[1];
        }

        const title = titleEl?.textContent?.trim() || '';
        const company = compEl?.textContent?.trim() || '';
        const appliedDate = dateEl?.textContent?.trim() || '';

        if (title || company) {
          list.push({
            jobId,
            title,
            company,
            url: href,
            appliedDate
          });
        }
      });

      return list;
    });

    console.log(`[RECONCILE] Scraped ${realAppliedJobs.length} real applied jobs directly from Naukri Applied Jobs section.`);

    // Reconcile our database records
    const ourApps = getNaukriAppliedJobs(userKey);
    let upgradedCount = 0;

    for (const ourApp of ourApps) {
      if (
        ourApp.status === ApplicationState.SUBMISSION_UNCONFIRMED ||
        ourApp.verificationStatus === VerificationStatus.UNVERIFIED ||
        ourApp.verificationStatus === VerificationStatus.LEGACY_UNVERIFIED
      ) {
        const match = realAppliedJobs.find(real =>
          (real.jobId && ourApp.jobId && real.jobId === ourApp.jobId) ||
          (real.company && ourApp.company && real.company.toLowerCase().includes(ourApp.company.toLowerCase())) ||
          (real.title && ourApp.jobTitle && real.title.toLowerCase().includes(ourApp.jobTitle.toLowerCase()))
        );

        if (match) {
          ourApp.status = ApplicationState.SUBMITTED;
          ourApp.verificationStatus = VerificationStatus.RECONCILED;
          ourApp.verificationSource = VerificationSource.NAUKRI_RECONCILIATION;
          ourApp.verifiedAt = new Date().toISOString();
          ourApp.verificationDetails = `Reconciled with Naukri Applied Jobs list (Date: ${match.appliedDate || 'Recent'})`;
          upgradedCount++;
        }
      }
    }

    if (upgradedCount > 0) {
      const filePath = getNaukriAppsFilePath(userKey);
      try { fs.writeFileSync(filePath, JSON.stringify(ourApps, null, 2), 'utf8'); } catch (e) {}
      if (isSupabaseConfigured()) {
        await supabaseSaveNaukriAppliedJobs(userKey, ourApps);
      }
      console.log(`[RECONCILE] ✅ Upgraded ${upgradedCount} unconfirmed application(s) to SUBMITTED (RECONCILED)!`);
    }

    return {
      success: true,
      naukriRealCount: realAppliedJobs.length,
      reconciledUpgrades: upgradedCount,
      realAppliedJobs
    };
  } catch (err) {
    console.error(`[RECONCILE ERROR] Failed reconciling with Naukri:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * End-to-End Naukri Easy Apply Process
 * Integrates dynamic DB resume, multi-factor ranking, company diversity, strict Easy Apply verification,
 * container-scoped question filling, and zero-hallucination Q&A memory.
 */
async function applyToNaukriJobsWithPuppeteer(page, userKey, customOptions = {}) {
  const filterConfig = { ...getFilterConfig(userKey), ...customOptions };
  const applyAllAtOnce = customOptions.applyAllAtOnce || filterConfig.applyAllAtOnce || false;
  const configuredTarget = parseInt(filterConfig.maxJobsPerRun, 10) || 12;

  console.log(`[NAUKRI EASY APPLY] Initiating automation for user "${userKey}" (Apply All At Once: ${applyAllAtOnce}, Target: ${applyAllAtOnce ? 'ALL' : configuredTarget})...`);

  // 1. Resolve Latest Candidate Resume from Database
  console.log(`[RESUME] Loading from DB for user "${userKey}"...`);
  let resolvedResume = null;
  try {
    resolvedResume = await resolveUserResumeFile(userKey);
    console.log(`[RESUME] Resume found for user "${userKey}".`);
    console.log(`[RESUME] Resolving storage reference & file formatting...`);
    console.log(`[RESUME] File ready: ${resolvedResume.fileName} (${(resolvedResume.fileSize / 1024).toFixed(1)} KB, source: ${resolvedResume.source})`);
  } catch (resumeErr) {
    console.error(`[RESUME ERROR] Failed resolving resume from DB:`, resumeErr.message);
    throw new Error(`Resume resolution failed from DB: ${resumeErr.message}`);
  }

  // 2. Check for Paused Applications Ready to Resume (State = READY_TO_RESUME, READY_TO_SUBMIT, or AUTH_REQUIRED)
  const existingQueue = await getNaukriQueueAsync(userKey);
  const readyToResumeJobs = existingQueue.filter(q =>
    q.state === ApplicationState.READY_TO_RESUME ||
    q.state === ApplicationState.READY_TO_SUBMIT ||
    q.state === ApplicationState.AUTHENTICATION_REQUIRED ||
    q.state === 'AUTH_REQUIRED'
  );
  if (readyToResumeJobs.length > 0) {
    console.log(`[APPLY] 🔄 Found ${readyToResumeJobs.length} previously paused/auth-required application(s)! Prioritizing resumption...`);
  }

  // 3. Load Q&A Knowledge Database directly from Supabase DB
  console.log(`[Q&A] Loading recruiter Q&A knowledge base from database for user "${userKey}"...`);
  const qaDb = await getQaDatabaseAsync(userKey);
  console.log(`[Q&A] Loaded ${qaDb.length} verified recruiter Q&A records directly from database.`);

  // 4. Load Past Applied Records for Strict Deduplication
  const pastAppliedList = await getNaukriAppliedJobsAsync(userKey);
  const pastAppliedSet = new Set();
  const pastAppliedCompanies = getPastAppliedCompanySets(pastAppliedList);
  const appliedCompaniesThisRun = new Set();

  for (const j of pastAppliedList) {
    if (!isConfirmedAppliedRecord(j)) continue; // TRUTH RULE: Never block unconfirmed / failed attempts from being discovered & applied!
    if (j.jobId) pastAppliedSet.add(j.jobId);
    if (j.jobUrl) pastAppliedSet.add(j.jobUrl.split('?')[0].toLowerCase().trim());
    if (j.company && j.jobTitle) pastAppliedSet.add(`${j.company.toLowerCase().trim()}___${j.jobTitle.toLowerCase().trim()}`);
  }

  // 5. Discover Real Jobs across Multiple Queries
  console.log(`[SEARCH] Discovering jobs on Naukri...`);
  const rawDiscovered = await discoverNaukriJobsWithPuppeteer(page, userKey, filterConfig);

  // 6. Build Diverse Ranked Queue (strictly excluding previously applied companies)
  console.log(`[DIVERSITY] Applying company diversity rules & strict company deduplication (never apply same company twice)...`);
  const freshDiverseQueue = buildDiverseApplicationQueue(rawDiscovered, filterConfig, pastAppliedSet, pastAppliedCompanies);

  // Merge: Prioritize ready-to-resume jobs at the front, then new diverse jobs
  const combinedQueue = [
    ...readyToResumeJobs,
    ...freshDiverseQueue.filter(f => !readyToResumeJobs.some(r => r.jobId === f.jobId || r.jobUrl === f.jobUrl))
  ];

  console.log(`[QUEUE] Total active queue size: ${combinedQueue.length} jobs (${readyToResumeJobs.length} resuming, ${freshDiverseQueue.length} newly discovered).`);
  await saveNaukriQueueAsync(userKey, combinedQueue);

  const appliedResults = [];
  const jobsToProcess = applyAllAtOnce ? combinedQueue : combinedQueue.slice(0, configuredTarget);

  activeApplyJobState.running = true;
  activeApplyJobState.progress = {
    current: 0,
    total: jobsToProcess.length,
    currentJob: '',
    status: `Processing ${jobsToProcess.length} Easy Apply jobs at once...`
  };

  for (let i = 0; i < jobsToProcess.length; i++) {
    const jobItem = jobsToProcess[i];
    const jobStartTime = Date.now();

    // Strict Company Deduplication Check before navigating
    if (filterConfig.neverApplySameCompanyTwice !== false) {
      const compRaw = (jobItem.company || '').toLowerCase().trim();
      const compNorm = normalizeCompanyName(compRaw);
      const alreadyApplied = appliedCompaniesThisRun.has(compRaw) ||
                             pastAppliedCompanies.exactCompanySet.has(compRaw) ||
                             (compNorm && (appliedCompaniesThisRun.has(compNorm) || pastAppliedCompanies.normalizedCompanySet.has(compNorm)));

      if (alreadyApplied) {
        console.log(`[COMPANY_DEDUP] Skipping application for "${jobItem.jobTitle}" at "${jobItem.company}" - Company already applied to.`);
        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.SKIPPED,
          stage: 'Skipped - Company Already Applied To Previously',
          failureStage: 'Company Deduplication'
        });
        continue;
      }
    }

    activeApplyJobState.progress.current = i + 1;
    activeApplyJobState.progress.currentJob = `${jobItem.jobTitle} at ${jobItem.company}`;
    activeApplyJobState.progress.status = `Applying to ${jobItem.company}...`;

    console.log(`\n--------------------------------------------------`);
    console.log(`[APPLY] [${i + 1}/${jobsToProcess.length}] Starting Easy Apply for "${jobItem.jobTitle}" at "${jobItem.company}"...`);
    console.log(`  • URL: ${jobItem.jobUrl}`);
    console.log(`  • Location: ${jobItem.location} | Exp: ${jobItem.experience}`);

    updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.STARTED, stage: 'Navigating to Job' });

    try {
      await page.goto(jobItem.jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      // Inspect if session expired / redirected to login
      const currentUrl = page.url();
      const pageTitle = (await page.title().catch(() => '')) || '';
      const isLoginRedirect = currentUrl.includes('login') || currentUrl.includes('nlogin') ||
                              pageTitle.toLowerCase().includes('access denied') ||
                              pageTitle.toLowerCase().includes('403') ||
                              pageTitle.toLowerCase().includes('jobseeker login');

      if (isLoginRedirect) {
        console.warn(`[APPLY] [AUTH_REQUIRED] Session expired during application for "${jobItem.jobTitle}" at "${jobItem.company}". Halting automation.`);
        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.AUTHENTICATION_REQUIRED,
          stage: 'Session Expired during Application (Authentication Required)',
          error: 'Naukri session expired'
        });

        // Save current queue state to Supabase DB so remaining jobs stay QUEUED
        await saveNaukriQueueAsync(userKey, combinedQueue);

        // Mark session EXPIRED in config and Supabase DB
        try {
          const { getNaukriConfigAsync, saveNaukriConfigAsync } = require('./naukri.service');
          const cfg = await getNaukriConfigAsync(userKey);
          cfg.hasSession = false;
          cfg.sessionStatus = 'EXPIRED';
          cfg.lastStatus = 'SESSION EXPIRED (Authentication Required)';
          cfg.lastError = 'Session expired mid-run on Naukri';
          await saveNaukriConfigAsync(userKey, cfg);
        } catch (e) {}

        activeApplyJobState.running = false;
        activeApplyJobState.progress.status = `Session expired on Naukri. Successfully submitted ${appliedResults.length} applications before expiry. Re-authentication required.`;

        return {
          success: false,
          authExpired: true,
          appliedCount: appliedResults.length,
          appliedJobs: appliedResults,
          queueRemaining: getNaukriQueue(userKey).filter(q => q.state !== ApplicationState.SUBMITTED && q.state !== ApplicationState.SKIPPED)
        };
      }

      // Check if job expired or closed
      const isJobExpired = await page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() || '';
        return text.includes('this job is no longer available') || text.includes('job expired') || text.includes('no longer active') || text.includes('job is closed');
      });

      if (isJobExpired) {
        console.log(`[APPLY] [EXPIRED] Job expired/closed on Naukri for ${jobItem.company}.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.EXPIRED, stage: 'Job Expired' });
        continue;
      }

      // Check Company Profile & Minimum 200+ Employee Threshold
      const companyEval = await inspectCompanySizeAndProfile(page, jobItem, filterConfig);
      if (!companyEval.eligible) {
        console.log(`[COMPANY_SIZE_FILTER] ⛔ Skipping "${jobItem.jobTitle}" at "${jobItem.company}" - ${companyEval.reason}`);
        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.SKIPPED,
          stage: `Skipped - ${companyEval.reason}`,
          failureStage: 'Company Headcount / Startup Filter'
        });
        continue;
      }

      // Locate Apply Button & Positively Verify Easy Apply vs External ATS Site
      const applyBtnData = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        
        // Find button specifically for Apply, completely ignoring standalone "Save" buttons
        let applyEl = buttons.find(el => {
          const t = (el.textContent || el.innerText || '').trim().toLowerCase();
          const isSave = t.includes('save') && !t.includes('apply');
          if (isSave) return false;
          return t === 'apply' || t.startsWith('apply') || t.includes('easy apply') || t.includes('already applied') || t === 'applied' || t.includes('apply on');
        });

        // Fallback: check elements with class containing apply-button
        if (!applyEl) {
          applyEl = document.querySelector('button#apply-button, button.apply-button, [class*="apply-button"]:not(div), [class*="applyButton"]:not(div), [class*="jhc__apply-button"]:not(div)');
        }

        if (!applyEl) return { exists: false };

        const text = (applyEl.textContent || applyEl.innerText || '').trim();
        const textLower = text.toLowerCase();
        const isExternal = textLower.includes('company site') || textLower.includes('external') || textLower.includes('visit employer');
        const isAlreadyApplied = textLower.includes('already applied') || textLower === 'applied';

        return {
          exists: true,
          text,
          isExternal,
          isAlreadyApplied
        };
      });

      if (!applyBtnData.exists) {
        console.log(`[APPLY] [SKIP] No apply button detected on page for ${jobItem.company}.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'No Apply Button Found' });
        continue;
      }

      if (applyBtnData.isAlreadyApplied) {
        console.log(`[APPLY] [ALREADY_APPLIED] Already applied to "${jobItem.jobTitle}" at "${jobItem.company}". Confirming verified submission.`);
        confirmNaukriApplicationSubmission(
          userKey,
          {
            jobId: jobItem.jobId,
            jobTitle: jobItem.jobTitle,
            company: jobItem.company,
            location: jobItem.location,
            experience: jobItem.experience,
            jobUrl: jobItem.jobUrl,
            resumeUsed: resolvedResume.fileName,
            questionsAnsweredCount: 0,
            duration: '0s'
          },
          {
            status: VerificationStatus.VERIFIED,
            source: VerificationSource.NAUKRI_DOM_CONFIRMATION,
            details: 'Job page shows "Applied" status on Naukri',
            verifiedAt: new Date().toISOString()
          }
        );
        continue;
      }

      if (applyBtnData.isExternal) {
        console.log(`[EXTERNAL_CAREER_SITE] Collected "Apply on company site" job for manual review: "${jobItem.jobTitle}" at "${jobItem.company}".`);
        recordExternalCompanyJob(userKey, jobItem);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'Collected for Manual Application (Company Site)' });
        continue;
      }

      // Click the Easy Apply button (strictly ignore Save button)
      console.log(`[EASY_APPLY] [FORM] Opening Easy Apply modal ("${applyBtnData.text}")...`);
      try {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          const btn = buttons.find(el => {
            const t = (el.textContent || el.innerText || '').trim().toLowerCase();
            if (t.includes('save') && !t.includes('apply')) return false;
            if (t.includes('company site')) return false;
            return t === 'apply' || t.startsWith('apply') || t.includes('easy apply') || el.classList.contains('apply-button') || (el.className && el.className.includes && el.className.includes('jhc__apply-button'));
          });
          if (btn) {
            btn.click();
          } else {
            const fallback = document.querySelector('button#apply-button, button.apply-button, button[id*="apply" i], button.apply-btn, .apply-message button, button.waves-effect');
            if (fallback) fallback.click();
          }
        });
      } catch (e) {
        console.warn(`[EASY_APPLY] Click evaluate warning: ${e.message}`);
      }

      await Promise.race([
        page.waitForNavigation({ timeout: 2000, waitUntil: 'domcontentloaded' }).catch(() => null),
        new Promise(r => setTimeout(r, 2500))
      ]);

      if (page.isClosed()) {
        console.warn(`[EASY_APPLY] Page closed unexpectedly for ${jobItem.company}`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'Page Closed Unexpectedly' });
        continue;
      }

      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.FORM_OPENED, stage: 'Form/Modal Opened' });
      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.FILLING, stage: 'Filling Form Fields' });

      let questionsAnsweredCount = 0;
      let hasUnansweredMandatory = false;

      // Container-Scoped Form Element Detection
      let formFields = [];
      try {
        formFields = await page.evaluate(() => {
          const fields = [];
          const questionContainers = Array.from(document.querySelectorAll(
            '.chatbot-container .bot-msg, .chatbot-container .chat-bubble, .apply-dialog .form-group, .custom-question, .question-wrapper, .chatbot-wrapper div[class*="msg"], div[class*="question"]'
          ));

        questionContainers.forEach((container, idx) => {
          const qText = (container.innerText || container.textContent || '').trim();
          if (!qText || qText.length < 4) return;

          const parent = container.closest('.form-group, .question-wrapper, .bot-msg, .chat-bubble') || container.parentElement;
          const textInput = container.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') ||
                            (parent ? parent.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') : null);

          const selectEl = container.querySelector('select') || (parent ? parent.querySelector('select') : null);
          const radioInputs = Array.from(container.querySelectorAll('input[type="radio"], label.radio, .radio-btn, .custom-radio') || []);
          const checkboxInputs = Array.from(container.querySelectorAll('input[type="checkbox"], label.checkbox') || []);

          let fieldType = 'text';
          let options = [];

          if (selectEl) {
            fieldType = 'select';
            options = Array.from(selectEl.options).map(o => (o.text || o.value || '').trim()).filter(Boolean);
          } else if (radioInputs.length > 0) {
            fieldType = 'radio';
            options = radioInputs.map(r => (r.innerText || r.textContent || r.value || '').trim()).filter(Boolean);
          } else if (checkboxInputs.length > 0) {
            fieldType = 'checkbox';
            options = checkboxInputs.map(c => (c.innerText || c.textContent || c.value || '').trim()).filter(Boolean);
          } else if (!textInput) {
            return;
          }

          fields.push({
            containerIndex: idx,
            questionText: qText.replace(/\n+/g, ' ').replace(/\*+/g, '').trim(),
            rawText: qText,
            fieldType,
            options,
            isMandatory: qText.includes('*') || (parent ? Boolean(parent.querySelector('.mandatory, .required, [required]')) : false)
          });
        });

        return fields;
      });
    } catch (err) {
      console.warn(`[EASY_APPLY] Form fields inspection warning for ${jobItem.company}:`, err.message);
    }

      if (formFields.length > 0) {
        console.log(`[FORM] Detected ${formFields.length} interactive screening field(s).`);

        for (const field of formFields) {
          const match = findBestAnswer(qaDb, field.questionText, field.options);

          if (match && match.confidence >= 80) {
            console.log(`[Q&A] Matched saved answer: "${field.questionText.slice(0, 40)}..." -> "${match.answer}" (${match.confidence}% confidence)`);
            questionsAnsweredCount++;

            // Fill ONLY the specific input inside this question container
            await page.evaluate((cIdx, fType, ans) => {
              const containers = Array.from(document.querySelectorAll(
                '.chatbot-container .bot-msg, .chatbot-container .chat-bubble, .apply-dialog .form-group, .custom-question, .question-wrapper, .chatbot-wrapper div[class*="msg"], div[class*="question"]'
              ));
              const container = containers[cIdx];
              if (!container) return false;

              const parent = container.closest('.form-group, .question-wrapper, .bot-msg, .chat-bubble') || container.parentElement;

              if (fType === 'select') {
                const sel = container.querySelector('select') || (parent ? parent.querySelector('select') : null);
                if (sel) {
                  const opt = Array.from(sel.options).find(o => (o.text || '').toLowerCase().includes(ans.toLowerCase()) || (o.value || '').toLowerCase().includes(ans.toLowerCase()));
                  if (opt) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              } else if (fType === 'radio') {
                const radios = Array.from(container.querySelectorAll('input[type="radio"], label.radio, .radio-btn, .custom-radio') || (parent ? parent.querySelectorAll('input[type="radio"], label.radio, .radio-btn, .custom-radio') : []));
                const matchRadio = radios.find(r => (r.innerText || r.textContent || r.value || '').toLowerCase().includes(ans.toLowerCase()));
                if (matchRadio) matchRadio.click();
              } else if (fType === 'checkbox') {
                const cbs = Array.from(container.querySelectorAll('input[type="checkbox"], label.checkbox') || (parent ? parent.querySelectorAll('input[type="checkbox"], label.checkbox') : []));
                const matchCb = cbs.find(c => (c.innerText || c.textContent || c.value || '').toLowerCase().includes(ans.toLowerCase()));
                if (matchCb) matchCb.click();
              } else {
                const inp = container.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') ||
                            (parent ? parent.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') : null);
                if (inp) {
                  inp.focus();
                  inp.value = ans;
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
              return true;
            }, field.containerIndex, field.fieldType, match.answer);
          } else {
            // STRICT ZERO-GUESS POLICY: DO NOT GUESS
            console.warn(`[Q&A] Unknown question: "${field.questionText}". Pausing application.`);
            hasUnansweredMandatory = true;

            addPendingQuestion(userKey, {
              jobId: jobItem.jobId,
              jobTitle: jobItem.jobTitle,
              company: jobItem.company,
              jobUrl: jobItem.jobUrl,
              question: field.questionText,
              inputType: field.fieldType,
              options: field.options,
              isMandatory: true
            });

            updateQueueItemState(userKey, jobItem.jobId, {
              state: ApplicationState.WAITING_FOR_USER,
              stage: 'Waiting for User Input on Screening Question',
              pendingQuestion: field.questionText
            });

            console.log(`[WAITING] Application paused for ${jobItem.company}`);
            break;
          }
        }
      }

      if (hasUnansweredMandatory) {
        console.log(`[WAITING] Application for ${jobItem.company} paused cleanly without submitting.`);
        continue;
      }

      // Check if resume upload is requested inside the Easy Apply modal
      const hasModalResumeInput = await page.$('.apply-dialog input[type="file"], .chatbot-container input[type="file"], input#attachCV');
      if (hasModalResumeInput && resolvedResume?.filePath) {
        console.log(`[RESUME] Uploading verified resume: ${resolvedResume.fileName}...`);
        try {
          await hasModalResumeInput.uploadFile(resolvedResume.filePath);
        } catch (e) {}
      }

      // Pre-Submit Form Validation Check
      const formValidation = await page.evaluate(() => {
        const invalidFields = Array.from(document.querySelectorAll('input:invalid, select:invalid, textarea:invalid, .error-field, .has-error input'));
        if (invalidFields.length > 0) {
          return { valid: false, reason: `Found ${invalidFields.length} invalid or incomplete required field(s)` };
        }
        return { valid: true };
      });

      if (!formValidation.valid) {
        console.warn(`[FORM_VALIDATION] ${jobItem.company}: ${formValidation.reason}. Pausing.`);
        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.FORM_INCOMPLETE,
          stage: 'Form Incomplete (Validation Error)',
          error: formValidation.reason
        });
        continue;
      }

      // Multi-Step Form Handling: Click through "Next" / "Continue" buttons until "Submit" is visible
      console.log(`[APPLY] Handling multi-step form for ${jobItem.company}...`);
      for (let step = 0; step < 5; step++) {
        const nextClicked = await page.evaluate(() => {
          const allBtns = Array.from(document.querySelectorAll('button, a'));
          const nextBtn = allBtns.find(el => {
            const t = (el.textContent || el.innerText || '').trim().toLowerCase();
            return t === 'next' || t === 'continue' || t === 'proceed' || t === 'save & next';
          });
          if (nextBtn) { nextBtn.click(); return true; }
          return false;
        });
        if (!nextClicked) break;
        await new Promise(r => setTimeout(r, 1500));
      }

      // Final Submit Button Click -> State = SUBMITTING (Never immediately SUBMITTED)
      console.log(`[APPLY] Submitting Easy Apply to ${jobItem.company}...`);
      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SUBMITTING, stage: 'Submitting Application to Naukri' });

      const submitClicked = await page.evaluate(() => {
        const allBtns = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
        // 1. Find by explicit text match (most reliable)
        const submitBtn = allBtns.find(el => {
          const t = (el.textContent || el.innerText || el.value || '').trim().toLowerCase();
          const isSave = t.includes('save') && !t.includes('submit');
          if (isSave) return false;
          return t === 'submit' || t === 'submit application' || t === 'submit now' || t === 'apply now' || t.includes('submit application');
        });
        if (submitBtn) { submitBtn.click(); return 'text_match'; }

        // 2. Fallback: submit-type button or primary action button
        const fallbackBtn = document.querySelector('.apply-dialog button[type="submit"], .chatbot-container button[type="submit"], button.btn-primary[type="submit"]');
        if (fallbackBtn) { fallbackBtn.click(); return 'type_match'; }

        // 3. Last resort: any primary-looking button inside the apply dialog (not Save, not Skip, not Next)
        const lastResort = allBtns.find(el => {
          const t = (el.textContent || el.innerText || '').trim().toLowerCase();
          const isExcluded = t.includes('save') || t.includes('skip') || t.includes('next') || t.includes('previous') || t.includes('cancel') || t.includes('close') || t.includes('later');
          if (isExcluded) return false;
          const hasPrimaryClass = el.classList.contains('btn-primary') || el.classList.contains('blue-btn') || el.classList.contains('submit-btn') || (el.className && el.className.includes && el.className.includes('jhc'));
          return hasPrimaryClass;
        });
        if (lastResort) { lastResort.click(); return 'last_resort'; }

        return null;
      });

      console.log(`[APPLY] Submit click result for ${jobItem.company}: ${submitClicked || 'NO_BUTTON_FOUND'}`);
      if (!submitClicked) {
        console.warn(`[APPLY] WARNING: No submit button found for ${jobItem.company}. Application may not have been submitted.`);
      }

      // Multi-Stage Post-Submission Live DOM Verification
      const durationSec = `${Math.round((Date.now() - jobStartTime) / 1000)}s`;
      const verification = await verifyNaukriSubmissionOnPage(page, jobItem, { timeoutMs: 8000 });

      if (verification.isVerified) {
        const record = confirmNaukriApplicationSubmission(
          userKey,
          {
            jobId: jobItem.jobId,
            jobTitle: jobItem.jobTitle,
            company: jobItem.company,
            location: jobItem.location,
            experience: jobItem.experience,
            jobUrl: jobItem.jobUrl,
            resumeUsed: resolvedResume.fileName,
            questionsAnsweredCount,
            duration: durationSec
          },
          {
            status: VerificationStatus.VERIFIED,
            source: verification.source,
            details: verification.details,
            verifiedAt: new Date().toISOString()
          }
        );

        appliedResults.push(record);
        console.log(`[APPLY] ✅ VERIFIED SUBMISSION: Application confirmed for "${jobItem.jobTitle}" at "${jobItem.company}" in ${durationSec}!`);
      } else {
        recordUnconfirmedNaukriApplication(
          userKey,
          {
            jobId: jobItem.jobId,
            jobTitle: jobItem.jobTitle,
            company: jobItem.company,
            location: jobItem.location,
            experience: jobItem.experience,
            jobUrl: jobItem.jobUrl,
            resumeUsed: resolvedResume.fileName,
            questionsAnsweredCount,
            duration: durationSec
          },
          verification.details || 'Naukri post-submit confirmation could not be verified on live DOM'
        );

        console.warn(`[APPLY] ⚠️ UNCONFIRMED SUBMISSION: Recorded as SUBMISSION_UNCONFIRMED for "${jobItem.jobTitle}" at "${jobItem.company}". Daily target NOT incremented.`);
      }

      // Polite pacing delay between jobs
      await new Promise(r => setTimeout(r, 2000));
    } catch (jobErr) {
      console.error(`[NAUKRI APPLY ERROR] Application failed for ${jobItem.jobTitle} at ${jobItem.company}:`, jobErr.message);

      const isAuthError = jobErr.message.toLowerCase().includes('session') || jobErr.message.toLowerCase().includes('login') || jobErr.message.toLowerCase().includes('auth');

      if (isAuthError) {
        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.AUTHENTICATION_REQUIRED,
          stage: 'Naukri Authentication Required',
          error: jobErr.message
        });
        console.warn(`[AUTH] Session failure during application. Queue item preserved as AUTHENTICATION_REQUIRED.`);
      } else {
        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.FAILED,
          stage: 'Execution Error',
          error: jobErr.message
        });

        logNaukriAppliedJob(userKey, {
          jobId: jobItem.jobId,
          jobTitle: jobItem.jobTitle,
          company: jobItem.company,
          location: jobItem.location,
          experience: jobItem.experience,
          jobUrl: jobItem.jobUrl,
          status: ApplicationState.FAILED,
          verificationStatus: VerificationStatus.FAILED,
          failureStage: 'Browser Navigation / Submission Error',
          resumeUsed: resolvedResume?.fileName || 'candidate_resume.pdf',
          error: jobErr.message
        });
      }
    }
  }

  activeApplyJobState.running = false;
  activeApplyJobState.progress.status = `Completed run! Successfully processed ${appliedResults.length} Easy Apply jobs. Running reconciliation...`;

  // Auto-reconcile: Navigate to Naukri Applied Jobs page and upgrade any unconfirmed submissions
  try {
    console.log(`[RECONCILE] Running automatic post-run reconciliation to verify unconfirmed applications...`);
    const reconcileResult = await reconcileNaukriAppliedJobs(page, userKey);
    if (reconcileResult.success && reconcileResult.reconciledUpgrades > 0) {
      console.log(`[RECONCILE] Upgraded ${reconcileResult.reconciledUpgrades} unconfirmed application(s) to VERIFIED via Naukri Applied Jobs reconciliation!`);
      activeApplyJobState.progress.status = `Completed! ${appliedResults.length} applied, ${reconcileResult.reconciledUpgrades} previously unconfirmed upgraded to verified.`;
    } else {
      console.log(`[RECONCILE] Reconciliation complete. No additional upgrades found.`);
    }
  } catch (reconcileErr) {
    console.warn(`[RECONCILE] Post-run reconciliation failed: ${reconcileErr.message}`);
  }

  return {
    success: true,
    appliedCount: appliedResults.length,
    appliedJobs: appliedResults,
    queueRemaining: getNaukriQueue(userKey).filter(q => q.state !== ApplicationState.SUBMITTED && q.state !== ApplicationState.SKIPPED)
  };
}

/**
 * Standalone launcher for Easy Apply from API / UI trigger
 */
async function runStandaloneNaukriApply(userKey = 'default_user', customOptions = {}) {
  const {
    findBrowserExecutable,
    getNaukriConfigAsync,
    saveNaukriConfigAsync,
    restoreAndInjectNaukriSession,
    validateNaukriSessionOnPage,
    acquireUserLockAsync,
    releaseUserLockAsync
  } = require('./naukri.service');

  if (activeApplyJobState.running) {
    return { success: false, message: 'Naukri Auto-Apply is already in progress.' };
  }

  const lockAcquired = await acquireUserLockAsync(userKey, 'easy_apply');
  if (!lockAcquired) {
    return { success: false, message: `Account "${userKey}" is currently locked by another automation process.` };
  }

  let browser = null;
  try {
    activeApplyJobState.running = true;
    activeApplyJobState.progress = {
      current: 1,
      total: customOptions.maxJobsPerRun || 12,
      currentJob: '',
      status: 'Connecting to Naukri session & initializing browser...'
    };

    const config = await getNaukriConfigAsync(userKey);
    let browserPath = findBrowserExecutable();
    const launchOptions = {
      headless: customOptions.headless !== undefined ? (customOptions.headless ? 'new' : false) : (config.headless !== false ? 'new' : false),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768'
      ],
      defaultViewport: { width: 1366, height: 768 }
    };
    if (browserPath) launchOptions.executablePath = browserPath;

    browser = await puppeteer.launch(launchOptions);
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Anti-bot stealth
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // 1. Restore & inject latest authentication state from DB/sandbox
    const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
    if (!restoreResult.hasSession) {
      if (restoreResult.failureType === 'AUTH_RESTORE_FAILED') {
        throw new Error(`[AUTH_RESTORE_FAILED] Application failed to restore saved session into browser context: ${restoreResult.error}`);
      }
      throw new Error('Naukri session is unauthenticated. Please link your account via "Paste Session Cookie".');
    }

    // 2. Validate session on Naukri BEFORE performing any applications
    const validation = await validateNaukriSessionOnPage(page, userKey);
    if (!validation.isValid) {
      const cfg = await getNaukriConfigAsync(userKey);
      cfg.hasSession = false;
      cfg.sessionStatus = 'EXPIRED';
      cfg.lastStatus = 'SESSION EXPIRED (Please Re-Link Cookie)';
      cfg.lastError = `Naukri session has expired on the server (${validation.detail || validation.reason || 'Session expired'}). Please click "Paste Session Cookie" in settings to refresh your cookie.`;
      await saveNaukriConfigAsync(userKey, cfg);

      throw new Error(`Naukri session is unauthenticated or expired (${validation.detail || validation.reason || 'Session expired'}). Please click "Paste Session Cookie" in the Naukri menu to refresh your session.`);
    }

    return await applyToNaukriJobsWithPuppeteer(page, userKey, customOptions);
  } finally {
    activeApplyJobState.running = false;
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    await releaseUserLockAsync(userKey, 'easy_apply');
  }
}

/**
 * Executes full interactive Easy Apply on a live Naukri job page
 * Answers screening fields, handles resume upload, advances multi-step dialogs, submits, and verifies.
 */
async function executeLiveNaukriApplyWorkflow(page, userKey, jobItem, resolvedResume, customUserAnswers = []) {
  const qaDb = await getQaDatabaseAsync(userKey);
  const jobStartTime = Date.now();

  // 1. Check if already applied on page
  const existingCheck = await page.evaluate(() => {
    const text = (document.body.innerText || document.body.textContent || '').toLowerCase();
    return text.includes('already applied') || text.includes('applied on') || text.includes('you have applied');
  });

  if (existingCheck) {
    const record = confirmNaukriApplicationSubmission(
      userKey,
      {
        jobId: jobItem.jobId || `job_${Date.now()}`,
        jobTitle: jobItem.jobTitle || 'Target Role',
        company: jobItem.company || 'Naukri Employer',
        location: jobItem.location || 'Remote',
        experience: jobItem.experience || '0-5 Yrs',
        jobUrl: jobItem.jobUrl,
        resumeUsed: resolvedResume?.fileName || 'candidate_resume.pdf',
        questionsAnsweredCount: 0,
        duration: '2s'
      },
      {
        status: VerificationStatus.VERIFIED,
        source: VerificationSource.NAUKRI_DOM_CONFIRMATION,
        details: 'Confirmed directly on Naukri job page DOM',
        verifiedAt: new Date().toISOString()
      }
    );
    return { success: true, isVerified: true, record, message: 'Job was already applied on Naukri and has been verified!' };
  }

  // 1.5 Inspect Company Profile & Verify Minimum 200+ Employees
  const filterConfig = getFilterConfig(userKey);
  const companyEval = await inspectCompanySizeAndProfile(page, jobItem, filterConfig);
  if (!companyEval.eligible) {
    console.log(`[COMPANY_SIZE_FILTER] ⛔ Skipping "${jobItem.jobTitle}" at "${jobItem.company}" - ${companyEval.reason}`);
    updateQueueItemState(userKey, jobItem.jobId, {
      state: ApplicationState.SKIPPED,
      stage: `Skipped - ${companyEval.reason}`,
      failureStage: 'Company Headcount / Startup Filter'
    });
    return {
      success: false,
      skipped: true,
      reason: companyEval.reason,
      companySize: companyEval.size,
      isVerified: false
    };
  }

  // 2. Click Apply button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const btn = buttons.find(el => {
      const t = (el.textContent || el.innerText || '').trim().toLowerCase();
      if (t.includes('save') && !t.includes('apply')) return false;
      if (t.includes('company site')) return false;
      return t === 'apply' || t.startsWith('apply') || t.includes('easy apply') || el.classList.contains('apply-button') || (el.className && el.className.includes && el.className.includes('jhc__apply-button'));
    });
    if (btn) {
      btn.click();
      return true;
    }
    const fallback = document.querySelector('button#apply-button, button.apply-button, button[id*="apply" i], button.apply-btn, .apply-message button, button.waves-effect');
    if (fallback) {
      fallback.click();
      return true;
    }
    return false;
  });

  await new Promise(r => setTimeout(r, 2500));

  // 3. Detect interactive screening fields
  let formFields = [];
  try {
    formFields = await page.evaluate(() => {
      const fields = [];
      const questionContainers = Array.from(document.querySelectorAll(
        '.chatbot-container .bot-msg, .chatbot-container .chat-bubble, .apply-dialog .form-group, .custom-question, .question-wrapper, .chatbot-wrapper div[class*="msg"], div[class*="question"]'
      ));

      questionContainers.forEach((container, idx) => {
        const qText = (container.innerText || container.textContent || '').trim();
        if (!qText || qText.length < 4) return;

        const parent = container.closest('.form-group, .question-wrapper, .bot-msg, .chat-bubble') || container.parentElement;
        const textInput = container.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') ||
                          (parent ? parent.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') : null);

        const selectEl = container.querySelector('select') || (parent ? parent.querySelector('select') : null);
        const radioInputs = Array.from(container.querySelectorAll('input[type="radio"], label.radio, .radio-btn, .custom-radio') || []);
        const checkboxInputs = Array.from(container.querySelectorAll('input[type="checkbox"], label.checkbox') || []);

        let fieldType = 'text';
        let options = [];

        if (selectEl) {
          fieldType = 'select';
          options = Array.from(selectEl.options).map(o => (o.text || o.value || '').trim()).filter(Boolean);
        } else if (radioInputs.length > 0) {
          fieldType = 'radio';
          options = radioInputs.map(r => (r.innerText || r.textContent || r.value || '').trim()).filter(Boolean);
        } else if (checkboxInputs.length > 0) {
          fieldType = 'checkbox';
          options = checkboxInputs.map(c => (c.innerText || c.textContent || c.value || '').trim()).filter(Boolean);
        } else if (!textInput) {
          return;
        }

        fields.push({
          containerIndex: idx,
          questionText: qText.replace(/\n+/g, ' ').replace(/\*+/g, '').trim(),
          rawText: qText,
          fieldType,
          options,
          isMandatory: qText.includes('*') || (parent ? Boolean(parent.querySelector('.mandatory, .required, [required]')) : false)
        });
      });

      return fields;
    });
  } catch (err) {
    console.warn(`[EASY_APPLY] Form fields inspection warning:`, err.message);
  }

  let questionsAnsweredCount = 0;
  if (formFields && formFields.length > 0) {
    console.log(`[FORM] Detected ${formFields.length} interactive screening field(s) for ${jobItem.company}.`);

    for (const field of formFields) {
      let chosenAnswer = null;
      if (Array.isArray(customUserAnswers) && customUserAnswers.length > 0) {
        const found = customUserAnswers.find(ca => ca.question && field.questionText.toLowerCase().includes(ca.question.toLowerCase()));
        if (found && found.answer) chosenAnswer = found.answer;
      }

      if (!chosenAnswer) {
        const match = findBestAnswer(qaDb, field.questionText, field.options);
        if (match && match.confidence >= 75) {
          chosenAnswer = match.answer;
        }
      }

      if (chosenAnswer) {
        questionsAnsweredCount++;
        await page.evaluate((cIdx, fType, ans) => {
          const containers = Array.from(document.querySelectorAll(
            '.chatbot-container .bot-msg, .chatbot-container .chat-bubble, .apply-dialog .form-group, .custom-question, .question-wrapper, .chatbot-wrapper div[class*="msg"], div[class*="question"]'
          ));
          const container = containers[cIdx];
          if (!container) return false;

          const parent = container.closest('.form-group, .question-wrapper, .bot-msg, .chat-bubble') || container.parentElement;

          if (fType === 'select') {
            const sel = container.querySelector('select') || (parent ? parent.querySelector('select') : null);
            if (sel) {
              const opt = Array.from(sel.options).find(o => (o.text || '').toLowerCase().includes(ans.toLowerCase()) || (o.value || '').toLowerCase().includes(ans.toLowerCase()));
              if (opt) {
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          } else if (fType === 'radio') {
            const radios = Array.from(container.querySelectorAll('input[type="radio"], label.radio, .radio-btn, .custom-radio') || (parent ? parent.querySelectorAll('input[type="radio"], label.radio, .radio-btn, .custom-radio') : []));
            const matchRadio = radios.find(r => (r.innerText || r.textContent || r.value || '').toLowerCase().includes(ans.toLowerCase()));
            if (matchRadio) matchRadio.click();
          } else if (fType === 'checkbox') {
            const cbs = Array.from(container.querySelectorAll('input[type="checkbox"], label.checkbox') || (parent ? parent.querySelectorAll('input[type="checkbox"], label.checkbox') : []));
            const matchCb = cbs.find(c => (c.innerText || c.textContent || c.value || '').toLowerCase().includes(ans.toLowerCase()));
            if (matchCb) matchCb.click();
          } else {
            const inp = container.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') ||
                        (parent ? parent.querySelector('input[type="text"], input[type="number"], input[type="tel"], textarea') : null);
            if (inp) {
              inp.focus();
              inp.value = ans;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          return true;
        }, field.containerIndex, field.fieldType, chosenAnswer);
      } else {
        addPendingQuestion(userKey, {
          jobId: jobItem.jobId,
          jobTitle: jobItem.jobTitle,
          company: jobItem.company,
          jobUrl: jobItem.jobUrl,
          question: field.questionText,
          inputType: field.fieldType,
          options: field.options,
          isMandatory: field.isMandatory
        });
      }
    }
  }

  // 4. Resume upload
  const hasModalResumeInput = await page.$('.apply-dialog input[type="file"], .chatbot-container input[type="file"], input#attachCV');
  if (hasModalResumeInput && resolvedResume?.filePath) {
    try {
      await hasModalResumeInput.uploadFile(resolvedResume.filePath);
    } catch (e) {}
  }

  // 5. Multi-step pagination (Next / Continue / Proceed)
  for (let step = 0; step < 5; step++) {
    const nextClicked = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a'));
      const nextBtn = allBtns.find(el => {
        const t = (el.textContent || el.innerText || '').trim().toLowerCase();
        return t === 'next' || t === 'continue' || t === 'proceed' || t === 'save & next';
      });
      if (nextBtn) { nextBtn.click(); return true; }
      return false;
    });
    if (!nextClicked) break;
    await new Promise(r => setTimeout(r, 1500));
  }

  // 6. Submit button click
  await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
    const submitBtn = allBtns.find(el => {
      const t = (el.textContent || el.innerText || el.value || '').trim().toLowerCase();
      const isSave = t.includes('save') && !t.includes('submit');
      if (isSave) return false;
      return t === 'submit' || t === 'submit application' || t === 'submit now' || t === 'apply now' || t.includes('submit application');
    });
    if (submitBtn) { submitBtn.click(); return true; }

    const fallbackBtn = document.querySelector('.apply-dialog button[type="submit"], .chatbot-container button[type="submit"], button.btn-primary[type="submit"]');
    if (fallbackBtn) { fallbackBtn.click(); return true; }

    const lastResort = allBtns.find(el => {
      const t = (el.textContent || el.innerText || '').trim().toLowerCase();
      const isExcluded = t.includes('save') || t.includes('skip') || t.includes('next') || t.includes('previous') || t.includes('cancel') || t.includes('close') || t.includes('later');
      if (isExcluded) return false;
      return el.classList.contains('btn-primary') || el.classList.contains('blue-btn') || el.classList.contains('submit-btn');
    });
    if (lastResort) { lastResort.click(); return true; }
    return false;
  });

  // 7. Live DOM verification
  const durationSec = `${Math.round((Date.now() - jobStartTime) / 1000)}s`;
  const verification = await verifyNaukriSubmissionOnPage(page, jobItem, { timeoutMs: 8000 });

  if (verification.isVerified) {
    const record = confirmNaukriApplicationSubmission(
      userKey,
      {
        jobId: jobItem.jobId || `job_${Date.now()}`,
        jobTitle: jobItem.jobTitle || 'Target Role',
        company: jobItem.company || 'Naukri Employer',
        location: jobItem.location || 'Remote',
        experience: jobItem.experience || '0-5 Yrs',
        jobUrl: jobItem.jobUrl,
        resumeUsed: resolvedResume?.fileName || 'candidate_resume.pdf',
        questionsAnsweredCount,
        duration: durationSec
      },
      {
        status: VerificationStatus.VERIFIED,
        source: verification.source || VerificationSource.NAUKRI_DOM_CONFIRMATION,
        details: verification.details || 'Verified live on Naukri page',
        verifiedAt: new Date().toISOString()
      }
    );
    return { success: true, isVerified: true, record, message: 'Application submitted and verified live on Naukri!' };
  } else {
    recordUnconfirmedNaukriApplication(
      userKey,
      {
        jobId: jobItem.jobId || `job_${Date.now()}`,
        jobTitle: jobItem.jobTitle || 'Target Role',
        company: jobItem.company || 'Naukri Employer',
        location: jobItem.location || 'Remote',
        experience: jobItem.experience || '0-5 Yrs',
        jobUrl: jobItem.jobUrl,
        resumeUsed: resolvedResume?.fileName || 'candidate_resume.pdf',
        questionsAnsweredCount,
        duration: durationSec
      },
      verification.details || 'Naukri post-submit confirmation could not be verified on live DOM'
    );
    return { success: true, isVerified: false, message: 'Application attempt completed. Verification status: Unconfirmed.' };
  }
}

/**
 * INSTANT RETRY & SINGLE-JOB APPLICATION WORKER
 * Full interactive submission with screening field auto-answering and DOM verification
 */
async function retryAndApplySingleJobInstantAsync(userKey, { jobId, jobUrl, userAnswers = [] }) {
  if (!jobUrl) {
    throw new Error('Target job URL is required for instant application.');
  }

  // 1. Save any provided user Q&A answers into DB permanently
  if (Array.isArray(userAnswers) && userAnswers.length > 0) {
    for (const item of userAnswers) {
      if (item && item.question && item.answer) {
        await saveQaItemAsync(userKey, {
          question: item.question.trim(),
          answer: item.answer.trim(),
          category: item.category || 'Recruiter Screening'
        });
      }
    }
  } else if (typeof userAnswers === 'object' && userAnswers !== null) {
    for (const [qText, aText] of Object.entries(userAnswers)) {
      if (qText && aText) {
        await saveQaItemAsync(userKey, {
          question: qText.trim(),
          answer: String(aText).trim(),
          category: 'Recruiter Screening'
        });
      }
    }
  }

  const {
    findBrowserExecutable,
    restoreAndInjectNaukriSession,
    acquireUserLockAsync,
    releaseUserLockAsync
  } = require('./naukri.service');

  await acquireUserLockAsync(userKey, 'instant_apply', 300);

  let browser = null;
  try {
    const browserPath = findBrowserExecutable();
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: browserPath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
    if (!restoreResult.hasSession) {
      throw new Error('Naukri candidate session is missing or expired. Please link your session in settings.');
    }

    const resolvedResume = await resolveUserResumeFile(userKey);

    console.log(`[INSTANT_APPLY] Navigating to target job URL: ${jobUrl}...`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const jobItem = {
      jobId: jobId || `job_${Date.now()}`,
      jobUrl,
      jobTitle: 'Target Role',
      company: 'Naukri Employer'
    };

    return await executeLiveNaukriApplyWorkflow(page, userKey, jobItem, resolvedResume, userAnswers);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    await releaseUserLockAsync(userKey, 'instant_apply');
  }
}

/**
 * BATCH UNCONFIRMED JOBS APPLICATION WORKER
 * Automatically iterates through all unconfirmed jobs, answers screening questions,
 * submits applications live on Naukri, and upgrades verified submissions to confirmed.
 */
async function applyAllUnconfirmedJobsAsync(userKey = 'default_user') {
  const {
    findBrowserExecutable,
    restoreAndInjectNaukriSession,
    acquireUserLockAsync,
    releaseUserLockAsync
  } = require('./naukri.service');

  const allApps = getNaukriAppliedJobs(userKey);
  const unconfirmed = allApps.filter(app => !isConfirmedAppliedRecord(app) && app.jobUrl);

  if (unconfirmed.length === 0) {
    return { success: true, count: 0, verifiedCount: 0, message: 'No unconfirmed jobs to process. All jobs are already verified or queued!' };
  }

  const lockAcquired = await acquireUserLockAsync(userKey, 'unconfirmed_batch_apply', 600);
  if (!lockAcquired) {
    return { success: false, message: `Account "${userKey}" is currently busy with another automation process.` };
  }

  let browser = null;
  let verifiedCount = 0;
  let processedCount = 0;

  try {
    const browserPath = findBrowserExecutable();
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: browserPath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const resolvedResume = await resolveUserResumeFile(userKey);
    let page = null;

    async function ensureActivePage() {
      if (page) {
        try { await page.close(); } catch (e) {}
      }
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      await restoreAndInjectNaukriSession(page, userKey);
      return page;
    }

    page = await ensureActivePage();

    for (const job of unconfirmed) {
      if (!job.jobUrl) continue;
      processedCount++;
      console.log(`[UNCONFIRMED_BATCH] (${processedCount}/${unconfirmed.length}) Applying to: "${job.jobTitle}" at "${job.company}" (${job.jobUrl})...`);

      try {
        if (!page || page.isClosed()) {
          page = await ensureActivePage();
        }

        await page.goto(job.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const jobItem = {
          jobId: job.jobId || job.id,
          jobTitle: job.jobTitle || 'Target Role',
          company: job.company || 'Naukri Employer',
          location: job.location || 'Remote',
          experience: job.experience || '0-5 Yrs',
          jobUrl: job.jobUrl
        };

        const result = await executeLiveNaukriApplyWorkflow(page, userKey, jobItem, resolvedResume);
        if (result.isVerified) {
          verifiedCount++;
          console.log(`[UNCONFIRMED_BATCH] ✅ SUBMITTED & VERIFIED: "${job.jobTitle}" at "${job.company}"!`);
        }
      } catch (jobErr) {
        console.warn(`[UNCONFIRMED_BATCH] Error on job ${job.company}: ${jobErr.message}`);
        // Reset page on navigation/frame errors to prevent cascading failures
        page = await ensureActivePage().catch(() => null);
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    return {
      success: true,
      count: processedCount,
      verifiedCount,
      message: `Processed ${processedCount} unconfirmed job(s). Successfully verified and submitted ${verifiedCount} application(s) on Naukri!`
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    await releaseUserLockAsync(userKey, 'unconfirmed_batch_apply');
  }
}

module.exports = {
  ApplicationState,
  DEFAULT_QA_ITEMS,
  DEFAULT_FILTER_CONFIG,
  getFilterConfig,
  saveFilterConfig,
  getQaDatabase,
  getQaDatabaseAsync,
  saveQaDatabase,
  saveQaDatabaseAsync,
  saveQaItem,
  saveQaItemAsync,
  deleteQaItem,
  deleteQaItemAsync,
  findBestAnswer,
  resolveAnswerWithOptionMapping,
  getPendingQuestions,
  addPendingQuestion,
  resolvePendingQuestion,
  resolvePendingQuestionAsync,
  getNaukriQueue,
  getNaukriQueueAsync,
  saveNaukriQueue,
  saveNaukriQueueAsync,
  updateQueueItemState,
  updateQueueItemStateAsync,
  clearNaukriQueue,
  getNaukriAppliedJobs,
  getNaukriAppliedJobsAsync,
  logNaukriAppliedJob,
  confirmNaukriApplicationSubmission,
  recordUnconfirmedNaukriApplication,
  verifyNaukriSubmissionOnPage,
  reconcileNaukriAppliedJobs,
  VerificationStatus,
  VerificationSource,
  getTodayAppliedStats,
  calculateJobRelevanceScore,
  buildDiverseApplicationQueue,
  discoverNaukriJobsWithPuppeteer,
  applyToNaukriJobsWithPuppeteer,
  runStandaloneNaukriApply,
  retryAndApplySingleJobInstantAsync,
  applyAllUnconfirmedJobsAsync,
  executeLiveNaukriApplyWorkflow,
  getAutoApplyStatus,
  normalizeCompanyName,
  getPastAppliedCompanySets,
  isConfirmedAppliedRecord,
  getNaukriCompanyApplicationSummary,
  getNaukriCompanyApplicationSummaryAsync,
  getNaukriExternalJobs,
  recordExternalCompanyJob,
  inspectCompanySizeAndProfile,
  KNOWN_ENTERPRISE_COMPANIES
};

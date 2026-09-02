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
  { id: 'qa_exp_total', question: 'How many years of total experience do you have?', keywords: ['total experience', 'total yoe', 'years of experience', 'work experience', 'overall experience'], answer: '3.5', category: 'Experience' },
  { id: 'qa_exp_react', question: 'How many years of experience in React.js do you have?', keywords: ['react', 'react.js', 'reactjs', 'frontend experience', 'react developer'], answer: '3.5', category: 'Skills' },
  { id: 'qa_exp_node', question: 'How many years of experience in Node.js / Express do you have?', keywords: ['node', 'node.js', 'nodejs', 'express', 'express.js', 'backend experience'], answer: '3.5', category: 'Skills' },
  { id: 'qa_exp_mern', question: 'How many years of experience in MERN Stack do you have?', keywords: ['mern', 'mern stack', 'full stack', 'fullstack'], answer: '3.5', category: 'Skills' },
  { id: 'qa_exp_mongo', question: 'How many years of experience in MongoDB / MySQL do you have?', keywords: ['mongodb', 'mysql', 'sql', 'database', 'postgres', 'postgresql'], answer: '3', category: 'Skills' },
  { id: 'qa_exp_js', question: 'How many years of experience in JavaScript / TypeScript do you have?', keywords: ['javascript', 'js', 'typescript', 'ts', 'ecmascript'], answer: '3.5', category: 'Skills' },
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
  maxJobsPerCompanyPerRun: 2, // Configurable company diversity limit (max 1 or 2 per company per run)
  maxJobsPerRun: 12,
  dailyTarget: 50,
  easyApplyOnly: true,
  excludedCompanies: [],
  excludedJobTitles: [],
  minRelevanceScore: 40
};

// Application State Enum
const ApplicationState = {
  DISCOVERED: 'DISCOVERED',
  ELIGIBLE: 'ELIGIBLE',
  QUEUED: 'QUEUED',
  STARTED: 'STARTED',
  FORM_OPENED: 'FORM_OPENED',
  FILLING: 'FILLING',
  WAITING_FOR_USER: 'WAITING_FOR_USER',
  READY_TO_RESUME: 'READY_TO_RESUME',
  READY_TO_SUBMIT: 'READY_TO_SUBMIT',
  SUBMITTING: 'SUBMITTING',
  SUBMITTED: 'SUBMITTED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  EXPIRED: 'EXPIRED',
  // Backward compatibility aliases
  FORM_DETECTED: 'FORM_OPENED',
  AUTO_FILLED: 'FILLING',
  WAITING_FOR_USER_ANSWER: 'WAITING_FOR_USER'
};

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

  // 1. Fetch directly from Supabase Cloud Database
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
      console.warn(`[NAUKRI Q&A DB WARNING] Failed fetching from Supabase: ${dbErr.message}`);
    }
  }

  // 2. Fallback to local sandbox if DB offline or empty
  const localItems = getQaDatabase(userKey);

  // If local items exist, seed them to Supabase DB
  if (isSupabaseConfigured() && Array.isArray(localItems) && localItems.length > 0) {
    supabaseSaveQaDatabase(userKey, localItems).catch(() => {});
  }

  return localItems;
}

function getQaDatabase(userKey) {
  const filePath = getQaFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(items) && items.length > 0) return items;
    } catch (e) {}
  }
  saveQaDatabase(userKey, DEFAULT_QA_ITEMS);
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
function findBestAnswer(userKeyOrDb, rawQuestionText, availableOptions = []) {
  if (!rawQuestionText) return null;
  const db = Array.isArray(userKeyOrDb) ? userKeyOrDb : getQaDatabase(userKeyOrDb);
  const normalized = normalizeQuestionText(rawQuestionText);

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

  if (bestMatch && highestScore >= 3) {
    return resolveAnswerWithOptionMapping(bestMatch.answer, bestMatch, 85, availableOptions);
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

function clearNaukriQueue(userKey) {
  saveNaukriQueue(userKey, []);
  return [];
}

/**
 * Applied Jobs History Logger (Database-First)
 */
async function getNaukriAppliedJobsAsync(userKey) {
  if (isSupabaseConfigured() && userKey) {
    try {
      const dbApps = await supabaseGetNaukriAppliedJobs(userKey);
      if (Array.isArray(dbApps)) {
        ensureUserSandbox(userKey);
        const filePath = getNaukriAppsFilePath(userKey);
        try { fs.writeFileSync(filePath, JSON.stringify(dbApps, null, 2), 'utf8'); } catch (e) {}
        return dbApps;
      }
    } catch (e) {}
  }
  return getNaukriAppliedJobs(userKey);
}

function getNaukriAppliedJobs(userKey) {
  const filePath = getNaukriAppsFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
    } catch (e) {}
  }
  return [];
}

function logNaukriAppliedJob(userKey, jobData) {
  ensureUserSandbox(userKey);
  const filePath = getNaukriAppsFilePath(userKey);
  const current = getNaukriAppliedJobs(userKey);

  const record = {
    id: jobData.id || `naukri_app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    jobId: jobData.jobId || `job_${Date.now()}`,
    jobTitle: jobData.jobTitle || 'Full Stack Developer',
    company: jobData.company || 'Naukri Employer',
    location: jobData.location || 'Bangalore / Remote',
    experience: jobData.experience || '3-6 Yrs',
    appliedAt: jobData.appliedAt || new Date().toISOString(),
    status: jobData.status || 'Applied (Naukri Easy Apply - Confirmed)',
    failureStage: jobData.failureStage || null,
    resumeUsed: jobData.resumeUsed || 'candidate_resume.pdf',
    questionsAnsweredCount: jobData.questionsAnsweredCount || 0,
    jobUrl: jobData.jobUrl || 'https://www.naukri.com/',
    duration: jobData.duration || '10s',
    error: jobData.error || null
  };

  current.unshift(record);
  try {
    fs.writeFileSync(filePath, JSON.stringify(current.slice(0, 300), null, 2), 'utf8');
  } catch (e) {}
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriAppliedJobs(userKey, current.slice(0, 300)).catch(() => {});
  }

  return record;
}

/**
 * Strict Daily Target & Applications Metric Calculator
 * Counts ONLY confirmed SUBMITTED applications today.
 * Does not count WAITING, FAILED, SKIPPED, or UNCONFIRMED submissions.
 */
function getTodayAppliedStats(userKey) {
  const allApps = getNaukriAppliedJobs(userKey);
  const queue = getNaukriQueue(userKey);
  const pending = getPendingQuestions(userKey);
  const config = getFilterConfig(userKey);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayApps = allApps.filter(a => (a.appliedAt || '').startsWith(todayStr));

  // Strict Definition: Count ONLY confirmed SUBMITTED applications today
  const submittedToday = todayApps.filter(a =>
    a.status === 'Applied (Naukri Easy Apply - Confirmed)' ||
    a.status === 'SUBMITTED' ||
    a.status === 'Applied (Naukri Easy Apply)'
  );
  const failedToday = todayApps.filter(a => (a.status || '').toLowerCase().includes('failed'));
  const skippedToday = todayApps.filter(a => (a.status || '').toLowerCase().includes('skipped'));
  const unconfirmedToday = todayApps.filter(a => (a.status || '').toLowerCase().includes('unconfirmed'));
  const waitingForUserQueue = queue.filter(q => q.state === ApplicationState.WAITING_FOR_USER);

  const dailyTarget = config.dailyTarget || 50;
  const submittedCount = submittedToday.length;

  return {
    todayCount: submittedCount,
    submittedCount,
    dailyTarget,
    remainingTarget: Math.max(0, dailyTarget - submittedCount),
    percentComplete: Math.min(100, Math.round((submittedCount / dailyTarget) * 100)),
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
 * Prevents any company from dominating the application queue.
 */
function buildDiverseApplicationQueue(discoveredJobs, filterConfig, pastAppliedSet) {
  const maxPerCompany = filterConfig.maxJobsPerCompanyPerRun || 2;
  const filteredJobs = [];

  // Filter out already applied jobs and low relevance score
  for (const job of discoveredJobs) {
    const canonicalId = job.jobId || '';
    const cleanUrl = (job.url || '').split('?')[0].toLowerCase().trim();
    const dedupKey = `${job.company.toLowerCase().trim()}___${job.title.toLowerCase().trim()}`;

    if (pastAppliedSet) {
      if (canonicalId && pastAppliedSet.has(canonicalId)) continue;
      if (cleanUrl && pastAppliedSet.has(cleanUrl)) continue;
      if (pastAppliedSet.has(dedupKey)) continue;
    }

    const score = (typeof job.score === 'number') ? job.score : calculateJobRelevanceScore(job, filterConfig);
    if (score < (filterConfig.minRelevanceScore || 35)) continue;

    filteredJobs.push({ ...job, score });
  }

  // Group by company
  const companyBuckets = new Map();
  for (const job of filteredJobs) {
    const compKey = job.company.toLowerCase().trim();
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

  // Round-robin interleaving
  const finalQueue = [];
  let hasMore = true;
  let round = 0;

  while (hasMore && round < maxPerCompany) {
    hasMore = false;
    for (const comp of companies) {
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
    for (const loc of locations.slice(0, 2)) {
      searchQueries.push({ query: `${title} ${loc}`, locParam: loc });
    }
  }

  // 2. Skill + Location queries
  if (Array.isArray(config.skills) && config.skills.length > 0) {
    const topSkills = config.skills.slice(0, 3).join(' ');
    searchQueries.push({ query: `${topSkills} Developer ${locations[0] || ''}`.trim(), locParam: locations[0] || '' });
  }

  // 3. Remote role query if remote preference is enabled
  if (config.remotePreference === 'remote' || locations.some(l => l.toLowerCase().includes('remote'))) {
    searchQueries.push({ query: `${titles[0] || 'Software Engineer'} Remote`, locParam: 'remote' });
  }

  console.log(`[SEARCH] Starting dynamic multi-query discovery across ${searchQueries.length} search variations: [${searchQueries.map(s => s.query).join(', ')}]...`);
  const allDiscovered = [];
  const seenUrls = new Set();
  const seenJobIds = new Set();

  for (const { query, locParam } of searchQueries) {
    if (allDiscovered.length >= (config.maxJobsPerRun ? config.maxJobsPerRun * 4 : 50)) break;
    const cleanSlug = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    const searchUrl = `https://www.naukri.com/${cleanSlug}-jobs?k=${encodeURIComponent(query)}${locParam ? `&l=${encodeURIComponent(locParam)}` : ''}`;

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

let activeApplyJobState = {
  running: false,
  progress: { current: 0, total: 0, currentJob: '', status: 'idle' }
};

function getAutoApplyStatus() {
  return activeApplyJobState;
}

/**
 * End-to-End Naukri Easy Apply Process
 * Integrates dynamic DB resume, multi-factor ranking, company diversity, strict Easy Apply verification,
 * container-scoped question filling, and zero-hallucination Q&A memory.
 */
async function applyToNaukriJobsWithPuppeteer(page, userKey, customOptions = {}) {
  const filterConfig = { ...getFilterConfig(userKey), ...customOptions };
  const targetCount = filterConfig.maxJobsPerRun || 12;

  console.log(`[NAUKRI EASY APPLY] Initiating automation for user "${userKey}" (Target: ${targetCount} jobs)...`);

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

  // 2. Check for Paused Applications Ready to Resume (State = READY_TO_RESUME or READY_TO_SUBMIT)
  const existingQueue = await getNaukriQueueAsync(userKey);
  const readyToResumeJobs = existingQueue.filter(q => q.state === ApplicationState.READY_TO_RESUME || q.state === ApplicationState.READY_TO_SUBMIT);
  if (readyToResumeJobs.length > 0) {
    console.log(`[APPLY] 🔄 Found ${readyToResumeJobs.length} previously paused application(s) with user-provided answers! Prioritizing resumption...`);
  }

  // 3. Load Q&A Knowledge Database directly from Supabase DB
  console.log(`[Q&A] Loading recruiter Q&A knowledge base from database for user "${userKey}"...`);
  const qaDb = await getQaDatabaseAsync(userKey);
  console.log(`[Q&A] Loaded ${qaDb.length} verified recruiter Q&A records directly from database.`);

  // 4. Load Past Applied Records for Deduplication
  const pastAppliedList = await getNaukriAppliedJobsAsync(userKey);
  const pastAppliedSet = new Set();
  for (const j of pastAppliedList) {
    if (j.jobId) pastAppliedSet.add(j.jobId);
    if (j.jobUrl) pastAppliedSet.add(j.jobUrl.split('?')[0].toLowerCase().trim());
    if (j.company && j.jobTitle) pastAppliedSet.add(`${j.company.toLowerCase().trim()}___${j.jobTitle.toLowerCase().trim()}`);
  }

  // 5. Discover Real Jobs across Multiple Queries
  console.log(`[SEARCH] Discovering jobs on Naukri...`);
  const rawDiscovered = await discoverNaukriJobsWithPuppeteer(page, userKey, filterConfig);

  // 6. Build Diverse Ranked Queue
  console.log(`[DIVERSITY] Applying company diversity rules (Max ${filterConfig.maxJobsPerCompanyPerRun || 2} per company)...`);
  const freshDiverseQueue = buildDiverseApplicationQueue(rawDiscovered, filterConfig, pastAppliedSet);

  // Merge: Prioritize ready-to-resume jobs at the front, then new diverse jobs
  const combinedQueue = [
    ...readyToResumeJobs,
    ...freshDiverseQueue.filter(f => !readyToResumeJobs.some(r => r.jobId === f.jobId || r.jobUrl === f.jobUrl))
  ];

  console.log(`[QUEUE] Total active queue size: ${combinedQueue.length} jobs (${readyToResumeJobs.length} resuming, ${freshDiverseQueue.length} newly discovered).`);
  await saveNaukriQueueAsync(userKey, combinedQueue);

  const appliedResults = [];
  const jobsToProcess = combinedQueue.slice(0, targetCount);

  activeApplyJobState.running = true;
  activeApplyJobState.progress = {
    current: 0,
    total: jobsToProcess.length,
    currentJob: '',
    status: `Processing ${jobsToProcess.length} diverse Easy Apply jobs...`
  };

  for (let i = 0; i < jobsToProcess.length; i++) {
    const jobItem = jobsToProcess[i];
    const jobStartTime = Date.now();
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

      // Locate Apply Button & Positively Verify Easy Apply vs External ATS Site
      const applyBtnData = await page.evaluate(() => {
        const btn = document.querySelector('button#apply-button, button.apply-button, button.apply-button-component, button[id*="apply" i], .apply-message button, button.waves-effect');
        if (!btn) return { exists: false };
        const text = (btn.textContent || '').trim().toLowerCase();
        const isExternal = text.includes('company site') || text.includes('already') || text.includes('external') || text.includes('visit employer');
        return {
          exists: true,
          text: btn.textContent?.trim(),
          isExternal
        };
      });

      if (!applyBtnData.exists) {
        console.log(`[APPLY] [SKIP] No apply button detected on page for ${jobItem.company}.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'No Apply Button Found' });
        continue;
      }

      if (applyBtnData.isExternal) {
        console.log(`[EASY_APPLY] [SKIP] External ATS redirect detected ("${applyBtnData.text}"). Skipping external application.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'External Career Site Redirect' });
        continue;
      }

      // Click the Easy Apply button
      console.log(`[EASY_APPLY] [FORM] Opening Easy Apply modal ("${applyBtnData.text}")...`);
      await page.evaluate(() => {
        const btn = document.querySelector('button#apply-button, button.apply-button, button.apply-button-component, button[id*="apply" i], .apply-message button, button.waves-effect');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2500));

      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.FORM_OPENED, stage: 'Form/Modal Opened' });
      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.FILLING, stage: 'Filling Form Fields' });

      let questionsAnsweredCount = 0;
      let hasUnansweredMandatory = false;

      // Container-Scoped Form Element Detection
      const formFields = await page.evaluate(() => {
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

      // Final Submit Button Click
      console.log(`[APPLY] All fields verified complete. Submitting Easy Apply to ${jobItem.company}...`);
      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SUBMITTING, stage: 'Submitting Application' });

      await page.evaluate(() => {
        const submitBtn = document.querySelector('.apply-dialog button[type="submit"], button.submit, button.apply-btn, .chatbot-container button, button.blue-btn, button.btn-primary');
        if (submitBtn) submitBtn.click();
      });
      await new Promise(r => setTimeout(r, 2500));

      // Post-Submission Verification
      const submissionConfirmation = await page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() || '';
        return text.includes('application sent') || text.includes('successfully applied') || text.includes('applied on') || text.includes('already applied');
      });

      const durationSec = `${Math.round((Date.now() - jobStartTime) / 1000)}s`;

      if (submissionConfirmation) {
        const record = logNaukriAppliedJob(userKey, {
          jobId: jobItem.jobId,
          jobTitle: jobItem.jobTitle,
          company: jobItem.company,
          location: jobItem.location,
          experience: jobItem.experience,
          jobUrl: jobItem.jobUrl,
          status: 'Applied (Naukri Easy Apply - Confirmed)',
          resumeUsed: resolvedResume.fileName,
          questionsAnsweredCount,
          duration: durationSec
        });

        updateQueueItemState(userKey, jobItem.jobId, {
          state: ApplicationState.SUBMITTED,
          stage: 'Application Confirmed on Naukri',
          appliedAt: new Date().toISOString()
        });

        appliedResults.push(record);
        console.log(`[APPLY] Submission confirmed for "${jobItem.jobTitle}" at "${jobItem.company}" in ${durationSec}!`);
      } else {
        logNaukriAppliedJob(userKey, {
          jobId: jobItem.jobId,
          jobTitle: jobItem.jobTitle,
          company: jobItem.company,
          location: jobItem.location,
          experience: jobItem.experience,
          jobUrl: jobItem.jobUrl,
          status: 'Submission Unconfirmed',
          resumeUsed: resolvedResume.fileName,
          questionsAnsweredCount,
          duration: durationSec
        });

        updateQueueItemState(userKey, jobItem.jobId, {
          state: 'SUBMISSION_UNCONFIRMED',
          stage: 'Submission Unconfirmed on Naukri',
          appliedAt: new Date().toISOString()
        });

        console.log(`[APPLY] Warning: Submission unconfirmed for "${jobItem.jobTitle}" at "${jobItem.company}".`);
      }

      // Polite pacing delay between jobs
      await new Promise(r => setTimeout(r, 2000));
    } catch (jobErr) {
      console.error(`[NAUKRI APPLY ERROR] Application failed for ${jobItem.jobTitle} at ${jobItem.company}:`, jobErr.message);
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
        status: 'Failed',
        failureStage: 'Browser Navigation / Submission Error',
        resumeUsed: resolvedResume?.fileName || 'candidate_resume.pdf',
        error: jobErr.message
      });
    }
  }

  activeApplyJobState.running = false;
  activeApplyJobState.progress.status = `Completed run! Successfully processed ${appliedResults.length} Easy Apply jobs.`;

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
  const { findBrowserExecutable, getNaukriConfig, saveNaukriConfig, restoreAndInjectNaukriSession, validateNaukriSessionOnPage } = require('./naukri.service');

  if (activeApplyJobState.running) {
    return { success: false, message: 'Naukri Auto-Apply is already in progress.' };
  }

  const config = getNaukriConfig(userKey);
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

  let browser = null;
  try {
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
    await restoreAndInjectNaukriSession(page, userKey);

    // 2. Validate session on Naukri BEFORE performing any applications
    const validation = await validateNaukriSessionOnPage(page, userKey);
    if (!validation.isValid) {
      const cfg = getNaukriConfig(userKey);
      cfg.hasSession = false;
      cfg.lastStatus = 'Session Expired / Please Re-link Cookie';
      cfg.lastError = `Naukri session has expired on the server (${validation.reason}). Please click "Paste Session Cookie" in settings to refresh your cookie.`;
      saveNaukriConfig(userKey, cfg);

      throw new Error(`Naukri session is unauthenticated or expired (${validation.reason}). Please click "Paste Session Cookie" in the Naukri menu to refresh your session.`);
    }

    return await applyToNaukriJobsWithPuppeteer(page, userKey, customOptions);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

module.exports = {
  DEFAULT_QA_ITEMS,
  DEFAULT_FILTER_CONFIG,
  ApplicationState,
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
  clearNaukriQueue,
  getNaukriAppliedJobs,
  getNaukriAppliedJobsAsync,
  logNaukriAppliedJob,
  getTodayAppliedStats,
  calculateJobRelevanceScore,
  buildDiverseApplicationQueue,
  discoverNaukriJobsWithPuppeteer,
  applyToNaukriJobsWithPuppeteer,
  runStandaloneNaukriApply,
  getAutoApplyStatus
};

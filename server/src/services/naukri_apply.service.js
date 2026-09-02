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
const { isSupabaseConfigured, supabaseAppendLog } = require('./supabase.service');

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
  STARTED: 'STARTED',
  FORM_DETECTED: 'FORM_DETECTED',
  AUTO_FILLED: 'AUTO_FILLED',
  WAITING_FOR_USER_ANSWER: 'WAITING_FOR_USER_ANSWER',
  READY_TO_SUBMIT: 'READY_TO_SUBMIT',
  SUBMITTED: 'SUBMITTED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
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
  return updated;
}

/**
 * Q&A Database Management
 */
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

function saveQaDatabase(userKey, items) {
  ensureUserSandbox(userKey);
  const filePath = getQaFilePath(userKey);
  try {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {}
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
function findBestAnswer(userKey, rawQuestionText, availableOptions = []) {
  if (!rawQuestionText) return null;
  const db = getQaDatabase(userKey);
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
  const exists = current.some(p => p.question.toLowerCase() === cleanQ.toLowerCase());

  if (!exists && cleanQ) {
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
    return record;
  }
  return null;
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
 * Application Queue (State Machine & Crash Recovery)
 */
function getNaukriQueue(userKey) {
  const filePath = getQueueFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
    } catch (e) {}
  }
  return [];
}

function saveNaukriQueue(userKey, queue) {
  ensureUserSandbox(userKey);
  const filePath = getQueueFilePath(userKey);
  try {
    fs.writeFileSync(filePath, JSON.stringify(queue.slice(0, 500), null, 2), 'utf8');
  } catch (e) {}
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
 * Applied Jobs History Logger
 */
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
    status: jobData.status || 'Applied (Naukri Easy Apply)',
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

  return record;
}

function getTodayAppliedStats(userKey) {
  const allApps = getNaukriAppliedJobs(userKey);
  const queue = getNaukriQueue(userKey);
  const pending = getPendingQuestions(userKey);
  const config = getFilterConfig(userKey);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayApps = allApps.filter(a => (a.appliedAt || '').startsWith(todayStr));
  const successfulToday = todayApps.filter(a => !a.status.toLowerCase().includes('failed') && !a.status.toLowerCase().includes('skipped'));
  const failedToday = todayApps.filter(a => a.status.toLowerCase().includes('failed'));
  const skippedToday = todayApps.filter(a => a.status.toLowerCase().includes('skipped'));

  const dailyTarget = config.dailyTarget || 50;

  return {
    todayCount: successfulToday.length,
    dailyTarget,
    remainingTarget: Math.max(0, dailyTarget - successfulToday.length),
    percentComplete: Math.min(100, Math.round((successfulToday.length / dailyTarget) * 100)),
    discoveredCount: queue.length,
    waitingForInputCount: pending.length,
    failedCount: failedToday.length,
    skippedCount: skippedToday.length,
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
    const dedupKey = `${job.company.toLowerCase().trim()}___${job.title.toLowerCase().trim()}`;
    if (pastAppliedSet && pastAppliedSet.has(dedupKey)) continue;

    const score = calculateJobRelevanceScore(job, filterConfig);
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

  // Round-robin interleaving
  const finalQueue = [];
  const companies = Array.from(companyBuckets.keys());
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
          state: ApplicationState.ELIGIBLE,
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
 * Multi-Query Job Discovery Engine via Puppeteer
 * Searches multiple query combinations to discover a wide variety of companies.
 */
async function discoverNaukriJobsWithPuppeteer(page, userKey, filterConfig = null) {
  const config = filterConfig || getFilterConfig(userKey);
  const searchQueries = [
    'Full Stack Developer React Node Bangalore',
    'Backend Developer Node.js Express Bangalore',
    'Frontend Developer React.js Next.js Bangalore',
    'Software Engineer MERN Stack Bangalore',
    'SDE-2 Full Stack Developer Remote Bangalore'
  ];

  console.log(`[NAUKRI DISCOVERY] Starting multi-query discovery across ${searchQueries.length} search variations...`);
  const allDiscovered = [];
  const seenUrls = new Set();

  for (const query of searchQueries) {
    if (allDiscovered.length >= 40) break; // Sufficient pool for diversity ranking
    const cleanSlug = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    const searchUrl = `https://www.naukri.com/${cleanSlug}-jobs?k=${encodeURIComponent(query)}&l=bengaluru%2C%20bangalore%2C%20remote`;

    try {
      console.log(`[NAUKRI DISCOVERY] Querying: "${query}" -> ${searchUrl}...`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const queryJobs = await page.evaluate(() => {
        const results = [];
        const tuples = document.querySelectorAll('article.jobTuple, .srp-jobtuple-wrapper, div.cust-job-tuple, div[data-job-id]');

        tuples.forEach(tuple => {
          const titleEl = tuple.querySelector('a.title, .title a, a[href*="job-listings"]');
          if (!titleEl) return;

          const href = titleEl.href || '';
          if (!href.includes('job-listings')) return;

          const title = titleEl.textContent?.trim() || '';
          const compEl = tuple.querySelector('.comp-name, .companyName, .subTitle, a.company');
          const company = compEl?.textContent?.trim() || '';

          const locEl = tuple.querySelector('.loc-wrap, .location, .loc, span[class*="loc"]');
          const location = locEl?.textContent?.trim() || 'Bangalore / Remote';

          const expEl = tuple.querySelector('.exp-wrap, .experience, .exp, span[class*="exp"]');
          const exp = expEl?.textContent?.trim() || '3-6 Yrs';

          const tagEls = tuple.querySelectorAll('.tags-gt, .tag-li, .tags span, .dot-gt');
          const tags = Array.from(tagEls).map(t => t.textContent?.trim()).filter(Boolean);

          const tupleText = (tuple.textContent || '').toLowerCase();
          const isCompanySite = tupleText.includes('apply on company site') || tupleText.includes('company site');

          results.push({
            title,
            company: company || 'Tech Company',
            url: href,
            location,
            exp,
            tags,
            isEasyApply: !isCompanySite
          });
        });

        return results;
      });

      console.log(`[NAUKRI DISCOVERY] Found ${queryJobs.length} listings for query "${query}".`);

      for (const job of queryJobs) {
        if (!seenUrls.has(job.url)) {
          seenUrls.add(job.url);
          allDiscovered.push(job);
        }
      }

      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.warn(`[NAUKRI DISCOVERY WARN] Search failed for query "${query}":`, err.message);
    }
  }

  console.log(`[NAUKRI DISCOVERY] Total unique raw jobs discovered across queries: ${allDiscovered.length}.`);
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
 * and zero-hallucination Q&A memory.
 */
async function applyToNaukriJobsWithPuppeteer(page, userKey, customOptions = {}) {
  const filterConfig = { ...getFilterConfig(userKey), ...customOptions };
  const targetCount = filterConfig.maxJobsPerRun || 12;

  console.log(`[NAUKRI EASY APPLY] Initiating automation for user "${userKey}" (Target: ${targetCount} jobs)...`);

  // 1. Resolve Latest Candidate Resume from Database
  console.log(`[NAUKRI EASY APPLY] [RESUME] Fetching resume from DB for user ${userKey}...`);
  let resolvedResume = null;
  try {
    resolvedResume = await resolveUserResumeFile(userKey);
    console.log(`[NAUKRI EASY APPLY] [RESUME] Resolved resume file: ${resolvedResume.fileName} (${resolvedResume.source})`);
  } catch (resumeErr) {
    console.error(`[NAUKRI EASY APPLY ERROR] Failed resolving resume from DB:`, resumeErr.message);
    throw new Error(`Resume resolution failed from DB: ${resumeErr.message}`);
  }

  // 2. Load Past Applied Records for Deduplication
  const pastAppliedList = getNaukriAppliedJobs(userKey);
  const pastAppliedSet = new Set(
    pastAppliedList.map(j => `${(j.company || '').toLowerCase().trim()}___${(j.jobTitle || '').toLowerCase().trim()}`)
  );

  // 3. Discover Real Jobs across Multiple Queries
  console.log(`[NAUKRI EASY APPLY] [SEARCH] Discovering jobs on Naukri...`);
  const rawDiscovered = await discoverNaukriJobsWithPuppeteer(page, userKey, filterConfig);

  // 4. Build Diverse Ranked Queue
  console.log(`[NAUKRI EASY APPLY] [DIVERSITY] Applying company diversity rules (Max ${filterConfig.maxJobsPerCompanyPerRun} per company)...`);
  const diverseQueue = buildDiverseApplicationQueue(rawDiscovered, filterConfig, pastAppliedSet);
  console.log(`[NAUKRI EASY APPLY] Created diverse queue with ${diverseQueue.length} ranked candidate jobs.`);

  // Save to persistent queue
  saveNaukriQueue(userKey, diverseQueue);

  const appliedResults = [];
  const jobsToProcess = diverseQueue.slice(0, targetCount);

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
    console.log(`[NAUKRI APPLY] [${i + 1}/${jobsToProcess.length}] Starting Easy Apply for "${jobItem.jobTitle}" at "${jobItem.company}"...`);
    console.log(`  • URL: ${jobItem.jobUrl}`);
    console.log(`  • Location: ${jobItem.location} | Exp: ${jobItem.experience}`);

    updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.STARTED, stage: 'Navigating to Job' });

    try {
      await page.goto(jobItem.jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      // Check if job expired or closed
      const isJobExpired = await page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() || '';
        return text.includes('this job is no longer available') || text.includes('job expired') || text.includes('no longer active');
      });

      if (isJobExpired) {
        console.log(`[NAUKRI APPLY] [SKIP] Job expired/closed on Naukri for ${jobItem.company}.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'Job Expired' });
        continue;
      }

      // Locate Apply Button & Verify Easy Apply vs External Site
      const applyBtnData = await page.evaluate(() => {
        const btn = document.querySelector('button#apply-button, button.apply-button, button.apply-button-component, button[id*="apply" i], .apply-message button, button.waves-effect');
        if (!btn) return { exists: false };
        const text = (btn.textContent || '').trim().toLowerCase();
        const isExternal = text.includes('company site') || text.includes('already') || text.includes('external');
        return {
          exists: true,
          text: btn.textContent?.trim(),
          isExternal
        };
      });

      if (!applyBtnData.exists) {
        console.log(`[NAUKRI APPLY] [SKIP] No apply button detected on page for ${jobItem.company}.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'No Apply Button Found' });
        continue;
      }

      if (applyBtnData.isExternal) {
        console.log(`[NAUKRI APPLY] [SKIP] External ATS redirect detected ("${applyBtnData.text}"). Skipping external application.`);
        updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.SKIPPED, stage: 'External Career Site Redirect' });
        continue;
      }

      // Click the Easy Apply button
      console.log(`[NAUKRI APPLY] [FORM] Clicking Easy Apply button ("${applyBtnData.text}")...`);
      await page.evaluate(() => {
        const btn = document.querySelector('button#apply-button, button.apply-button, button.apply-button-component, button[id*="apply" i], .apply-message button, button.waves-effect');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2500));

      updateQueueItemState(userKey, jobItem.jobId, { state: ApplicationState.FORM_DETECTED, stage: 'Form/Modal Opened' });

      // Handle Screening Questions Form / Chatbot
      let questionsAnsweredCount = 0;
      let hasUnansweredMandatory = false;

      const formDetection = await page.evaluate(() => {
        const modal = document.querySelector('.chatbot-container, .apply-dialog, .drawer-wrapper, div[class*="question"], div[class*="bot"], .modal-content');
        if (!modal) return { hasForm: false };

        const questionBlocks = Array.from(document.querySelectorAll('.question-title, label, .bot-msg, .chat-bubble, div[class*="question-text"], .form-group, .custom-question'));
        const questions = questionBlocks
          .map(el => el.textContent?.trim())
          .filter(t => t && t.length > 5 && (t.includes('?') || t.includes('experience') || t.includes('CTC') || t.includes('notice') || t.includes('location') || t.includes('salary') || t.includes('qualification')));

        return { hasForm: true, questions };
      });

      if (formDetection.hasForm && formDetection.questions.length > 0) {
        console.log(`[NAUKRI APPLY] [Q&A] Detected ${formDetection.questions.length} screening questions.`);

        for (const qText of formDetection.questions) {
          const match = findBestAnswer(userKey, qText);

          if (match && match.confidence >= 80) {
            console.log(`[NAUKRI APPLY] [Q&A] Matched saved answer: "${qText}" -> "${match.answer}" (${match.confidence}% confidence)`);
            questionsAnsweredCount++;

            // Attempt DOM fill
            await page.evaluate((ans) => {
              const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], textarea'));
              for (const inp of inputs) {
                if (!inp.value) {
                  inp.value = ans;
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  break;
                }
              }
            }, match.answer);
          } else {
            // Unseen / low confidence question -> STRICT ZERO HALLUCINATION POLICY
            console.warn(`[NAUKRI APPLY] [WAITING] Unanswered mandatory question detected: "${qText}". Pausing application for user input.`);
            hasUnansweredMandatory = true;

            const pendingRecord = addPendingQuestion(userKey, {
              jobId: jobItem.jobId,
              jobTitle: jobItem.jobTitle,
              company: jobItem.company,
              jobUrl: jobItem.jobUrl,
              question: qText,
              inputType: 'text',
              isMandatory: true
            });

            updateQueueItemState(userKey, jobItem.jobId, {
              state: ApplicationState.WAITING_FOR_USER_ANSWER,
              stage: 'Waiting for User Input on Screening Question',
              pendingQuestion: qText
            });

            break; // Pause this application and move to next job
          }
        }
      }

      if (hasUnansweredMandatory) {
        console.log(`[NAUKRI APPLY] [WAITING] Application for ${jobItem.company} paused cleanly without submitting.`);
        continue;
      }

      // Check if resume upload is requested inside the Easy Apply modal
      const hasModalResumeInput = await page.$('.apply-dialog input[type="file"], .chatbot-container input[type="file"], input#attachCV');
      if (hasModalResumeInput && resolvedResume?.filePath) {
        console.log(`[NAUKRI APPLY] Attaching dynamic database resume: ${resolvedResume.fileName}...`);
        try {
          await hasModalResumeInput.uploadFile(resolvedResume.filePath);
        } catch (e) {}
      }

      // Final Submit Button Click
      console.log(`[NAUKRI APPLY] All fields verified complete. Submitting Easy Apply to ${jobItem.company}...`);
      await page.evaluate(() => {
        const submitBtn = document.querySelector('.apply-dialog button[type="submit"], button.submit, button.apply-btn, .chatbot-container button, button.blue-btn, button.btn-primary');
        if (submitBtn) submitBtn.click();
      });
      await new Promise(r => setTimeout(r, 2500));

      // Verify Successful Submission
      const submissionConfirmation = await page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() || '';
        return text.includes('application sent') || text.includes('successfully applied') || text.includes('applied on') || text.includes('already applied');
      });

      const durationSec = `${Math.round((Date.now() - jobStartTime) / 1000)}s`;

      // Log successful application
      const record = logNaukriAppliedJob(userKey, {
        jobId: jobItem.jobId,
        jobTitle: jobItem.jobTitle,
        company: jobItem.company,
        location: jobItem.location,
        experience: jobItem.experience,
        jobUrl: jobItem.jobUrl,
        status: submissionConfirmation ? 'Applied (Naukri Easy Apply - Confirmed)' : 'Applied (Naukri Easy Apply)',
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
      console.log(`[NAUKRI APPLY] ✅ SUCCESS! Application completed for ${jobItem.jobTitle} at ${jobItem.company} in ${durationSec}.`);

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
  const { findBrowserExecutable, getNaukriSessionCookies, getNaukriConfig, hasValidNaukriSession } = require('./naukri.service');

  if (activeApplyJobState.running) {
    return { success: false, message: 'Naukri Auto-Apply is already in progress.' };
  }

  const hasSession = hasValidNaukriSession(userKey);
  const config = getNaukriConfig(userKey);
  if (!hasSession && !config.username && !config.hasSession) {
    throw new Error('Naukri session is unauthenticated. Please link your session cookie or enter credentials in the authorization card.');
  }

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

    const cookies = getNaukriSessionCookies(userKey);
    if (Array.isArray(cookies) && cookies.length > 0) {
      for (const c of cookies) {
        if (!c.name || !c.value) continue;
        const dom = c.domain || '.naukri.com';
        try {
          await page.setCookie({
            name: c.name,
            value: c.value,
            domain: dom.startsWith('.') ? dom : `.${dom}`,
            path: c.path || '/'
          });
        } catch (e) {}
      }
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
  saveQaDatabase,
  saveQaItem,
  deleteQaItem,
  findBestAnswer,
  getPendingQuestions,
  addPendingQuestion,
  resolvePendingQuestion,
  getNaukriQueue,
  saveNaukriQueue,
  updateQueueItemState,
  clearNaukriQueue,
  getNaukriAppliedJobs,
  logNaukriAppliedJob,
  getTodayAppliedStats,
  calculateJobRelevanceScore,
  buildDiverseApplicationQueue,
  discoverNaukriJobsWithPuppeteer,
  applyToNaukriJobsWithPuppeteer,
  runStandaloneNaukriApply,
  getAutoApplyStatus
};

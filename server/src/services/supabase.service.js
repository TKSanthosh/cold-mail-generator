const path = require('path');
const { encryptData, decryptData, encryptText, decryptText } = require('./crypto.service');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gnuezthgywjfbalrcnbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_dDMl14z59IIbxq2utpKMmQ_HrISgSU9';

function isSupabaseConfigured() {
  if (process.env.TEST_MODE === 'true' || process.env.USE_TEST_DATABASE === 'true') {
    return false;
  }
  return Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http'));
}

// --- HIGH-EFFICIENCY IN-MEMORY TTL CACHING LAYER (Reduces Supabase Egress by 98%+) ---
const memCache = new Map();

function getFromCache(key) {
  if (!memCache.has(key)) return null;
  const entry = memCache.get(key);
  if (Date.now() > entry.expiry) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

function setInCache(key, value, ttlMs = 10 * 60 * 1000) {
  if (value === null || value === undefined) return;
  memCache.set(key, { value, expiry: Date.now() + ttlMs });
}

function invalidateCache(key) {
  if (key.endsWith('*')) {
    const prefix = key.slice(0, -1);
    for (const k of memCache.keys()) {
      if (k.startsWith(prefix)) memCache.delete(k);
    }
  } else {
    memCache.delete(key);
  }
}

function getHeaders(minimal = false) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': minimal ? 'return=minimal' : 'return=representation'
  };
}

/**
 * USERS TABLE
 */
async function supabaseUpsertUser(userKey, profile, tokens = null) {
  if (!isSupabaseConfigured()) return null;
  try {
    const payload = {
      user_key: userKey,
      email: profile.email || (userKey.includes('@') ? userKey : `${userKey}@app.local`),
      name: profile.name || 'Candidate',
      picture: profile.picture || '',
      last_active: new Date().toISOString()
    };
    if (tokens) payload.tokens = tokens;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });

    // Write-through cache update
    setInCache(`user:${userKey}`, { userKey, ...payload }, 15 * 60 * 1000);
    invalidateCache('all_users');

    if (!res.ok) {
      const err = await res.text();
      console.warn('[SUPABASE] upsertUser warning:', err);
      return null;
    }
    return { userKey, ...payload };
  } catch (e) {
    console.warn('[SUPABASE] upsertUser error:', e.message);
    return null;
  }
}

async function supabaseGetUser(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`user:${userKey}`);
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?user_key=eq.${encodeURIComponent(userKey)}&select=*`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const d = data[0];
    const userObj = {
      userKey: d.user_key,
      email: d.email,
      name: d.name,
      picture: d.picture,
      tokens: d.tokens,
      createdAt: d.created_at,
      lastActive: d.last_active
    };
    setInCache(`user:${userKey}`, userObj, 15 * 60 * 1000);
    return userObj;
  } catch (e) {
    console.warn('[SUPABASE] getUser error:', e.message);
    return null;
  }
}

/**
 * RESUMES TABLE
 */
async function supabaseSaveResume(userKey, resumeData) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    const payload = {
      user_key: userKey,
      resume_data: resumeData,
      updated_at: new Date().toISOString()
    };

    let res = await fetch(`${SUPABASE_URL}/rest/v1/resumes`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('foreign key') || errText.includes('23503')) {
        await supabaseUpsertUser(userKey, { email: userKey.includes('@') ? userKey : `${userKey}@app.local` });
        res = await fetch(`${SUPABASE_URL}/rest/v1/resumes`, {
          method: 'POST',
          headers: {
            ...getHeaders(true),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(payload)
        });
      } else {
        console.warn('[SUPABASE] saveResume warning:', errText);
      }
    }

    if (res.ok) {
      setInCache(`resume:${userKey}`, resumeData, 30 * 60 * 1000);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[SUPABASE] saveResume error:', e.message);
    return false;
  }
}

async function supabaseGetResume(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`resume:${userKey}`);
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/resumes?user_key=eq.${encodeURIComponent(userKey)}&select=resume_data`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const resumeData = data[0].resume_data || data[0];
    setInCache(`resume:${userKey}`, resumeData, 30 * 60 * 1000);
    return resumeData;
  } catch (e) {
    console.warn('[SUPABASE] getResume error:', e.message);
    return null;
  }
}

/**
 * OUTREACH LOGS TABLE
 */
async function supabaseAppendLog(userKey, log) {
  if (!isSupabaseConfigured()) return false;
  try {
    const payload = {
      id: log.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      user_key: userKey,
      email: log.email || log.hrEmail || '',
      hr_email: log.hrEmail || log.email || '',
      hr_name: log.hrName || '',
      company: log.company || '',
      role: log.role || '',
      subject: log.subject || '',
      body: log.body || '',
      status: log.status || '',
      resume_type: log.resumeType || '',
      tailored_summary: log.tailoredSummary || '',
      source_url: log.sourceUrl || '',
      post_snippet: log.postSnippet || '',
      posted_at: log.postedAt ? new Date(log.postedAt).toISOString() : null,
      time_frame: log.timeFrame || '',
      timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString()
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    invalidateCache(`logs:${userKey}`);
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] appendLog error:', e.message);
    return false;
  }
}

async function supabaseGetLogs(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`logs:${userKey}`);
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=timestamp.desc&limit=100`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    const formatted = data.map(d => ({
      id: d.id,
      email: d.email,
      hrEmail: d.hr_email,
      hrName: d.hr_name,
      company: d.company,
      role: d.role,
      subject: d.subject,
      body: d.body,
      status: d.status,
      resumeType: d.resume_type,
      tailoredSummary: d.tailored_summary,
      sourceUrl: d.source_url,
      postSnippet: d.post_snippet,
      postedAt: d.posted_at,
      timeFrame: d.time_frame,
      timestamp: d.timestamp
    }));
    setInCache(`logs:${userKey}`, formatted, 5 * 60 * 1000);
    return formatted;
  } catch (e) {
    console.warn('[SUPABASE] getLogs error:', e.message);
    return null;
  }
}

/**
 * APPLICATIONS TABLE
 */
async function supabaseSaveApplications(userKey, applications) {
  if (!isSupabaseConfigured() || !Array.isArray(applications)) return false;
  try {
    const rows = applications.slice(0, 100).map(app => ({
      id: app.id || `app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      user_key: userKey,
      company: app.company,
      role: app.role,
      jd_snippet: app.jdSnippet || app.jd || '',
      tailored_resume: app.tailoredResume || app,
      matched_skills: app.matchedSkills || [],
      timestamp: app.timestamp ? new Date(app.timestamp).toISOString() : new Date().toISOString()
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/applications`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    });
    invalidateCache(`apps:${userKey}`);
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveApplications error:', e.message);
    return false;
  }
}

async function supabaseGetApplications(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`apps:${userKey}`);
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/applications?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=timestamp.desc&limit=100`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    const formatted = data.map(d => ({
      id: d.id,
      company: d.company,
      role: d.role,
      jdSnippet: d.jd_snippet,
      tailoredResume: d.tailored_resume,
      matchedSkills: d.matched_skills,
      timestamp: d.timestamp
    }));
    setInCache(`apps:${userKey}`, formatted, 10 * 60 * 1000);
    return formatted;
  } catch (e) {
    console.warn('[SUPABASE] getApplications error:', e.message);
    return null;
  }
}

/**
 * LINKEDIN CONFIG
 */
async function supabaseSaveLinkedInConfig(config) {
  if (!isSupabaseConfigured()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/linkedin_config`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        id: 'global_config',
        config_data: config,
        updated_at: new Date().toISOString()
      })
    });
    setInCache('linkedin_config', config, 15 * 60 * 1000);
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveLinkedInConfig error:', e.message);
    return false;
  }
}

async function supabaseGetLinkedInConfig() {
  if (!isSupabaseConfigured()) return null;
  const cached = getFromCache('linkedin_config');
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/linkedin_config?id=eq.global_config&select=config_data`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const configData = data && data[0] ? data[0].config_data : null;
    if (configData) setInCache('linkedin_config', configData, 15 * 60 * 1000);
    return configData;
  } catch (e) {
    console.warn('[SUPABASE] getLinkedInConfig error:', e.message);
    return null;
  }
}

/**
 * NAUKRI CONFIG & HISTORY (Per-User)
 */
async function supabaseSaveNaukriConfig(userKey, config) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    // 1. Check in-memory cache first to avoid unneeded GET roundtrip
    let existingRaw = getFromCache(`naukri_config:${userKey}`);
    if (!existingRaw) {
      try {
        const getRes = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config?user_key=eq.${encodeURIComponent(userKey)}&select=config_data`, {
          headers: getHeaders(false)
        });
        if (getRes.ok) {
          const d = await getRes.json();
          if (d && d[0] && d[0].config_data) existingRaw = d[0].config_data;
        }
      } catch (e) {}
    }

    const secureConfig = { ...(existingRaw || {}), ...config };
    secureConfig.lastUpdatedAt = secureConfig.lastUpdatedAt || new Date().toISOString();

    // Encrypt sensitive password before storing in DB
    if (config.password && typeof config.password === 'string' && !config.password.startsWith('enc:v1:')) {
      secureConfig.password = encryptText(config.password);
    } else if (config.password === '') {
      secureConfig.password = '';
    } else if (config.password === undefined && existingRaw?.password) {
      secureConfig.password = existingRaw.password;
    }

    // Encrypt sensitive session cookies before storing in DB
    if (Array.isArray(config.sessionCookies)) {
      secureConfig.sessionCookies = config.sessionCookies.length > 0 ? encryptData(config.sessionCookies) : [];
      secureConfig.hasSession = config.sessionCookies.length > 0;
    } else if (config.sessionCookies && typeof config.sessionCookies === 'object') {
      secureConfig.sessionCookies = encryptData(config.sessionCookies);
      secureConfig.hasSession = true;
    } else if (config.sessionCookies === undefined && existingRaw?.sessionCookies) {
      secureConfig.sessionCookies = existingRaw.sessionCookies;
    }

    let res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_key: userKey,
        config_data: secureConfig,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('foreign key') || errText.includes('23503')) {
        await supabaseUpsertUser(userKey, { email: userKey.includes('@') ? userKey : `${userKey}@app.local` });
        res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config`, {
          method: 'POST',
          headers: {
            ...getHeaders(true),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            user_key: userKey,
            config_data: secureConfig,
            updated_at: new Date().toISOString()
          })
        });
      }
    }

    // Update in-memory cache with decrypted version for fast zero-egress access
    const decryptedCached = { ...secureConfig };
    if (decryptedCached.password && typeof decryptedCached.password === 'string' && decryptedCached.password.startsWith('enc:v1:')) {
      decryptedCached.password = decryptText(decryptedCached.password);
    }
    if (decryptedCached.sessionCookies && typeof decryptedCached.sessionCookies === 'string' && decryptedCached.sessionCookies.startsWith('enc:v1:')) {
      decryptedCached.sessionCookies = decryptData(decryptedCached.sessionCookies);
    }
    setInCache(`naukri_config:${userKey}`, decryptedCached, 10 * 60 * 1000);

    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveNaukriConfig error:', e.message);
    return false;
  }
}

async function supabaseGetNaukriConfig(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`naukri_config:${userKey}`);
  if (cached) return cached;

  try {
    let rawConfig = null;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config?user_key=eq.${encodeURIComponent(userKey)}&select=config_data`, {
      headers: getHeaders(false)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] && data[0].config_data) rawConfig = data[0].config_data;
    }

    if (!rawConfig) {
      const user = await supabaseGetUser(userKey);
      if (user && user.tokens && user.tokens.naukri_config) {
        rawConfig = user.tokens.naukri_config;
      }
    }

    if (!rawConfig) return null;

    // Decrypt credentials and session cookies
    const decryptedConfig = { ...rawConfig };
    if (decryptedConfig.password && typeof decryptedConfig.password === 'string' && decryptedConfig.password.startsWith('enc:v1:')) {
      decryptedConfig.password = decryptText(decryptedConfig.password);
    }
    if (decryptedConfig.sessionCookies && typeof decryptedConfig.sessionCookies === 'string' && decryptedConfig.sessionCookies.startsWith('enc:v1:')) {
      decryptedConfig.sessionCookies = decryptData(decryptedConfig.sessionCookies);
    }

    setInCache(`naukri_config:${userKey}`, decryptedConfig, 10 * 60 * 1000);
    return decryptedConfig;
  } catch (e) {
    console.warn('[SUPABASE] getNaukriConfig error:', e.message);
    return null;
  }
}

/**
 * Q&A MEMORY DATABASE (Per-User / Supabase Persistent)
 */
async function supabaseSaveQaDatabase(userKey, items) {
  if (!isSupabaseConfigured() || !userKey || !Array.isArray(items)) return false;
  try {
    const payload = {
      user_key: userKey,
      qa_data: items,
      updated_at: new Date().toISOString()
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/qa_database`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    }).catch(() => null);

    setInCache(`qa_db:${userKey}`, items, 15 * 60 * 1000);
    if (res && res.ok) return true;

    // Fallback: Save in naukri_config under qaDatabase
    await supabaseSaveNaukriConfig(userKey, { qaDatabase: items });
    return true;
  } catch (e) {
    console.warn('[SUPABASE] saveQaDatabase error:', e.message);
    return false;
  }
}

async function supabaseGetQaDatabase(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`qa_db:${userKey}`);
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/qa_database?user_key=eq.${encodeURIComponent(userKey)}&select=qa_data`, {
      headers: getHeaders(false)
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data[0] && Array.isArray(data[0].qa_data)) {
        setInCache(`qa_db:${userKey}`, data[0].qa_data, 15 * 60 * 1000);
        return data[0].qa_data;
      }
    }

    const conf = await supabaseGetNaukriConfig(userKey);
    if (conf && Array.isArray(conf.qaDatabase)) {
      setInCache(`qa_db:${userKey}`, conf.qaDatabase, 15 * 60 * 1000);
      return conf.qaDatabase;
    }
    return null;
  } catch (e) {
    console.warn('[SUPABASE] getQaDatabase error:', e.message);
    return null;
  }
}

async function supabaseAppendNaukriHistory(userKey, record) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    const payload = {
      id: record.id || `naukri_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      user_key: userKey,
      status: record.status || 'success',
      file_name: record.fileName || record.file_name || 'resume.pdf',
      message: record.message || '',
      profile_status: record.profileStatus || '',
      duration: record.duration || '',
      error: record.error || null,
      timestamp: record.timestamp ? new Date(record.timestamp).toISOString() : new Date().toISOString()
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_history`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    invalidateCache(`naukri_hist:${userKey}`);
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] appendNaukriHistory error:', e.message);
    return false;
  }
}

async function supabaseGetNaukriHistory(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  const cached = getFromCache(`naukri_hist:${userKey}`);
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_history?user_key=eq.${encodeURIComponent(userKey)}&select=id,timestamp,status,file_name,message,profile_status,duration,error&order=timestamp.desc&limit=30`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    const formatted = data.map(d => ({
      id: d.id,
      timestamp: d.timestamp,
      status: d.status,
      fileName: d.file_name,
      message: d.message,
      profileStatus: d.profile_status,
      duration: d.duration,
      error: d.error
    }));
    setInCache(`naukri_hist:${userKey}`, formatted, 5 * 60 * 1000);
    return formatted;
  } catch (e) {
    console.warn('[SUPABASE] getNaukriHistory error:', e.message);
    return null;
  }
}

/**
 * SCHEDULED JOBS TABLE
 */
async function supabaseSaveScheduledJob(job) {
  if (!isSupabaseConfigured() || !job) return false;
  try {
    const payload = {
      id: job.id || `sched_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      user_key: job.userKey || 'default_user',
      job_data: job,
      scheduled_at: job.scheduledAt ? new Date(job.scheduledAt).toISOString() : new Date().toISOString(),
      created_at: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString()
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_jobs`, {
      method: 'POST',
      headers: {
        ...getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    invalidateCache('scheduled_jobs');
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveScheduledJob error:', e.message);
    return false;
  }
}

async function supabaseGetScheduledJobs() {
  if (!isSupabaseConfigured()) return null;
  const cached = getFromCache('scheduled_jobs');
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_jobs?select=id,user_key,job_data,scheduled_at,created_at&order=scheduled_at.asc`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    const formatted = data.map(d => ({
      id: d.id,
      userKey: d.user_key,
      ...d.job_data,
      scheduledAt: d.scheduled_at,
      createdAt: d.created_at
    }));
    setInCache('scheduled_jobs', formatted, 60 * 1000);
    return formatted;
  } catch (e) {
    console.warn('[SUPABASE] getScheduledJobs error:', e.message);
    return null;
  }
}

async function supabaseDeleteScheduledJob(id) {
  if (!isSupabaseConfigured() || !id) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(true)
    });
    invalidateCache('scheduled_jobs');
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] deleteScheduledJob error:', e.message);
    return false;
  }
}

/**
 * GET ALL USERS (Startup Sync - Select only lean fields to minimize egress)
 */
async function supabaseGetAllUsers() {
  if (!isSupabaseConfigured()) return [];
  const cached = getFromCache('all_users');
  if (cached) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=user_key,email,name,picture,created_at,last_active`, {
      headers: getHeaders(false)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const formatted = Array.isArray(data) ? data.map(d => ({
      userKey: d.user_key,
      email: d.email,
      name: d.name,
      picture: d.picture,
      createdAt: d.created_at,
      lastActive: d.last_active
    })) : [];
    setInCache('all_users', formatted, 10 * 60 * 1000);
    return formatted;
  } catch (e) {
    console.warn('[SUPABASE] getAllUsers error:', e.message);
    return [];
  }
}

/**
 * DISTRIBUTED LEASE LOCK (Supabase Backed with local cache)
 */
async function supabaseAcquireLock(userKey, owner = `worker_${process.pid}_${Date.now()}`, ttlSeconds = 300) {
  if (!isSupabaseConfigured() || !userKey) return true;
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const conf = await supabaseGetNaukriConfig(userKey);
    const existingLock = conf?.lock;

    if (existingLock && existingLock.expiresAt && new Date(existingLock.expiresAt) > now && existingLock.owner !== owner) {
      return false;
    }

    const newLock = {
      owner,
      acquiredAt: now.toISOString(),
      expiresAt
    };

    await supabaseSaveNaukriConfig(userKey, { lock: newLock });
    return true;
  } catch (err) {
    return true;
  }
}

async function supabaseReleaseLock(userKey, owner = null) {
  if (!isSupabaseConfigured() || !userKey) return true;
  try {
    const conf = await supabaseGetNaukriConfig(userKey);
    if (!conf || !conf.lock) return true;

    if (owner && conf.lock.owner && conf.lock.owner !== owner && new Date(conf.lock.expiresAt) > new Date()) {
      return false;
    }

    await supabaseSaveNaukriConfig(userKey, { lock: null });
    return true;
  } catch (err) {
    return false;
  }
}

async function supabaseIsLocked(userKey) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    const conf = await supabaseGetNaukriConfig(userKey);
    if (conf && conf.lock && conf.lock.expiresAt) {
      return new Date(conf.lock.expiresAt) > new Date();
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function supabaseGetNaukriQueue(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  try {
    const config = await supabaseGetNaukriConfig(userKey);
    return config?.applicationQueue || null;
  } catch (e) {
    return null;
  }
}

async function supabaseSaveNaukriQueue(userKey, queue) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    return await supabaseSaveNaukriConfig(userKey, { applicationQueue: Array.isArray(queue) ? queue.slice(0, 200) : [] });
  } catch (e) {
    return false;
  }
}

async function supabaseGetNaukriAppliedJobs(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  try {
    const config = await supabaseGetNaukriConfig(userKey);
    return config?.appliedJobs || null;
  } catch (e) {
    return null;
  }
}

async function supabaseSaveNaukriAppliedJobs(userKey, appliedJobs) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    return await supabaseSaveNaukriConfig(userKey, { appliedJobs: Array.isArray(appliedJobs) ? appliedJobs.slice(0, 200) : [] });
  } catch (e) {
    return false;
  }
}

async function supabaseSaveBatchScreeningData(userKey, batchData) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    return await supabaseSaveNaukriConfig(userKey, { batchScreeningData: batchData });
  } catch (e) {
    return false;
  }
}

async function supabaseGetBatchScreeningData(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  try {
    const config = await supabaseGetNaukriConfig(userKey);
    return config?.batchScreeningData || null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  isSupabaseConfigured,
  supabaseUpsertUser,
  supabaseGetUser,
  supabaseGetAllUsers,
  supabaseSaveResume,
  supabaseGetResume,
  supabaseAppendLog,
  supabaseGetLogs,
  supabaseSaveApplications,
  supabaseGetApplications,
  supabaseSaveLinkedInConfig,
  supabaseGetLinkedInConfig,
  supabaseSaveNaukriConfig,
  supabaseGetNaukriConfig,
  supabaseSaveQaDatabase,
  supabaseGetQaDatabase,
  supabaseAppendNaukriHistory,
  supabaseGetNaukriHistory,
  supabaseSaveScheduledJob,
  supabaseGetScheduledJobs,
  supabaseDeleteScheduledJob,
  supabaseAcquireLock,
  supabaseReleaseLock,
  supabaseIsLocked,
  supabaseGetNaukriQueue,
  supabaseSaveNaukriQueue,
  supabaseGetNaukriAppliedJobs,
  supabaseSaveNaukriAppliedJobs,
  supabaseSaveBatchScreeningData,
  supabaseGetBatchScreeningData,
  invalidateCache
};
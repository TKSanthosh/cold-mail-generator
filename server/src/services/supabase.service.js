const path = require('path');
const { encryptData, decryptData, encryptText, decryptText } = require('./crypto.service');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gnuezthgywjfbalrcnbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_dDMl14z59IIbxq2utpKMmQ_HrISgSU9';

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http'));
}

function getHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
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
      email: profile.email || '',
      name: profile.name || 'Candidate',
      picture: profile.picture || '',
      last_active: new Date().toISOString()
    };
    if (tokens) payload.tokens = tokens;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[SUPABASE] upsertUser warning:', err);
      return null;
    }
    const data = await res.json();
    return data && data[0] ? data[0] : null;
  } catch (e) {
    console.warn('[SUPABASE] upsertUser error:', e.message);
    return null;
  }
}

async function supabaseGetUser(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?user_key=eq.${encodeURIComponent(userKey)}&select=*`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const d = data[0];
    return {
      userKey: d.user_key,
      email: d.email,
      name: d.name,
      picture: d.picture,
      tokens: d.tokens,
      createdAt: d.created_at,
      lastActive: d.last_active
    };
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
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      // If user record doesn't exist yet, create user and retry
      if (errText.includes('foreign key') || errText.includes('23503')) {
        await supabaseUpsertUser(userKey, { email: userKey.includes('@') ? userKey : '' });
        res = await fetch(`${SUPABASE_URL}/rest/v1/resumes`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(payload)
        });
      } else {
        console.warn('[SUPABASE] saveResume warning:', errText);
      }
    }
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveResume error:', e.message);
    return false;
  }
}

async function supabaseGetResume(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/resumes?user_key=eq.${encodeURIComponent(userKey)}&select=*`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      // Fallback with select=resume_data
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/resumes?user_key=eq.${encodeURIComponent(userKey)}&select=resume_data`, {
        headers: getHeaders()
      });
      if (!res2.ok) return null;
      const data2 = await res2.json();
      if (!data2 || data2.length === 0) return null;
      return data2[0].resume_data || data2[0];
    }
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const row = data[0];
    if (row.resume_data !== undefined) {
      if (typeof row.resume_data === 'string') {
        try {
          return JSON.parse(row.resume_data);
        } catch (e) {
          return row.resume_data;
        }
      }
      return row.resume_data;
    }
    return row;
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
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] appendLog error:', e.message);
    return false;
  }
}

async function supabaseGetLogs(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=timestamp.desc`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    return data.map(d => ({
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
    const rows = applications.map(app => ({
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
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveApplications error:', e.message);
    return false;
  }
}

async function supabaseGetApplications(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/applications?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=timestamp.desc`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    return data.map(d => ({
      id: d.id,
      company: d.company,
      role: d.role,
      jdSnippet: d.jd_snippet,
      tailoredResume: d.tailored_resume,
      matchedSkills: d.matched_skills,
      timestamp: d.timestamp
    }));
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
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        id: 'global_config',
        config_data: config,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveLinkedInConfig error:', e.message);
    return false;
  }
}

async function supabaseGetLinkedInConfig() {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/linkedin_config?id=eq.global_config&select=config_data`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data[0] ? data[0].config_data : null;
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
    // 1. Fetch existing cloud config to merge and avoid overwriting session cookies / passwords with undefined
    let existingRaw = null;
    try {
      const getRes = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config?user_key=eq.${encodeURIComponent(userKey)}&select=config_data`, {
        headers: getHeaders()
      });
      if (getRes.ok) {
        const d = await getRes.json();
        if (d && d[0] && d[0].config_data) existingRaw = d[0].config_data;
      }
    } catch (e) {}

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
        ...getHeaders(),
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
      // If user record doesn't exist yet, auto-provision user and retry
      if (errText.includes('foreign key') || errText.includes('23503')) {
        await supabaseUpsertUser(userKey, { email: userKey.includes('@') ? userKey : '' });
        res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
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

    if (res.ok) return true;

    // Fallback: Store into users.tokens.naukri_config if standalone table is not yet created
    const user = await supabaseGetUser(userKey);
    if (user) {
      const updatedTokens = { ...(user.tokens || {}), naukri_config: secureConfig };
      await supabaseUpsertUser(userKey, user, updatedTokens);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[SUPABASE] saveNaukriConfig error:', e.message);
    return false;
  }
}

async function supabaseGetNaukriConfig(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    let rawConfig = null;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config?user_key=eq.${encodeURIComponent(userKey)}&select=config_data`, {
      headers: getHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] && data[0].config_data) rawConfig = data[0].config_data;
    }

    if (!rawConfig) {
      // Fallback: Retrieve from users.tokens.naukri_config
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

    return decryptedConfig;
  } catch (e) {
    console.warn('[SUPABASE] getNaukriConfig error:', e.message);
    return null;
  }
}

async function supabaseAppendNaukriHistory(userKey, record) {
  if (!isSupabaseConfigured()) return false;
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
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] appendNaukriHistory error:', e.message);
    return false;
  }
}

async function supabaseGetNaukriHistory(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_history?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=timestamp.desc&limit=50`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    return data.map(d => ({
      id: d.id,
      timestamp: d.timestamp,
      status: d.status,
      fileName: d.file_name,
      message: d.message,
      profileStatus: d.profile_status,
      duration: d.duration,
      error: d.error
    }));
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
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveScheduledJob error:', e.message);
    return false;
  }
}

async function supabaseGetScheduledJobs() {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_jobs?select=*&order=scheduled_at.asc`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    return data.map(d => ({
      id: d.id,
      userKey: d.user_key,
      ...d.job_data,
      scheduledAt: d.scheduled_at,
      createdAt: d.created_at
    }));
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
      headers: getHeaders()
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] deleteScheduledJob error:', e.message);
    return false;
  }
}

/**
 * GET ALL USERS (Startup Sync)
 */
async function supabaseGetAllUsers() {
  if (!isSupabaseConfigured()) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*`, {
      headers: getHeaders()
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(d => ({
      userKey: d.user_key,
      email: d.email,
      name: d.name,
      picture: d.picture,
      tokens: d.tokens,
      createdAt: d.created_at,
      lastActive: d.last_active
    })) : [];
  } catch (e) {
    console.warn('[SUPABASE] getAllUsers error:', e.message);
    return [];
  }
}

async function supabaseSaveQaDatabase(userKey, qaItems) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    const config = await supabaseGetNaukriConfig(userKey) || {};
    return await supabaseSaveNaukriConfig(userKey, { ...config, qaItems });
  } catch (e) {
    console.warn('[SUPABASE] saveQaDatabase error:', e.message);
    return false;
  }
}

async function supabaseGetQaDatabase(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  try {
    const config = await supabaseGetNaukriConfig(userKey);
    if (config && Array.isArray(config.qaItems) && config.qaItems.length > 0) {
      return config.qaItems;
    }
    return null;
  } catch (e) {
    console.warn('[SUPABASE] getQaDatabase error:', e.message);
    return null;
  }
}

/**
 * DISTRIBUTED LEASE LOCK (Supabase Backed)
 */
async function supabaseAcquireLock(userKey, owner = `worker_${process.pid}_${Date.now()}`, ttlSeconds = 300) {
  if (!isSupabaseConfigured() || !userKey) return true; // Local single-instance fallback
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const conf = await supabaseGetNaukriConfig(userKey);
    const existingLock = conf?.lock;

    if (existingLock && existingLock.expiresAt && new Date(existingLock.expiresAt) > now && existingLock.owner !== owner) {
      console.log(`[DISTRIBUTED LOCK] User "${userKey}" is currently locked by owner "${existingLock.owner}" until ${existingLock.expiresAt}. Skipping duplicate run.`);
      return false;
    }

    const newLock = {
      owner,
      acquiredAt: now.toISOString(),
      expiresAt
    };

    await supabaseSaveNaukriConfig(userKey, { lock: newLock });
    console.log(`[DISTRIBUTED LOCK] Acquired lock for user "${userKey}" (Owner: "${owner}", TTL: ${ttlSeconds}s, Expires: ${expiresAt}).`);
    return true;
  } catch (err) {
    console.warn(`[DISTRIBUTED LOCK WARNING] Error acquiring lock for ${userKey}: ${err.message}`);
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
    console.log(`[DISTRIBUTED LOCK] Released lock for user "${userKey}".`);
    return true;
  } catch (err) {
    console.warn(`[DISTRIBUTED LOCK WARNING] Error releasing lock for ${userKey}: ${err.message}`);
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
    if (config && Array.isArray(config.applicationQueue)) {
      return config.applicationQueue;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function supabaseSaveNaukriQueue(userKey, queue) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    return await supabaseSaveNaukriConfig(userKey, { applicationQueue: Array.isArray(queue) ? queue.slice(0, 500) : [] });
  } catch (e) {
    return false;
  }
}

async function supabaseGetNaukriAppliedJobs(userKey) {
  if (!isSupabaseConfigured() || !userKey) return null;
  try {
    const config = await supabaseGetNaukriConfig(userKey);
    if (config && Array.isArray(config.appliedJobs)) {
      return config.appliedJobs;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function supabaseSaveNaukriAppliedJobs(userKey, appliedJobs) {
  if (!isSupabaseConfigured() || !userKey) return false;
  try {
    return await supabaseSaveNaukriConfig(userKey, { appliedJobs: Array.isArray(appliedJobs) ? appliedJobs.slice(0, 500) : [] });
  } catch (e) {
    return false;
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
  supabaseSaveNaukriAppliedJobs
};
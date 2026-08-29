const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

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
  if (!isSupabaseConfigured()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/resumes`, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_key: userKey,
        resume_data: resumeData,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveResume error:', e.message);
    return false;
  }
}

async function supabaseGetResume(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/resumes?user_key=eq.${encodeURIComponent(userKey)}&select=resume_data`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data[0] ? data[0].resume_data : null;
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
  if (!isSupabaseConfigured()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config`, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_key: userKey,
        config_data: config,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (e) {
    console.warn('[SUPABASE] saveNaukriConfig error:', e.message);
    return false;
  }
}

async function supabaseGetNaukriConfig(userKey) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/naukri_config?user_key=eq.${encodeURIComponent(userKey)}&select=config_data`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data[0] ? data[0].config_data : null;
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
      file_name: record.fileName || 'santhosh_t_k_resume.pdf',
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

module.exports = {
  isSupabaseConfigured,
  supabaseUpsertUser,
  supabaseGetUser,
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
  supabaseAppendNaukriHistory,
  supabaseGetNaukriHistory
};
/**
 * COLD REACH AI - ADMIN MONITORING & ACTIVITY SERVICE
 * Exclusively for tksanthosh494@gmail.com
 */

const fs = require('fs');
const path = require('path');
const {
  USERS_DIR,
  getUserPaths,
  getUserProfile,
  getUserResume,
  getUserLogs,
  getUserApplications,
  isUserAuthorized
} = require('./user.service');
const {
  isSupabaseConfigured,
  supabaseGetLogs,
  supabaseGetApplications,
  supabaseGetNaukriConfig
} = require('./supabase.service');
const { getNaukriConfig, getNaukriHistory } = require('./naukri.service');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function getSupabaseHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Fetch all registered users from Supabase + Local Sandbox
 */
async function getAllUsers() {
  const usersMap = new Map();

  // 1. Fetch from Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*&order=last_active.desc`, {
        headers: getSupabaseHeaders()
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          rows.forEach(r => {
            usersMap.set(r.user_key, {
              userKey: r.user_key,
              email: r.email,
              name: r.name || r.email.split('@')[0],
              picture: r.picture || null,
              createdAt: r.created_at,
              lastActive: r.last_active,
              hasTokens: !!(r.tokens && (r.tokens.access_token || r.tokens.refresh_token))
            });
          });
        }
      }
    } catch (e) {
      console.warn('[ADMIN SERVICE] Supabase users fetch warning:', e.message);
    }
  }

  // 2. Fetch from Local Sandbox directories
  if (fs.existsSync(USERS_DIR)) {
    const entries = fs.readdirSync(USERS_DIR, { withFileTypes: true });
    entries.forEach(entry => {
      if (entry.isDirectory()) {
        const key = entry.name;
        const profile = getUserProfile(key);
        const paths = getUserPaths(key);
        let statTime = null;
        try {
          statTime = fs.statSync(paths.profilePath).mtime.toISOString();
        } catch (e) {}

        if (profile && !usersMap.has(key)) {
          usersMap.set(key, {
            userKey: key,
            email: profile.email || `${key.replace(/_/g, '.')}@gmail.com`,
            name: profile.name || 'User',
            picture: profile.picture || null,
            createdAt: statTime || new Date().toISOString(),
            lastActive: statTime || new Date().toISOString(),
            hasTokens: isUserAuthorized(key)
          });
        }
      }
    });
  }

  return Array.from(usersMap.values());
}

/**
 * Compile detailed overview & live activity stream across all users
 */
async function getAdminOverview() {
  const users = await getAllUsers();
  const allActivities = [];
  let totalEmailsSent = 0;
  let totalResumesTailored = 0;
  let activeNaukriBoosters = 0;

  const enrichedUsers = await Promise.all(
    users.map(async (u) => {
      const logs = getUserLogs(u.userKey) || [];
      const apps = getUserApplications(u.userKey) || [];
      const naukriConf = getNaukriConfig(u.userKey) || {};
      const naukriHist = getNaukriHistory(u.userKey) || [];

      const sentCount = logs.filter(l => (l.status || '').toLowerCase().includes('sent')).length;
      totalEmailsSent += sentCount;
      totalResumesTailored += apps.length;

      if (naukriConf.enabled) {
        activeNaukriBoosters++;
      }

      // Collect user activities
      logs.forEach(l => {
        allActivities.push({
          id: l.id || `act_log_${Math.random()}`,
          type: 'email_outreach',
          userKey: u.userKey,
          userEmail: u.email,
          userName: u.name,
          title: `Sent cold email to ${l.company || 'Company'} (${l.hrEmail || l.email || 'HR'})`,
          details: l.subject || 'Application Inquiry',
          status: l.status || 'Sent',
          timestamp: l.timestamp || new Date().toISOString()
        });
      });

      apps.forEach(a => {
        allActivities.push({
          id: a.id || `act_app_${Math.random()}`,
          type: 'resume_tailored',
          userKey: u.userKey,
          userEmail: u.email,
          userName: u.name,
          title: `Tailored ATS Resume for ${a.role || 'Role'} at ${a.company || 'Company'}`,
          details: a.jdSnippet ? `${a.jdSnippet.slice(0, 100)}...` : 'JD Analysis',
          status: 'Generated',
          timestamp: a.timestamp || new Date().toISOString()
        });
      });

      naukriHist.forEach(h => {
        allActivities.push({
          id: h.id || `act_naukri_${Math.random()}`,
          type: 'naukri_boost',
          userKey: u.userKey,
          userEmail: u.email,
          userName: u.name,
          title: `Naukri Profile Boosted as ${h.fileName || 'resume.pdf'}`,
          details: h.message || 'Active Just Now refreshed',
          status: h.status || 'success',
          timestamp: h.timestamp || new Date().toISOString()
        });
      });

      return {
        ...u,
        isAuthorized: isUserAuthorized(u.userKey),
        totalEmailsSent: sentCount,
        totalTailoredResumes: apps.length,
        naukriConfig: {
          enabled: !!naukriConf.enabled,
          username: naukriConf.username || '',
          scheduleMode: naukriConf.scheduleMode || 'quarter_day',
          lastUploadAt: naukriConf.lastUploadAt || null,
          nextUploadAt: naukriConf.nextUploadAt || null,
          lastStatus: naukriConf.lastStatus || null
        }
      };
    })
  );

  // Sort activities newest first
  allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    metrics: {
      totalUsers: users.length,
      totalEmailsSent,
      totalResumesTailored,
      activeNaukriBoosters
    },
    users: enrichedUsers,
    activities: allActivities.slice(0, 100),
    systemTime: new Date().toISOString()
  };
}

/**
 * Get detailed deep dive for a single user
 */
async function getAdminUserDetails(userKey) {
  const profile = getUserProfile(userKey);
  const resume = getUserResume(userKey);
  const logs = getUserLogs(userKey) || [];
  const applications = getUserApplications(userKey) || [];
  const naukriConfig = getNaukriConfig(userKey) || {};
  const naukriHistory = getNaukriHistory(userKey) || [];

  return {
    userKey,
    profile,
    resume,
    logs,
    applications,
    naukriConfig,
    naukriHistory,
    isAuthorized: isUserAuthorized(userKey)
  };
}

module.exports = {
  getAdminOverview,
  getAdminUserDetails
};
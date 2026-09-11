const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { sendGmail } = require('./mail.service');
const { addUserLog, getUserPaths, isUserAuthorized } = require('./user.service');
const { broadcastErrorAlert } = require('./notification.service');

const {
  isSupabaseConfigured,
  supabaseSaveScheduledJob,
  supabaseGetScheduledJobs,
  supabaseDeleteScheduledJob
} = require('./supabase.service');

const SCHEDULE_FILE = path.join(__dirname, '../../scheduled.json');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

if (!fs.existsSync(SCHEDULE_FILE)) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([], null, 2), 'utf8');
}

// In-memory mutex queue for thread-safe schedule operations
let scheduleMutex = Promise.resolve();

function withScheduleLock(fn) {
  const next = scheduleMutex.then(fn, fn);
  scheduleMutex = next.catch(() => {});
  return next;
}

function getScheduledJobsLocal() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveScheduledJobsLocal(jobs) {
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  } catch (e) {
    console.error('[SCHEDULER] Error writing scheduled.json:', e.message);
  }
}

async function getScheduledJobsAsync(userKey = null) {
  return withScheduleLock(async () => {
    if (isSupabaseConfigured()) {
      try {
        const dbJobs = await supabaseGetScheduledJobs(userKey);
        if (Array.isArray(dbJobs)) {
          saveScheduledJobsLocal(dbJobs);
          return userKey ? dbJobs.filter(j => j.userKey === userKey) : dbJobs;
        }
      } catch (e) {
        console.warn('[SCHEDULER DB SYNC WARN]', e.message);
      }
    }
    const local = getScheduledJobsLocal();
    return userKey ? local.filter(j => j.userKey === userKey) : local;
  });
}

function getScheduledJobs(userKey = null) {
  const local = getScheduledJobsLocal();
  return userKey ? local.filter(j => j.userKey === userKey) : local;
}

function saveScheduledJobs(jobs) {
  return withScheduleLock(async () => {
    saveScheduledJobsLocal(jobs);
  });
}

async function addScheduledJobAsync(job) {
  return withScheduleLock(async () => {
    const jobs = getScheduledJobsLocal();
    const newJob = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
      userKey: job.userKey || 'default_user',
      ...job
    };
    jobs.push(newJob);
    saveScheduledJobsLocal(jobs);

    if (isSupabaseConfigured()) {
      await supabaseSaveScheduledJob(newJob).catch(() => {});
    }

    return newJob;
  });
}

function addScheduledJob(job) {
  const jobs = getScheduledJobsLocal();
  const newJob = {
    id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    userKey: job.userKey || 'default_user',
    ...job
  };
  jobs.push(newJob);
  saveScheduledJobsLocal(jobs);

  if (isSupabaseConfigured()) {
    supabaseSaveScheduledJob(newJob).catch(() => {});
  }

  return newJob;
}

async function cancelScheduledJobAsync(id, userKey = null) {
  return withScheduleLock(async () => {
    let jobs = getScheduledJobsLocal();
    jobs = jobs.filter(j => {
      if (j.id !== id) return true;
      if (userKey && j.userKey && j.userKey !== userKey) return true; // Prevent cross-user deletion
      return false;
    });
    saveScheduledJobsLocal(jobs);

    if (isSupabaseConfigured()) {
      await supabaseDeleteScheduledJob(id).catch(() => {});
    }

    return true;
  });
}

function cancelScheduledJob(id) {
  let jobs = getScheduledJobsLocal();
  jobs = jobs.filter(j => j.id !== id);
  saveScheduledJobsLocal(jobs);

  if (isSupabaseConfigured()) {
    supabaseDeleteScheduledJob(id).catch(() => {});
  }

  return true;
}

// Background scheduler ticker (runs every 15 seconds)
function initScheduler() {
  setInterval(async () => {
    await withScheduleLock(async () => {
      const jobs = getScheduledJobsLocal();
      if (!jobs || jobs.length === 0) return;

      const now = new Date();
      const remainingJobs = [];

      for (const job of jobs) {
        const targetTime = new Date(job.scheduledAt);
        if (targetTime <= now) {
          const userKey = job.userKey || 'default_user';
          console.log(`[SCHEDULER] Triggering scheduled outreach dispatch for: ${job.email} (User: ${userKey})`);

          if (!isUserAuthorized(userKey)) {
            console.warn(`[SCHEDULER WARN] User "${userKey}" not authorized or missing Gmail tokens. Skipping job.`);
            remainingJobs.push(job);
            continue;
          }

          const userPaths = getUserPaths(userKey);
          const tempPdfPath = path.join(userPaths.uploadsDir || UPLOADS_DIR, `Scheduled_Resume_${Date.now()}.pdf`);

          try {
            // 1. Generate 1-page PDF
            await generateResumePdf(job.resume, tempPdfPath);

            // 2. Send via Gmail using user's OAuth tokens
            await sendGmail(job.email, job.subject, job.body, tempPdfPath, userKey);

            // 3. Cleanup temp file
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

            // 4. Record to user outreach logs
            addUserLog(userKey, {
              hrEmail: job.email,
              email: job.email,
              hrName: job.hrName || 'Hiring Manager',
              company: job.company || 'Company',
              subject: job.subject,
              body: job.body,
              resumeType: job.resumeType || 'Tailored',
              tailoredSummary: job.resume?.summary || '',
              status: 'Sent (10:00 AM Scheduled Dispatch)'
            });

            if (isSupabaseConfigured() && job.id) {
              supabaseDeleteScheduledJob(job.id).catch(() => {});
            }
          } catch (err) {
            console.error(`[SCHEDULER ERROR] Failed to send scheduled email to ${job.email}:`, err.message);
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

            if (isSupabaseConfigured() && job.id) {
              supabaseDeleteScheduledJob(job.id).catch(() => {});
            }

            addUserLog(userKey, {
              hrEmail: job.email,
              email: job.email,
              hrName: job.hrName || 'Hiring Manager',
              company: job.company || 'Company',
              subject: job.subject,
              body: job.body,
              resumeType: job.resumeType || 'Tailored',
              tailoredSummary: job.resume?.summary || '',
              status: `Failed (Scheduled): ${err.message}`
            });

            // Broadcast error alert to user
            broadcastErrorAlert('Scheduled Email Dispatch Failed', `Email to ${job.email} (${job.company}) failed: ${err.message}`, err.message, userKey).catch(() => {});
          }
        } else {
          remainingJobs.push(job);
        }
      }

      if (remainingJobs.length !== jobs.length) {
        saveScheduledJobsLocal(remainingJobs);
      }
    });
  }, 15000);
}

module.exports = {
  getScheduledJobs,
  getScheduledJobsAsync,
  saveScheduledJobs,
  addScheduledJob,
  addScheduledJobAsync,
  cancelScheduledJob,
  cancelScheduledJobAsync,
  initScheduler
};

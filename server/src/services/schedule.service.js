const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { sendGmail } = require('./mail.service');
const { addUserLog, getUserPaths } = require('./user.service');

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

function getScheduledJobs() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveScheduledJobs(jobs) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(jobs, null, 2), 'utf8');
}

function addScheduledJob(job) {
  const jobs = getScheduledJobs();
  const newJob = {
    id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    ...job
  };
  jobs.push(newJob);
  saveScheduledJobs(jobs);

  if (isSupabaseConfigured()) {
    supabaseSaveScheduledJob(newJob).catch(() => {});
  }

  return newJob;
}

function cancelScheduledJob(id) {
  let jobs = getScheduledJobs();
  jobs = jobs.filter(j => j.id !== id);
  saveScheduledJobs(jobs);

  if (isSupabaseConfigured()) {
    supabaseDeleteScheduledJob(id).catch(() => {});
  }

  return true;
}

// Background scheduler ticker (runs every 15 seconds)
function initScheduler() {
  setInterval(async () => {
    const jobs = getScheduledJobs();
    if (!jobs || jobs.length === 0) return;

    const now = new Date();
    const remainingJobs = [];

    for (const job of jobs) {
      const targetTime = new Date(job.scheduledAt);
      if (targetTime <= now) {
        console.log(`[SCHEDULER] Triggering scheduled 10:00 AM dispatch for: ${job.email} (User: ${job.userKey || 'default'})`);
        const userKey = job.userKey || 'tksanthosh494_gmail_com';
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
        }
      } else {
        remainingJobs.push(job);
      }
    }

    if (remainingJobs.length !== jobs.length) {
      saveScheduledJobs(remainingJobs);
    }
  }, 15000);
}

module.exports = {
  getScheduledJobs,
  addScheduledJob,
  cancelScheduledJob,
  initScheduler
};

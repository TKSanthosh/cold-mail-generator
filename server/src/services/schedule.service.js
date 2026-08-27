const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { sendGmail } = require('./mail.service');

const SCHEDULE_FILE = path.join(__dirname, '../../scheduled.json');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

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
  return newJob;
}

function cancelScheduledJob(id) {
  let jobs = getScheduledJobs();
  jobs = jobs.filter(j => j.id !== id);
  saveScheduledJobs(jobs);
  return true;
}

// Background scheduler ticker (runs every 20 seconds)
function initScheduler(addLogCallback) {
  setInterval(async () => {
    const jobs = getScheduledJobs();
    if (jobs.length === 0) return;

    const now = new Date();
    const remainingJobs = [];

    for (const job of jobs) {
      const targetTime = new Date(job.scheduledAt);
      if (targetTime <= now) {
        console.log(`[SCHEDULER] Triggering scheduled morning dispatch to: ${job.email}`);
        const tempPdfPath = path.join(UPLOADS_DIR, `Scheduled_Resume_${Date.now()}.pdf`);
        try {
          // 1. Generate PDF
          await generateResumePdf(job.resume, tempPdfPath);

          // 2. Send via Gmail
          await sendGmail(job.email, job.subject, job.body, tempPdfPath);

          // 3. Cleanup
          if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

          // 4. Log
          if (addLogCallback) {
            addLogCallback({
              hrEmail: job.email,
              hrName: job.hrName || 'Hiring Manager',
              company: job.company || 'Company',
              subject: job.subject,
              body: job.body,
              resumeType: job.resumeType || 'Tailored',
              tailoredSummary: job.resume?.summary || '',
              status: 'Success (Scheduled Morning Dispatch)'
            });
          }
        } catch (err) {
          console.error(`[SCHEDULER ERROR] Failed to send scheduled email to ${job.email}:`, err);
          if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
          if (addLogCallback) {
            addLogCallback({
              hrEmail: job.email,
              hrName: job.hrName || 'Hiring Manager',
              company: job.company || 'Company',
              subject: job.subject,
              body: job.body,
              resumeType: job.resumeType || 'Tailored',
              tailoredSummary: job.resume?.summary || '',
              status: `Failed: ${err.message}`
            });
          }
        }
      } else {
        remainingJobs.push(job);
      }
    }

    if (remainingJobs.length !== jobs.length) {
      saveScheduledJobs(remainingJobs);
    }
  }, 20000);
}

module.exports = {
  getScheduledJobs,
  addScheduledJob,
  cancelScheduledJob,
  initScheduler
};

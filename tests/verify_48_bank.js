const fs = require('fs');

const SOFT_404_INDICATORS = [
  "something's wrong",
  "can't seem to find",
  "we couldn't find",
  "page not found",
  "job not found",
  "position has been filled",
  "job has expired",
  "no longer available",
  "requisition is closed",
  "posting has expired",
  "postingavailable: false",
  '"postingavailable":false',
  '"postingavailable": false',
  "error 404"
];

async function verifyJobHasRealDetails(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (res.status !== 200) {
      return { valid: false, reason: `HTTP status ${res.status}` };
    }

    const html = await res.text().catch(() => '');
    const lower = html.toLowerCase();

    for (const indicator of SOFT_404_INDICATORS) {
      if (lower.includes(indicator)) {
        return { valid: false, reason: `Closed/invalid notice: "${indicator}"` };
      }
    }

    const hasJobPostingSchema = lower.includes('"@type":"jobposting"') || lower.includes('"@type": "jobposting"') || lower.includes("jobposting");
    const hasJobContent = (lower.includes('responsibilities') || lower.includes('description') || lower.includes('qualifications') || lower.includes('requirements') || lower.includes('deliverables') || lower.includes('what you’ll do') || lower.includes('what you will do')) && (lower.includes('apply') || lower.includes('submit'));

    if (!hasJobPostingSchema && !hasJobContent) {
      return { valid: false, reason: 'Lacks job description or apply button' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

async function run() {
  const jobs = require('./combined_bank.json');
  console.log(`Verifying all ${jobs.length} jobs in combined bank...\n`);
  let passed = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const res = await verifyJobHasRealDetails(j.url);
    if (res.valid) {
      passed++;
      console.log(`[PASS ${i + 1}/${jobs.length}] ${j.company} - ${j.role}`);
    } else {
      console.log(`[FAIL ${i + 1}/${jobs.length}] ${j.company} - ${j.role}: ${res.reason}`);
    }
  }
  console.log(`\nVerification complete: ${passed}/${jobs.length} passed.`);
  process.exit(passed === jobs.length ? 0 : 1);
}

run();

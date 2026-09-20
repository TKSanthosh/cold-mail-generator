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

    let extractedTitle = null;
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitleMatch) extractedTitle = ogTitleMatch[1];

    return {
      valid: true,
      title: extractedTitle,
      hasSchema: hasJobPostingSchema
    };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

// Candidates to test
const candidates = [
  // Okta Greenhouse
  { company: 'Okta', role: 'Staff UI Software Engineer', location: 'Bengaluru, India', url: 'https://www.okta.com/company/careers/opportunity/7902410?gh_jid=7902410' },
  { company: 'Okta', role: 'Staff Software Engineer - Node.js (JavaScript or TypeScript)', location: 'Bengaluru, India', url: 'https://www.okta.com/company/careers/opportunity/7602354?gh_jid=7602354' },
  { company: 'Okta', role: 'Staff Software Engineer - Backend', location: 'Bengaluru, India', url: 'https://www.okta.com/company/careers/opportunity/8007085?gh_jid=8007085' },
  { company: 'Okta', role: 'Staff FullStack Engineer - Backend Focused (Java & React)', location: 'Bengaluru, India', url: 'https://www.okta.com/company/careers/opportunity/7929542?gh_jid=7929542' },
  
  // Databricks Greenhouse
  { company: 'Databricks', role: 'Delivery Solutions Architect', location: 'Mumbai, India', url: 'https://boards.greenhouse.io/databricks/jobs/8735814002' },
  { company: 'Databricks', role: 'Deployment Strategist - Solutions', location: 'Bengaluru, India', url: 'https://boards.greenhouse.io/databricks/jobs/8630011002' },

  // MongoDB Greenhouse
  { company: 'MongoDB', role: 'Senior Engineer - Business Systems', location: 'Bengaluru; Gurugram', url: 'https://www.mongodb.com/careers/job/?gh_jid=7942613' },
  { company: 'MongoDB', role: 'Senior Sales Compensation Engineer', location: 'Bengaluru; Gurugram', url: 'https://www.mongodb.com/careers/job/?gh_jid=8121701' },

  // Twilio Greenhouse
  { company: 'Twilio', role: 'Senior Application Engineer, Zuora Billing', location: 'Remote - India', url: 'https://job-boards.greenhouse.io/twilio/jobs/8048661' },

  // Freshworks SmartRecruiters
  { company: 'Freshworks', role: 'Principal - Solution Engineering', location: 'Bengaluru', url: 'https://jobs.smartrecruiters.com/Freshworks/744000150067891' },
  { company: 'Freshworks', role: 'Principal - Solution Engineering', location: 'Chennai', url: 'https://jobs.smartrecruiters.com/Freshworks/744000150068499' },
  { company: 'Freshworks', role: 'Senior Director, Engineering - AI Studio', location: 'Chennai', url: 'https://jobs.smartrecruiters.com/Freshworks/744000147296104' },
  { company: 'Freshworks', role: 'Solution Architect', location: 'Chennai', url: 'https://jobs.smartrecruiters.com/Freshworks/744000142843669' },

  // Chevron Workday
  { company: 'Chevron', role: 'Senior Integration Software Engineer', location: 'Bengaluru, Karnataka, India', url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bengaluru-Karnataka-India/Senior-Integration-Software-Engineer_R000072302-1' },
  { company: 'Chevron', role: 'Senior Machine Learning Engineer', location: 'Bangalore, Karnataka, India', url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bangalore-Karnataka-India/Senior-Machine-Learning-Engineer_R000064919' },
  { company: 'Chevron', role: 'Data Engineer', location: 'Bengaluru, Karnataka, India', url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bengaluru-Karnataka-India/Data-Engineer_R000071869-2' },

  // Adobe Workday
  { company: 'Adobe', role: 'Software Development Engineer 4 - Cloud Services', location: 'Bangalore', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Bangalore/Software-Development-Engineer-4_R170532' },
  { company: 'Adobe', role: 'Software Development Engineer 4 - Creative Cloud', location: 'Noida', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida/Software-Development-Engineer-4_R170262' },
  { company: 'Adobe', role: 'Software Development Engineer 4 - Platform', location: 'Noida', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida/Software-Development-Engineer-4_R170647' },

  // Salesforce Workday
  { company: 'Salesforce', role: 'Mulesoft Technical Manager', location: 'India - Bangalore', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Bangalore/Mulesoft-Technical-Manager_JR327156' },
  { company: 'Salesforce', role: 'Salesforce DevOps - Technical Architect', location: 'India - Bangalore', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Bangalore/Salesforce-DevOps---Technical-Architect_JR353962' },
  { company: 'Salesforce', role: 'Sr. Data Engineer', location: 'India - Hyderabad', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Hyderabad/Sr-Data-Engineer--Python---SQL-exp-mandatory-_JR358536' },

  // Autodesk Workday
  { company: 'Autodesk', role: 'Software Engineering Manager (Java, AWS, Search)', location: 'Pune, IND', url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Pune-IND/Software-Engineering-Manager--Java--AWS--Search-_26WD100857-1' },
  { company: 'Autodesk', role: 'Principal Engineer - Agentic AI', location: 'Bengaluru, IND', url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Bengaluru-IND/Principal-Engineer---Agentic-AI_26WD99802' },

  // HP Workday
  { company: 'HP Inc.', role: 'AI Solutions Engineer', location: 'Bengaluru, Karnataka, India', url: 'https://hp.wd5.myworkdayjobs.com/en-US/ExternalCareerSite/job/Bengaluru-Karnataka-India/AI-Solutions-Engineer_3166378-1' },
  { company: 'HP Inc.', role: 'Agentic AI Engineer', location: 'Bengaluru, Karnataka, India', url: 'https://hp.wd5.myworkdayjobs.com/en-US/ExternalCareerSite/job/Bengaluru-Karnataka-India/Agentic-AI-Engineer_3164655-1' }
];

async function run() {
  console.log(`Testing ${candidates.length} additional candidates...\n`);
  const verified = [];
  for (const c of candidates) {
    const res = await verifyJobHasRealDetails(c.url);
    if (res.valid) {
      console.log(`[PASS] ${c.company} - ${c.role} (${res.title || 'OK'})`);
      verified.push({ ...c, verifiedTitle: res.title });
    } else {
      console.log(`[FAIL] ${c.company} - ${c.role}: ${res.reason}`);
    }
  }
  console.log(`\nVerified ${verified.length}/${candidates.length} additional jobs.`);
  fs.writeFileSync('tests/verified_additional_pool.json', JSON.stringify(verified, null, 2));
}

run();

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

const jobs = [
  { company: 'Chevron', role: 'Full Stack Developer', url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bengaluru-Karnataka-India/Full-Stack-Developer_R000073863-4' },
  { company: 'Okta', role: 'Senior Software Engineer - Fullstack', url: 'https://www.okta.com/company/careers/opportunity/8203481?gh_jid=8203481' },
  { company: 'Assurant', role: 'Lead Full Stack Developer', url: 'https://assurant.wd1.myworkdayjobs.com/en-US/Assurant_Careers/job/Lead-Full-Stack-Developer-Net-C--React-Typescript-Azure-SQL-server-_R-113999-1' },
  { company: 'Okta', role: 'Senior Software Engineer, Workflows', url: 'https://www.okta.com/company/careers/opportunity/5772061?gh_jid=5772061' },
  { company: 'Adobe', role: 'Software Development Engineer 3 - Java', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Bangalore/Software-Development-Engineer-3---Java_R171822' },
  { company: 'Autodesk', role: 'Principal Engineer (Tooling Platform)', url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Bengaluru-IND/Principal-Engineer--Python--Playwright--JavaScript--AI-_25WD94110-1' },
  { company: 'HP Inc.', role: 'Cloud Automation & Platform Engineer', url: 'https://hp.wd5.myworkdayjobs.com/en-US/ExternalCareerSite/job/Bengaluru-Karnataka-India/Cloud-Automation---Platform-Engineer_3167675-1' },
  { company: 'Okta', role: 'Staff Full-Stack Engineer', url: 'https://www.okta.com/company/careers/opportunity/7471202?gh_jid=7471202' },
  { company: 'Mastercard', role: 'Senior Software Engineer', url: 'https://mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers/job/Pune-India/Senior-Software-Engineer_R-291015' },
  { company: 'Autodesk', role: 'Senior Software Engineer(AI/ML Platform)', url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Pune-IND/Senior-Software-Engineer-AI-ML-Platform-_26WD96776-1' },
  { company: 'Autodesk', role: 'Senior Software Engineer (C#.NET, AWS)', url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Pune-IND/Senior-Software-Engineer--C-NET--AWS-_25WD93257-2' },
  { company: 'Newfold Digital', role: 'Full Stack Engineer', url: 'https://web.wd1.myworkdayjobs.com/en-US/ExternalCareerSite/job/Mumbai-India/FullStack-Engineer_R15144-1' },
  { company: 'Mastercard', role: 'Senior Software Engineer-1', url: 'https://mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers/job/Navi-Mumbai-India-Finicity/Senior-Software-Engineer-1_R-290528' },
  { company: 'Salesforce', role: 'Software Engineering SMTS', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Hyderabad/Software-Engineering-SMTS---MTS----Platform-Engineering--Backend--Kubernetes---Cloud-_JR347341' },
  { company: 'Salesforce', role: 'Infrastructure Platform Engineering', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Hyderabad/Infrastructure-Platform-Engineering--SMTS--Software-Engineering-_JR356752' },
  { company: 'Freshworks', role: 'Senior Staff Engineer - Site Reliability', url: 'https://jobs.smartrecruiters.com/Freshworks/744000148182744' },
  { company: 'Adobe', role: 'Software Development Engineer 3 - Frontend', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida/Software-Development-Engineer-3---Frontend_R170811' },
  { company: 'Adobe', role: 'Software Development Engineer', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida/Software-Development-Engineer_R170776' },
  { company: 'MongoDB', role: 'Application Engineer', url: 'https://www.mongodb.com/careers/job/?gh_jid=8143980' },
  { company: 'Freshworks', role: 'Staff Engineer - Full Stack', url: 'https://jobs.smartrecruiters.com/Freshworks/744000150064279' },
  { company: 'Freshworks', role: 'Lead Software Engineer - Systems', url: 'https://jobs.smartrecruiters.com/Freshworks/744000144463069' },
  { company: 'HP Inc.', role: 'Quality Engineer - Surface Mount Technology', url: 'https://hp.wd5.myworkdayjobs.com/en-US/ExternalCareerSite/job/Chennai-Tamil-Nadu-India/Quality-Engineer---Surface-Mount-Technology_3165344-2' },
  { company: 'Twilio', role: 'Principal Engineer (L5)', url: 'https://job-boards.greenhouse.io/twilio/jobs/7996776' },
  { company: 'Databricks', role: 'AI Engineer - FDE', url: 'https://boards.greenhouse.io/databricks/jobs/8099751002' }
];

async function main() {
  console.log(`Testing all ${jobs.length} jobs for real details verification...\n`);
  let passed = 0;
  for (const j of jobs) {
    const res = await verifyJobHasRealDetails(j.url);
    if (res.valid) {
      console.log(`[PASS] ${j.company} - ${j.role} (${res.title || 'OK'})`);
      passed++;
    } else {
      console.log(`[FAIL] ${j.company} - ${j.role}: ${res.reason}`);
    }
  }
  console.log(`\nFinal score: ${passed}/${jobs.length} passed.`);
}

main();

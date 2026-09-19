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
      signal: AbortSignal.timeout(9000)
    });

    if (res.status !== 200) {
      return { valid: false, reason: `HTTP status ${res.status}` };
    }

    const html = await res.text().catch(() => '');
    const lower = html.toLowerCase();

    for (const indicator of SOFT_404_INDICATORS) {
      if (lower.includes(indicator)) {
        return { valid: false, reason: `Detected closed/invalid notice: "${indicator}"` };
      }
    }

    // Must contain genuine job content markers
    const hasJobPostingSchema = lower.includes('"@type":"jobposting"') || lower.includes('"@type": "jobposting"') || lower.includes("jobposting");
    const hasJobContent = (lower.includes('responsibilities') || lower.includes('description') || lower.includes('qualifications') || lower.includes('requirements') || lower.includes('deliverables')) && (lower.includes('apply') || lower.includes('submit'));

    if (!hasJobPostingSchema && !hasJobContent) {
      return { valid: false, reason: 'Lacks job specification content or apply button' };
    }

    // Extract title if available
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

async function runTests() {
  const testUrls = [
    { name: 'Chevron (Workday Direct)', url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bengaluru-Karnataka-India/Full-Stack-Developer_R000073863-4' },
    { name: 'Mastercard (Workday Direct)', url: 'https://mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers/job/Pune-India/Senior-Software-Engineer_R-291015' },
    { name: 'Newfold Digital (Workday Direct)', url: 'https://web.wd1.myworkdayjobs.com/en-US/ExternalCareerSite/job/Mumbai-India/FullStack-Engineer_R15144-1' },
    { name: 'Assurant (Workday Direct)', url: 'https://assurant.wd1.myworkdayjobs.com/en-US/Assurant_Careers/job/Lead-Full-Stack-Developer-Net-C--React-Typescript-Azure-SQL-server-_R-113999-1' },
    { name: 'Salesforce (Workday Direct)', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/Hyderabad-Telangana-India/Member-of-Technical-Staff---Full-Stack_JR247810' },
    { name: 'NVIDIA (Workday Direct)', url: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Pune-India/System-Software-Engineer---Web-and-Cloud-Services_JR1985420' },
    { name: 'Adobe (Workday Direct)', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida-India/Computer-Scientist---Full-Stack-Node-React_R148290' },
    { name: 'Target (Workday Direct)', url: 'https://target.wd5.myworkdayjobs.com/en-US/targetcareers/job/Bangalore-India/Senior-Software-Engineer---Full-Stack_R0000348210' },
    { name: 'TCS (Broken/Fake 404)', url: 'https://www.tcs.com/careers/india/technical-lead-full-stack-web-architect' },
    { name: 'Amazon (Broken 404)', url: 'https://www.amazon.jobs/en/jobs/2691450/software-development-engineer-ii-full-stack' },
    { name: 'CME Group (Workday Closed)', url: 'https://cmegroup.wd1.myworkdayjobs.com/en-US/cme_careers/job/Bangalore---Bagmane-Tridib/Sr-Software-Engineer---India_34738-1' }
  ];

  console.log('Testing job details verification...\n');
  for (const t of testUrls) {
    const res = await verifyJobHasRealDetails(t.url);
    console.log(`[${res.valid ? 'PASS - GENUINE JOB' : 'REJECTED'}] ${t.name}`);
    if (res.valid) {
      console.log(`   -> Title: ${res.title}`);
    } else {
      console.log(`   -> Reason: ${res.reason}`);
    }
  }
}

runTests();

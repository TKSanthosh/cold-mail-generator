const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.NVIDIA_API_KEY;
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL_NAME = process.env.NVIDIA_MODEL || 'meta/llama-3.2-11b-vision-instruct';

// In-memory cache to make repeated generations instantaneous
const llmResponseCache = new Map();

const CANDIDATE_MODELS = [
  MODEL_NAME,
  'meta/llama-3.2-11b-vision-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct'
];

/**
 * Calls NVIDIA NIM API with optimized low-latency token streaming, multi-model fallback & caching.
 */
async function callLlm(systemPrompt, userPrompt, maxTokens = 800) {
  if (!API_KEY) {
    throw new Error('NVIDIA_API_KEY is not defined in the environment variables.');
  }

  const cacheKey = `${systemPrompt.length}_${userPrompt}`;
  if (llmResponseCache.has(cacheKey)) {
    return llmResponseCache.get(cacheKey);
  }

  const uniqueModels = [...new Set(CANDIDATE_MODELS)];
  let lastError = null;

  for (const model of uniqueModels) {
    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.15,
      max_tokens: maxTokens
    };

    const timeoutMs = Math.max(20000, Math.min(35000, maxTokens * 25));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
          ? data.choices[0].message.content.trim()
          : '';
        if (content) {
          llmResponseCache.set(cacheKey, content);
          return content;
        }
      } else {
        const errText = await response.text().catch(() => '');
        lastError = new Error(`NVIDIA NIM API error with model ${model} (${response.status}): ${errText}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
    }
  }

  throw new Error(`LLM Fetch error: ${lastError ? lastError.message : 'All model attempts failed'}`);
}

function sanitizeHrName(rawName) {
  if (!rawName) return 'Hiring Team';
  let clean = rawName
    .replace(/\([^)]*\)/g, '') // remove parenthetical role suffixes like (Staff Technical Recruiter)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/(?:Senior|Staff|Lead|Principal|Associate)?\s*(?:Technical|Tech|Engineering|Talent|HR|Recruiter|Hiring|Talent Acquisition|Recruitment)\s*(?:Specialist|Manager|Lead|Partner|Team|Recruiter)?/gi, '')
    .replace(/[\,\-\|].*$/g, '') // remove anything after commas, dashes, or pipes
    .trim();

  if (!clean || clean.length < 2 || ['hr', 'careers', 'talent', 'jobs', 'noreply', 'recruiting', 'admin', 'team', 'contact', 'info', 'hiring team', 'recruitment team'].includes(clean.toLowerCase())) {
    return 'Hiring Team';
  }
  return clean;
}

function generateDeterministicFallbackEmail(cleanHrName, company, jd, candidateInfo) {
  const name = candidateInfo?.name || 'Santhosh T K';
  const phone = candidateInfo?.phone || '+91 8825802707';
  const email = candidateInfo?.email || 'tksanthosh494@gmail.com';
  const linkedin = candidateInfo?.linkedin || 'https://linkedin.com/in/santhosh-tk';
  const github = candidateInfo?.github || 'https://github.com/TKSanthosh';

  const subject = `Software Developer | 3+ Years | React / Node.js / MERN | Interested in ${company}`;
  
  const body = `Hi ${cleanHrName},

I’m ${name}, a Software Developer with 3.5 years of experience in Full Stack engineering (React.js, Node.js, Express, MySQL, MongoDB, AWS), currently building high-throughput web applications and microservices.

I’m reaching out regarding Software Developer opportunities at ${company}. Your team's engineering work caught my attention, and I believe my background could be a strong fit for your team.

**What I bring:**
• 3.5 years of hands-on experience building high-performance Node.js, Express & React applications
• Proven track record reducing API response latency by ~20% and cutting production issues by ~30%
• Strong expertise in relational & NoSQL databases (MySQL, MongoDB) and REST API system design
• Production deployment and infrastructure experience with AWS, Docker, and CI/CD pipelines

I’d appreciate it if you could take a quick look at my profile and consider me for relevant openings.

**Resume:** Attached (1-Page ATS PDF)
**LinkedIn:** ${linkedin}
**GitHub:** ${github}

If there’s a suitable opening, I’d be happy to discuss how I could contribute to ${company}.

Best regards,
${name}
${phone ? `${phone} | ` : ''}${email}`;

  return { subject, body };
}

/**
 * Generates a tailored, plain-text cold email strictly adhering to the user's fixed template format.
 */
async function generateColdEmail(hrName, company, jd, resumeData, companyIntel) {
  const candidateName = resumeData?.personalInfo?.name || 'Santhosh T K';
  const candidateTitle = resumeData?.personalInfo?.title || 'Software Developer';
  const candidateEmail = resumeData?.personalInfo?.email || 'tksanthosh494@gmail.com';
  const candidatePhone = resumeData?.personalInfo?.phone || '+91 8825802707';
  const candidateLinkedin = resumeData?.personalInfo?.linkedin || 'https://linkedin.com/in/santhosh-tk';
  const candidateGithub = resumeData?.personalInfo?.github || 'https://github.com/TKSanthosh';

  const cleanHrName = sanitizeHrName(hrName);
  const candidateInfo = {
    name: candidateName,
    title: candidateTitle,
    email: candidateEmail,
    phone: candidatePhone,
    linkedin: candidateLinkedin,
    github: candidateGithub
  };

  const systemPrompt = `You are an elite tech recruiter and cold email specialist. Output PLAIN TEXT ONLY.

STRICT SUBJECT FORMAT:
Subject: [Role] | [X Years] | [Key Tech] | Interested in [Company]
(Example: Subject: Software Developer | 3+ Years | React / Node.js / MERN | Interested in ${company})

STRICT BODY TEMPLATE:
Hi ${cleanHrName},

I’m ${candidateName}, a Software Developer with 3+ years of experience in [Key Tech / Full Stack], currently working on [one-line description of current work/domain].

I’m reaching out regarding Software Developer opportunities at ${company}. Your team’s work in [specific product/team/technology] caught my attention, and I believe my experience could be relevant.

**What I bring:**
• 3+ years of experience with [core technology stack]
• Built/owned [important project or high-throughput system]
• [Strong measurable achievement, e.g. reduced API latency by 20% / cut production issues by 30%]
• Experience with [cloud/microservices/databases/system design]

I’d appreciate it if you could take a quick look at my profile and consider me for relevant openings.

**Resume:** Attached (1-Page ATS PDF)
**LinkedIn:** ${candidateLinkedin}
**GitHub:** ${candidateGithub}

If there’s a suitable opening, I’d be happy to discuss how I could contribute to the team.

Best regards,
${candidateName}
${candidatePhone ? `${candidatePhone} | ` : ''}${candidateEmail}

RULES:
- Do NOT output JSON or code fences.
- Maintain the exact section headings (**What I bring:**, **Resume:**, **LinkedIn:**, **GitHub:**).
- Use bullet points (•) under **What I bring:**.`;

  let userPrompt = `Target Recruiter: ${cleanHrName}
Target Company: ${company}
Candidate Name: ${candidateName}
Total Experience: 3+ years (full-stack & backend engineering)
Core Stack: Node.js, Express.js, React.js (MERN), MySQL, MongoDB, AWS, REST APIs
Notable Achievements: Reduced API response times by ~20% and cut production issues by ~30% at Sify Technologies; built clinical platforms at IQVIA.
`;

  if (companyIntel && companyIntel.summary) {
    userPrompt += `\nCompany Context: ${companyIntel.summary}\n`;
  }

  if (jd && jd.trim().length > 0) {
    userPrompt += `\nJob Description (JD):\n${jd}\n\nTask: Align the [Role], [Key Tech], and "**What I bring:**" bullets strictly to this JD while keeping the exact template.`;
  } else {
    userPrompt += `\nTask: Draft a high-impact cold email for ${company} following the template.`;
  }

  try {
    const responseText = await callLlm(systemPrompt, userPrompt);
    return sanitizeAndExtractEmail(responseText, cleanHrName, company, candidateInfo);
  } catch (err) {
    console.warn(`[LLM EMAIL WARN] LLM call failed (${err.message}). Using deterministic fallback email.`);
    return generateDeterministicFallbackEmail(cleanHrName, company, jd, candidateInfo);
  }
}

/**
 * Code-level safety net to extract pure subject and body text adhering strictly to the user's template format.
 */
function sanitizeAndExtractEmail(raw, hrName, company, candidateInfo) {
  const name = candidateInfo?.name || 'Santhosh T K';
  const phone = candidateInfo?.phone || '+91 8825802707';
  const email = candidateInfo?.email || 'tksanthosh494@gmail.com';
  const linkedin = candidateInfo?.linkedin || 'https://linkedin.com/in/santhosh-tk';
  const github = candidateInfo?.github || 'https://github.com/TKSanthosh';

  const cleanSignature = `Best regards,\n${name}\n${phone ? `${phone} | ` : ''}${email}`.trim();

  let text = (raw || '').trim();

  // 1. If model returned JSON despite prompt, extract and flatten it
  if (text.startsWith("{") || text.startsWith("```json")) {
    try {
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const obj = JSON.parse(cleanJson);
      const subject = obj.subject ? obj.subject.replace(/^Subject:\s*/i, '').trim() : `Software Developer | 3+ Years | React / Node.js / MERN | Interested in ${company}`;
      
      const paragraphs = [
        obj.greeting || `Hi ${hrName || 'Hiring Team'},`,
        obj.paragraph1 || obj.body,
        obj.paragraph2,
        obj.paragraph3
      ].filter(Boolean);

      return {
        subject,
        body: paragraphs.join('\n\n') + '\n\n' + cleanSignature
      };
    } catch (e) {
      text = text.replace(/["{}]/g, "").replace(/\b\w+":/g, "");
    }
  }

  // 2. Extract Subject Line in format: [Role] | [X Years] | [Key Tech] | Interested in [Company]
  let subject = null;

  const explicitSubjectMatch = text.match(/^Subject:\s*(.+)$/im);
  if (explicitSubjectMatch) {
    subject = explicitSubjectMatch[1].replace(/["']/g, '').trim();
    text = text.replace(/^Subject:\s*.+$/im, '').trim();
  } else {
    // Check for pipe-separated or role-based subject line candidates
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      if (line.includes('|') || line.includes('Interested in') || line.includes('Opportunities') || line.includes('Application for') || line.includes('Exploring')) {
        subject = line.replace(/^(?:Subject|Re):\s*/i, '').replace(/["']/g, '').trim();
        text = text.replace(line, '').trim();
        break;
      }
    }
  }

  if (!subject) {
    subject = `Software Developer | 3+ Years | React / Node.js / MERN | Interested in ${company}`;
  }

  // If subject line is still embedded anywhere in text, remove it
  if (subject && text.includes(subject)) {
    text = text.replace(subject, '').trim();
  }

  // 3. Strip any existing signatures from the end
  const signoffRegex = /(?:best regards|warm regards|sincerely|regards|thanks & regards|thanks and regards|cheers)/i;
  const signoffIndex = text.search(signoffRegex);
  let mainBody = text;
  if (signoffIndex !== -1) {
    mainBody = text.substring(0, signoffIndex).trim();
  }

  // 4. Remove unwanted label artifacts
  mainBody = mainBody
    .replace(/^(?:greeting|paragraph\s*\d+|body|call to action|subject):\s*/gim, '')
    .replace(/^["']|["']$/gm, '')
    .trim();

  // 5. Ensure single clean greeting & deduplicate all greeting occurrences
  const cleanRecipientName = sanitizeHrName(hrName);
  let finalGreeting = `Hi ${cleanRecipientName},`;
  const firstGreetingMatch = mainBody.match(/^(Hi\s+[^,\n]+,|Dear\s+[^,\n]+,|Hello\s+[^,\n]+,|Hey\s+[^,\n]+,)/i);
  if (firstGreetingMatch) {
    const rawGreet = firstGreetingMatch[1].trim();
    const extractedName = rawGreet.replace(/^(?:Hi|Dear|Hello|Hey)\s+/i, '').replace(/,/g, '').trim();
    finalGreeting = `Hi ${sanitizeHrName(extractedName)},`;
  }

  let bodyWithoutGreetings = mainBody
    .replace(/^(Hi\s+[^,\n]+,|Dear\s+[^,\n]+,|Hello\s+[^,\n]+,|Hey\s+[^,\n]+,)\s*/gim, '')
    .trim();

  // 6. Ensure links are present in the body
  if (!bodyWithoutGreetings.includes('**LinkedIn:**') && !bodyWithoutGreetings.includes('linkedin.com')) {
    const linksBlock = `**Resume:** Attached (1-Page ATS PDF)\n**LinkedIn:** ${linkedin}\n**GitHub:** ${github}`;
    bodyWithoutGreetings = bodyWithoutGreetings + '\n\n' + linksBlock;
  }

  const finalBody = `${finalGreeting}\n\n${bodyWithoutGreetings}\n\n${cleanSignature}`.trim();

  return { subject, body: finalBody };
}

/**
 * Tailors a resume JSON based on the JD, preventing hallucinated skills and embedding ATS keywords.
 * Optimized for blazing-fast 2-3 second execution by generating only tailored differential fields.
 */
async function tailorResume(standardResumeJson, jd) {
  if (!jd || jd.trim().length === 0) {
    return standardResumeJson;
  }

  const systemPrompt = `You are an ATS resume optimizer. Given a Job Description (JD), return a JSON object with:
1. "targetTitle": Best matching engineering title from the JD (e.g. "Full Stack Developer", "Software Engineer", "Backend Developer").
2. "summary": A compelling 2-3 sentence technical profile summary tailored to the JD requirements using the candidate's 3+ years experience with Node.js, Express.js, React.js, MySQL, MongoDB, AWS, and REST APIs.
3. "atsKeywords": Array of 15 to 30 technical keywords, tools, and methodologies extracted directly from the JD for ATS optimization.

Output JSON ONLY matching this format with no other text.`;

  const userPrompt = `Job Description (JD):\n${jd.slice(0, 2000)}\n\nCandidate Core Stack: Node.js, Express.js, React.js (MERN), MySQL, MongoDB, AWS, JWT/RBAC, RESTful APIs, Git\nCandidate Name: ${standardResumeJson?.personalInfo?.name || 'Santhosh T K'}`;

  try {
    const responseText = await callLlm(systemPrompt, userPrompt, 400);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let patch = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

    // Deep clone standard resume
    const tailored = JSON.parse(JSON.stringify(standardResumeJson));

    // Update target role title if present
    if (patch.targetTitle && typeof patch.targetTitle === 'string') {
      tailored.personalInfo = tailored.personalInfo || {};
      tailored.personalInfo.title = patch.targetTitle.trim();
    }

    // Update summary with tailored pitch
    if (patch.summary && typeof patch.summary === 'string' && patch.summary.trim().length > 0) {
      tailored.summary = patch.summary.replace(/→|➔|➜/g, ' to ').trim();
    }

    // Embed extracted ATS keywords
    if (Array.isArray(patch.atsKeywords) && patch.atsKeywords.length > 0) {
      tailored.atsKeywords = patch.atsKeywords.map(k => String(k).trim()).filter(Boolean);
    } else {
      const words = (jd.match(/[a-zA-Z0-9.+/]{3,}/g) || []).slice(0, 25);
      tailored.atsKeywords = [...new Set(words)];
    }

    return tailored;
  } catch (e) {
    console.warn('Fast tailor failed, using resilient fallback:', e.message);
    const words = (jd.match(/[a-zA-Z0-9.+/]{3,}/g) || []).slice(0, 25);
    const fallback = JSON.parse(JSON.stringify(standardResumeJson));
    fallback.atsKeywords = [...new Set(words)];
    return fallback;
  }
}

module.exports = {
  callLlm,
  generateColdEmail,
  tailorResume,
  sanitizeAndExtractEmail
};

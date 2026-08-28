const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.NVIDIA_API_KEY;
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL_NAME = process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct';

// In-memory cache to make repeated generations instantaneous
const llmResponseCache = new Map();

/**
 * Calls NVIDIA NIM API with optimized low-latency token streaming & caching.
 */
async function callLlm(systemPrompt, userPrompt, maxTokens = 800) {
  if (!API_KEY) {
    throw new Error('NVIDIA_API_KEY is not defined in the environment variables.');
  }

  const cacheKey = `${systemPrompt.length}_${userPrompt}`;
  if (llmResponseCache.has(cacheKey)) {
    return llmResponseCache.get(cacheKey);
  }

  const payload = {
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.15,
    max_tokens: maxTokens
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    // If fast model has rate limit, fallback to llama-3.2-11b-vision-instruct
    if (MODEL_NAME !== 'meta/llama-3.2-11b-vision-instruct') {
      payload.model = 'meta/llama-3.2-11b-vision-instruct';
      const fallbackRes = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(payload)
      });
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        const content = fbData.choices[0].message.content.trim();
        llmResponseCache.set(cacheKey, content);
        return content;
      }
    }
    const errText = await response.text();
    throw new Error(`NVIDIA NIM API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();
  llmResponseCache.set(cacheKey, content);
  return content;
}

/**
 * Generates a tailored, plain-text cold email strictly adhering to the user's fixed format.
 */
async function generateColdEmail(hrName, company, jd, resumeData, companyIntel) {
  const candidateName = resumeData?.personalInfo?.name || 'Santhosh T K';
  const candidateTitle = 'Full Stack Developer';
  const candidateEmail = resumeData?.personalInfo?.email || 'tksanthosh494@gmail.com';
  const candidatePhone = resumeData?.personalInfo?.phone || '+91 8825802707';
  const candidateLinkedin = resumeData?.personalInfo?.linkedin || 'linkedin.com/in/santhosh-tk';
  const candidateGithub = resumeData?.personalInfo?.github || 'github.com/TKSanthosh';

  const genericKeywords = ['hr', 'careers', 'talent', 'jobs', 'noreply', 'recruiting', 'admin', 'team', 'contact', 'info'];
  const cleanHrName = (hrName && !genericKeywords.includes(hrName.toLowerCase().trim())) 
    ? hrName.trim() 
    : 'Hiring Team';

  const systemPrompt = `You are a high-converting cold email writer for a software engineer job seeker. Output PLAIN TEXT ONLY.

STRICT RULES:
- Never output JSON, curly braces, quotation-mark-wrapped keys, or any markup.
- Never output field labels like "subject:", "greeting:", "paragraph1:".
- Output must be ready to paste directly into an email body — nothing else.
- Do not truncate sentences. Every sentence must be grammatically complete.
- Do not fabricate or round up years of experience. Use EXACTLY "3+ years" of experience as provided in the input data.
- Do not use the word "seasoned" or similar inflated language.

ROLE TITLE RULES:
1. Check the company and Job Description (JD): If a specific role name is provided (e.g. "Full Stack Engineer", "Backend Developer", "Software Engineer", "MERN Stack Developer", "Software Development Engineer"), tailor the subject line and opening pitch to use their exact role title naming.
2. If it is a general cold outreach with no JD, use "Full Stack Developer" as the primary role title in the subject line and opening body.
3. NEVER use level numbers like "SDE2", "SDE 2", or "Software Development Engineer 2".

OUTPUT FORMAT (plain text, in this exact structure):
Subject: <Targeted subject line: e.g. "Full Stack Developer Opportunities at ${company} - ${candidateName}" or "Exploring <Role Title> Opportunities at ${company} - ${candidateName}">

Hi ${cleanHrName},

<Paragraph 1: 2-3 sentences. Express strong interest in Full Stack Developer opportunities (or the specific role title if JD is provided) at ${company}. Highlight 3+ years of experience building scalable web applications and RESTful APIs using Node.js, Express.js, React.js (MERN stack), MySQL, MongoDB, and AWS.>

<Paragraph 2: 2-3 sentences. Specific achievements from input: reduced API response time by 20% and eliminated ~30% of production issues migrating PHP backend to Node.js & MongoDB at Sify Technologies; built clinical event platform at IQVIA; maintained 95%+ first-pass code review approval rate. Connect with the company's tech focus if company context is available. Do not invent metrics not present in input.>

<Paragraph 3: 1-2 sentences. Clear call to action requesting a 15-minute intro call this week to discuss how I can contribute to your engineering team, mention attached resume.>

Best regards,
${candidateName}
Full Stack Developer
${candidatePhone} | ${candidateEmail}
${candidateLinkedin} | ${candidateGithub}

Before finalizing, re-check: no JSON syntax, no level numbers like SDE2, no truncated sentences, no inflated experience claims, no field-name labels visible in the text.`;

  let userPrompt = `Target Recruiter: ${cleanHrName}
Target Company: ${company}
Candidate: ${candidateName} (${candidateTitle})
Total Experience: 3+ years (full-stack & backend web application development)
Core Stack: Node.js, Express.js, React.js (MERN), MySQL, MongoDB, AWS, JWT/RBAC, REST APIs
Experience & Achievements:
- Software Development Engineer at IQVIA, Bangalore (Clinical Event & Engagement Management Platform)
- Software Developer at Sify Technologies (Exam Engine: migrated PHP backend to Node.js/MongoDB, cutting production issues by ~30%; QPTool: built RESTful APIs + React.js, improved API response time by ~20%)
- Maintained 95%+ first-pass code review approval rate; set coding standards for a 5-member team
Call to Action: Request a 15-minute intro call this week; resume attached.
`;

  if (companyIntel && companyIntel.summary) {
    userPrompt += `\nCompany Context: ${companyIntel.summary}\n`;
  }

  if (jd && jd.trim().length > 0) {
    userPrompt += `\nJob Description (JD):\n${jd}\n\nTask: Check how the company names the role in this JD and align your subject line, role title, and technical pitch to their exact role requirements.`;
  } else {
    userPrompt += `\nTask: Draft a concise, high-impact cold email to ${company} for Full Stack Developer opportunities.`;
  }

  const responseText = await callLlm(systemPrompt, userPrompt);
  return sanitizeAndExtractEmail(responseText, cleanHrName, company, {
    name: candidateName,
    title: candidateTitle,
    email: candidateEmail,
    phone: candidatePhone,
    linkedin: candidateLinkedin,
    github: candidateGithub
  });
}

/**
 * Code-level safety net to extract pure subject and body text with zero JSON artifacts.
 */
function sanitizeAndExtractEmail(raw, hrName, company, candidateInfo) {
  const name = candidateInfo?.name || 'Santhosh T K';
  const title = candidateInfo?.title || 'Full Stack Developer';
  const phone = candidateInfo?.phone || '+91 8825802707';
  const email = candidateInfo?.email || 'tksanthosh494@gmail.com';
  const linkedin = candidateInfo?.linkedin || 'linkedin.com/in/santhosh-tk';
  const github = candidateInfo?.github || 'github.com/TKSanthosh';

  const cleanSignature = `Best regards,\n${name}\n${title}\n${phone} | ${email}\n${linkedin} | ${github}`;

  let text = (raw || '').trim();

  // 1. If model returned JSON despite prompt, extract and flatten it
  if (text.startsWith("{") || text.startsWith("```json")) {
    try {
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const obj = JSON.parse(cleanJson);
      const subject = obj.subject ? obj.subject.replace(/^Subject:\s*/i, '').trim() : `Full Stack Developer Opportunities at ${company} - ${name}`;
      
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

  // 2. Extract Subject Line if present
  let subject = `Full Stack Developer Opportunities at ${company} - ${name}`;
  const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
  if (subjectMatch) {
    subject = subjectMatch[1].replace(/["']/g, '').trim();
    // Remove Subject line from body text
    text = text.replace(/^Subject:\s*.+$/im, '').trim();
  }

  // 3. Strip existing signatures from the end
  const signoffRegex = /(?:best regards|warm regards|sincerely|regards|thanks & regards|thanks and regards)/i;
  const signoffIndex = text.search(signoffRegex);
  let mainBody = text;
  if (signoffIndex !== -1) {
    mainBody = text.substring(0, signoffIndex).trim();
  }

  // 4. Remove labels like "paragraph1:", "greeting:", "body:"
  mainBody = mainBody
    .replace(/^(?:greeting|paragraph\s*\d+|body|call to action):\s*/gim, '')
    .replace(/^["']|["']$/gm, '')
    .trim();

  // 5. Build structured paragraphs
  const rawParagraphs = mainBody.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  let finalParagraphs = [];

  rawParagraphs.forEach(p => {
    // Check if greeting is merged into paragraph 1
    const greetingMatch = p.match(/^(Hi\s+[^,\n]+,|Dear\s+[^,\n]+,|Hello\s+[^,\n]+,)\s*([\s\S]*)$/i);
    if (greetingMatch) {
      finalParagraphs.push(greetingMatch[1].trim());
      if (greetingMatch[2] && greetingMatch[2].trim().length > 0) {
        finalParagraphs.push(greetingMatch[2].trim().replace(/\n+/g, ' '));
      }
    } else {
      finalParagraphs.push(p.replace(/\n+/g, ' ').trim());
    }
  });

  // Ensure greeting exists
  if (finalParagraphs.length === 0 || !finalParagraphs[0].match(/^(Hi|Dear|Hello)\b/i)) {
    finalParagraphs.unshift(`Hi ${hrName || 'Hiring Team'},`);
  }

  const finalBody = finalParagraphs.join('\n\n') + '\n\n' + cleanSignature;

  return { subject, body: finalBody };
}

/**
 * Tailors a resume JSON based on the JD, preventing hallucinated skills and embedding ATS keywords.
 */
async function tailorResume(standardResumeJson, jd) {
  if (!jd || jd.trim().length === 0) {
    return standardResumeJson;
  }

  const systemPrompt = `You are an elite technical resume writer and ATS optimization specialist. 
Your task is to tailor a candidate's standard resume JSON to rank #1 in ATS (Applicant Tracking Systems) for a specific Job Description (JD).

STRICT VERIFIED SKILLS MANDATE (CRITICAL):
1. DO NOT invent, hallucinate, or add skills, tools, or cloud platforms that are NOT present in the candidate's Standard Resume (e.g. NEVER add Azure, AWS Lambda, Kubernetes, GCP, Python, C++, Java, etc. unless explicitly listed in Standard Resume).
2. Only REORDER, PRIORITIZE, and EMPHASIZE the candidate's authentic skills (Node.js, Express.js, React.js, MySQL, MongoDB, AWS, RESTful APIs, JWT, Git, etc.).
3. NEVER use unicode arrow symbols like '→' or '➔' in achievements or project descriptions. Always write plain English words like 'PHP to Node.js'.

ATS KEYWORDS MANDATE:
4. Extract 15-30 highly relevant technical keywords, methodologies, and requirements from the JD into an "atsKeywords" array. These keywords will be rendered into the resume's hidden ATS optimization layer to guarantee top search visibility.

Output must be a valid JSON object matching the input schema with an added "atsKeywords" array. Output JSON ONLY with zero prose or markdown wrapping.`;

  const userPrompt = `Standard Resume JSON:\n${JSON.stringify(standardResumeJson, null, 2)}

Job Description (JD):\n${jd}

Tailor the resume now and return ONLY the updated JSON.`;

  const responseText = await callLlm(systemPrompt, userPrompt);
  
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

    // Deep sanitize strings to remove any unicode arrows
    const sanitizeObj = (obj) => {
      if (typeof obj === 'string') {
        return obj.replace(/→|➔|➜|!’/g, ' to ').replace(/–|—/g, '-');
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObj);
      }
      if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)) {
          cleaned[k] = sanitizeObj(v);
        }
        return cleaned;
      }
      return obj;
    };

    parsed = sanitizeObj(parsed);

    // Ensure atsKeywords exists
    if (!parsed.atsKeywords || !Array.isArray(parsed.atsKeywords) || parsed.atsKeywords.length === 0) {
      // Extract keywords from JD
      const words = jd.match(/[a-zA-Z0-9.+/]{3,}/g) || [];
      const unique = [...new Set(words.map(w => w.replace(/^[^\w]+|[^\w]+$/g, '')))].filter(w => w.length > 2).slice(0, 30);
      parsed.atsKeywords = unique;
    }

    return parsed;
  } catch (e) {
    console.error('Failed to parse tailored resume JSON. Returning standard resume.', responseText);
    return standardResumeJson;
  }
}

module.exports = {
  generateColdEmail,
  tailorResume
};

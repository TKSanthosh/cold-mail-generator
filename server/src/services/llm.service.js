const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.NVIDIA_API_KEY;
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL_NAME = 'meta/llama-3.2-11b-vision-instruct';

/**
 * Calls NVIDIA NIM API using native fetch.
 */
async function callLlm(systemPrompt, userPrompt, jsonMode = false) {
  if (!API_KEY) {
    throw new Error('NVIDIA_API_KEY is not defined in the environment variables.');
  }

  const payload = {
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 2048
  };

  if (jsonMode) {
    // Some models support json response format, but to be safe and compatible 
    // we instruct it strongly in the prompt and ask for JSON structure.
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA NIM API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Generates a tailored cold email with zero placeholders.
 */
async function generateColdEmail(hrName, company, jd, resumeData, companyIntel) {
  const candidateName = resumeData?.personalInfo?.name || 'Santhosh T K';
  const candidateTitle = resumeData?.personalInfo?.title || 'Software Development Engineer 2 (SDE2)';
  const candidateEmail = resumeData?.personalInfo?.email || 'tksanthosh494@gmail.com';
  const candidatePhone = resumeData?.personalInfo?.phone || '+91 8825802707';
  const candidateLinkedin = resumeData?.personalInfo?.linkedin || 'linkedin.com/in/santhosh-tk';
  const candidateGithub = resumeData?.personalInfo?.github || 'github.com/TKSanthosh';
  const resumeSummary = resumeData?.summary || '';
  const topSkills = Object.values(resumeData?.skills || {}).flat().slice(0, 8).join(', ');
  const companySummary = companyIntel?.summary ? `Target Company Domain: ${companyIntel.summary}` : '';

  const systemPrompt = `You are Santhosh T K, a results-driven Senior Software Engineer (SDE 2) writing a direct, high-impact cold outreach email to a recruiter/hiring manager (${hrName}) at ${company}.

STRICT WRITING RULES:
1. ZERO FLATTERY / NO CORPORATE ESSAYS: NEVER praise the company's mission, user numbers (e.g. "I am drawn to your mission of..."), or write generic compliments. Recruiters delete flattery immediately.
2. BE DIRECT & VALUE-DRIVEN: State clearly and confidently:
   - Who you are: SDE 2 with 3+ years of production experience building scalable web applications and microservices.
   - Core Tech Stack: ${topSkills}.
   - Measurable Experience: Building high-performance REST APIs, reducing API response times by 20%, eliminating production bottlenecks, and architecting enterprise platforms at IQVIA and Sify Technologies.
   - Exact Value: Ready to deliver immediate engineering impact, write clean scalable code, and optimize backend systems.
3. CONCISE & PUNCHY: 80 to 110 words maximum. Every sentence must communicate competence and value.
4. STRUCTURE:
   - Line 1: Hi ${hrName},
   - Paragraph 1: Direct pitch introducing yourself as an SDE 2 with 3+ years of experience and expressing interest in engineering roles at ${company}.
   - Paragraph 2: Core technical capabilities (${topSkills}) and tangible achievements at IQVIA & Sify.
   - Paragraph 3: Mention attached resume and ask for a quick 10-minute introductory call.
5. ZERO PLACEHOLDERS: NEVER use [Your Name], [Company], or any bracketed text.

Output format MUST be a JSON object:
{
  "subject": "SDE 2 / Backend Engineering Opportunities - Santhosh T K",
  "body": "The direct 3-paragraph email text without signatures"
}`;

  let userPrompt = `Target Recruiter: ${hrName}
Target Company: ${company}
${companySummary}
Candidate: ${candidateName} (${candidateTitle})
Core Tech Stack: ${topSkills}
Experience Highlights: 3+ years at IQVIA (Clinical Event Platform) and Sify Technologies (Exam Engine, QPTool, 20% API speedup)
`;

  if (jd && jd.trim().length > 0) {
    userPrompt += `\nJob Description (JD):\n${jd}\n\nTask: Align your direct technical pitch with the provided JD requirements.`;
  } else {
    userPrompt += `\nTask: Draft a direct value-driven outreach email highlighting why you are a high-value hire for ${company}.`;
  }

  const responseText = await callLlm(systemPrompt, userPrompt);
  return extractCleanEmail(responseText, candidateTitle, company, {
    name: candidateName,
    title: candidateTitle,
    email: candidateEmail,
    phone: candidatePhone,
    linkedin: candidateLinkedin,
    github: candidateGithub
  });
}

/**
 * Robustly parses and formats pure subject and plain text body from LLM output.
 * Ensures flush-left alignment, proper paragraph spacing, and a clean professional signature.
 */
function extractCleanEmail(rawText, candidateTitle, company, candidateInfo) {
  let subject = `Software Development Engineer 2 Application - ${candidateInfo?.name || 'Santhosh T K'}`;
  let rawBody = '';

  let text = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1. Try JSON parsing
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonCandidate = jsonMatch[0].replace(/[\u0000-\u001F]+/g, (c) => {
        if (c === '\n') return '\\n';
        if (c === '\r') return '\\r';
        if (c === '\t') return '\\t';
        return '';
      });
      const parsed = JSON.parse(jsonCandidate);
      if (parsed.subject) subject = parsed.subject.trim();
      if (parsed.body) rawBody = parsed.body.trim();
    }
  } catch (err) {
    // Continue to regex
  }

  // 2. Regex fallback
  if (!rawBody) {
    const subjectMatch = text.match(/"subject"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) ||
                         text.match(/subject:\s*([^\n\r]+)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].replace(/\\"/g, '"').trim();
    }

    const bodyMatch = text.match(/"body"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/i) ||
                      text.match(/"body"\s*:\s*([\s\S]*)/i);
    if (bodyMatch) {
      rawBody = bodyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\s*"\s*\}?\s*$/, '')
        .trim();
    }
  }

  if (!rawBody) {
    rawBody = text
      .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
      .replace(/"?\s*\}\s*$/, '')
      .replace(/\\n/g, '\n')
      .trim();
  }

  // 3. Format and clean paragraphs + build crisp signature
  const name = candidateInfo?.name || 'Santhosh T K';
  const title = candidateInfo?.title || 'Software Development Engineer 2 (SDE2)';
  const phone = candidateInfo?.phone || '+91 8825802707';
  const email = candidateInfo?.email || 'tksanthosh494@gmail.com';
  const linkedin = candidateInfo?.linkedin || 'linkedin.com/in/santhosh-tk';
  const github = candidateInfo?.github || 'github.com/TKSanthosh';

  // Strip broken signoffs at end of rawBody
  const signoffRegex = /(?:best regards|warm regards|sincerely|regards|thanks & regards|thanks and regards)/i;
  const signoffIndex = rawBody.search(signoffRegex);
  let mainBody = rawBody;
  if (signoffIndex !== -1) {
    mainBody = rawBody.substring(0, signoffIndex).trim();
  }

  // Strip leading spaces/tabs on each line and create clean paragraphs
  const rawParagraphs = mainBody.split(/\n\s*\n/);
  const cleanedParagraphs = rawParagraphs
    .map(p => p.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
    .map(p => p.trim())
    .filter(Boolean);

  const cleanSignature = `Best regards,\n${name}\n${title}\n${phone} | ${email}\n${linkedin} | ${github}`;
  const finalBody = cleanedParagraphs.join('\n\n') + '\n\n' + cleanSignature;

  return { subject, body: finalBody };
}

/**
 * Tinkers/Tailors a resume JSON based on the JD.
 */
async function tailorResume(standardResumeJson, jd) {
  if (!jd) {
    return standardResumeJson; // Return standard resume if no JD
  }

  const systemPrompt = `You are an expert resume writer and technical recruiter. 
Your task is to tailor/tweak a candidate's standard resume JSON to better match the provided Job Description (JD).

CRITICAL RULES:
1. DO NOT add any new skills that are not already present in the standard resume.
2. DO NOT invent or fabricate any experience, company details, education, or projects.
3. Alter or tweak the existing experience and project highlights slightly according to the JD requirements to maximize the possibility of being hired. Highlight relevant keywords and match the tone of the JD.
4. Reorder the existing skills array so that matching skills are prioritized.
5. Keep personalInfo, education, company names, and project titles exactly the same.
6. Output must be a valid JSON object matching the input schema EXACTLY. Do not add markdown backticks outside of the JSON or any prose explanation.`;

  const userPrompt = `Standard Resume JSON:\n${JSON.stringify(standardResumeJson, null, 2)}

Job Description (JD):\n${jd}

Tailor the resume now and return ONLY the updated JSON.`;

  const responseText = await callLlm(systemPrompt, userPrompt);
  
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
  } catch (e) {
    console.error('Failed to parse tailored resume JSON. Returning standard resume.', responseText);
    return standardResumeJson;
  }
}

module.exports = {
  generateColdEmail,
  tailorResume
};

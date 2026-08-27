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
  const topSkills = Object.values(resumeData?.skills || {}).flat().slice(0, 6).join(', ');
  const companySummary = companyIntel?.summary || `${company} is an innovative technology enterprise.`;

  const systemPrompt = `You are a seasoned senior software engineer writing a direct, professional, and respectful cold outreach email to a hiring manager or recruiter.

WRITING GUIDELINES:
1. SUBJECT LINE: Keep it clean, direct, and human. NEVER use marketing cliches or buzzwords like "Unlocking Excellence" or "Revolutionizing".
   Examples:
   - "Software Development Engineer 2 Application - ${candidateName}"
   - "SDE 2 / Backend Engineering Opportunities - ${candidateName}"
   - "Exploring Software Development Engineer 2 Roles at ${company} - ${candidateName}"

2. EMAIL STRUCTURE (Write in 3 concise, left-aligned paragraphs):
   - Paragraph 1: Greeting + brief intro + target role (${candidateTitle}) + natural mention of what ${company} does based on: "${companySummary}".
   - Paragraph 2: Highlight genuine technical strengths (${topSkills}) and measurable experience (e.g. scalable REST APIs, microservices, performance tuning, and enterprise applications).
   - Paragraph 3: Mention attached resume and express interest in a brief 10-minute introductory conversation.

3. ZERO PLACEHOLDERS: NEVER use [Your Name], [Company], [Phone], or any bracketed text.
4. NO TAB OR SPACE INDENTATION: Start every line flush left.
5. LENGTH: 90 to 130 words. Natural, confident, and executive tone.

Output format MUST be a JSON object:
{
  "subject": "Clean professional subject line",
  "body": "The 3-paragraph email body text without broken signatures"
}`;

  let userPrompt = `Target HR: ${hrName}
Target Company: ${company}
Company Intelligence: ${companySummary}
Candidate Name: ${candidateName}
Candidate Title: ${candidateTitle}
Candidate Summary: ${resumeSummary}
Key Skills: ${topSkills}
`;

  if (jd && jd.trim().length > 0) {
    userPrompt += `\nJob Description (JD):\n${jd}\n\nTask: Align the email specifically to the target company's business domain and JD requirements.`;
  } else {
    userPrompt += `\nTask: Draft a clean, professional cold outreach email expressing interest in engineering opportunities at ${company}.`;
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

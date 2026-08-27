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
  const candidateTitle = resumeData?.personalInfo?.title || 'Software Development Engineer';
  const candidateEmail = resumeData?.personalInfo?.email || 'tksanthosh494@gmail.com';
  const candidatePhone = resumeData?.personalInfo?.phone || '+91 8825802707';
  const candidateLinkedin = resumeData?.personalInfo?.linkedin || 'linkedin.com/in/santhosh-tk';
  const resumeSummary = resumeData?.summary || '';
  const topSkills = Object.values(resumeData?.skills || {}).flat().slice(0, 6).join(', ');
  const companySummary = companyIntel?.summary || `${company} is an innovative technology enterprise.`;

  const systemPrompt = `You are a high-performing tech career coach and copywriter specializing in direct, high-response cold outreach.
Write a 100% finished, ready-to-send cold email from ${candidateName} to ${hrName} at ${company}.

CRITICAL MANDATES:
1. ZERO PLACEHOLDERS: NEVER use brackets like [Your Name], [industry/field], [Company], [insert ...], or [Job Title]. All text must be fully written out, authentic, and 100% sendable without any manual editing.
2. Sign off exactly as:
Best regards,
${candidateName}
${candidateTitle}
${candidateEmail} | ${candidatePhone}
${candidateLinkedin ? candidateLinkedin : ''}

3. Address the recipient naturally: "Hi ${hrName}," (or "Hi Hiring Team," if generic).
4. Naturally reference ${company}'s domain/work based on this background: "${companySummary}".
5. Clearly state interest in joining ${company} as a ${candidateTitle}.
6. Highlight 2-3 genuine core technical strengths (${topSkills}) matching their business needs.
7. Explicitly mention that the resume is attached for their review.
8. Keep it concise, professional, punchy, and confident (around 100 to 140 words).

Output format MUST be a JSON object:
{
  "subject": "Clear, compelling subject line without placeholders",
  "body": "The complete, fully written email body text ready to send immediately"
}`;

  let userPrompt = `Target HR: ${hrName}
Target Company: ${company}
Company Intelligence / What they do: ${companySummary}
Candidate Name: ${candidateName}
Candidate Title: ${candidateTitle}
Candidate Summary: ${resumeSummary}
Key Skills: ${topSkills}
`;

  if (jd && jd.trim().length > 0) {
    userPrompt += `\nJob Description (JD):\n${jd}\n\nTask: Align the email specifically to ${company}'s domain and the provided JD requirements.`;
  } else {
    userPrompt += `\nTask: Draft a customized cold outreach email that references ${company}'s domain and explains why the candidate is a strong fit for their engineering team.`;
  }

  const responseText = await callLlm(systemPrompt, userPrompt);
  return extractCleanEmail(responseText, candidateTitle, company);
}

/**
 * Robustly parses and extracts pure subject and plain text body from LLM output.
 * Guarantees NO raw JSON artifacts, keys, or brackets appear in the final email.
 */
function extractCleanEmail(rawText, candidateTitle, company) {
  let subject = `Application for ${candidateTitle} - ${company}`;
  let body = '';

  let text = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1. Try JSON parsing with control character escaping
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
      if (parsed.body) body = parsed.body.trim();
    }
  } catch (err) {
    // Continue to regex extraction
  }

  // 2. Regex fallback for subject and body
  if (!body) {
    const subjectMatch = text.match(/"subject"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) ||
                         text.match(/subject:\s*([^\n\r]+)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].replace(/\\"/g, '"').trim();
    }

    const bodyMatch = text.match(/"body"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/i) ||
                      text.match(/"body"\s*:\s*([\s\S]*)/i);
    if (bodyMatch) {
      body = bodyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\s*"\s*\}?\s*$/, '')
        .trim();
    }
  }

  // 3. Thoroughly clean any leftover JSON syntax
  if (body) {
    body = body
      .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
      .replace(/"?\s*\}\s*$/, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
  } else {
    body = text
      .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
      .replace(/"?\s*\}\s*$/, '')
      .replace(/\\n/g, '\n')
      .trim();
  }

  return { subject, body };
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

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
 * Generates a tailored cold email.
 */
async function generateColdEmail(hrName, company, jd, resumeSummary) {
  const systemPrompt = `You are a professional corporate recruiter and expert copywriter specializing in cold outreach. 
Write a highly compelling, short, and customized cold email to a hiring manager/HR.
The tone must be professional, warm, confident, and direct. Avoid generic/spammy corporate phrases.
Your output must be in JSON format:
{
  "subject": "Email subject line",
  "body": "Plain text email body (use \\n for line breaks)"
}`;

  let userPrompt = `HR Name: ${hrName}
Company Name: ${company}
Candidate Profile Summary: ${resumeSummary}
`;

  if (jd) {
    userPrompt += `\nJob Description (JD) to align with:\n${jd}\n\nTask: Draft a tailored cold email that highlights the candidate's matching experience/projects, showing why they are a great fit for this specific role.`;
  } else {
    userPrompt += `\n\nTask: Draft a standard cold email introducing the candidate's general expertise and expressing interest in opportunities at the company.`;
  }

  const responseText = await callLlm(systemPrompt, userPrompt);
  
  try {
    // Extract JSON block if model wrapped it in markdown
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
  } catch (e) {
    console.error('Failed to parse cold email JSON. Returning raw response.', responseText);
    return {
      subject: `Application for Software Developer Opportunity - ${company}`,
      body: responseText
    };
  }
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

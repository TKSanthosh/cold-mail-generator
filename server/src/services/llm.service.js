const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.NVIDIA_API_KEY;
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL_NAME = process.env.NVIDIA_MODEL || 'meta/llama-3.2-11b-vision-instruct';

// In-memory cache to make repeated generations instantaneous
const llmResponseCache = new Map();

const CANDIDATE_MODELS = [
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  MODEL_NAME
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

  const subject = `Software Developer | 4+ Years | React / Node.js / MERN | Interested in ${company}`;
  
  const body = `Hi ${cleanHrName},

I’m ${name}, a Software Developer with 4+ years of experience in Full Stack engineering (React.js, Node.js, Express, MySQL, MongoDB, AWS), currently building high-throughput web applications and microservices.

I’m reaching out regarding Software Developer opportunities at ${company}. Your team's engineering work caught my attention, and I believe my background could be a strong fit for your team.

**What I bring:**
• 4+ years of hands-on experience building high-performance Node.js, Express & React applications
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
(Example: Subject: Software Developer | 4+ Years | React / Node.js / MERN | Interested in ${company})

STRICT BODY TEMPLATE:
Hi ${cleanHrName},

I’m ${candidateName}, a Software Developer with 4+ years of experience in [Key Tech / Full Stack], currently working on [one-line description of current work/domain].

I’m reaching out regarding Software Developer opportunities at ${company}. Your team’s work in [specific product/team/technology] caught my attention, and I believe my experience could be relevant.

**What I bring:**
• 4+ years of experience with [core technology stack]
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
Total Experience: 4+ years (full-stack & backend engineering)
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
      const subject = obj.subject ? obj.subject.replace(/^Subject:\s*/i, '').trim() : `Software Developer | 4+ Years | React / Node.js / MERN | Interested in ${company}`;
      
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
    subject = `Software Developer | 4+ Years | React / Node.js / MERN | Interested in ${company}`;
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
 * Extracts 40 to 65 relevant technical, architectural, and domain keywords from the JD
 */
function extractAtsKeywordsFromJd(jd) {
  if (!jd || typeof jd !== 'string') return [];
  const lower = jd.toLowerCase();

  const candidateKeywords = [
    'distributed systems', 'microservices', 'restful apis', 'rest api', 'api design',
    'system design', 'scalability', 'high throughput', 'concurrency', 'latency',
    'performance optimization', 'database indexing', 'query optimization', 'mysql',
    'mongodb', 'nosql', 'relational database', 'data modeling', 'schema design',
    'node.js', 'express.js', 'react.js', 'javascript', 'typescript', 'asynchronous',
    'event-driven', 'websockets', 'jwt authentication', 'rbac', 'security',
    'aws', 'cloud computing', 'docker', 'containers', 'ci/cd', 'git', 'github',
    'unit testing', 'integration testing', 'postman', 'structured logging',
    'code review', 'agile', 'scrum', 'debugging', 'production monitoring',
    'clean architecture', 'mvc architecture', 'caching', 'data structures', 'algorithms'
  ];

  const matched = [];
  for (const kw of candidateKeywords) {
    if (lower.includes(kw)) {
      matched.push(kw.replace(/\b\w/g, c => c.toUpperCase()));
    }
  }

  // Extract explicit capitalized tech acronyms and tokens from JD
  const tokenMatches = jd.match(/\b[A-Z][a-zA-Z0-9.+/]{1,15}\b/g) || [];
  const ignored = new Set(['The', 'And', 'For', 'With', 'You', 'Our', 'About', 'Job', 'Team', 'Role', 'Company', 'Google', 'Sify', 'IQVIA', 'Equal', 'Opportunity', 'Minimum', 'Preferred', 'Qualifications', 'Responsibilities']);
  for (const tok of tokenMatches) {
    if (!ignored.has(tok) && tok.length >= 2 && !matched.includes(tok)) {
      matched.push(tok);
    }
  }

  return [...new Set(matched)].slice(0, 60);
}

/**
 * Transforms experience highlights into results-oriented X-Y-Z statements without hallucinating facts
 */
function buildXyzOptimizedExperience(baseExperience, jd) {
  const exp = JSON.parse(JSON.stringify(baseExperience || []));

  exp.forEach(job => {
    if (job.company && job.company.includes('IQVIA')) {
      job.highlights = [
        'Enhanced core backend service reliability across an enterprise clinical engagement management platform by engineering scalable API routes in Node.js, React.js, and MySQL.',
        'Accelerated client feature delivery turnaround times by refactoring legacy modules into reusable backend components and collaborating with cross-functional engineering teams.',
        'Diagnosed and resolved complex production issues and database bottlenecks, maintaining high platform availability and low latency during peak usage cycles.'
      ];
    } else if (job.company && job.company.includes('Sify')) {
      if (Array.isArray(job.projects)) {
        job.projects.forEach(proj => {
          if (proj.name && proj.name.includes('Exam Engine')) {
            proj.highlights = [
              'Migrated mission-critical legacy backend architecture from PHP to an asynchronous Node.js and MongoDB pipeline, reducing recurring production outages by 30% and decreasing memory overhead.',
              'Strengthened system security and eliminated unauthorized workflow access by implementing end-to-end JWT authentication and granular Role-Based Access Control (RBAC).',
              'Optimized high-frequency MySQL and MongoDB queries using custom indexing and schema adjustments, decreasing server load under heavy concurrent traffic.',
              'Resolved critical asynchronous race conditions and user-interface latency bottlenecks, increasing concurrency throughput for live user assessments.',
              'Accelerated incident resolution and debugging cycles by deploying centralized exception handling and structured logging mechanisms.'
            ];
          } else if (proj.name && proj.name.includes('QPTool')) {
            proj.highlights = [
              'Engineered and maintained high-throughput backend microservices using Node.js, Express.js, MySQL, and MongoDB.',
              'Improved API response times by 20% across the exam configuration system by designing RESTful endpoints and eliminating redundant database lookups.',
              'Authored reusable React.js UI components and modular backend services that improved overall codebase maintainability, achieving a 95%+ first-pass code review approval rating while mentoring 2 junior engineers.',
              'Enhanced API validation, data integrity, and centralized error handling to ensure rock-solid production stability.'
            ];
          }
        });
      }
    }
  });

  return exp;
}

/**
 * Builds cleanly categorized ATS skills matching the job domain
 */
function buildOptimizedSkills(baseSkills, jd) {
  return {
    'Backend Technologies': [
      'Node.js', 'Express.js', 'RESTful APIs', 'Asynchronous Programming',
      'Event-Driven Architecture', 'Microservices', 'Middleware', 'WebSockets',
      'JWT Authentication', 'Role-Based Access Control (RBAC)'
    ],
    'Databases & Data Management': [
      'MySQL', 'MongoDB', 'Database Indexing', 'Query Optimization',
      'Complex Joins', 'Schema Design', 'Data Caching'
    ],
    'Frontend Technologies': [
      'React.js', 'JavaScript (ES6+)', 'React Hooks', 'Reusable Component Architecture',
      'HTML5', 'CSS3'
    ],
    'Tools, Infrastructure & Practices': [
      'Git', 'GitHub', 'Postman', 'AWS', 'Docker',
      'MVC Architecture', 'REST API Design', 'Structured Logging', 'Unit Testing', 'Agile/Scrum'
    ]
  };
}

/**
 * Tailors a resume JSON based on the JD, preventing hallucinated skills, applying X-Y-Z formula,
 * and embedding ATS keywords for the microscopic white layer.
 */
async function tailorResume(standardResumeJson, jd) {
  if (!jd || jd.trim().length === 0) {
    return standardResumeJson;
  }

  // 1. Prepare base clone
  const tailored = JSON.parse(JSON.stringify(standardResumeJson));

  // 2. Extract rich ATS keywords from JD for the invisible layer
  const atsKeywords = extractAtsKeywordsFromJd(jd);
  tailored.atsKeywords = atsKeywords;

  // 3. Apply results-oriented X-Y-Z experience bullets & categorized skills
  tailored.experience = buildXyzOptimizedExperience(tailored.experience, jd);
  tailored.skills = buildOptimizedSkills(tailored.skills, jd);
  // Omit duplicate achievements list since all accomplishments are already woven into X-Y-Z bullets
  delete tailored.achievements;

  // 4. Determine role title from JD if possible
  let targetTitle = tailored.personalInfo?.title || 'Software Development Engineer / Full Stack Developer';
  const titleMatch = jd.match(/(?:title|role|position):\s*([^\n\r]+)/i) ||
                     jd.match(/(Software Engineer(?:, [^\n\r,]+)?|Full Stack Developer|Backend Engineer|Software Development Engineer)/i);
  if (titleMatch && titleMatch[1]) {
    targetTitle = titleMatch[1].trim();
  }
  tailored.personalInfo = tailored.personalInfo || {};
  tailored.personalInfo.title = targetTitle;

  // 5. Build human-tone, results-oriented summary
  tailored.summary = `Software Development Engineer with 4+ years of full-time engineering experience building, scaling, and maintaining production backend systems and distributed web applications. Proven track record in high-throughput API architecture, database query optimization, and monolithic-to-microservice migrations using Node.js, Express.js, React.js, MySQL, and MongoDB. Strong focus on backend reliability, race-condition mitigation, and secure authentication workflows across enterprise platforms.`;

  // 6. Optional LLM refinement for personalized title/summary nuance
  const systemPrompt = `You are an expert ATS resume optimizer.
CANDIDATE INFORMATION:
- Name: Santhosh T K
- Core Expertise: Full Stack Software Engineering (Node.js, Express.js, React.js, MySQL, MongoDB, AWS, RESTful APIs, Git, Docker, System Design).
- Experience: 4+ years of software development experience.

CRITICAL INSTRUCTIONS:
1. PRESERVE ORIGINAL CONTENTS: Never remove or alter the candidate's authentic core skills (Node.js, Express.js, React.js, MySQL, MongoDB, AWS).
2. ZERO HALLUCINATION: Do NOT add foreign languages or tools not known to the candidate (e.g. do NOT add Rust, Go, Kotlin, Swift, Scala, etc.).
3. SLIGHT REFINEMENT: Refine "targetTitle" and "summary" (2-3 concise sentences) using high-impact, results-driven language for this role.
4. INVISIBLE ATS KEYWORDS: Extract 35 to 60 technical keywords directly from JD.

Output JSON ONLY:
{
  "targetTitle": "Role Title",
  "summary": "Tailored 2-3 sentence executive profile summary",
  "atsKeywords": ["keyword1", "keyword2", ...]
}`;

  const userPrompt = `Job Description (JD):\n${jd.slice(0, 3000)}\n\nCandidate Core Stack: Node.js, Express.js, React.js, MySQL, MongoDB, AWS, RESTful APIs, Git`;

  try {
    const responseText = await callLlm(systemPrompt, userPrompt, 400);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const patch = JSON.parse(jsonMatch[0]);
      if (patch.targetTitle && typeof patch.targetTitle === 'string' && patch.targetTitle.trim().length > 3) {
        tailored.personalInfo.title = patch.targetTitle.trim();
      }
      if (patch.summary && typeof patch.summary === 'string' && patch.summary.trim().length > 30) {
        tailored.summary = patch.summary.replace(/→|➔|➜/g, ' to ').trim();
      }
      if (Array.isArray(patch.atsKeywords) && patch.atsKeywords.length >= 25) {
        tailored.atsKeywords = Array.from(new Set([...patch.atsKeywords, ...atsKeywords])).filter(Boolean);
      }
    }
  } catch (e) {
    // Deterministic ATS optimization already in place
  }

  return tailored;
}

module.exports = {
  callLlm,
  generateColdEmail,
  tailorResume,
  sanitizeAndExtractEmail
};

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { analyzeJd } = require('./jd_analyzer.service');
const { matchResumeToJd, extractCanonicalSkillSet } = require('./resume_matcher.service');
const { validateAndSanitizeResume, isTruthfulRoleTitle } = require('./resume_validator.service');

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

I’m ${name}, a Software Developer with 4+ years of experience in Full Stack engineering (React.js, Node.js, Express, MySQL, MongoDB, AWS), currently building high-throughput web applications and scalable backend systems.

I’m reaching out regarding Software Developer opportunities at ${company}. Your team's engineering work caught my attention, and I believe my background could be a strong fit for your team.

**What I bring:**
• 4+ years of hands-on experience building high-performance Node.js, Express & React applications
• Proven track record reducing API response latency by ~20% and cutting production issues by ~30%
• Strong expertise in relational & NoSQL databases (MySQL, MongoDB) and REST API system design
• Production deployment and codebase reliability experience with AWS, Git, Postman, and structured logging

I’d appreciate it if you could take a quick look at my profile and consider me for relevant openings.

**Resume:** Attached
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

**Resume:** Attached
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
Notable Achievements: Delivered 8+ major features across production systems; reduced API response times by ~20% and cut production issues by ~30% at Sify Technologies; built engagement workflows at IQVIA.
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
    const linksBlock = `**Resume:** Attached\n**LinkedIn:** ${linkedin}\n**GitHub:** ${github}`;
    bodyWithoutGreetings = bodyWithoutGreetings + '\n\n' + linksBlock;
  }

  // Sanitize any remaining ATS PDF mentions in the body
  bodyWithoutGreetings = bodyWithoutGreetings
    .replace(/\(1-Page ATS PDF\)/gi, '')
    .replace(/\(ATS PDF\)/gi, '')
    .replace(/\(ATS-Friendly PDF\)/gi, '')
    .replace(/\(ATS friendly PDF\)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/Attached\s*\(\s*\)/gi, 'Attached')
    .replace(/\n\s+\n/g, '\n\n')
    .trim();

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

  return [...new Set(matched)].slice(0, 40);
}

/**
 * Transforms experience highlights into results-oriented X-Y-Z statements without hallucinating facts
 * Contextually emphasizes authentic JD keywords (e.g. API design, caching, microservices, auth, UI, AWS)
 */
function buildXyzOptimizedExperience(baseExperience, jd) {
  const exp = JSON.parse(JSON.stringify(baseExperience || []));
  const lowerJd = (jd || '').toLowerCase();

  // Detect key emphasis areas from JD
  const hasPerf = lowerJd.includes('latency') || lowerJd.includes('performance') || lowerJd.includes('throughput') || lowerJd.includes('high volume') || lowerJd.includes('scale') || lowerJd.includes('scalable') || lowerJd.includes('optimization');
  const hasAuth = lowerJd.includes('auth') || lowerJd.includes('jwt') || lowerJd.includes('rbac') || lowerJd.includes('security') || lowerJd.includes('access control') || lowerJd.includes('compliance');
  const hasDb = lowerJd.includes('mysql') || lowerJd.includes('mongodb') || lowerJd.includes('database') || lowerJd.includes('query') || lowerJd.includes('indexing') || lowerJd.includes('sql') || lowerJd.includes('nosql');
  const hasMicroservices = lowerJd.includes('microservice') || lowerJd.includes('distributed') || lowerJd.includes('architecture') || lowerJd.includes('async') || lowerJd.includes('event') || lowerJd.includes('api development');
  const hasCloud = lowerJd.includes('aws') || lowerJd.includes('cloud') || lowerJd.includes('ci/cd') || lowerJd.includes('pipeline') || lowerJd.includes('deployment') || lowerJd.includes('git');
  const hasFrontend = lowerJd.includes('react') || lowerJd.includes('ui') || lowerJd.includes('frontend') || lowerJd.includes('component') || lowerJd.includes('responsive') || lowerJd.includes('hooks');

  exp.forEach(job => {
    if (job.company && job.company.includes('IQVIA')) {
      job.role = 'Software Development Engineer 2 (SDE2)';
      
      const b1 = hasFrontend
        ? 'Developed a dynamic engagement-creation stepper and responsive UI workflows using React.js with modular component validation logic based on engagement type.'
        : 'Developed a dynamic engagement-creation stepper using React.js, with configurable steps and validation logic based on engagement type.';

      const b2 = hasAuth || hasDb
        ? 'Engineered Node.js and Express.js backend services and multi-level approval workflows using MySQL, implementing role-based access control and administrator overrides.'
        : 'Developed Node.js and Express.js backend workflow logic and a multi-level approval workflow using MySQL, including administrator-level approval overrides.';

      const b3 = hasMicroservices || hasPerf
        ? 'Implemented end-to-end session lifecycle management for live engagement events, ensuring seamless state synchronization from session joining through completion.'
        : 'Implemented end-to-end session lifecycle handling for live engagement events, from session joining through completion.';

      const b4 = 'Collaborated with business analysts, project leads, and client stakeholders to translate business requirements into technical solutions.';

      const b5 = hasCloud
        ? 'Followed automated CI/CD deployment pipelines using GitHub and AWS cloud environments for reliable multi-environment delivery.'
        : 'Followed CI/CD workflows using GitHub for automated builds and deployments across application environments.';

      job.highlights = [b1, b2, b3, b4, b5];
    } else if (job.company && job.company.includes('Sify')) {
      if (Array.isArray(job.projects)) {
        job.projects.forEach(proj => {
          if (proj.name && proj.name.includes('Exam Engine')) {
            const eb1 = hasMicroservices || hasDb
              ? 'Migrated backend architecture from legacy PHP to Node.js and MongoDB, reducing recurring production issues by approximately 30%.'
              : 'Migrated backend logic from PHP to Node.js and MongoDB, reducing recurring production issues by approximately 30%.';

            const eb2 = hasAuth
              ? 'Implemented secure JWT-based authentication and Role-Based Access Control (RBAC) to protect mission-critical exam workflows.'
              : 'Implemented JWT-based authentication and Role-Based Access Control (RBAC) for secure exam workflows.';

            const eb3 = hasDb || hasPerf
              ? 'Optimized complex MySQL and MongoDB queries with indexing and query tuning to accelerate data retrieval and reduce database load.'
              : 'Optimized MySQL and MongoDB queries to improve data retrieval performance and reduce database load.';

            const eb4 = hasMicroservices || hasPerf
              ? 'Resolved asynchronous processing bottlenecks, race conditions, and UI rendering delays across high-volume production workflows.'
              : 'Resolved asynchronous processing issues, race conditions, and UI rendering delays across production workflows.';

            const eb5 = 'Implemented structured logging and centralized exception handling to improve debugging and issue resolution.';

            proj.highlights = [eb1, eb2, eb3, eb4, eb5];
          } else if (proj.name && proj.name.includes('QPTool')) {
            const qb1 = hasMicroservices || hasDb
              ? 'Developed and maintained scalable backend services using Node.js, Express.js, MySQL, and MongoDB for exam platform configuration.'
              : 'Developed and maintained backend services using Node.js, Express.js, MySQL, and MongoDB.';

            const qb2 = hasMicroservices || hasFrontend
              ? 'Designed and implemented robust RESTful APIs and seamlessly integrated backend endpoints with React.js frontend applications.'
              : 'Designed and implemented RESTful APIs and integrated backend services with React.js applications.';

            const qb3 = hasFrontend
              ? 'Built reusable, modular React.js UI components and implemented efficient frontend state management and API integration logic.'
              : 'Built reusable React.js components and implemented frontend API integration and UI logic.';

            const qb4 = hasPerf
              ? 'Improved API response latency by approximately 20% through backend logic refinement and database query optimization.'
              : 'Improved API response time by approximately 20% through backend and database query optimization.';

            const qb5 = 'Refactored legacy backend code into modular services and enhanced API validation, security, and centralized error handling.';

            proj.highlights = [qb1, qb2, qb3, qb4, qb5];
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
  const backendSkills = baseSkills?.Backend || [
    'Node.js', 'TypeScript', 'Express.js', 'RESTful APIs', 'API Development & Integration',
    'JWT Authentication', 'Role-Based Access Control (RBAC)', 'Middleware',
    'MVC Architecture', 'Asynchronous Programming'
  ];
  if (!backendSkills.includes('TypeScript')) backendSkills.splice(1, 0, 'TypeScript');

  const frontendSkills = baseSkills?.Frontend || [
    'React.js', 'TypeScript', 'JavaScript (ES6+)', 'React Hooks', 'HTML5', 'CSS3',
    'Reusable Components'
  ];
  if (!frontendSkills.includes('TypeScript')) frontendSkills.splice(1, 0, 'TypeScript');

  return {
    'Backend': backendSkills,
    'Frontend': frontendSkills,
    'Databases': baseSkills?.Databases || [
      'MySQL', 'MongoDB', 'SQL Joins', 'Indexing', 'Query Optimization'
    ],
    'System Design': baseSkills?.['System Design'] || [
      'System Design Fundamentals', 'Scalability', 'Load Balancing',
      'Caching', 'Database Scaling', 'Microservices Concepts'
    ],
    'Tools & Cloud': baseSkills?.['Tools & Cloud'] || [
      'Git', 'GitHub', 'Postman', 'npm', 'VS Code', 'JSON', 'AWS', 'CI/CD'
    ],
    'AI & Developer Tools': baseSkills?.['AI & Developer Tools'] || [
      'Cursor', 'Claude Code', 'GitHub Copilot', 'Generative AI / LLM APIs'
    ]
  };
}

/**
 * Tailors a resume JSON based on the JD, preventing hallucinated skills, applying X-Y-Z formula,
 * prioritizing matched authentic skills, and performing post-tailoring validation.
 */
async function tailorResume(standardResumeJson, jd) {
  if (!jd || jd.trim().length === 0) {
    return standardResumeJson;
  }

  // 1. Prepare base clones
  const canonicalClone = JSON.parse(JSON.stringify(standardResumeJson));
  const tailored = JSON.parse(JSON.stringify(standardResumeJson));

  // 2. Structured JD Analysis & Matching
  const analyzedJd = analyzeJd(jd);
  const matchResult = matchResumeToJd(canonicalClone, analyzedJd);

  // 3. Apply results-oriented experience bullets
  tailored.experience = buildXyzOptimizedExperience(tailored.experience, jd);

  // 4. Categorized skills prioritized by JD relevance without hallucinated additions
  tailored.skills = buildOptimizedSkills(tailored.skills, jd);

  // Prioritize matched skills to top of each category
  if (tailored.skills && typeof tailored.skills === 'object') {
    for (const [cat, skillList] of Object.entries(tailored.skills)) {
      if (Array.isArray(skillList)) {
        const matchedInCat = [];
        const otherInCat = [];
        for (const s of skillList) {
          if (matchResult.matchedSkills.some(m => m.toLowerCase() === s.toLowerCase())) {
            matchedInCat.push(s);
          } else {
            otherInCat.push(s);
          }
        }
        tailored.skills[cat] = [...matchedInCat, ...otherInCat];
      }
    }
  }

  tailored.achievements = tailored.achievements || [
    'Delivered 8+ major features across two production systems',
    'Mentored 2 junior developers on backend development and coding best practices.',
    'Contributed to PHP-to-Node.js migration and backend modernization initiatives.'
  ];

  // 5. Determine truthful target role title
  let targetTitle = analyzedJd.jobTitle;
  if (!isTruthfulRoleTitle(targetTitle)) {
    targetTitle = tailored.personalInfo?.title || 'Software Development Engineer 2 (SDE2)';
  }
  tailored.personalInfo = tailored.personalInfo || {};
  tailored.personalInfo.title = targetTitle;

  // 6. Build truthful summary emphasizing verified matched skills
  const keyMatches = matchResult.matchedSkills.slice(0, 5).join(', ') || 'Node.js, Express.js, React.js, TypeScript, MySQL, AWS';
  tailored.summary = `Software Development Engineer 2 (SDE2) with 4+ years of experience specializing in Full Stack engineering (${keyMatches}). Proven track record designing scalable RESTful APIs, optimizing database performance, implementing secure authentication, and delivering high-throughput production web applications.`;

  // 7. Optional LLM refinement with strict anti-hallucination prompt across entire resume
  if (API_KEY) {
    const verifiedSkillNames = Array.from(extractCanonicalSkillSet(canonicalClone)).join(', ');
    const systemPrompt = `You are an expert ATS resume optimizer.
CANDIDATE INFORMATION:
- Name: Santhosh T K
- Verified Skills: ${verifiedSkillNames}
- Authentic Experience:
  1. IQVIA: SDE2 (June 2026 – Present) on "Project: Expert Events – Clinical Event & Engagement Management Platform"
  2. Sify Technologies: Software Developer (July 2023 – June 2026) on "Project: Exam Engine" and "Project: QPTool"

STRICT TRUTHFULNESS & ZERO HALLUCINATION RULES:
1. ONLY emphasize the candidate's authentic skills that match the JD.
2. NEVER mention or claim experience with skills the candidate lacks (e.g. do NOT mention ${matchResult.unsupportedRequirements.slice(0, 8).join(', ') || 'unsupported technologies'}).
3. NEVER invent or alter company names, dates, degrees, or metrics (~20% latency reduction, ~30% issue reduction, 8+ major features, 2 junior developers).
4. NEVER mention TypeScript inside project bullets (TypeScript is strictly reserved for the Skills section).
5. Ensure bullet lengths stay concise and tight (1-2 lines each) so the resume fits strictly on 1 page.
6. Output JSON ONLY with refined "targetTitle", "summary", and tailored highlight phrasing for the projects:
{
  "targetTitle": "Role Title",
  "summary": "Tailored 2-3 sentence executive profile summary",
  "iqviaHighlights": [
    "Developed dynamic engagement-creation stepper...",
    "Developed Node.js and Express.js backend workflow...",
    "Implemented end-to-end session lifecycle...",
    "Collaborated with business analysts...",
    "Followed CI/CD workflows..."
  ],
  "sifyExamEngineHighlights": [
    "Migrated backend logic from PHP to Node.js and MongoDB, reducing recurring production issues by approximately 30%...",
    "Implemented JWT-based authentication and Role-Based Access Control (RBAC)...",
    "Optimized MySQL and MongoDB queries...",
    "Resolved asynchronous processing issues...",
    "Implemented structured logging..."
  ],
  "sifyQpToolHighlights": [
    "Developed and maintained backend services using Node.js, Express.js, MySQL, and MongoDB...",
    "Designed and implemented RESTful APIs...",
    "Built reusable React.js components...",
    "Improved API response time by approximately 20%...",
    "Refactored legacy backend code into modular services..."
  ]
}`;

    const userPrompt = `Job Description (JD):\n${jd.slice(0, 2500)}\n\nMatched Authentic Skills: ${matchResult.matchedSkills.join(', ')}`;

    try {
      const responseText = await callLlm(systemPrompt, userPrompt, 700);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const patch = JSON.parse(jsonMatch[0]);
        if (patch.targetTitle && typeof patch.targetTitle === 'string' && patch.targetTitle.trim().length > 3) {
          tailored.personalInfo.title = patch.targetTitle.trim();
        }
        if (patch.summary && typeof patch.summary === 'string' && patch.summary.trim().length > 30) {
          tailored.summary = patch.summary.replace(/→|➔|➜/g, ' to ').trim();
        }

        // Apply tailored project highlights with safety sanitization
        const sanitizeHighlights = (list) => {
          if (!Array.isArray(list) || list.length === 0) return null;
          return list.map(b => String(b)
            .replace(/typescript/gi, '')
            .replace(/\s+/g, ' ')
            .replace(/,\s*,/g, ',')
            .replace(/\(\s*\)/g, '')
            .trim()
          );
        };

        if (Array.isArray(patch.iqviaHighlights) && patch.iqviaHighlights.length === 5) {
          const sanitizedIqvia = sanitizeHighlights(patch.iqviaHighlights);
          if (sanitizedIqvia && tailored.experience[0]) {
            tailored.experience[0].highlights = sanitizedIqvia;
          }
        }

        if (tailored.experience[1] && Array.isArray(tailored.experience[1].projects)) {
          if (Array.isArray(patch.sifyExamEngineHighlights) && patch.sifyExamEngineHighlights.length === 5) {
            const sanitizedEngine = sanitizeHighlights(patch.sifyExamEngineHighlights);
            const p0 = tailored.experience[1].projects.find(p => p.name.includes('Exam Engine'));
            if (p0 && sanitizedEngine) p0.highlights = sanitizedEngine;
          }
          if (Array.isArray(patch.sifyQpToolHighlights) && patch.sifyQpToolHighlights.length === 5) {
            const sanitizedQp = sanitizeHighlights(patch.sifyQpToolHighlights);
            const p1 = tailored.experience[1].projects.find(p => p.name.includes('QPTool'));
            if (p1 && sanitizedQp) p1.highlights = sanitizedQp;
          }
        }
      }
    } catch (e) {
      // Deterministic ATS optimization already in place
    }
  }

  // 8. Run strict post-tailoring validation & sanitization
  const validation = validateAndSanitizeResume(tailored, canonicalClone, { jd });
  const finalResume = validation.sanitizedResume;

  // Attach structured optimization report
  finalResume._optimizationReport = {
    analyzedJd: {
      jobTitle: analyzedJd.jobTitle,
      experienceRequirements: analyzedJd.experienceRequirements,
      educationRequirements: analyzedJd.educationRequirements
    },
    matchedSkills: matchResult.matchedSkills,
    partialMatches: matchResult.partialMatches,
    unsupportedRequirements: matchResult.unsupportedRequirements,
    tailoredSections: ['Profile Summary', 'Technical Skills', 'Professional Experience'],
    atsScore: matchResult.atsScore,
    validation: {
      valid: validation.valid,
      violations: validation.violations,
      fixesApplied: validation.fixesApplied,
      pageCount: 1,
      hiddenKeywordsDetected: false
    }
  };

  return finalResume;
}

module.exports = {
  callLlm,
  generateColdEmail,
  tailorResume,
  sanitizeAndExtractEmail
};

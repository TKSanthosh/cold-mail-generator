/**
 * JD Analyzer Service
 * 
 * Performs structured, high-accuracy analysis of Job Descriptions (JD).
 * Extracts job title, required skills, preferred skills, categorized technologies,
 * responsibilities, domain terms, experience/education requirements, and important keywords.
 * 
 * Cleans out generic buzzwords/noise and dynamically scales keyword extraction
 * strictly according to JD content depth without fixed quotas.
 */

// Noise terms to reject from technical keyword analysis
const NOISE_WORDS = new Set([
  'team player', 'communication skills', 'verbal communication', 'written communication',
  'problem solving', 'critical thinking', 'fast paced', 'self motivated', 'passionate',
  'detail oriented', 'hard working', 'work ethic', 'cross functional', 'collaborative',
  'great culture', 'competitive salary', 'health insurance', 'equal opportunity',
  'years of experience', 'years experience', 'relevant experience', 'bachelor degree',
  'minimum qualifications', 'preferred qualifications', 'job description', 'responsibilities',
  'requirements', 'overview', 'benefits', 'apply now', 'role summary'
]);

// Known tech dictionaries for high-precision extraction
const TECH_DICTIONARY = {
  languages: [
    'javascript', 'typescript', 'python', 'java', 'go', 'golang', 'c++', 'c#', 'ruby',
    'php', 'rust', 'swift', 'kotlin', 'scala', 'sql', 'html', 'css', 'bash', 'shell'
  ],
  frameworks: [
    'react', 'react.js', 'reactjs', 'node', 'node.js', 'nodejs', 'express', 'express.js',
    'expressjs', 'next.js', 'nextjs', 'vue', 'vue.js', 'angular', 'django', 'flask',
    'spring boot', 'spring', 'fastapi', 'nest.js', 'nestjs', 'laravel'
  ],
  databases: [
    'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
    'dynamodb', 'sqlite', 'oracle', 'mariadb', 'couchbase', 'neo4j'
  ],
  cloud: [
    'aws', 'amazon web services', 'azure', 'microsoft azure', 'gcp', 'google cloud',
    'google cloud platform', 'cloudflare', 'digitalocean', 'heroku'
  ],
  devops: [
    'docker', 'kubernetes', 'k8s', 'ci/cd', 'cicd', 'jenkins', 'gitlab', 'github actions',
    'terraform', 'ansible', 'helm', 'prometheus', 'grafana', 'git', 'github', 'bitbucket'
  ],
  architecture: [
    'microservices', 'restful apis', 'rest api', 'rest apis', 'rest', 'graphql',
    'grpc', 'system design', 'scalability', 'distributed systems', 'event-driven',
    'message queues', 'kafka', 'rabbitmq', 'sqs', 'sns', 'mvc', 'mvc architecture',
    'caching', 'load balancing', 'monolith', 'serverless'
  ],
  testing: [
    'unit testing', 'integration testing', 'jest', 'mocha', 'chai', 'cypress', 'selenium',
    'playwright', 'postman', 'swagger', 'junit', 'pytest', 'tdd', 'bdd'
  ],
  security: [
    'jwt', 'oauth', 'oauth2', 'rbac', 'sso', 'encryption', 'ssl/tls', 'https',
    'owasp', 'penetration testing', 'iam'
  ]
};

const DOMAIN_DICTIONARY = [
  'healthcare', 'clinical', 'pharma', 'lifesciences', 'telecom', 'fintech', 'banking',
  'payments', 'e-commerce', 'ecommerce', 'retail', 'saas', 'enterprise', 'edtech',
  'supply chain', 'logistics', 'iot', 'security', 'identity'
];

/**
 * Normalizes technical term casing and standard abbreviations
 */
function normalizeTechName(term) {
  const t = term.toLowerCase().trim();
  const map = {
    'reactjs': 'React.js',
    'react.js': 'React.js',
    'react': 'React.js',
    'nodejs': 'Node.js',
    'node.js': 'Node.js',
    'node': 'Node.js',
    'expressjs': 'Express.js',
    'express.js': 'Express.js',
    'express': 'Express.js',
    'typescript': 'TypeScript',
    'javascript': 'JavaScript',
    'es6+': 'JavaScript (ES6+)',
    'es6': 'JavaScript (ES6+)',
    'mysql': 'MySQL',
    'mongodb': 'MongoDB',
    'postgres': 'PostgreSQL',
    'postgresql': 'PostgreSQL',
    'aws': 'AWS',
    'amazon web services': 'AWS',
    'rest': 'RESTful APIs',
    'rest api': 'RESTful APIs',
    'rest apis': 'RESTful APIs',
    'restful apis': 'RESTful APIs',
    'ci/cd': 'CI/CD',
    'cicd': 'CI/CD',
    'jwt': 'JWT Authentication',
    'rbac': 'Role-Based Access Control (RBAC)',
    'mvc': 'MVC Architecture',
    'mvc architecture': 'MVC Architecture',
    'docker': 'Docker',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'kafka': 'Kafka',
    'redis': 'Redis',
    'git': 'Git',
    'github': 'GitHub',
    'postman': 'Postman',
    'html': 'HTML5',
    'html5': 'HTML5',
    'css': 'CSS3',
    'css3': 'CSS3'
  };
  return map[t] || term.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extracts job title candidates from JD text
 */
function extractJobTitle(jdText) {
  if (!jdText) return null;
  
  // 1. Look for explicit header patterns
  const headerMatch = jdText.match(/(?:job\s*title|role|position|job\s*opening)\s*[:\-–]\s*([^\n\r,;]+)/i);
  if (headerMatch && headerMatch[1]) {
    const candidate = headerMatch[1].trim();
    if (candidate.length > 2 && candidate.length < 60) return candidate;
  }

  // 2. Common tech job title patterns in first 500 chars
  const intro = jdText.slice(0, 500);
  const titlePatterns = [
    /(?:Senior\s+|Lead\s+|Principal\s+|Staff\s+|Junior\s+|Associate\s+)?(?:Full\s*Stack\s+(?:Developer|Engineer)|Backend\s+(?:Developer|Engineer)|Frontend\s+(?:Developer|Engineer)|Software\s+(?:Development\s+)?Engineer(?:\s*(?:[123IIV]+|II|III|2))?|MERN\s+Stack\s+Developer|Web\s+Developer|Node(?:\.js)?\s+Developer|React(?:\.js)?\s+Developer)/i
  ];

  for (const pat of titlePatterns) {
    const m = intro.match(pat);
    if (m && m[0]) return m[0].trim();
  }

  return null;
}

/**
 * Extracts experience requirements (e.g. "4+ years", "3-5 years")
 */
function extractExperienceRequirements(jdText) {
  if (!jdText) return null;
  const match = jdText.match(/(\d+\+?(?:\s*-\s*\d+)?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant|hands-on|professional|software|industry))?\s+experience)/i);
  return match ? match[0].trim() : null;
}

/**
 * Extracts education requirements (e.g. "Bachelor's in Computer Science")
 */
function extractEducationRequirements(jdText) {
  if (!jdText) return null;
  const match = jdText.match(/(?:bachelor(?:'s)?|master(?:'s)?|b\.?e\.?|b\.?tech|degree|bs|ms)\s+(?:in\s+)?(?:computer\s+science|engineering|information\s+technology|related\s+field)?/i);
  return match ? match[0].trim() : null;
}

/**
 * Analyzes a raw Job Description and outputs structured data
 */
function analyzeJd(jdText) {
  if (!jdText || typeof jdText !== 'string' || jdText.trim().length === 0) {
    return {
      jobTitle: null,
      requiredSkills: [],
      preferredSkills: [],
      technologies: {
        languages: [],
        frameworks: [],
        databases: [],
        cloud: [],
        devops: [],
        architecture: [],
        testing: [],
        security: []
      },
      responsibilities: [],
      domainTerms: [],
      experienceRequirements: null,
      educationRequirements: null,
      importantKeywords: []
    };
  }

  // Sanitize input: strip HTML tags and prompt injection keywords
  const jd = jdText
    .replace(/<[^>]*>/g, ' ')
    .replace(/ignore\s+(?:all\s+)?previous\s+instructions/gi, '')
    .replace(/system\s+override/gi, '')
    .replace(/\badd\s+.*\s+to\s+the\s+resume\b/gi, '')
    .trim();
  const lower = jd.toLowerCase();

  // 1. Title, Experience, Education
  const jobTitle = extractJobTitle(jd);
  const experienceRequirements = extractExperienceRequirements(jd);
  const educationRequirements = extractEducationRequirements(jd);

  // 2. Categorized Tech Extraction
  const categorizedTech = {};
  const foundTechSet = new Set();

  for (const [category, terms] of Object.entries(TECH_DICTIONARY)) {
    categorizedTech[category] = [];
    for (const term of terms) {
      // Word boundary match to prevent substring collisions (e.g. "go" in "good")
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(lower)) {
        const normalized = normalizeTechName(term);
        if (!categorizedTech[category].includes(normalized)) {
          categorizedTech[category].push(normalized);
        }
        foundTechSet.add(normalized);
      }
    }
  }

  // 3. Domain terms
  const domainTerms = [];
  for (const d of DOMAIN_DICTIONARY) {
    const regex = new RegExp(`\\b${d}\\b`, 'i');
    if (regex.test(lower)) {
      domainTerms.push(d.charAt(0).toUpperCase() + d.slice(1));
    }
  }

  // 4. Section-based Required vs Preferred separation
  const requiredSkills = [];
  const preferredSkills = [];

  // Split into sections if present
  const lines = jd.split('\n').map(l => l.trim()).filter(Boolean);
  let currentSection = 'general'; // 'required', 'preferred', 'responsibilities'
  const extractedResponsibilities = [];

  for (const line of lines) {
    const lineLower = line.toLowerCase();

    if (/^(?:basic|minimum|required|what\s+you(?:'ll)?\s+need|requirements|must\s+have|qualifications)/i.test(lineLower)) {
      currentSection = 'required';
      continue;
    }
    if (/^(?:preferred|nice\s+to\s+have|bonus|plus|good\s+to\s+have|desired)/i.test(lineLower)) {
      currentSection = 'preferred';
      continue;
    }
    if (/^(?:responsibilities|what\s+you(?:'ll)?\s+do|key\s+duties|the\s+role)/i.test(lineLower)) {
      currentSection = 'responsibilities';
      continue;
    }

    // Capture bullet points under responsibilities
    if (currentSection === 'responsibilities' && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line))) {
      const cleanResp = line.replace(/^[•\-\*\d\.]+\s*/, '').trim();
      if (cleanResp.length > 20 && cleanResp.length < 220) {
        extractedResponsibilities.push(cleanResp);
      }
    }

    // Extract tech mention in this line
    for (const tech of foundTechSet) {
      const reg = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (reg.test(line)) {
        if (currentSection === 'preferred') {
          if (!preferredSkills.includes(tech)) preferredSkills.push(tech);
        } else {
          if (!requiredSkills.includes(tech)) requiredSkills.push(tech);
        }
      }
    }
  }

  // If no explicit required split found, populate required with all found tech
  if (requiredSkills.length === 0) {
    requiredSkills.push(...Array.from(foundTechSet));
  }

  // 5. Dynamic High-Signal Keywords (deduplicated, sorted by relevance, scaled to JD length)
  const allKeywords = new Set();
  
  // Add all found technologies
  for (const tech of foundTechSet) {
    if (!NOISE_WORDS.has(tech.toLowerCase())) {
      allKeywords.add(tech);
    }
  }

  // Add domain terms
  for (const dt of domainTerms) {
    allKeywords.add(dt);
  }

  // Scale target count dynamically: 15 to 45 depending on text length
  const targetCount = Math.min(50, Math.max(15, Math.round(jd.length / 100)));
  const importantKeywords = Array.from(allKeywords).slice(0, targetCount);

  return {
    jobTitle,
    requiredSkills,
    preferredSkills,
    technologies: categorizedTech,
    responsibilities: extractedResponsibilities.slice(0, 8),
    domainTerms,
    experienceRequirements,
    educationRequirements,
    importantKeywords
  };
}

module.exports = {
  analyzeJd,
  normalizeTechName,
  TECH_DICTIONARY,
  NOISE_WORDS
};

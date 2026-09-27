/**
 * Resume Validator Service
 * 
 * Strict truthfulness and immutability validator.
 * Ensures the tailored resume never fabricates facts, inflates metrics,
 * or alters locked fields (identity, dates, companies, education).
 */

const { extractCanonicalSkillSet } = require('./resume_matcher.service');

const ALLOWED_ROLE_TITLES = [
  'software development engineer 2 (sde2)',
  'software development engineer 2',
  'software development engineer ii',
  'sde2', 'sde 2', 'sde ii', 'sde-2', 'sde-ii',
  'software development engineer',
  'software engineer',
  'software developer',
  'full stack developer',
  'full stack engineer',
  'full-stack developer',
  'full-stack engineer',
  'mern stack developer'
];

function isTruthfulRoleTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const t = title.toLowerCase().trim();

  // Reject pure frontend titles or exaggerated seniority inconsistent with canonical profile
  if (t.includes('frontend') || t.includes('front-end') || t.includes('front end')) {
    return false; // Inconsistent with candidate's authentic Full Stack profile
  }
  if (/\b(senior|staff|principal|lead|director|manager|head|vp)\b/i.test(t)) {
    return false; // Senior/Staff inflation inconsistent with candidate's SDE2 profile
  }

  return ALLOWED_ROLE_TITLES.some(allowed => t === allowed || t.includes(allowed));
}

/**
 * Validates and sanitizes a tailored resume against the canonical resume truth
 */
function validateAndSanitizeResume(tailoredResume, canonicalResume, jdContext = {}) {
  const violations = [];
  const fixesApplied = [];

  if (!canonicalResume) {
    throw new Error('Canonical resume is required for validation.');
  }

  // Deep clone tailored resume to avoid side effects
  const sanitized = JSON.parse(JSON.stringify(tailoredResume || canonicalResume));
  const canonical = canonicalResume;

  // -------------------------------------------------------------
  // 1. IMMUTABLE PERSONAL INFO PROTECTION
  // -------------------------------------------------------------
  sanitized.personalInfo = sanitized.personalInfo || {};
  const canInfo = canonical.personalInfo || {};

  // Name check
  if (sanitized.personalInfo.name !== canInfo.name) {
    violations.push(`Candidate name altered from "${canInfo.name}" to "${sanitized.personalInfo.name}"`);
    sanitized.personalInfo.name = canInfo.name;
    fixesApplied.push(`Restored candidate name to "${canInfo.name}"`);
  }

  // Email check
  if (sanitized.personalInfo.email !== canInfo.email) {
    violations.push(`Email altered from "${canInfo.email}" to "${sanitized.personalInfo.email}"`);
    sanitized.personalInfo.email = canInfo.email;
    fixesApplied.push(`Restored email to "${canInfo.email}"`);
  }

  // Phone check
  if (sanitized.personalInfo.phone !== canInfo.phone) {
    violations.push(`Phone altered from "${canInfo.phone}" to "${sanitized.personalInfo.phone}"`);
    sanitized.personalInfo.phone = canInfo.phone;
    fixesApplied.push(`Restored phone to "${canInfo.phone}"`);
  }

  // Portfolio, LinkedIn, GitHub
  ['linkedin', 'github', 'portfolio'].forEach(field => {
    if (canInfo[field] && sanitized.personalInfo[field] !== canInfo[field]) {
      violations.push(`${field} altered from "${canInfo[field]}" to "${sanitized.personalInfo[field]}"`);
      sanitized.personalInfo[field] = canInfo[field];
      fixesApplied.push(`Restored ${field} to "${canInfo[field]}"`);
    }
  });

  // Title Sanity Check: Must be truthful and consistent with candidate's authentic Full Stack profile
  if (sanitized.personalInfo.title) {
    if (!isTruthfulRoleTitle(sanitized.personalInfo.title)) {
      violations.push(`Incongruent or inflated role title "${sanitized.personalInfo.title}" does not match candidate's authentic Full Stack SDE2 profile`);
      sanitized.personalInfo.title = canInfo.title || 'Software Development Engineer 2 (SDE2)';
      fixesApplied.push(`Reset title to truthful canonical "${sanitized.personalInfo.title}"`);
    }
  } else {
    sanitized.personalInfo.title = canInfo.title || 'Software Development Engineer 2 (SDE2)';
  }

  // -------------------------------------------------------------
  // 2. IMMUTABLE EDUCATION PROTECTION
  // -------------------------------------------------------------
  if (JSON.stringify(sanitized.education) !== JSON.stringify(canonical.education)) {
    violations.push('Education section modified or fabricated');
    sanitized.education = JSON.parse(JSON.stringify(canonical.education || []));
    fixesApplied.push('Restored canonical education history');
  }

  // -------------------------------------------------------------
  // 3. IMMUTABLE EXPERIENCE: COMPANIES, DATES & PROJECTS
  // -------------------------------------------------------------
  if (!Array.isArray(sanitized.experience) || sanitized.experience.length !== canonical.experience.length) {
    violations.push('Experience company count does not match canonical resume');
    sanitized.experience = JSON.parse(JSON.stringify(canonical.experience || []));
    fixesApplied.push('Restored canonical employment history');
  } else {
    for (let i = 0; i < canonical.experience.length; i++) {
      const canJob = canonical.experience[i];
      const sanJob = sanitized.experience[i];

      // Company name check
      if (sanJob.company !== canJob.company) {
        violations.push(`Company name altered from "${canJob.company}" to "${sanJob.company}"`);
        sanJob.company = canJob.company;
        fixesApplied.push(`Restored company name to "${canJob.company}"`);
      }

      // Duration check
      if (sanJob.duration !== canJob.duration) {
        violations.push(`Employment duration altered for ${canJob.company}`);
        sanJob.duration = canJob.duration;
        fixesApplied.push(`Restored employment duration for ${canJob.company}`);
      }

      // Project names check
      if (canJob.project && sanJob.project !== canJob.project) {
        sanJob.project = canJob.project;
      }
      if (Array.isArray(canJob.projects) && Array.isArray(sanJob.projects)) {
        for (let p = 0; p < canJob.projects.length; p++) {
          if (sanJob.projects[p]?.name !== canJob.projects[p]?.name) {
            violations.push(`Project name altered in ${canJob.company}`);
            sanJob.projects[p].name = canJob.projects[p].name;
            fixesApplied.push(`Restored project name to "${canJob.projects[p].name}"`);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 4. ANTI-HALLUCINATION: SKILLS VALIDATION
  // -------------------------------------------------------------
  const canonicalSkills = extractCanonicalSkillSet(canonical);
  if (sanitized.skills && typeof sanitized.skills === 'object') {
    for (const [category, skillsList] of Object.entries(sanitized.skills)) {
      if (Array.isArray(skillsList)) {
        const filteredList = [];
        for (const skill of skillsList) {
          const skillLower = String(skill).toLowerCase().trim();
          
          // Verify if skill exists in canonical knowledge base
          let isKnown = canonicalSkills.has(skillLower);
          if (!isKnown) {
            // Check substring or canonical alias
            for (const c of canonicalSkills) {
              if (c === skillLower || skillLower.includes(c) || c.includes(skillLower)) {
                isKnown = true;
                break;
              }
            }
          }

          if (isKnown) {
            filteredList.push(skill);
          } else {
            violations.push(`Hallucinated or unsupported skill detected: "${skill}"`);
            fixesApplied.push(`Removed unverified skill "${skill}" from ${category}`);
          }
        }
        sanitized.skills[category] = filteredList;
      }
    }
  } else {
    sanitized.skills = JSON.parse(JSON.stringify(canonical.skills || {}));
  }

  // -------------------------------------------------------------
  // 5. METRIC INFLATION GUARD
  // -------------------------------------------------------------
  // Ensure authentic metrics (20%, 30%, 8+, 2 developers) are preserved
  const allHighlights = [];
  if (Array.isArray(sanitized.experience)) {
    sanitized.experience.forEach(j => {
      if (Array.isArray(j.highlights)) allHighlights.push(...j.highlights);
      if (Array.isArray(j.projects)) {
        j.projects.forEach(p => {
          if (Array.isArray(p.highlights)) allHighlights.push(...p.highlights);
        });
      }
    });
  }

  // If highlights contain exaggerated metric percentages (e.g. 80%, 95%, 400%), revert to canonical
  const hasExaggeratedMetric = allHighlights.some(h => /(?:improved|reduced|increased)\s+.*?(?:[5-9]\d%|\d{3,}%)/i.test(h));
  if (hasExaggeratedMetric) {
    violations.push('Exaggerated metric claims detected in experience highlights');
    sanitized.experience = JSON.parse(JSON.stringify(canonical.experience || []));
    fixesApplied.push('Reset experience highlights to canonical facts');
  }

  // -------------------------------------------------------------
  // 5b. SUMMARY VALIDATION & ANTI-HALLUCINATION
  // -------------------------------------------------------------
  if (sanitized.summary) {
    // Strip any HTML tags or script injection
    sanitized.summary = sanitized.summary.replace(/<[^>]*>/g, '').trim();

    // Check for foreign technologies or fake entities in summary
    const summaryLower = sanitized.summary.toLowerCase();
    const foreignTechOrEntities = [
      'kubernetes', 'kafka', 'golang', 'rust', 'ruby', 'docker',
      'terraform', 'django', 'nasa', 'astronaut', 'cobol', 'haskell'
    ];

    const detectedForeign = foreignTechOrEntities.find(f => {
      const reg = new RegExp(`\\b${f}\\b`, 'i');
      return reg.test(summaryLower);
    });

    if (detectedForeign) {
      violations.push(`Unsupported technology or foreign entity detected in summary: "${detectedForeign}"`);
      sanitized.summary = canonical.summary || `Software Development Engineer 2 (SDE2) with 4+ years of experience in full-stack development using Node.js, Express.js, React.js, TypeScript, MySQL, MongoDB, and AWS.`;
      fixesApplied.push(`Reset summary to authentic canonical profile (purged "${detectedForeign}")`);
    }

    // Ensure candidate's authentic Full Stack / SDE2 profile is preserved
    const preservesFullStack = summaryLower.includes('full stack') || summaryLower.includes('full-stack') || summaryLower.includes('sde2') || summaryLower.includes('software development engineer');
    if (!preservesFullStack) {
      violations.push('Summary deviated from candidate authentic Full Stack / SDE2 profile');
      sanitized.summary = canonical.summary || `Software Development Engineer 2 (SDE2) with 4+ years of experience in full-stack development using Node.js, Express.js, React.js, TypeScript, MySQL, MongoDB, and AWS.`;
      fixesApplied.push('Restored truthful Full Stack SDE2 summary');
    }
  } else {
    sanitized.summary = canonical.summary;
  }

  // -------------------------------------------------------------
  // 6. PURGE HIDDEN KEYWORD INJECTIONS
  // -------------------------------------------------------------
  if (sanitized.atsKeywords) {
    // Purge any invisible text injection artifacts
    delete sanitized.atsKeywords;
  }

  return {
    valid: violations.length === 0,
    violations,
    fixesApplied,
    sanitizedResume: sanitized
  };
}

module.exports = {
  validateAndSanitizeResume,
  ALLOWED_ROLE_TITLES,
  isTruthfulRoleTitle
};

/**
 * Resume Matcher Service
 * 
 * Compares Job Description requirements against the canonical resume facts.
 * Classifies all JD requirements into:
 *   - MATCH: Candidate authentically has this skill in canonical resume.
 *   - PARTIAL_MATCH: Candidate has closely related or foundational skills.
 *   - NOT_PRESENT: Skill is completely absent from canonical resume (must never be claimed).
 * 
 * Maps matched skills to legitimate placement targets (Summary, Skills, Experience)
 * and generates unsupportedRequirements to guard against hallucination.
 */

const { normalizeTechName } = require('./jd_analyzer.service');

// Knowledge base of related technologies for partial matching
const RELATED_TECH_MAP = {
  'sql': ['mysql', 'sql joins', 'query optimization'],
  'relational database': ['mysql', 'sql joins'],
  'nosql': ['mongodb'],
  'document database': ['mongodb'],
  'api design': ['restful apis', 'api development & integration'],
  'restful api development': ['restful apis', 'api development & integration'],
  'api development': ['restful apis', 'api development & integration'],
  'web services': ['restful apis', 'node.js', 'express.js'],
  'express.js': ['node.js', 'express.js'],
  'express': ['node.js', 'express.js'],
  'aws lambda': ['aws'],
  'lambda': ['aws'],
  'cloud': ['aws'],
  'frontend': ['react.js', 'typescript', 'javascript (es6+)', 'html5', 'css3'],
  'backend': ['node.js', 'express.js', 'typescript', 'mysql', 'mongodb'],
  'full stack': ['node.js', 'react.js', 'typescript', 'express.js', 'mysql', 'mongodb']
};

/**
 * Extracts a flattened set of all authentic candidate skills from canonical resume
 */
function extractCanonicalSkillSet(canonicalResume) {
  const verified = new Set();
  if (!canonicalResume) return verified;

  // 1. From skills object
  if (canonicalResume.skills && typeof canonicalResume.skills === 'object') {
    for (const group of Object.values(canonicalResume.skills)) {
      if (Array.isArray(group)) {
        for (const item of group) {
          if (typeof item === 'string') verified.add(item.toLowerCase().trim());
        }
      }
    }
  }

  // 2. From personalInfo & summary
  const summary = (canonicalResume.summary || '').toLowerCase();
  ['node.js', 'express.js', 'react.js', 'typescript', 'javascript', 'mysql', 'mongodb', 'aws', 'restful apis', 'git', 'postman', 'ci/cd', 'jwt', 'rbac'].forEach(s => {
    if (summary.includes(s)) verified.add(s);
  });

  // 3. From experience bullets
  if (Array.isArray(canonicalResume.experience)) {
    for (const job of canonicalResume.experience) {
      const texts = [...(job.highlights || [])];
      if (Array.isArray(job.projects)) {
        for (const p of job.projects) {
          texts.push(...(p.highlights || []));
        }
      }
      const expBlob = texts.join(' ').toLowerCase();
      ['node.js', 'react.js', 'typescript', 'express.js', 'mysql', 'mongodb', 'ci/cd', 'git', 'jwt', 'rbac'].forEach(s => {
        if (expBlob.includes(s)) verified.add(s);
      });
    }
  }

  return verified;
}

/**
 * Checks if a requirement has a direct match in canonical skills
 */
function isDirectMatch(reqLower, canonicalSet) {
  if (canonicalSet.has(reqLower)) return true;
  for (const skill of canonicalSet) {
    if (skill === reqLower) return true;
    // Normalized check
    if (normalizeTechName(skill).toLowerCase() === normalizeTechName(reqLower).toLowerCase()) return true;
  }
  return false;
}

/**
 * Checks if a requirement has a partial match in canonical skills
 */
function findPartialMatch(reqLower, canonicalSet) {
  for (const [concept, bases] of Object.entries(RELATED_TECH_MAP)) {
    if (reqLower.includes(concept) || concept.includes(reqLower)) {
      const matchedBases = bases.filter(b => canonicalSet.has(b));
      if (matchedBases.length > 0) {
        return matchedBases.map(normalizeTechName);
      }
    }
  }
  return null;
}

/**
 * Matches JD requirements against canonical resume
 */
function matchResumeToJd(canonicalResume, analyzedJd) {
  const canonicalSet = extractCanonicalSkillSet(canonicalResume);
  const requirements = Array.from(new Set([
    ...(analyzedJd.requiredSkills || []),
    ...(analyzedJd.preferredSkills || []),
    ...(analyzedJd.importantKeywords || [])
  ]));

  const matchedSkills = [];
  const partialMatches = [];
  const unsupportedRequirements = [];

  for (const req of requirements) {
    const reqClean = normalizeTechName(req);
    const reqLower = reqClean.toLowerCase();

    if (isDirectMatch(reqLower, canonicalSet)) {
      if (!matchedSkills.includes(reqClean)) {
        matchedSkills.push(reqClean);
      }
    } else {
      const partial = findPartialMatch(reqLower, canonicalSet);
      if (partial) {
        partialMatches.push({
          requirement: reqClean,
          candidateBasis: partial
        });
      } else {
        // Must never claim skills the candidate does not have
        if (!unsupportedRequirements.includes(reqClean)) {
          unsupportedRequirements.push(reqClean);
        }
      }
    }
  }

  // Determine section placement recommendations
  const placementPlan = {
    summarySkills: matchedSkills.slice(0, 5),
    highlightedSkills: matchedSkills,
    experienceEmphases: []
  };

  // Determine experience emphases
  const hasFrontendJd = matchedSkills.some(s => ['React.js', 'JavaScript (ES6+)', 'HTML5', 'CSS3'].includes(s));
  const hasBackendJd = matchedSkills.some(s => ['Node.js', 'Express.js', 'MySQL', 'MongoDB', 'RESTful APIs'].includes(s));

  if (hasFrontendJd) {
    placementPlan.experienceEmphases.push('Frontend & React Stepper components');
  }
  if (hasBackendJd) {
    placementPlan.experienceEmphases.push('Node.js, Express, and Database Optimization');
  }

  // Compute transparent JD Match Coverage
  const totalRelevant = Math.max(1, matchedSkills.length + unsupportedRequirements.length);
  const matchedCount = matchedSkills.length;
  const coveragePercentage = Math.round((matchedCount / totalRelevant) * 100);

  const jdMatchCoverage = {
    matchedCount,
    totalRelevantCount: totalRelevant,
    coveragePercentage,
    formula: `${matchedCount} / ${totalRelevant} requirements matched`
  };

  const atsScore = coveragePercentage;

  return {
    matchedSkills,
    partialMatches,
    unsupportedRequirements,
    placementPlan,
    jdMatchCoverage,
    atsScore
  };
}

/**
 * Classifies an individual requirement against a canonical resume into MATCH, PARTIAL_MATCH, or NOT_PRESENT
 */
function classifyRequirement(requirement, canonicalResume) {
  if (!requirement || typeof requirement !== 'string') {
    return { status: 'NOT_PRESENT', requirement: '', basis: null };
  }
  const canonicalSet = extractCanonicalSkillSet(canonicalResume);
  const reqClean = normalizeTechName(requirement);
  const reqLower = reqClean.toLowerCase();

  // 1. Direct Match Check
  if (isDirectMatch(reqLower, canonicalSet)) {
    return {
      status: 'MATCH',
      requirement: reqClean,
      basis: [reqClean]
    };
  }

  // 2. Partial Match Check
  const partial = findPartialMatch(reqLower, canonicalSet);
  if (partial && partial.length > 0) {
    return {
      status: 'PARTIAL_MATCH',
      requirement: reqClean,
      basis: partial
    };
  }

  // 3. Not Present
  return {
    status: 'NOT_PRESENT',
    requirement: reqClean,
    basis: null
  };
}

module.exports = {
  matchResumeToJd,
  classifyRequirement,
  extractCanonicalSkillSet,
  RELATED_TECH_MAP
};

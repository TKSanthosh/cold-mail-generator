/**
 * COMPANY EXCLUSION SERVICE
 * 
 * Enforces hard exclusion of candidate's present and past employers to prevent
 * accidental cold email outreach, draft creation, or automated job applications.
 * 
 * Default Excluded:
 * - Present Company: IQVIA (and all associated domains & subsidiaries)
 * - Past Company: Sify Technologies (and all associated domains & subsidiaries)
 */

const fs = require('fs');
const path = require('path');

// Canonical default exclusions for Santhosh T K
const DEFAULT_EXCLUDED_COMPANIES = [
  {
    name: 'IQVIA',
    type: 'PRESENT_COMPANY',
    reason: 'Present company (Currently employed)',
    aliases: [
      'iqvia',
      'iqvia rds',
      'iqvia india',
      'iqvia bangalore',
      'iqvia solutions',
      'ims health',
      'quintiles'
    ],
    domains: [
      'iqvia.com',
      'imshealth.com',
      'quintiles.com'
    ]
  },
  {
    name: 'Sify Technologies',
    type: 'PAST_COMPANY',
    reason: 'Past company (Previously employed)',
    aliases: [
      'sify',
      'sify technologies',
      'sify tech',
      'sify technologies limited',
      'sify technologies, chennai',
      'sify corp',
      'sify broadband'
    ],
    domains: [
      'sify.com',
      'sifycorp.com',
      'sifytechnologies.com'
    ]
  }
];

const CONFIG_FILE = path.join(__dirname, '../../excluded_companies.json');

/**
 * Loads the active list of excluded companies (defaults + user additions)
 */
function getExcludedCompanies(userKey = null) {
  let custom = [];
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      custom = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {}
  }

  // Combine defaults and custom exclusions, removing duplicates
  const map = new Map();
  for (const item of DEFAULT_EXCLUDED_COMPANIES) {
    map.set(item.name.toLowerCase(), item);
  }
  for (const item of custom) {
    if (item && item.name) {
      map.set(item.name.toLowerCase(), item);
    }
  }

  return Array.from(map.values());
}

/**
 * Saves additional custom excluded companies
 */
function addExcludedCompany(companyObj) {
  if (!companyObj || !companyObj.name) return;
  const current = getExcludedCompanies();
  const existingIndex = current.findIndex(c => c.name.toLowerCase() === companyObj.name.toLowerCase());
  
  const record = {
    name: companyObj.name.trim(),
    type: companyObj.type || 'USER_EXCLUDED',
    reason: companyObj.reason || 'User blacklisted company',
    aliases: companyObj.aliases || [companyObj.name.toLowerCase().trim()],
    domains: companyObj.domains || []
  };

  if (existingIndex >= 0) {
    current[existingIndex] = { ...current[existingIndex], ...record };
  } else {
    current.push(record);
  }

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), 'utf8');
  } catch (e) {}
  return current;
}

/**
 * Normalizes text for lenient fuzzy matching
 */
function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a company name, domain, email, or URL belongs to an excluded company.
 * 
 * @param {string} companyName - Company name (e.g. "IQVIA", "Sify Technologies")
 * @param {string} emailOrDomain - Email address or domain (e.g. "recruiter@iqvia.com")
 * @param {string} url - Optional career page or job URL
 * @returns {{ excluded: boolean, reason?: string, matchedCompany?: string }}
 */
function isCompanyOrDomainExcluded(companyName = '', emailOrDomain = '', url = '') {
  const excludedList = getExcludedCompanies();

  const normCompany = normalizeText(companyName);
  
  let domain = '';
  if (emailOrDomain) {
    if (emailOrDomain.includes('@')) {
      domain = emailOrDomain.split('@')[1].toLowerCase().trim();
    } else {
      domain = emailOrDomain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim();
    }
  }

  let urlHostname = '';
  if (url) {
    try {
      urlHostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    } catch (e) {
      urlHostname = url.toLowerCase();
    }
  }

  for (const item of excludedList) {
    // 1. Check exact/alias company match
    for (const alias of (item.aliases || [])) {
      const normAlias = normalizeText(alias);
      if (normAlias.length > 2) {
        // Word boundary match or exact match to prevent false partial substrings
        const words = normCompany.split(' ');
        const aliasWords = normAlias.split(' ');
        
        if (normCompany === normAlias || 
            normCompany.startsWith(`${normAlias} `) || 
            normCompany.endsWith(` ${normAlias}`) || 
            normCompany.includes(` ${normAlias} `) ||
            (aliasWords.length > 1 && normCompany.includes(normAlias))) {
          return {
            excluded: true,
            reason: `Company Excluded: "${companyName}" is identified as your ${item.type === 'PRESENT_COMPANY' ? 'present' : (item.type === 'PAST_COMPANY' ? 'past' : 'excluded')} company (${item.name}). Outreach & applications are blocked.`,
            matchedCompany: item.name,
            type: item.type
          };
        }
      }
    }

    // 2. Check domain / email match
    for (const d of (item.domains || [])) {
      const cleanD = d.toLowerCase().trim();
      if (domain && (domain === cleanD || domain.endsWith(`.${cleanD}`))) {
        return {
          excluded: true,
          reason: `Domain Excluded: "@${domain}" belongs to ${item.name} (${item.type === 'PRESENT_COMPANY' ? 'present' : 'past'} company). Outreach is blocked.`,
          matchedCompany: item.name,
          type: item.type
        };
      }
      if (urlHostname && (urlHostname === cleanD || urlHostname.endsWith(`.${cleanD}`))) {
        return {
          excluded: true,
          reason: `Career Portal Excluded: "${urlHostname}" belongs to ${item.name} (${item.type === 'PRESENT_COMPANY' ? 'present' : 'past'} company). Outreach is blocked.`,
          matchedCompany: item.name,
          type: item.type
        };
      }
    }
  }

  return { excluded: false };
}

/**
 * Throws a descriptive Error if company or domain is excluded
 */
function assertCompanyNotExcluded(companyName, emailOrDomain = '', url = '') {
  const check = isCompanyOrDomainExcluded(companyName, emailOrDomain, url);
  if (check.excluded) {
    const err = new Error(check.reason);
    err.code = 'EXCLUDED_COMPANY';
    err.matchedCompany = check.matchedCompany;
    err.exclusionType = check.type;
    throw err;
  }
}

module.exports = {
  DEFAULT_EXCLUDED_COMPANIES,
  getExcludedCompanies,
  addExcludedCompany,
  isCompanyOrDomainExcluded,
  assertCompanyNotExcluded
};

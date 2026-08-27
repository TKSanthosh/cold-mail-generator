/**
 * Parses an HR email address to extract a clean HR name and Company name.
 * Handles personal email domains and cleans out numbers and unwanted artifacts.
 */
function parseHrEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { name: 'Hiring Manager', company: 'your team', domain: '' };
  }

  const [localPart, domainPart] = email.split('@');
  const domain = domainPart.toLowerCase().trim();

  // 1. Parse Name from local part (strip numbers and separators)
  const cleanLocal = localPart.replace(/\d+/g, '').replace(/[._\-+]/g, ' ').trim();
  let name = cleanLocal
    .split(' ')
    .filter(word => word.length > 1)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  const genericNames = ['hr', 'careers', 'jobs', 'recruitment', 'talent', 'hiring', 'admin', 'contact', 'info', 'support', 'team'];
  if (!name || genericNames.includes(name.toLowerCase())) {
    name = 'Hiring Team';
  }

  // 2. Parse Company from domain part
  const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'mail.com'];
  let company = 'your organization';

  if (!personalDomains.includes(domain)) {
    const domainParts = domain.split('.');
    const subdomains = ['mail', 'email', 'careers', 'jobs', 'recruitment', 'hr', 'www'];
    let compPart = domainParts[0];
    if (subdomains.includes(compPart.toLowerCase()) && domainParts.length > 1) {
      compPart = domainParts[1];
    }
    company = compPart.charAt(0).toUpperCase() + compPart.slice(1).toLowerCase();
  }

  return { name, company, domain };
}

module.exports = { parseHrEmail };

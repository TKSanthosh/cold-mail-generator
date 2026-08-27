/**
 * Parses an HR email address to extract the HR name and Company name.
 * Example: santhosh@indi.co -> { name: 'Santhosh', company: 'Indi' }
 * 
 * @param {string} email 
 * @returns {{ name: string, company: string }}
 */
function parseHrEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { name: 'HR Manager', company: 'Company' };
  }

  const [localPart, domainPart] = email.split('@');

  // Parse Name from local part
  // Replace dots, hyphens, underscores, and plus signs with spaces
  let name = localPart
    .replace(/[._\-+]/g, ' ')
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Standard cleanup for generic terms
  if (!name || name.toLowerCase() === 'hr' || name.toLowerCase() === 'careers' || name.toLowerCase() === 'jobs' || name.toLowerCase() === 'recruitment') {
    name = 'Hiring Team';
  }

  // Parse Company from domain part
  // E.g., "indi.co" -> ["indi", "co"]
  const domainParts = domainPart.split('.');
  let company = 'Company';
  
  if (domainParts.length > 0) {
    // If domain is like "mail.google.com", take the second one if first is common subdomain, 
    // otherwise take the first part.
    const subdomains = ['mail', 'email', 'careers', 'jobs', 'recruitment', 'hr', 'www'];
    let compPart = domainParts[0];
    if (subdomains.includes(compPart.toLowerCase()) && domainParts.length > 1) {
      compPart = domainParts[1];
    }
    
    company = compPart.charAt(0).toUpperCase() + compPart.slice(1).toLowerCase();
  }

  return { name, company };
}

module.exports = { parseHrEmail };

/**
 * Scrapes company background info from official website meta tags and Wikipedia.
 * Provides live contextual intelligence for tailoring cold emails and resumes.
 */
async function scrapeCompanyIntel(companyName, domain) {
  let intel = {
    company: companyName,
    domain: domain,
    summary: '',
    source: ''
  };

  const isPersonalEmail = !domain || ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com'].includes(domain.toLowerCase());

  if (isPersonalEmail || ['gmail', 'yahoo', 'outlook', 'hotmail'].includes(companyName.toLowerCase())) {
    intel.summary = '';
    intel.source = 'Direct Recruiter Outreach';
    return intel;
  }

  // 1. Check if official domain is accessible and extract homepage meta description
  if (domain) {
    try {
      const targetUrl = `https://${domain}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const pageRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (pageRes.ok) {
        const html = await pageRes.text();
        const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                              html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

        let title = titleMatch ? titleMatch[1].trim() : '';
        let desc = metaDescMatch ? metaDescMatch[1].trim() : '';

        title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        desc = desc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

        if (desc || title) {
          intel.summary = `${title}. ${desc}`.trim();
          intel.source = `Official Website (${domain})`;
          return intel;
        }
      }
    } catch (e) {
      // Continue to Wikipedia fallback
    }
  }

  // 2. Query Wikipedia API
  try {
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`;
    const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'JobOutreachBot/1.0' } });
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      if (data.extract && data.type === 'standard') {
        intel.summary = data.extract;
        intel.source = 'Wikipedia';
        return intel;
      }
    }
  } catch (e) {
    // Fallback
  }

  return intel;
}

module.exports = { scrapeCompanyIntel };

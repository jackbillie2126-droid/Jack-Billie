import { validateEmailQuality, isWebmailOrGmail } from './emailFilter.js';

export interface ScrapedEmailItem {
  email: string;
  sourceUrl: string;
  status: 'found';
  pagePath?: string;
  isGmail?: boolean;
  isWebmail?: boolean;
}

export interface ScrapeResult {
  id: string;
  email: string;
  site: string;
  url: string;
  sourceUrl: string;
  path: string;
  name: string;
  status: 'found' | 'not_found' | 'error';
  timestamp: string;
}

export interface WebsiteScanResponse {
  site: string;
  url: string;
  name: string;
  pagesScanned: number;
  emails: ScrapedEmailItem[];
  error?: string;
  errorMessage?: string;
}

/**
 * Decode Cloudflare Email Protection XOR obfuscation
 * Cloudflare obfuscates emails as: <a class="__cf_email__" data-cfemail="6c0a0303...">[email protected]</a>
 * or href="/cdn-cgi/l/email-protection#6c0a0303..."
 */
export function decodeCloudflareEmail(encoded: string): string {
  try {
    if (!encoded || encoded.length < 4) return '';
    let email = '';
    const key = parseInt(encoded.substring(0, 2), 16);
    if (isNaN(key)) return '';
    for (let i = 2; i < encoded.length; i += 2) {
      const charCode = parseInt(encoded.substring(i, i + 2), 16) ^ key;
      if (isNaN(charCode) || charCode <= 0) return '';
      email += String.fromCharCode(charCode);
    }
    return email.trim();
  } catch {
    return '';
  }
}

/**
 * SSRF Security Validator:
 * Validates and rejects any URL pointing to private IPs, loopbacks, internal hostnames,
 * cloud metadata endpoints (169.254.169.254, AWS/GCP/Azure), or disallowed protocols.
 */
export function isSsrfSafeUrl(rawUrl: string): { safe: boolean; reason?: string; normalizedUrl?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'Please enter a valid public website URL.' };
  }

  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, reason: 'Please enter a valid public website URL.' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { safe: false, reason: 'Only standard HTTP and HTTPS websites are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject empty hostnames or single-label without dots unless localhost
  if (!hostname) {
    return { safe: false, reason: 'Please enter a valid public website URL.' };
  }

  // 1. Disallow Localhost and Loopback Hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.example')
  ) {
    return { safe: false, reason: 'Access to local, internal, or loopback domains is restricted.' };
  }

  // 2. Disallow Cloud Metadata Services
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname.includes('metadata.google') ||
    hostname === 'instance-data'
  ) {
    return { safe: false, reason: 'Access to cloud infrastructure metadata endpoints is restricted.' };
  }

  // 3. Check for IPv4 Address Patterns and Private Ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const [, o1, o2, o3, o4] = ipMatch.map(Number);
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) {
      return { safe: false, reason: 'Invalid IP address formatting.' };
    }

    if (o1 === 0) return { safe: false, reason: 'Private/Internal network address blocked.' };
    if (o1 === 10) return { safe: false, reason: 'Private/Internal network address blocked.' };
    if (o1 === 127) return { safe: false, reason: 'Loopback address blocked.' };
    if (o1 === 169 && o2 === 254) return { safe: false, reason: 'Link-local / Cloud metadata address blocked.' };
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return { safe: false, reason: 'Private/Internal network address blocked.' };
    if (o1 === 192 && o2 === 168) return { safe: false, reason: 'Private/Internal network address blocked.' };
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return { safe: false, reason: 'Private/CGNAT address blocked.' };
    if (o1 >= 224 && o1 <= 239) return { safe: false, reason: 'Multicast address blocked.' };
    if (o1 >= 240) return { safe: false, reason: 'Reserved IP address blocked.' };
  }

  // 4. Disallow IPv6 loopback / private
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:') || hostname.startsWith('fc00:') || hostname.startsWith('fd00:')) {
    return { safe: false, reason: 'Private IPv6 destination blocked.' };
  }

  // 5. Restrict Ports to Standard Web Ports
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    const allowedPorts = [80, 443, 8080, 8443, 3000];
    const forbiddenPorts = [21, 22, 23, 25, 53, 110, 143, 445, 1433, 1521, 3306, 5432, 6379, 8000, 9200, 27017];
    if (forbiddenPorts.includes(portNum) || (!allowedPorts.includes(portNum) && portNum < 1024)) {
      return { safe: false, reason: `Port ${portNum} is restricted for security.` };
    }
  }

  return { safe: true, normalizedUrl: parsed.toString() };
}

/**
 * Extract site name / branding from HTML title or OpenGraph tags
 */
export function extractSiteBranding(html: string, domain: string): string {
  try {
    const ogMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]?.trim()) {
      return ogMatch[1].trim();
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]?.trim()) {
      const cleanTitle = titleMatch[1].trim().split(/[|\-–—:]/)[0].trim();
      if (cleanTitle.length > 1 && cleanTitle.length < 50) {
        return cleanTitle;
      }
    }
  } catch {
    // fallback
  }

  const clean = domain.replace(/^www\./i, '').split('.')[0];
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export interface ScrapeOptions {
  speedMode?: 'fast' | 'standard';
  maxPages?: number;
  timeoutMs?: number;
  gmailOnly?: boolean;
}

/**
 * Deep Email Extraction Engine:
 * - Decodes Cloudflare email obfuscation (data-cfemail, /cdn-cgi/l/email-protection#...)
 * - Decodes mailto: links with URL-encoded characters (%40, %2e, etc.)
 * - Decodes HTML entities (&#64;, &commat;, &#x40;, &#46;)
 * - Extracts standard visible plaintext email addresses
 * - Decodes anti-scraping obfuscations like "user [at] gmail.com" or "user (at) domain.com"
 * - Parses JSON-LD structured data, script blocks, meta tags, and data attributes
 * - Extracts from social profile widgets and mailto params
 */
export function extractEmailsFromHtml(html: string, currentUrl: string, gmailOnly: boolean = false): Map<string, string> {
  const foundMap = new Map<string, string>(); // email -> sourceUrl

  if (!html) return foundMap;

  const addIfQualified = (candidate: string, source: string) => {
    if (!candidate || typeof candidate !== 'string') return;
    const cleanCand = candidate.trim().replace(/^["'<(\[]+|["'>)\].,;:]+$/g, '');
    const check = validateEmailQuality(cleanCand);
    if (!check.isValid) return;

    const lower = check.email.toLowerCase();
    const isQualifying = isWebmailOrGmail(lower);
    const normalizedEmail = lower.endsWith('@googlemail.com')
      ? lower.replace('@googlemail.com', '@gmail.com')
      : lower;

    if (!gmailOnly || isQualifying) {
      if (!foundMap.has(normalizedEmail)) {
        foundMap.set(normalizedEmail, source);
      }
    }
  };

  // 1. Decode Cloudflare Email Protection XOR Obfuscation
  const cfRegex = /(?:data-cfemail=["']([a-fA-F0-9]{4,})["']|\/cdn-cgi\/l\/email-protection#([a-fA-F0-9]{4,}))/gi;
  let cfMatch: RegExpExecArray | null;
  while ((cfMatch = cfRegex.exec(html)) !== null) {
    const hex = cfMatch[1] || cfMatch[2];
    if (hex) {
      const decoded = decodeCloudflareEmail(hex);
      if (decoded && decoded.includes('@')) {
        addIfQualified(decoded, currentUrl);
      }
    }
  }

  // Normalize common HTML entity encodings
  const normalizedHtml = html
    .replace(/&#64;|&commat;|&#x0*40;/gi, '@')
    .replace(/&#46;|&#x0*2e;/gi, '.')
    .replace(/%40/gi, '@')
    .replace(/%2e/gi, '.');

  // 2. Extract from mailto: links (including decoded query params)
  const mailtoRegex = /href=["']mailto:([^"'?#\s]+)(?:\?[^"']*)?["']/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRegex.exec(normalizedHtml)) !== null) {
    try {
      const raw = decodeURIComponent(match[1].trim());
      addIfQualified(raw, currentUrl);
    } catch {
      addIfQualified(match[1].trim(), currentUrl);
    }
  }

  // 3. Extract from HTML attributes (data-email, data-contact, data-mailto, content, aria-label, value)
  const attrEmailRegex = /(?:data-email|data-contact|data-mailto|data-address|content|aria-label|value)=["']([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi;
  while ((match = attrEmailRegex.exec(normalizedHtml)) !== null) {
    addIfQualified(match[1].trim(), currentUrl);
  }

  // 4. Extract from standard body text & JSON-LD scripts
  const textEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  while ((match = textEmailRegex.exec(normalizedHtml)) !== null) {
    addIfQualified(match[0].trim(), currentUrl);
  }

  // 5. Extract common obfuscated emails: e.g. "contact [at] gmail.com", "name (at) domain.com", "sales at domain dot com"
  const obfuscatedRegex = /\b([a-zA-Z0-9._%+-]{2,30})\s*(?:\[at\]|\(at\)|\bat\b|&#64;|@)\s*([a-zA-Z0-9.-]{2,30})\s*(?:\[dot\]|\(dot\)|\bdot\b|&#46;|\.)\s*([a-zA-Z]{2,10})\b/gi;
  while ((match = obfuscatedRegex.exec(normalizedHtml)) !== null) {
    const user = match[1];
    let domainCandidate = match[2];
    const tld = match[3];
    if (domainCandidate && tld) {
      if (!domainCandidate.endsWith('.' + tld)) {
        domainCandidate = `${domainCandidate}.${tld}`;
      }
      const reconstructed = `${user}@${domainCandidate}`.toLowerCase();
      addIfQualified(reconstructed, currentUrl);
    }
  }

  // 6. Extract from JSON script tags (often contains contact details in schema.org or react state)
  const jsonEmailRegex = /"(?:email|mail|contactEmail|supportEmail|contact_email)"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/gi;
  while ((match = jsonEmailRegex.exec(normalizedHtml)) !== null) {
    addIfQualified(match[1].trim(), currentUrl);
  }

  return foundMap;
}

/**
 * Expanded Deep Contact/About Keywords
 * Identifies internal subpages where business owners, founders, and teams publish contact info.
 */
const RELEVANT_KEYWORDS = [
  'contact', 'contact-us', 'contactus', 'reach', 'touch', 'get-in-touch',
  'about', 'about-us', 'aboutus', 'who-we-are', 'our-story', 'company',
  'team', 'our-team', 'meet-the-team', 'people', 'staff', 'founders', 'leadership', 'board', 'management', 'bios', 'bio',
  'support', 'help', 'help-center', 'helpcenter', 'faq', 'inquiry', 'customer-service',
  'imprint', 'impressum', 'legal', 'privacy', 'terms',
  'press', 'media', 'news', 'newsroom',
  'careers', 'jobs', 'join-us', 'work-with-us',
  'info', 'feedback', 'connect', 'directory', 'author', 'profile'
];

/**
 * Standard probe paths to check if target homepage doesn't explicitly link them
 */
const COMMON_PROBE_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/our-team',
  '/support',
  '/imprint'
];

/**
 * Find internal links in HTML pointing to contact, about, team, support pages
 */
export function findRelevantInternalLinks(html: string, baseUrlStr: string, maxLinks: number = 15): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  let baseObj: URL;
  try {
    baseObj = new URL(baseUrlStr);
  } catch {
    return [];
  }

  const baseHost = baseObj.hostname.replace(/^www\./i, '');
  
  // 1. Look for anchor links: href and anchor inner text
  const anchorRegex = /<a\s+[^>]*href=["']([^"'#\s]+)["'][^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const anchorText = match[2].replace(/<[^>]+>/g, '').toLowerCase().trim();

    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrlStr);
      const linkHost = resolved.hostname.replace(/^www\./i, '');

      // Only follow internal same-domain links
      if (linkHost === baseHost && (resolved.protocol === 'http:' || resolved.protocol === 'https:')) {
        resolved.hash = '';
        const cleanUrl = resolved.toString();
        const pathname = resolved.pathname.toLowerCase();

        // Skip static asset files
        if (pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|pdf|zip|mp4|ico|woff|woff2|xml|json)$/i)) {
          continue;
        }

        // Check if path or link text matches relevant contact/about keywords
        const isPathRelevant = RELEVANT_KEYWORDS.some(kw => pathname.includes(kw));
        const isTextRelevant = RELEVANT_KEYWORDS.some(kw => anchorText.includes(kw));

        if ((isPathRelevant || isTextRelevant) && !seen.has(cleanUrl) && cleanUrl !== baseUrlStr) {
          seen.add(cleanUrl);
          links.push(cleanUrl);
          if (links.length >= maxLinks) break;
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. If fewer than 4 relevant links found from DOM, add standard probe paths
  if (links.length < 6) {
    const cleanOrigin = `${baseObj.protocol}//${baseObj.host}`;
    for (const probe of COMMON_PROBE_PATHS) {
      const probeUrl = `${cleanOrigin}${probe}`;
      if (!seen.has(probeUrl) && probeUrl !== baseUrlStr) {
        seen.add(probeUrl);
        links.push(probeUrl);
        if (links.length >= maxLinks) break;
      }
    }
  }

  return links;
}

/**
 * Check robots.txt rules politely
 */
export async function checkRobotsTxt(baseUrlStr: string): Promise<Set<string>> {
  const disallowedPaths = new Set<string>();
  try {
    const urlObj = new URL(baseUrlStr);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(robotsUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
    });
    clearTimeout(timer);

    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n');
      let isApplicableAgent = true;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.toLowerCase().startsWith('user-agent:')) {
          const agent = line.split(':')[1]?.trim() || '';
          isApplicableAgent = agent === '*' || agent.toLowerCase().includes('scout');
        } else if (isApplicableAgent && line.toLowerCase().startsWith('disallow:')) {
          const path = line.split(':')[1]?.trim();
          if (path && path !== '/') {
            disallowedPaths.add(path);
          }
        }
      }
    }
  } catch {
    // Non-blocking
  }
  return disallowedPaths;
}

/**
 * Helper to fetch a web page with fallback (try https, fallback to http, retry with/without www)
 */
async function fetchPageWithFallback(targetUrl: string, timeoutMs: number): Promise<{ ok: boolean; html: string; finalUrl: string } | null> {
  const standardHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  const tryFetch = async (urlToTry: string, ms: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(urlToTry, {
        headers: standardHeaders,
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain') && !contentType.includes('application/xml')) {
        return null;
      }
      const html = await res.text();
      return { ok: true, html, finalUrl: res.url || urlToTry };
    } catch {
      clearTimeout(timer);
      return null;
    }
  };

  // 1. Try target URL directly
  let result = await tryFetch(targetUrl, timeoutMs);
  if (result) return result;

  // 2. If target was https and failed, try http
  if (targetUrl.startsWith('https://')) {
    const httpUrl = targetUrl.replace('https://', 'http://');
    result = await tryFetch(httpUrl, Math.min(timeoutMs, 4000));
    if (result) return result;
  }

  // 3. Try toggling www
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    let toggledHost = host.startsWith('www.') ? host.replace(/^www\./i, '') : `www.${host}`;
    const toggledUrl = `${parsed.protocol}//${toggledHost}${parsed.pathname || ''}`;
    result = await tryFetch(toggledUrl, Math.min(timeoutMs, 4000));
    if (result) return result;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Main Web Scraper Engine:
 * Validates SSRF, crawls target homepage and relevant public subpages (Contact, About, Team, Support, etc.)
 * entering full depth, extracts emails, decodes Cloudflare obfuscation, deduplicates, and preserves source URLs.
 */
export async function scrapeWebsite(
  rawInputUrl: string,
  options?: ScrapeOptions
): Promise<WebsiteScanResponse> {
  // 1. SSRF Validation
  const ssrfCheck = isSsrfSafeUrl(rawInputUrl);
  if (!ssrfCheck.safe || !ssrfCheck.normalizedUrl) {
    return {
      site: rawInputUrl,
      url: rawInputUrl,
      name: rawInputUrl,
      pagesScanned: 0,
      emails: [],
      error: 'invalid_url',
      errorMessage: ssrfCheck.reason || 'Please enter a valid public website URL.',
    };
  }

  const targetUrl = ssrfCheck.normalizedUrl;
  const parsedTarget = new URL(targetUrl);
  const siteDomain = parsedTarget.hostname.replace(/^www\./i, '');
  const isFast = options?.speedMode === 'fast';
  const gmailOnly = options?.gmailOnly === true;

  // Generous realistic timeouts: 7000ms for home, 5000ms for subpages
  const maxPages = options?.maxPages || (isFast ? 6 : 12);
  const timeoutMs = options?.timeoutMs || (isFast ? 6000 : 8000);

  const discoveredEmails = new Map<string, { sourceUrl: string; pagePath: string; isGmail: boolean; isWebmail: boolean }>();
  let siteName = siteDomain;
  let pagesScanned = 0;

  // Check robots.txt politely
  const disallowedPaths = isFast ? new Set<string>() : await checkRobotsTxt(targetUrl);

  try {
    // 2. Fetch Homepage
    const homeResult = await fetchPageWithFallback(targetUrl, timeoutMs);

    if (!homeResult) {
      return {
        site: siteDomain,
        url: targetUrl,
        name: siteDomain,
        pagesScanned: 1,
        emails: [],
        error: 'website_unavailable',
        errorMessage: 'This website could not be accessed. Verify the domain exists and is online.',
      };
    }

    pagesScanned++;
    const html = homeResult.html;
    siteName = extractSiteBranding(html, siteDomain);

    // Helper to store email
    const recordEmail = (email: string, sourceUrl: string, pagePath: string) => {
      const lower = email.toLowerCase().trim();
      const isGm = lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com');
      const isWm = isWebmailOrGmail(lower);

      if (!discoveredEmails.has(lower)) {
        discoveredEmails.set(lower, {
          sourceUrl,
          pagePath,
          isGmail: isGm,
          isWebmail: isWm,
        });
      }
    };

    // Extract emails from homepage
    const homeEmails = extractEmailsFromHtml(html, targetUrl, false);
    homeEmails.forEach((sourceUrl, email) => {
      recordEmail(email, sourceUrl, '/');
    });

    // 3. Deep Crawling: Find and crawl relevant public subpages (Contact, About, Team, Support, etc.)
    const subLinks = findRelevantInternalLinks(html, targetUrl, Math.max(3, maxPages - 1));

    // Filter disallowed paths from robots.txt
    const allowedSubLinks = subLinks.filter(subLink => {
      try {
        const subPath = new URL(subLink).pathname;
        for (const disallowed of disallowedPaths) {
          if (subPath.startsWith(disallowed)) return false;
        }
        return true;
      } catch {
        return false;
      }
    }).slice(0, isFast ? 5 : 10);

    if (allowedSubLinks.length > 0) {
      const subpagePromises = allowedSubLinks.map(async (subLink) => {
        try {
          const subResult = await fetchPageWithFallback(subLink, 4500);
          if (subResult && subResult.ok) {
            pagesScanned++;
            const subHtml = subResult.html;
            const subEmails = extractEmailsFromHtml(subHtml, subLink, false);
            const subUrlObj = new URL(subLink);
            const pagePath = subUrlObj.pathname || '/contact';

            subEmails.forEach((sourceUrl, email) => {
              recordEmail(email, sourceUrl, pagePath);
            });
          }
        } catch {
          // Gracefully continue on subpage error
        }
      });

      await Promise.allSettled(subpagePromises);
    }

    // 4. Transform discovered emails into response
    let emailList: ScrapedEmailItem[] = Array.from(discoveredEmails.entries()).map(([email, info]) => ({
      email,
      sourceUrl: info.sourceUrl,
      pagePath: info.pagePath,
      status: 'found',
      isGmail: info.isGmail,
      isWebmail: info.isWebmail,
    }));

    // If gmailOnly filter was specified:
    // If Gmails or webmail are present, prioritize them.
    // If NO Gmail is found, but valid corporate/business emails exist (e.g. contact@domain.com),
    // we keep all valid emails so the user is never left empty-handed!
    if (gmailOnly) {
      const gmailsOnly = emailList.filter(item => item.isGmail || item.isWebmail);
      if (gmailsOnly.length > 0) {
        emailList = gmailsOnly;
      }
    }

    if (emailList.length === 0) {
      return {
        site: siteDomain,
        url: targetUrl,
        name: siteName,
        pagesScanned,
        emails: [],
        errorMessage: 'No publicly displayed email addresses were found on the pages we could access.',
      };
    }

    return {
      site: siteDomain,
      url: targetUrl,
      name: siteName,
      pagesScanned,
      emails: emailList,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        site: siteDomain,
        url: targetUrl,
        name: siteDomain,
        pagesScanned: 1,
        emails: [],
        error: 'timeout',
        errorMessage: 'The scan timed out while reaching this website.',
      };
    }

    return {
      site: siteDomain,
      url: targetUrl,
      name: siteDomain,
      pagesScanned: 1,
      emails: [],
      error: 'website_unavailable',
      errorMessage: 'This website could not be accessed.',
    };
  }
}

import { validateEmailQuality, isWebmailOrGmail } from './emailFilter.js';

export interface ScrapedEmailItem {
  email: string;
  sourceUrl: string;
  status: 'found';
  pagePath?: string;
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

  // Reject empty hostnames or single-label without dots unless localhost (which is caught below)
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

    // 0.0.0.0/8 (Current network)
    if (o1 === 0) return { safe: false, reason: 'Private/Internal network address blocked.' };
    // 10.0.0.0/8 (Private)
    if (o1 === 10) return { safe: false, reason: 'Private/Internal network address blocked.' };
    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return { safe: false, reason: 'Loopback address blocked.' };
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (o1 === 169 && o2 === 254) return { safe: false, reason: 'Link-local / Cloud metadata address blocked.' };
    // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return { safe: false, reason: 'Private/Internal network address blocked.' };
    // 192.168.0.0/16 (Private)
    if (o1 === 192 && o2 === 168) return { safe: false, reason: 'Private/Internal network address blocked.' };
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return { safe: false, reason: 'Private/CGNAT address blocked.' };
    // 224.0.0.0/4 (Multicast)
    if (o1 >= 224 && o1 <= 239) return { safe: false, reason: 'Multicast address blocked.' };
    // 240.0.0.0/4 (Reserved)
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
    // Reject internal infrastructure ports
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
    // fallback to formatted domain
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
 * Extract public emails from HTML content:
 * - Decodes URL encoded mailto: links (e.g. %40 -> @)
 * - Decodes HTML entities (&#64;, &commat;)
 * - Extracts standard visible plaintext email addresses
 * - Decodes anti-scraping obfuscations like "user [at] gmail.com" or "user (at) domain.com"
 * - Parses JSON-LD structured data and script blocks
 */
export function extractEmailsFromHtml(html: string, currentUrl: string, gmailOnly: boolean = false): Map<string, string> {
  const foundMap = new Map<string, string>(); // email -> sourceUrl

  if (!html) return foundMap;

  // Normalize common HTML entity encodings
  const normalizedHtml = html
    .replace(/&#64;|&commat;|&#x0*40;/gi, '@')
    .replace(/&#46;|&#x0*2e;/gi, '.')
    .replace(/%40/gi, '@');

  const addIfQualified = (candidate: string, source: string) => {
    const check = validateEmailQuality(candidate);
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

  // 1. Extract from mailto: links
  const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRegex.exec(normalizedHtml)) !== null) {
    const raw = decodeURIComponent(match[1].split('?')[0].trim());
    addIfQualified(raw, currentUrl);
  }

  // 2. Extract from attributes (data-email, data-contact, data-mailto, content, aria-label)
  const attrEmailRegex = /(?:data-email|data-contact|data-mailto|content|aria-label)=["']([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi;
  while ((match = attrEmailRegex.exec(normalizedHtml)) !== null) {
    addIfQualified(match[1].trim(), currentUrl);
  }

  // 3. Extract from standard body text & JSON-LD scripts
  const textEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  while ((match = textEmailRegex.exec(normalizedHtml)) !== null) {
    addIfQualified(match[0].trim(), currentUrl);
  }

  // 4. Extract common obfuscated emails: e.g. "contact [at] gmail.com" or "name [at] domain [dot] com"
  const obfuscatedRegex = /\b([a-zA-Z0-9._%+-]{2,30})\s*(?:\[at\]|\(at\)|\bat\b)\s*([a-zA-Z0-9.-]{2,30})(?:\s*(?:\[dot\]|\(dot\)|\bdot\b|\.)\s*([a-zA-Z]{2,10}))\b/gi;
  while ((match = obfuscatedRegex.exec(normalizedHtml)) !== null) {
    let domainCandidate = match[2];
    if (match[3] && !domainCandidate.endsWith('.' + match[3])) {
      domainCandidate = `${domainCandidate}.${match[3]}`;
    }
    const reconstructed = `${match[1]}@${domainCandidate}`.toLowerCase();
    addIfQualified(reconstructed, currentUrl);
  }

  return foundMap;
}

/**
 * Identify relevant public internal subpages (Contact, About, Team, Staff, Company, Support, Press, etc.)
 */
const RELEVANT_KEYWORDS = [
  'contact', 'about', 'team', 'staff', 'company', 'support', 'press',
  'business', 'developers', 'reach', 'touch', 'people', 'leadership',
  'help', 'connect', 'directory', 'contact-us', 'about-us', 'our-team'
];

export function findRelevantInternalLinks(html: string, baseUrlStr: string, maxLinks: number = 20): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  let baseObj: URL;
  try {
    baseObj = new URL(baseUrlStr);
  } catch {
    return [];
  }

  const baseHost = baseObj.hostname.replace(/^www\./i, '');
  const linkRegex = /href=["']([^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrlStr);
      const linkHost = resolved.hostname.replace(/^www\./i, '');

      // Only follow internal same-domain links
      if (linkHost === baseHost && (resolved.protocol === 'http:' || resolved.protocol === 'https:')) {
        // Strip hash fragment and common non-html file extensions
        resolved.hash = '';
        const cleanUrl = resolved.toString();
        const pathname = resolved.pathname.toLowerCase();

        // Skip static asset files
        if (pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|pdf|zip|mp4|ico|woff|woff2)$/i)) {
          continue;
        }

        // Check if path or link text matches relevant contact/about keywords
        const isRelevant = RELEVANT_KEYWORDS.some(kw => pathname.includes(kw));

        if (isRelevant && !seen.has(cleanUrl) && cleanUrl !== baseUrlStr) {
          seen.add(cleanUrl);
          links.push(cleanUrl);
          if (links.length >= maxLinks) break;
        }
      }
    } catch {
      // ignore invalid relative url
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
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(robotsUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScoutTool/1.0; +https://scout-toool.netlify.app)' },
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
    // Non-blocking if robots.txt is missing or times out
  }
  return disallowedPaths;
}

/**
 * Main Web Scraper Engine:
 * Validates SSRF, crawls target homepage and relevant public subpages (Contact, About, Team, etc.)
 * up to MAX_PAGES_PER_SCAN (default: 20), extracts emails, deduplicates, and preserves source URLs.
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

  const maxPages = isFast ? 2 : (options?.maxPages || parseInt(process.env.MAX_PAGES_PER_SCAN || '6', 10) || 6);
  const timeoutMs = isFast ? 1800 : (options?.timeoutMs || parseInt(process.env.SCRAPER_TIMEOUT_MS || '3500', 10) || 3500);

  const standardHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; ScoutTool/1.0; +https://scout-toool.netlify.app)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const discoveredEmails = new Map<string, { sourceUrl: string; pagePath: string }>();
  let siteName = siteDomain;
  let pagesScanned = 0;

  // Check robots.txt politely if in standard mode
  const disallowedPaths = isFast ? new Set<string>() : await checkRobotsTxt(targetUrl);

  try {
    // 2. Fetch Homepage / Initial Target Page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(targetUrl, {
      headers: standardHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
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

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      return {
        site: siteDomain,
        url: targetUrl,
        name: siteDomain,
        pagesScanned: 1,
        emails: [],
        error: 'invalid_content',
        errorMessage: 'No publicly displayed email addresses were found on the pages we could access.',
      };
    }

    const html = await res.text();
    pagesScanned++;
    siteName = extractSiteBranding(html, siteDomain);

    // Extract emails from homepage
    const homeEmails = extractEmailsFromHtml(html, targetUrl, gmailOnly);
    homeEmails.forEach((sourceUrl, email) => {
      if (!discoveredEmails.has(email)) {
        discoveredEmails.set(email, { sourceUrl, pagePath: '/' });
      }
    });

    // 3. Find and crawl relevant public subpages (Contact, About, Team, etc.)
    const subLinks = isFast 
      ? [`${targetUrl.replace(/\/+$/, '')}/contact`, `${targetUrl.replace(/\/+$/, '')}/about`]
      : findRelevantInternalLinks(html, targetUrl, Math.max(1, maxPages - 1));

    // Filter disallowed paths
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
    }).slice(0, isFast ? 2 : 5);

    if (allowedSubLinks.length > 0) {
      const subpagePromises = allowedSubLinks.map(async (subLink) => {
        try {
          const subCtrl = new AbortController();
          const subTimer = setTimeout(() => subCtrl.abort(), isFast ? 1500 : 2500);

          const subRes = await fetch(subLink, {
            headers: standardHeaders,
            signal: subCtrl.signal,
            redirect: 'follow',
          });
          clearTimeout(subTimer);

          if (subRes.ok) {
            pagesScanned++;
            const subHtml = await subRes.text();
            const subEmails = extractEmailsFromHtml(subHtml, subLink, gmailOnly);
            const subUrlObj = new URL(subLink);
            const pagePath = subUrlObj.pathname || '/contact';

            subEmails.forEach((sourceUrl, email) => {
              if (!discoveredEmails.has(email)) {
                discoveredEmails.set(email, { sourceUrl, pagePath });
              }
            });
          }
        } catch {
          // Gracefully continue on subpage timeout
        }
      });

      await Promise.allSettled(subpagePromises);
    }

    // 4. Working Email Resolution: If target site has no exposed plaintext emails,
    // verify standard public domain contacts or Gmail channels based on user preferences
    if (discoveredEmails.size === 0) {
      // Check if any mailto or domain handle was mentioned in meta tags
      const metaMailto = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (metaMailto && metaMailto[1]) {
        const val = validateEmailQuality(metaMailto[1]);
        if (val.isValid && (!gmailOnly || isWebmailOrGmail(val.email))) {
          discoveredEmails.set(val.email, { sourceUrl: targetUrl, pagePath: '/meta' });
        }
      }
    }

    const emailList: ScrapedEmailItem[] = Array.from(discoveredEmails.entries()).map(([email, info]) => ({
      email,
      sourceUrl: info.sourceUrl,
      pagePath: info.pagePath,
      status: 'found',
    }));

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
        pagesScanned,
        emails: [],
        error: 'timeout',
        errorMessage: 'The scan timed out. Please try again.',
      };
    }

    return {
      site: siteDomain,
      url: targetUrl,
      name: siteDomain,
      pagesScanned,
      emails: [],
      error: 'website_unavailable',
      errorMessage: 'This website could not be accessed.',
    };
  }
}

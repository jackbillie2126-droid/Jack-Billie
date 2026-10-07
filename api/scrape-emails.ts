import { scrapeWebsite } from '../src/lib/scraper.ts';

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { websites, url, speedMode = 'fast', gmailOnly = false } = req.body || {};
    const rawList: string[] = [];

    if (Array.isArray(websites)) {
      rawList.push(...websites);
    } else if (typeof url === 'string') {
      rawList.push(url);
    } else if (typeof websites === 'string') {
      rawList.push(websites);
    }

    const cleanList = rawList
      .map((w: any) => String(w || '').trim())
      .filter((w: string) => w.length > 0)
      .slice(0, 50);

    if (cleanList.length === 0) {
      return res.status(400).json({
        error: 'Please enter a valid public website URL.',
        stats: { processed: 0, total: 0, emailsFound: 0, successful: 0, errors: 0 },
        results: [],
      });
    }

    const allResults: any[] = [];
    let successfulCount = 0;
    let errorCount = 0;
    let emailsFoundCount = 0;
    const seenEmails = new Set<string>();

    const isFast = speedMode === 'fast';
    const chunkSize = isFast ? 4 : 2;

    for (let i = 0; i < cleanList.length; i += chunkSize) {
      const chunk = cleanList.slice(i, i + chunkSize);
      const promises = chunk.map(async (rawUrl) => {
        try {
          const data = await scrapeWebsite(rawUrl, {
            speedMode: isFast ? 'fast' : 'standard',
            maxPages: isFast ? 5 : 8,
            timeoutMs: isFast ? 5000 : 7000,
            gmailOnly,
          });

          if (data.error && data.emails.length === 0) {
            errorCount++;
            allResults.push({
              id: 'res_' + Math.random().toString(36).substring(2, 11),
              email: 'No Gmail found',
              site: data.site || rawUrl.replace(/^https?:\/\//i, '').split('/')[0],
              url: data.url || rawUrl,
              sourceUrl: data.url || rawUrl,
              path: '/',
              name: data.name || data.site || rawUrl,
              status: 'not_found',
              timestamp: new Date().toISOString(),
            });
            return;
          }

          successfulCount++;
          if (data.emails && data.emails.length > 0) {
            data.emails.forEach((item) => {
              const dedupeKey = item.email.toLowerCase();
              if (!seenEmails.has(dedupeKey)) {
                seenEmails.add(dedupeKey);
                emailsFoundCount++;
                allResults.push({
                  id: 'res_' + Math.random().toString(36).substring(2, 11),
                  email: item.email,
                  site: data.site,
                  url: data.url,
                  sourceUrl: item.sourceUrl || data.url,
                  path: item.pagePath || '/',
                  name: data.name,
                  status: 'found',
                  timestamp: new Date().toISOString(),
                });
              }
            });
          } else {
            allResults.push({
              id: 'res_' + Math.random().toString(36).substring(2, 11),
              email: 'No Gmail found',
              site: data.site,
              url: data.url,
              sourceUrl: data.url,
              path: '/',
              name: data.name,
              status: 'not_found',
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          errorCount++;
          allResults.push({
            id: 'res_' + Math.random().toString(36).substring(2, 11),
            email: 'No Gmail found',
            site: rawUrl.replace(/^https?:\/\//i, '').split('/')[0],
            url: rawUrl,
            sourceUrl: rawUrl,
            path: '/',
            name: rawUrl.replace(/^https?:\/\//i, '').split('/')[0],
            status: 'not_found',
            timestamp: new Date().toISOString(),
          });
        }
      });

      await Promise.allSettled(promises);
    }

    return res.status(200).json({
      stats: {
        processed: cleanList.length,
        total: cleanList.length,
        emailsFound: emailsFoundCount,
        successful: successfulCount,
        errors: errorCount,
      },
      results: allResults,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Something went wrong while scanning. Please try again.',
    });
  }
}

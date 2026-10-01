import { scrapeWebsite } from '../../src/lib/scraper.js';

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { websites, url } = body;
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
      .slice(0, 100);

    if (cleanList.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: 'Please enter a valid public website URL.',
          stats: { processed: 0, total: 0, emailsFound: 0, successful: 0, errors: 0 },
          results: [],
        }),
      };
    }

    const allResults: any[] = [];
    let successfulCount = 0;
    let errorCount = 0;
    let emailsFoundCount = 0;
    const seenEmails = new Set<string>();

    // Process concurrently in chunks of 3 for fast throughput without serverless exhaustion
    const chunkSize = 3;
    for (let i = 0; i < cleanList.length; i += chunkSize) {
      const chunk = cleanList.slice(i, i + chunkSize);
      const promises = chunk.map(async (rawUrl) => {
        try {
          const data = await scrapeWebsite(rawUrl, { maxPages: 4, timeoutMs: 3000 });
          if (data.error && data.emails.length === 0) {
            errorCount++;
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
          }
        } catch (err) {
          errorCount++;
        }
      });

      await Promise.allSettled(promises);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        stats: {
          processed: cleanList.length,
          total: cleanList.length,
          emailsFound: emailsFoundCount,
          successful: successfulCount,
          errors: errorCount,
        },
        results: allResults,
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Something went wrong while scanning this website. Please try again.' }),
    };
  }
};


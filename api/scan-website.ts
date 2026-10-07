import { scrapeWebsite, isSsrfSafeUrl } from '../src/lib/scraper.ts';

export default async function handler(req: any, res: any) {
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
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid public website URL.' });
    }

    const ssrf = isSsrfSafeUrl(url);
    if (!ssrf.safe) {
      return res.status(400).json({ error: ssrf.reason || 'Please enter a valid public website URL.' });
    }

    const result = await scrapeWebsite(url, { maxPages: 6, timeoutMs: 6500 });
    if (result.error && result.errorMessage) {
      return res.status(200).json({
        site: result.site,
        url: result.url,
        name: result.name,
        pagesScanned: result.pagesScanned,
        emails: [],
        status: 'error',
        message: result.errorMessage,
      });
    }

    return res.status(200).json({
      site: result.site,
      url: result.url,
      name: result.name,
      pagesScanned: result.pagesScanned,
      emails: result.emails,
      status: 'completed',
      message: result.emails.length > 0 ? `${result.emails.length} public emails found` : 'No publicly displayed email addresses were found on the pages we could access.',
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Something went wrong while scanning this website. Please try again.' });
  }
}

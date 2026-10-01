import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { getCampaigns, getCampaign, saveCampaign } from './src/lib/db.js';
import { processCampaign, cancelCampaign, startScheduler } from './src/lib/queue.js';
import { Campaign } from './src/types.js';
import { scrapeWebsite, ScrapeResult, isSsrfSafeUrl } from './src/lib/scraper.js';
import { validateEmailQuality } from './src/lib/emailFilter.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Start the background campaign scheduler
  startScheduler();

  app.use(express.json({ limit: '10mb' }));

  // Google Search Console Verification
  app.get('/googlebef459eca62ce8c0.html', (req, res) => {
    const verifPath = path.join(process.cwd(), 'public', 'googlebef459eca62ce8c0.html');
    if (fs.existsSync(verifPath)) {
      res.type('text/html').sendFile(verifPath);
    } else {
      res.type('text/html').send('google-site-verification: googlebef459eca62ce8c0.html\n');
    }
  });

  // SEO: Serve robots.txt dynamically matching deployment domain
  app.get('/robots.txt', (req, res) => {
    const host = req.get('host') || 'localhost:3000';
    const proto = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const origin = `${proto}://${host}`;
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /auth/',
      '',
      `Sitemap: ${origin}/sitemap.xml`
    ].join('\r\n') + '\r\n');
  });

  // SEO: Serve sitemap.xml dynamically matching deployment domain
  app.get('/sitemap.xml', (req, res) => {
    const host = req.get('host') || 'localhost:3000';
    const proto = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const origin = `${proto}://${host}`;
    const today = new Date().toISOString().split('T')[0];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`);
  });

  // API: Get all campaigns
  app.get('/api/campaigns', (req, res) => {
    try {
      const campaigns = getCampaigns();
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
    }
  });

  // API: Get a single campaign status/logs
  app.get('/api/campaigns/:id', (req, res) => {
    try {
      const campaign = getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch campaign' });
    }
  });

  // API: Create a new outreach campaign
  app.post('/api/campaigns', (req, res) => {
    try {
      const { name, subject, body, recipients, pacingMode, deliverabilityScore } = req.body;
      if (!name || !subject || !body || !Array.isArray(recipients)) {
        return res.status(400).json({ error: 'Missing required campaign fields (name, subject, body, recipients)' });
      }

      // Filter and validate recipients: keep only good emails
      const validRecipients = recipients
        .map((r: any) => {
          const rawEmail = String(r.email || '').trim();
          const check = validateEmailQuality(rawEmail);
          return {
            email: check.isValid ? check.email : rawEmail,
            name: String(r.name || '').trim(),
            link: r.link ? String(r.link).trim() : undefined,
            status: check.isValid ? ('queued' as const) : ('failed' as const),
            error: check.isValid ? undefined : `Filtered: ${check.reason || 'Invalid email format'}`
          };
        })
        .filter((r: any) => r.email.length > 0);

      if (validRecipients.length === 0) {
        return res.status(400).json({ error: 'No valid recipient email addresses found in the campaign payload.' });
      }

      const campaign: Campaign = {
        id: 'camp_' + Math.random().toString(36).substring(2, 11),
        name,
        subject,
        body,
        recipients: validRecipients,
        status: 'queued',
        createdAt: new Date().toISOString(),
        pacingMode: pacingMode || 'human',
        deliverabilityScore: typeof deliverabilityScore === 'number' ? deliverabilityScore : undefined,
      };

      saveCampaign(campaign);
      res.status(201).json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create campaign' });
    }
  });

  // API: Trigger background sending of a campaign
  app.post('/api/campaigns/:id/send', (req, res) => {
    try {
      const { id } = req.params;
      const campaign = getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body.accessToken;

      if (!token) {
        return res.status(401).json({ error: 'Google OAuth Access Token is required to send emails' });
      }

      const { scheduledAt } = req.body;
      if (scheduledAt) {
        campaign.status = 'scheduled';
        campaign.scheduledAt = new Date(scheduledAt).toISOString();
        campaign.scheduledToken = token;
        saveCampaign(campaign);
        return res.json({ 
          message: `Campaign successfully scheduled for ${campaign.scheduledAt}`, 
          campaignId: id,
          scheduledAt: campaign.scheduledAt
        });
      }

      processCampaign(id, token).catch(err => {
        console.error(`[Queue Error] Background campaign sending failed for ${id}:`, err);
      });

      res.json({ message: 'Sending sequence initiated', campaignId: id });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to initiate campaign send' });
    }
  });

  // API: Cancel an actively sending campaign
  app.post('/api/campaigns/:id/cancel', (req, res) => {
    try {
      const { id } = req.params;
      const success = cancelCampaign(id);
      res.json({ success, message: success ? 'Sending cancelled successfully' : 'Campaign is not currently active' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to cancel campaign' });
    }
  });

  // API: Single Website Scan Endpoint
  app.post('/api/scan-website', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Please enter a valid public website URL.' });
      }

      const ssrf = isSsrfSafeUrl(url);
      if (!ssrf.safe) {
        return res.status(400).json({ error: ssrf.reason || 'Please enter a valid public website URL.' });
      }

      const result = await scrapeWebsite(url);
      if (result.error && result.errorMessage) {
        return res.json({
          site: result.site,
          url: result.url,
          name: result.name,
          pagesScanned: result.pagesScanned,
          emails: [],
          status: 'error',
          message: result.errorMessage,
        });
      }

      res.json({
        site: result.site,
        url: result.url,
        name: result.name,
        pagesScanned: result.pagesScanned,
        emails: result.emails,
        status: 'completed',
        message: result.emails.length > 0 ? `${result.emails.length} public emails found` : 'No publicly displayed email addresses were found on the pages we could access.',
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Something went wrong while scanning this website. Please try again.' });
    }
  });

  // API: ScoutTool Bulk / URL Email Scraper Endpoint
  app.post('/api/scrape-emails', async (req, res) => {
    try {
      const { websites, url, speedMode = 'fast', gmailOnly = false } = req.body;
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
        .slice(0, 500); // Max 500 websites

      if (cleanList.length === 0) {
        return res.status(400).json({
          error: 'Please enter a valid public website URL.',
          stats: { processed: 0, total: 0, emailsFound: 0, successful: 0, errors: 0 },
          results: []
        });
      }

      const allResults: ScrapeResult[] = [];
      let successfulCount = 0;
      let errorCount = 0;
      let emailsFoundCount = 0;
      const seenEmails = new Set<string>();

      const isFast = speedMode === 'fast';
      const batchSize = isFast ? 8 : 3;

      for (let i = 0; i < cleanList.length; i += batchSize) {
        const batch = cleanList.slice(i, i + batchSize);
        const batchPromises = batch.map(async (rawUrl) => {
          try {
            const data = await scrapeWebsite(rawUrl, {
              speedMode: isFast ? 'fast' : 'standard',
              maxPages: isFast ? 2 : 5,
              timeoutMs: isFast ? 1800 : 3500,
              gmailOnly
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
              // No Gmail/email found on accessible pages: do not assume, explicitly output "No Gmail found"
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
          } catch (err: any) {
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

        await Promise.allSettled(batchPromises);
      }

      res.json({
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
      res.status(500).json({ error: 'Something went wrong while scanning this website. Please try again.' });
    }
  });

  // OAuth Callback Route for Google Implicit Grant Flow
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Authentication</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #f8fafc;
              color: #1e293b;
            }
            .card {
              background: white;
              padding: 2rem;
              border-radius: 1rem;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
              text-align: center;
              max-width: 400px;
            }
            .spinner {
              border: 3px solid #f3f3f3;
              border-top: 3px solid #4f46e5;
              border-radius: 50%;
              width: 24px;
              height: 24px;
              animation: spin 1s linear infinite;
              margin: 1rem auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>Completing Connection</h3>
            <div class="spinner"></div>
            <p style="font-size: 0.875rem; color: #64748b;">Transferring your secure session to ScoutTool...</p>
          </div>
          <script>
            const hash = window.location.hash;
            if (hash) {
              const params = new URLSearchParams(hash.substring(1));
              const accessToken = params.get('access_token');
              if (accessToken) {
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'OAUTH_AUTH_SUCCESS', 
                    accessToken: accessToken 
                  }, '*');
                  window.close();
                } else {
                  document.querySelector('.card').innerHTML = '<h3>Connection Successful!</h3><p>You can close this tab now.</p>';
                }
              } else {
                document.querySelector('.card').innerHTML = '<h3>Authentication Failed</h3><p>Could not retrieve access token from Google.</p>';
              }
            } else {
              document.querySelector('.card').innerHTML = '<h3>Authentication Failed</h3><p>No credentials received in URL hash.</p>';
            }
          </script>
        </body>
      </html>
    `);
  });

  // Vite assets hosting configuration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

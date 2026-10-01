import { Campaign, Recipient } from '../types.js';
import { validateEmailQuality } from './emailFilter.js';
import { resolveSpintax, getPacingDelayMs } from './antiSpam.js';

// Standard Base64 encoder for RFC 2047 MIME headers
function toBase64Utf8(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.byteLength; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

// Base64url encoder for Gmail API compliance in pure browser environments
function base64urlEncode(str: string): string {
  return toBase64Utf8(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function isAuthError(errorMsg: string): boolean {
  const lower = (errorMsg || '').toLowerCase();
  return (
    lower.includes('401') ||
    lower.includes('unauthenticated') ||
    lower.includes('invalid credentials') ||
    lower.includes('invalid authentication credentials') ||
    lower.includes('access token expired') ||
    lower.includes('token expired') ||
    lower.includes('token has been expired') ||
    lower.includes('invalid_grant')
  );
}

function formatBodyHtml(body: string): string {
  if (!body) return '';
  if (body.includes('<p>') || body.includes('<div>') || body.includes('<br') || body.includes('<html>')) {
    return body;
  }
  return body
    .split(/\r?\n\r?\n/)
    .map(para => `<p style="margin: 0 0 16px 0; font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">${para.replace(/\r?\n/g, '<br/>')}</p>`)
    .join('');
}

// Help personalize template tags case-insensitively with Spintax fingerprint prevention
function personalize(template: string, recipient: { name: string; email: string; link?: string }): string {
  // First resolve Spintax variants {variant1|variant2|variant3} to ensure unique message hash
  let text = resolveSpintax(template);
  const nameVal = recipient.name || 'there';
  const emailVal = recipient.email;
  const formattedLink = recipient.link
    ? (recipient.link.startsWith('http://') || recipient.link.startsWith('https://') ? recipient.link : `https://${recipient.link}`)
    : '#';

  // Replace double bracket fields {{name}}, {{email}}, {{link}}, {{url}}
  text = text.replace(/\{\{\s*name\s*\}\}/gi, nameVal);
  text = text.replace(/\{\{\s*email\s*\}\}/gi, emailVal);
  text = text.replace(/\{\{\s*(link|url)\s*\}\}/gi, formattedLink);

  // Replace single bracket fields {name}, {email}, {link}, {url}
  text = text.replace(/\{\s*name\s*\}/gi, nameVal);
  text = text.replace(/\{\s*email\s*\}/gi, emailVal);
  text = text.replace(/\{\s*(link|url)\s*\}/gi, formattedLink);

  return text;
}

// Send Gmail direct request from browser with Anti-Spam headers
async function sendGmailEmail(
  accessToken: string,
  to: string,
  subject: string,
  bodyHtml: string
): Promise<{ success: boolean; error?: string; isAuthExpired?: boolean }> {
  try {
    if (accessToken && accessToken.startsWith('sandbox_token_')) {
      // Simulate realistic network outreach dispatch
      await new Promise(r => setTimeout(r, 70));
      return { success: true };
    }

    const formattedBody = formatBodyHtml(bodyHtml);
    const emailParts = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${toBase64Utf8(subject)}?=`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      'X-Mailer: ScoutTool Deliverability Engine/2.5',
      'List-Unsubscribe: <mailto:unsubscribe@scouttool.app?subject=Unsubscribe>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      '',
      formattedBody,
    ];
    const emailString = emailParts.join('\r\n');
    const raw = base64urlEncode(emailString);

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      let errMsg = errData?.error?.message || `HTTP ${res.status} ${res.statusText}`;
      
      if (res.status === 401 || isAuthError(errMsg)) {
        return { 
          success: false, 
          error: 'Google OAuth session expired (tokens expire after 1 hour). Please reconnect your Gmail account to resume.', 
          isAuthExpired: true 
        };
      }

      if (errMsg.includes('Gmail API has not been used') || errMsg.includes('disabled')) {
        errMsg = `Gmail API disabled in project. Please ensure Gmail API is enabled in Google Cloud Console.`;
      }
      return { success: false, error: errMsg, isAuthExpired: false };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Network connection issue' };
  }
}

// Global detection state for fallback
let isServerAvailable = true;

export function isUsingClientSideOnly(): boolean {
  return !isServerAvailable;
}

// Notify UI when local database changes
function notifyLocalUpdate() {
  window.dispatchEvent(new CustomEvent('campaigns-updated'));
}

// Local storage state managers
function getLocalCampaigns(): Campaign[] {
  const data = localStorage.getItem('client_campaigns');
  return data ? JSON.parse(data) : [];
}

function saveLocalCampaigns(campaigns: Campaign[]): void {
  localStorage.setItem('client_campaigns', JSON.stringify(campaigns));
  notifyLocalUpdate();
}

function updateLocalCampaignStatus(id: string, status: Campaign['status']) {
  const campaigns = getLocalCampaigns();
  const campaign = campaigns.find(c => c.id === id);
  if (campaign) {
    campaign.status = status;
    if (status === 'sending' && !campaign.startedAt) {
      campaign.startedAt = new Date().toISOString();
    }
    if ((status === 'completed' || status === 'cancelled' || status === 'failed') && !campaign.completedAt) {
      campaign.completedAt = new Date().toISOString();
    }
    saveLocalCampaigns(campaigns);
  }
}

function updateLocalRecipientStatus(campaignId: string, email: string, status: Recipient['status'], error?: string) {
  const campaigns = getLocalCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);
  if (campaign) {
    const recipient = campaign.recipients.find(r => r.email === email);
    if (recipient) {
      recipient.status = status;
      if (error) recipient.error = error;
      if (status === 'sent') {
        recipient.sentAt = new Date().toISOString();
      }
      saveLocalCampaigns(campaigns);
    }
  }
}

// Active local queue processing runners
const activeLocalCampaigns = new Set<string>();

async function runLocalCampaignQueue(campaignId: string, accessToken: string) {
  activeLocalCampaigns.add(campaignId);
  updateLocalCampaignStatus(campaignId, 'sending');

  const campaigns = getLocalCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign) return;

  const pendingRecipients = campaign.recipients.filter(r => r.status === 'queued' || r.status === 'failed');

  // Reset failed recipient records
  for (const recipient of pendingRecipients) {
    if (recipient.status === 'failed') {
      updateLocalRecipientStatus(campaignId, recipient.email, 'queued');
    }
  }

  let encounteredAuthError = false;

  for (const recipient of pendingRecipients) {
    if (!activeLocalCampaigns.has(campaignId)) {
      break;
    }

    // Strict Email Quality Filter check: Reject image assets (.png, .jpg), malformed addresses, and non-emails
    const qualityCheck = validateEmailQuality(recipient.email);
    if (!qualityCheck.isValid) {
      console.warn(`[Local Queue Filter] Skipped invalid email/asset: "${recipient.email}" (${qualityCheck.reason})`);
      updateLocalRecipientStatus(campaignId, recipient.email, 'failed', `Filtered: ${qualityCheck.reason}`);
      continue;
    }

    updateLocalRecipientStatus(campaignId, recipient.email, 'sending');

    const personalizedSubject = personalize(campaign.subject, recipient);
    const personalizedBody = personalize(campaign.body, recipient);

    const result = await sendGmailEmail(accessToken, qualityCheck.email, personalizedSubject, personalizedBody);

    if (!activeLocalCampaigns.has(campaignId)) {
      break;
    }

    if (result.success) {
      updateLocalRecipientStatus(campaignId, recipient.email, 'sent');
    } else {
      updateLocalRecipientStatus(campaignId, recipient.email, 'failed', result.error);
      if (result.isAuthExpired) {
        encounteredAuthError = true;
        console.warn(`[Local Queue Auth Halt] OAuth token expired for campaign ${campaignId}. Halting sending queue.`);
        break;
      }
    }

    // Anti-Spam Humanized Pacing: Prevents Gmail bot detection and bulk spam classification
    const isSandbox = Boolean(accessToken && accessToken.startsWith('sandbox_token_'));
    const pacingDelay = isSandbox ? 80 : getPacingDelayMs(campaign.pacingMode || 'human');
    await new Promise(resolve => setTimeout(resolve, pacingDelay));
  }

  if (activeLocalCampaigns.has(campaignId)) {
    activeLocalCampaigns.delete(campaignId);
    const freshCampaigns = getLocalCampaigns();
    const freshCampaign = freshCampaigns.find(c => c.id === campaignId);
    if (freshCampaign) {
      const stillPending = freshCampaign.recipients.some(r => r.status === 'queued' || r.status === 'sending');
      if (encounteredAuthError) {
        updateLocalCampaignStatus(campaignId, 'failed');
      } else {
        updateLocalCampaignStatus(campaignId, stillPending ? 'failed' : 'completed');
      }
    }
  }
}

// Start client local scheduler checks
let schedulerInterval: any = null;
function startLocalScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    try {
      const campaigns = getLocalCampaigns();
      const now = new Date();
      for (const campaign of campaigns) {
        if (campaign.status === 'scheduled' && campaign.scheduledAt) {
          const scheduledDate = new Date(campaign.scheduledAt);
          if (scheduledDate <= now) {
            const token = campaign.scheduledToken;
            campaign.status = 'sending';
            delete campaign.scheduledAt;
            delete campaign.scheduledToken;
            saveLocalCampaigns(campaigns);

            if (token) {
              runLocalCampaignQueue(campaign.id, token).catch(err => {
                console.error('[Local Scheduler Error] Failed sending local scheduled campaign:', err);
              });
            } else {
              updateLocalCampaignStatus(campaign.id, 'failed');
            }
          }
        }
      }
    } catch (e) {
      console.error('[Local Scheduler Error] failed checking schedules:', e);
    }
  }, 1000);
}

// Self-initializing client scheduler
if (typeof window !== 'undefined') {
  startLocalScheduler();
}

// EXPORTED API METHODS
export async function getCampaigns(): Promise<Campaign[]> {
  try {
    const res = await fetch('/api/campaigns');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && !contentType.includes('text/html')) {
      const data = await res.json();
      isServerAvailable = true;
      return data;
    }
  } catch {
    // Server unreachable, fallback to local client storage
  }

  isServerAvailable = false;
  return getLocalCampaigns();
}

export async function getCampaign(id: string): Promise<Campaign> {
  if (!isServerAvailable) {
    const local = getLocalCampaigns().find(c => c.id === id);
    if (!local) throw new Error('Campaign not found');
    return local;
  }

  try {
    const res = await fetch(`/api/campaigns/${id}`);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('text/html')) {
      const local = getLocalCampaigns().find(c => c.id === id);
      if (!local) throw new Error('Campaign not found');
      return local;
    }
    return await res.json();
  } catch (error) {
    const local = getLocalCampaigns().find(c => c.id === id);
    if (!local) throw new Error('Campaign not found');
    return local;
  }
}

export async function createCampaign(
  name: string,
  subject: string,
  body: string,
  recipients: Recipient[],
  pacingMode: 'human' | 'warmup' | 'fast' = 'human',
  deliverabilityScore?: number
): Promise<Campaign> {
  const mapRecipient = (r: Recipient): Recipient => ({
    email: String(r.email).trim(),
    name: String(r.name || '').trim(),
    link: r.link ? String(r.link).trim() : undefined,
    status: 'queued',
  });

  if (!isServerAvailable) {
    const campaigns = getLocalCampaigns();
    const newCamp: Campaign = {
      id: 'camp_' + Math.random().toString(36).substring(2, 11),
      name,
      subject,
      body,
      recipients: recipients.map(mapRecipient),
      status: 'queued',
      createdAt: new Date().toISOString(),
      pacingMode,
      deliverabilityScore,
    };
    campaigns.unshift(newCamp);
    saveLocalCampaigns(campaigns);
    return newCamp;
  }

  try {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subject, body, recipients, pacingMode, deliverabilityScore }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('text/html')) {
      throw new Error('Server API failed');
    }
    return await res.json();
  } catch (error) {
    // Fallback to local
    const campaigns = getLocalCampaigns();
    const newCamp: Campaign = {
      id: 'camp_' + Math.random().toString(36).substring(2, 11),
      name,
      subject,
      body,
      recipients: recipients.map(mapRecipient),
      status: 'queued',
      createdAt: new Date().toISOString(),
      pacingMode,
      deliverabilityScore,
    };
    campaigns.unshift(newCamp);
    saveLocalCampaigns(campaigns);
    return newCamp;
  }
}

export async function sendCampaign(
  id: string,
  accessToken: string,
  scheduledAt?: string
): Promise<{ message: string; campaignId: string; scheduledAt?: string }> {
  if (!isServerAvailable) {
    const campaigns = getLocalCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) throw new Error('Campaign not found');

    if (scheduledAt) {
      campaign.status = 'scheduled';
      campaign.scheduledAt = new Date(scheduledAt).toISOString();
      campaign.scheduledToken = accessToken;
      saveLocalCampaigns(campaigns);
      return {
        message: `Campaign scheduled locally for ${campaign.scheduledAt}`,
        campaignId: id,
        scheduledAt: campaign.scheduledAt,
      };
    }

    // Run async queue in local browser background
    runLocalCampaignQueue(id, accessToken).catch(err => {
      console.error('[Local Queue Error] Failed run local campaign:', err);
    });

    return {
      message: 'Client-side sending sequence initiated',
      campaignId: id,
    };
  }

  try {
    const res = await fetch(`/api/campaigns/${id}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: scheduledAt ? JSON.stringify({ scheduledAt }) : undefined,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('text/html')) {
      throw new Error('Server API failed');
    }
    return await res.json();
  } catch (error) {
    // Client side fallback
    const campaigns = getLocalCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) throw new Error('Campaign not found');

    if (scheduledAt) {
      campaign.status = 'scheduled';
      campaign.scheduledAt = new Date(scheduledAt).toISOString();
      campaign.scheduledToken = accessToken;
      saveLocalCampaigns(campaigns);
      return {
        message: `Campaign scheduled locally for ${campaign.scheduledAt}`,
        campaignId: id,
        scheduledAt: campaign.scheduledAt,
      };
    }

    runLocalCampaignQueue(id, accessToken).catch(err => {
      console.error('[Local Queue Error] Failed run local campaign:', err);
    });

    return {
      message: 'Client-side sending sequence initiated',
      campaignId: id,
    };
  }
}

export async function cancelCampaign(id: string): Promise<{ success: boolean; message: string }> {
  if (!isServerAvailable) {
    if (activeLocalCampaigns.has(id)) {
      activeLocalCampaigns.delete(id);
      updateLocalCampaignStatus(id, 'cancelled');
      return { success: true, message: 'Campaign sending halted on client' };
    }

    const campaigns = getLocalCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (campaign && campaign.status === 'scheduled') {
      campaign.status = 'cancelled';
      delete campaign.scheduledAt;
      delete campaign.scheduledToken;
      saveLocalCampaigns(campaigns);
      return { success: true, message: 'Scheduled campaign cancelled on client' };
    }

    return { success: false, message: 'Campaign was not actively sending' };
  }

  try {
    const res = await fetch(`/api/campaigns/${id}/cancel`, {
      method: 'POST',
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('text/html')) {
      throw new Error('Server API failed');
    }
    return await res.json();
  } catch (error) {
    if (activeLocalCampaigns.has(id)) {
      activeLocalCampaigns.delete(id);
      updateLocalCampaignStatus(id, 'cancelled');
      return { success: true, message: 'Campaign sending halted on client' };
    }

    const campaigns = getLocalCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (campaign && campaign.status === 'scheduled') {
      campaign.status = 'cancelled';
      delete campaign.scheduledAt;
      delete campaign.scheduledToken;
      saveLocalCampaigns(campaigns);
      return { success: true, message: 'Scheduled campaign cancelled on client' };
    }

    return { success: false, message: 'Campaign was not actively sending' };
  }
}

export interface ScrapeApiResponse {
  stats: {
    processed: number;
    total: number;
    emailsFound: number;
    successful: number;
    errors: number;
  };
  results: {
    id: string;
    email: string;
    site: string;
    url: string;
    sourceUrl?: string;
    path: string;
    name: string;
    status: 'found' | 'not_found' | 'error';
    timestamp: string;
  }[];
}

export interface ScrapeProgressData {
  processed: number;
  total: number;
  emailsFound: number;
  currentBatchResults: any[];
  currentUrl?: string;
  pagesScanned?: number;
  rawEmailsCount?: number;
  duplicatesRemoved?: number;
}

export interface ScrapeWebsitesOptions {
  speedMode?: 'fast' | 'standard';
  gmailOnly?: boolean;
}

export async function scrapeWebsites(
  websites: string[],
  optionsOrProgress?: ScrapeWebsitesOptions | ((progress: ScrapeProgressData) => void),
  onProgressCallback?: (progress: ScrapeProgressData) => void
): Promise<ScrapeApiResponse> {
  let options: ScrapeWebsitesOptions = {};
  let onProgress = onProgressCallback;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = optionsOrProgress;
  }

  const speedMode = options.speedMode || 'fast';
  const gmailOnly = options.gmailOnly === true;
  const isFast = speedMode === 'fast';

  const cleanList = websites
    .map(w => String(w || '').trim())
    .filter(w => w.length > 0);

  if (cleanList.length === 0) {
    return {
      stats: { processed: 0, total: 0, emailsFound: 0, successful: 0, errors: 0 },
      results: [],
    };
  }

  // Fast mode uses 6-site parallel chunks for instant discovery; Standard uses 2 for deep polite crawling
  const batchSize = isFast ? 6 : 2;
  const allResults: ScrapeApiResponse['results'] = [];
  let totalSuccessful = 0;
  let totalErrors = 0;
  let totalEmailsFound = 0;
  let totalRawEmails = 0;
  let processedCount = 0;
  const seenEmails = new Set<string>();

  for (let i = 0; i < cleanList.length; i += batchSize) {
    const chunk = cleanList.slice(i, i + batchSize);
    const activeUrl = chunk[0] || '';

    // Immediate update that we are actively scanning this target
    onProgress?.({
      processed: processedCount,
      total: cleanList.length,
      emailsFound: totalEmailsFound,
      currentBatchResults: [],
      currentUrl: activeUrl,
      pagesScanned: Math.max(1, processedCount * 2),
      rawEmailsCount: totalRawEmails,
      duplicatesRemoved: Math.max(0, totalRawEmails - totalEmailsFound),
    });

    try {
      const res = await fetch('/api/scrape-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          websites: chunk,
          speedMode,
          gmailOnly
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        // If an individual batch encounters a 502/504 or server error, record chunk as errors and proceed
        totalErrors += chunk.length;
        processedCount += chunk.length;
        onProgress?.({
          processed: processedCount,
          total: cleanList.length,
          emailsFound: totalEmailsFound,
          currentBatchResults: [],
          currentUrl: activeUrl,
          pagesScanned: processedCount * 3,
          rawEmailsCount: totalRawEmails,
          duplicatesRemoved: Math.max(0, totalRawEmails - totalEmailsFound),
        });
        continue;
      }

      const data: ScrapeApiResponse = await res.json();
      processedCount += chunk.length;

      if (data && data.results) {
        const batchNewResults: any[] = [];
        totalRawEmails += data.results.length;

        for (const item of data.results) {
          const isNotFound = item.status === 'not_found' || item.email === 'No Gmail found' || item.email === 'No email found';
          const dedupeKey = isNotFound ? `${item.site || item.url}_not_found` : item.email.toLowerCase();
          
          if (!seenEmails.has(dedupeKey)) {
            seenEmails.add(dedupeKey);
            if (!isNotFound) {
              totalEmailsFound++;
            }
            allResults.push(item);
            batchNewResults.push(item);
          }
        }
        totalSuccessful += data.stats?.successful || (chunk.length - (data.stats?.errors || 0));
        totalErrors += data.stats?.errors || 0;

        onProgress?.({
          processed: processedCount,
          total: cleanList.length,
          emailsFound: totalEmailsFound,
          currentBatchResults: batchNewResults,
          currentUrl: activeUrl,
          pagesScanned: processedCount * 3,
          rawEmailsCount: totalRawEmails,
          duplicatesRemoved: Math.max(0, totalRawEmails - totalEmailsFound),
        });
      } else {
        totalErrors += chunk.length;
      }
    } catch (err) {
      console.warn(`[ScoutTool Batch Warning] Chunk ${chunk.join(', ')} failed:`, err);
      processedCount += chunk.length;
      totalErrors += chunk.length;
      onProgress?.({
        processed: processedCount,
        total: cleanList.length,
        emailsFound: totalEmailsFound,
        currentBatchResults: [],
        currentUrl: activeUrl,
        pagesScanned: processedCount * 3,
        rawEmailsCount: totalRawEmails,
        duplicatesRemoved: Math.max(0, totalRawEmails - totalEmailsFound),
      });
    }
  }

  return {
    stats: {
      processed: cleanList.length,
      total: cleanList.length,
      emailsFound: totalEmailsFound,
      successful: totalSuccessful,
      errors: totalErrors,
    },
    results: allResults,
  };
}


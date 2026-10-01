import { getCampaign, getCampaigns, saveCampaign, updateCampaignStatus, updateRecipientStatus } from './db.js';
import { validateEmailQuality } from './emailFilter.js';
import { resolveSpintax, getPacingDelayMs } from './antiSpam.js';

// Keep track of active campaigns that are currently sending in the background
const activeCampaigns = new Set<string>();

export function cancelCampaign(id: string): boolean {
  if (activeCampaigns.has(id)) {
    activeCampaigns.delete(id);
    updateCampaignStatus(id, 'cancelled');
    return true;
  }
  const campaign = getCampaign(id);
  if (campaign && campaign.status === 'scheduled') {
    campaign.status = 'cancelled';
    delete campaign.scheduledAt;
    delete campaign.scheduledToken;
    saveCampaign(campaign);
    return true;
  }
  return false;
}

export function isCampaignActive(id: string): boolean {
  return activeCampaigns.has(id);
}

function personalize(template: string, recipient: { name: string; email: string }): string {
  let text = resolveSpintax(template);
  // Case-insensitive replace of {{name}} and {{email}}
  text = text.replace(/\{\{\s*name\s*\}\}/gi, recipient.name || 'there');
  text = text.replace(/\{\{\s*email\s*\}\}/gi, recipient.email);
  return text;
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

async function sendGmailEmail(
  accessToken: string,
  to: string,
  subject: string,
  bodyHtml: string
): Promise<{ success: boolean; error?: string; isAuthExpired?: boolean }> {
  try {
    if (accessToken && accessToken.startsWith('sandbox_token_')) {
      await new Promise(r => setTimeout(r, 60));
      return { success: true };
    }

    const formattedBody = formatBodyHtml(bodyHtml);
    // Construct standard RFC 2822 email message
    const emailParts = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      formattedBody,
    ];
    const emailString = emailParts.join('\r\n');
    
    // Base64url encode (RFC 4648)
    const raw = Buffer.from(emailString)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

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
        errMsg = 'Gmail API disabled in project. Please ensure Gmail API is enabled in Google Cloud Console.';
      }

      return { success: false, error: errMsg, isAuthExpired: false };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown network connection issue' };
  }
}

export async function processCampaign(campaignId: string, accessToken: string): Promise<void> {
  const campaign = getCampaign(campaignId);
  if (!campaign) return;

  if (campaign.status === 'completed' || campaign.status === 'cancelled') {
    return;
  }

  activeCampaigns.add(campaignId);
  updateCampaignStatus(campaignId, 'sending');

  // Filter recipients who are queued or failed (for a retry-like scenario if restarted)
  const pendingRecipients = campaign.recipients.filter(r => r.status === 'queued' || r.status === 'failed');

  // Reset status of any failed recipients back to queued when we start fresh
  for (const recipient of pendingRecipients) {
    if (recipient.status === 'failed') {
      updateRecipientStatus(campaignId, recipient.email, 'queued', undefined);
    }
  }

  let encounteredAuthError = false;

  for (const recipient of pendingRecipients) {
    // Check if campaign was cancelled during iteration
    if (!activeCampaigns.has(campaignId)) {
      break;
    }

    // Strict Email Quality Filter check: Reject image assets (.png, .jpg), malformed addresses, and non-emails
    const qualityCheck = validateEmailQuality(recipient.email);
    if (!qualityCheck.isValid) {
      console.warn(`[Queue Filter] Skipped invalid email/asset: "${recipient.email}" (${qualityCheck.reason})`);
      updateRecipientStatus(campaignId, recipient.email, 'failed', `Filtered: ${qualityCheck.reason}`);
      continue;
    }

    updateRecipientStatus(campaignId, recipient.email, 'sending');

    const personalizedSubject = personalize(campaign.subject, recipient);
    const personalizedBody = personalize(campaign.body, recipient);

    const result = await sendGmailEmail(accessToken, qualityCheck.email, personalizedSubject, personalizedBody);

    if (!activeCampaigns.has(campaignId)) {
      // If cancelled during send, update database and stop
      break;
    }

    if (result.success) {
      updateRecipientStatus(campaignId, recipient.email, 'sent');
    } else {
      updateRecipientStatus(campaignId, recipient.email, 'failed', result.error);
      
      // If Gmail OAuth token expired or is invalid, HALT the queue immediately!
      // Do NOT fail all remaining queued contacts; keep them in queued state for easy resume once reconnected.
      if (result.isAuthExpired) {
        encounteredAuthError = true;
        console.warn(`[Queue Auth Halt] OAuth token expired for campaign ${campaignId}. Halting sending queue to prevent cascading failure.`);
        break;
      }
    }

    // Anti-Spam Humanized Pacing: Prevents Gmail bot detection and rate limits
    const isSandbox = Boolean(accessToken && accessToken.startsWith('sandbox_token_'));
    const pacingDelay = isSandbox ? 80 : getPacingDelayMs(campaign.pacingMode || 'human');
    await new Promise(resolve => setTimeout(resolve, pacingDelay));
  }

  // Mark campaign state after loop
  if (activeCampaigns.has(campaignId)) {
    activeCampaigns.delete(campaignId);
    
    const freshCampaign = getCampaign(campaignId);
    if (freshCampaign) {
      const stillPending = freshCampaign.recipients.some(r => r.status === 'queued' || r.status === 'sending');
      if (encounteredAuthError) {
        updateCampaignStatus(campaignId, 'failed');
      } else if (!stillPending) {
        updateCampaignStatus(campaignId, 'completed');
      } else {
        updateCampaignStatus(campaignId, 'failed');
      }
    }
  }
}

// Background scheduler to process scheduled campaigns automatically
export function startScheduler() {
  console.log('[Scheduler] Background outreach scheduler started.');
  setInterval(async () => {
    try {
      const campaigns = getCampaigns();
      const now = new Date();
      for (const campaign of campaigns) {
        if (campaign.status === 'scheduled' && campaign.scheduledAt) {
          const scheduledDate = new Date(campaign.scheduledAt);
          if (scheduledDate <= now) {
            console.log(`[Scheduler] Scheduled campaign ${campaign.id} ("${campaign.name}") matches trigger time ${campaign.scheduledAt}. Starting dispatch...`);
            
            const token = campaign.scheduledToken;
            
            // Clean up scheduling fields and transition to sending
            campaign.status = 'sending';
            delete campaign.scheduledAt;
            delete campaign.scheduledToken;
            saveCampaign(campaign);

            if (token) {
              processCampaign(campaign.id, token).catch(err => {
                console.error(`[Scheduler Error] Background processing failed for ${campaign.id}:`, err);
              });
            } else {
              console.error(`[Scheduler Error] Campaign ${campaign.id} is scheduled but has no OAuth access token.`);
              updateCampaignStatus(campaign.id, 'failed');
            }
          }
        }
      }
    } catch (error) {
      console.error('[Scheduler Error] Error in background scheduled campaigns check:', error);
    }
  }, 1000);
}

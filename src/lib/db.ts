import fs from 'fs';
import path from 'path';
import { Campaign, Recipient } from '../types.js';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ campaigns: [] }), 'utf-8');
  }
}

export function getCampaigns(): Campaign[] {
  ensureDb();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed.campaigns || [];
  } catch (error) {
    console.error('Failed to read database:', error);
    return [];
  }
}

export function getCampaign(id: string): Campaign | undefined {
  const campaigns = getCampaigns();
  return campaigns.find(c => c.id === id);
}

export function saveCampaign(campaign: Campaign): void {
  ensureDb();
  const campaigns = getCampaigns();
  const index = campaigns.findIndex(c => c.id === campaign.id);
  if (index >= 0) {
    campaigns[index] = campaign;
  } else {
    campaigns.push(campaign);
  }
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify({ campaigns }, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save campaign:', error);
  }
}

export function updateCampaignStatus(id: string, status: Campaign['status']): void {
  const campaign = getCampaign(id);
  if (campaign) {
    campaign.status = status;
    if (status === 'sending' && !campaign.startedAt) {
      campaign.startedAt = new Date().toISOString();
    }
    if ((status === 'completed' || status === 'cancelled' || status === 'failed') && !campaign.completedAt) {
      campaign.completedAt = new Date().toISOString();
    }
    saveCampaign(campaign);
  }
}

export function updateRecipientStatus(
  campaignId: string,
  email: string,
  status: Recipient['status'],
  error?: string
): void {
  const campaign = getCampaign(campaignId);
  if (campaign) {
    const recipient = campaign.recipients.find(r => r.email === email);
    if (recipient) {
      recipient.status = status;
      if (error) recipient.error = error;
      if (status === 'sent') {
        recipient.sentAt = new Date().toISOString();
      }
      saveCampaign(campaign);
    }
  }
}

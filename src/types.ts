export interface Recipient {
  email: string;
  name: string;
  link?: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  error?: string;
  sentAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  recipients: Recipient[];
  status: 'queued' | 'scheduled' | 'sending' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  scheduledAt?: string;
  scheduledToken?: string;
  pacingMode?: 'human' | 'warmup' | 'fast';
  deliverabilityScore?: number;
}

export interface CampaignStats {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
}


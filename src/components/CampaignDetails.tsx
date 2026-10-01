import React from 'react';
import { Campaign, Recipient } from '../types.js';
import { getCampaign, sendCampaign, cancelCampaign, isUsingClientSideOnly } from '../lib/api.ts';
import { testGmailConnection, isTokenExpired, getCachedToken } from '../lib/firebase.js';
import { getCampaignStats } from './Dashboard.js';
import { 
  ArrowLeft, Download, Ban, Play, AlertCircle, CheckCircle2, 
  Loader2, Search, Filter, HelpCircle, RefreshCcw, MailCheck,
  Bell, BellRing, Clock, CalendarRange, Trophy, Sparkles, PartyPopper, X, ExternalLink, Link as LinkIcon,
  ShieldCheck, AlertTriangle
} from 'lucide-react';
import { VoiceActions } from '../lib/voiceNarrator.ts';

interface CampaignDetailsProps {
  campaignId: string;
  accessToken: string | null;
  onBack: () => void;
  needsAuth: boolean;
  onTriggerAuth: () => Promise<boolean> | void;
  triggerCampaignCompleteNotification?: (campaignName: string) => void;
}

export default function CampaignDetails({ 
  campaignId, 
  accessToken, 
  onBack,
  needsAuth,
  onTriggerAuth,
  triggerCampaignCompleteNotification
}: CampaignDetailsProps) {
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [showCongratsModal, setShowCongratsModal] = React.useState(false);
  const [isTestingConn, setIsTestingConn] = React.useState(false);
  const [connStatus, setConnStatus] = React.useState<{ valid: boolean; email?: string; error?: string } | null>(null);

  // Browser Notification states
  const [notificationPermission, setNotificationPermission] = React.useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const prevStatusRef = React.useRef<string | undefined>(undefined);

  // Search & Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [customScheduleDate, setCustomScheduleDate] = React.useState('');

  const fetchCampaign = React.useCallback(async () => {
    try {
      const data = await getCampaign(campaignId);
      setCampaign(data);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error fetching campaign data.');
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  // Handle manual sender connection verification test
  const handleTestConnection = async () => {
    if (!accessToken) {
      onTriggerAuth();
      return;
    }
    setIsTestingConn(true);
    setConnStatus(null);
    try {
      const res = await testGmailConnection(accessToken);
      setConnStatus(res);
      if (!res.valid && res.isAuthError) {
        setErrorMsg('Gmail connection has expired. Please click "Reconnect Gmail" to renew your session.');
      }
    } catch (err: any) {
      setConnStatus({ valid: false, error: err?.message || 'Connection test failed' });
    } finally {
      setIsTestingConn(false);
    }
  };

  const hasAuthError = React.useMemo(() => {
    if (!campaign) return false;
    if (errorMsg && (errorMsg.includes('expired') || errorMsg.includes('credentials') || errorMsg.includes('OAuth') || errorMsg.includes('401'))) return true;
    return campaign.recipients.some(r => r.status === 'failed' && (
      r.error?.includes('expired') || 
      r.error?.includes('credentials') || 
      r.error?.includes('OAuth') || 
      r.error?.includes('401') ||
      r.error?.includes('UNAUTHENTICATED')
    ));
  }, [campaign, errorMsg]);

  // Synchronize state instantly on local event dispatching
  React.useEffect(() => {
    const handleLocalSync = () => {
      fetchCampaign();
    };
    window.addEventListener('campaigns-updated', handleLocalSync);
    return () => window.removeEventListener('campaigns-updated', handleLocalSync);
  }, [fetchCampaign]);

  // Polling campaign status when active - polled at 800ms for fast feedback
  React.useEffect(() => {
    fetchCampaign();
    
    const interval = setInterval(() => {
      if (campaign?.status === 'sending' || campaign?.status === 'scheduled') {
        fetchCampaign();
      }
    }, 800);

    return () => clearInterval(interval);
  }, [campaignId, campaign?.status, fetchCampaign]);

  // Request browser notification permission
  const handleRequestNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          new Notification('Notifications Enabled!', {
            body: 'You will be notified once this outreach campaign finishes sending.',
            icon: 'https://cdn-icons-png.flaticon.com/512/190/190411.png'
          });
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    }
  };

  // Trigger browser notification & congrats popup when sending transitions to completed
  React.useEffect(() => {
    if (campaign) {
      if (campaign.status === 'completed' && (prevStatusRef.current === 'sending' || prevStatusRef.current === 'scheduled')) {
        setShowCongratsModal(true);
        VoiceActions.gmailSentCongrats();
        if (triggerCampaignCompleteNotification) {
          triggerCampaignCompleteNotification(campaign.name);
        } else if (notificationPermission === 'granted') {
          try {
            new Notification('Campaign Dispatched!', {
              body: `All outbound emails for campaign "${campaign.name}" have been successfully sent.`,
              icon: 'https://cdn-icons-png.flaticon.com/512/190/190411.png'
            });
          } catch (e) {
            console.error('Failed to trigger completion notification:', e);
          }
        }
      }
      prevStatusRef.current = campaign.status;
    }
  }, [campaign, notificationPermission, triggerCampaignCompleteNotification]);

  const handleReconnectAndResume = async () => {
    setIsActionLoading(true);
    setErrorMsg(null);
    try {
      const authed = await onTriggerAuth();
      const freshToken = getCachedToken() || accessToken;
      if (authed || freshToken) {
        if (freshToken) {
          const testRes = await testGmailConnection(freshToken);
          setConnStatus(testRes);
          if (testRes.valid) {
            await sendCampaign(campaignId, freshToken);
            await fetchCampaign();
            return;
          } else if (testRes.error) {
            setErrorMsg(testRes.error);
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to reconnect Google account');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStartSending = async () => {
    let currentToken = accessToken || getCachedToken();

    if (needsAuth || !currentToken || isTokenExpired()) {
      setIsActionLoading(true);
      setErrorMsg(null);
      try {
        const authed = await onTriggerAuth();
        currentToken = getCachedToken() || accessToken;
        if (!authed && !currentToken) {
          setIsActionLoading(false);
          return;
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Authentication required');
        setIsActionLoading(false);
        return;
      }
    }

    if (!currentToken) {
      setErrorMsg('No Google OAuth token available. Please sign in with Google.');
      setIsActionLoading(false);
      return;
    }

    setIsActionLoading(true);
    setErrorMsg(null);
    try {
      // Pre-flight check to verify token is genuinely recognized by Gmail
      const conn = await testGmailConnection(currentToken);
      setConnStatus(conn);
      if (!conn.valid && conn.isAuthError) {
        setErrorMsg('Google OAuth session expired. Please re-authenticate your Gmail connection.');
        await onTriggerAuth();
        const refreshedToken = getCachedToken();
        if (refreshedToken) {
          await sendCampaign(campaignId, refreshedToken);
          await fetchCampaign();
        }
        return;
      }

      await sendCampaign(campaignId, currentToken);
      await fetchCampaign();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const scheduleCampaign = async (targetDate: Date) => {
    let currentToken = accessToken || getCachedToken();

    if (needsAuth || !currentToken || isTokenExpired()) {
      setIsActionLoading(true);
      setErrorMsg(null);
      try {
        const authed = await onTriggerAuth();
        currentToken = getCachedToken() || accessToken;
        if (!authed && !currentToken) {
          setIsActionLoading(false);
          return;
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Authentication required to schedule');
        setIsActionLoading(false);
        return;
      }
    }

    if (!currentToken) {
      setErrorMsg('No Google OAuth token available. Please sign in with Google.');
      setIsActionLoading(false);
      return;
    }

    setIsActionLoading(true);
    setErrorMsg(null);
    try {
      await sendCampaign(campaignId, currentToken, targetDate.toISOString());
      await fetchCampaign();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePresetSchedule = async (preset: string) => {
    if (preset === 'now') {
      handleStartSending();
      return;
    }
    
    let delayMs = 0;
    if (preset === '1s') delayMs = 1000;
    else if (preset === '1m') delayMs = 60 * 1000;
    else if (preset === '1h') delayMs = 60 * 60 * 1000;
    else if (preset === '2h') delayMs = 2 * 60 * 60 * 1000;
    else if (preset === '1d') delayMs = 24 * 60 * 60 * 1000;

    const targetDate = new Date(Date.now() + delayMs);
    await scheduleCampaign(targetDate);
  };

  const handleCustomSchedule = async () => {
    if (!customScheduleDate) return;
    const targetDate = new Date(customScheduleDate);
    if (targetDate <= new Date()) {
      setErrorMsg('Please select a date and time in the future.');
      return;
    }
    await scheduleCampaign(targetDate);
  };

  const handleCancelSending = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to halt this email outreach campaign?\n\n' +
      'Any emails currently queued will not be dispatched. You can resume sending at any time.'
    );
    if (!confirmed) return;

    setIsActionLoading(true);
    setErrorMsg(null);
    try {
      await cancelCampaign(campaignId);
      await fetchCampaign();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!campaign) return;
    const headers = ['Recipient Name', 'Recipient Email', 'Delivery Status', 'Time Sent', 'Failure Reason'];
    const rows = campaign.recipients.map(r => [
      r.name || '',
      r.email,
      r.status.toUpperCase(),
      r.sentAt ? new Date(r.sentAt).toLocaleString() : '',
      r.error || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `outreach_campaign_${campaignId}_logs.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-xs font-semibold">Loading campaign details...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 space-y-4 max-w-lg mx-auto text-center mt-10">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
        <h3 className="text-sm font-bold text-red-900">Campaign Not Found</h3>
        <p className="text-xs text-red-700">{errorMsg || 'We could not fetch the details for this campaign.'}</p>
        <button onClick={onBack} className="text-xs font-bold text-indigo-600 hover:underline">
          Go Back
        </button>
      </div>
    );
  }

  const stats = getCampaignStats(campaign);
  const pendingCount = stats.queued + stats.sending;
  const progressPercent = stats.total > 0 ? Math.round(((stats.sent + stats.failed) / stats.total) * 100) : 0;

  // Filtered lists
  const filteredRecipients = campaign.recipients.filter(recipient => {
    const matchesSearch = 
      recipient.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipient.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && recipient.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header and Back navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl transition-all cursor-pointer text-neutral-600 dark:text-neutral-400 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">{campaign.name}</h2>
              {typeof campaign.deliverabilityScore === 'number' && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  campaign.deliverabilityScore >= 90
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : campaign.deliverabilityScore >= 75
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                }`}>
                  Score: {campaign.deliverabilityScore}/100
                </span>
              )}
              {campaign.pacingMode && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
                  {campaign.pacingMode === 'warmup' ? 'Warm-Up Pacing' : campaign.pacingMode === 'fast' ? 'Express Pacing' : 'Human Safe Pacing'}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Subject: "{campaign.subject}"</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={isTestingConn}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-blue-600 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 py-2 px-3 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            title="Test whether sender credentials are valid"
          >
            {isTestingConn ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            ) : connStatus?.valid ? (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" />
            )}
            <span>{isTestingConn ? 'Testing...' : connStatus?.valid ? 'Sender Connected' : 'Verify Sender'}</span>
          </button>

          <button
            onClick={fetchCampaign}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 py-2 px-3 rounded-lg transition-all cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 py-2 px-3 rounded-lg transition-all cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {connStatus && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
          connStatus.valid 
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' 
            : 'bg-amber-50/80 border-amber-200 text-amber-800'
        }`}>
          {connStatus.valid ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5 text-xs">
            <span className="font-bold block">
              {connStatus.valid ? 'Gmail Sender Verified Active' : 'Gmail Authorization Needed'}
            </span>
            <p>
              {connStatus.valid 
                ? `Authorized sender address: ${connStatus.email || 'Your Gmail Account'}. Outbound messages will dispatch directly through this account.`
                : `${connStatus.error || 'Google session expired.'} Please click "Reconnect Gmail" below.`}
            </p>
          </div>
        </div>
      )}

      {hasAuthError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100/80 text-amber-800 rounded-xl shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Gmail Sender Authorization Expired
              </h4>
              <p className="text-xs text-amber-800 leading-normal max-w-xl">
                Google OAuth credentials expire after 1 hour to protect your security. Your campaign was halted to protect your recipient list. Click below to refresh your token and resume sending.
              </p>
            </div>
          </div>
          <button
            onClick={handleReconnectAndResume}
            disabled={isActionLoading}
            className="shrink-0 w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 px-5 rounded-xl shadow-md shadow-indigo-100 hover:shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
          >
            {isActionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            <span>{isActionLoading ? 'Connecting & Resuming...' : 'Reconnect Gmail & Resume'}</span>
          </button>
        </div>
      )}

      {isUsingClientSideOnly() && (
        <div className="bg-indigo-50/75 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="block text-xs font-bold text-indigo-800 uppercase tracking-wider">Client-Side Engine Active (Optimized for Netlify)</span>
            <p className="text-xs text-indigo-700 leading-normal">
              Because this app is deployed on Netlify, campaigns are processed directly and securely from your browser. Please keep this tab active while sending is in progress to ensure uninterrupted email delivery.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs font-semibold text-rose-800 dark:text-rose-200">{errorMsg}</div>
        </div>
      )}

      {/* Control Station (Send, Cancel, Resend) */}
      <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center md:text-left">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Dispatch Status &amp; Controls
          </h3>
          {campaign.status === 'sending' ? (
            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold animate-pulse flex items-center gap-1.5 justify-center md:justify-start">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              Outreach sequence active. Delivering emails at paced intervals...
            </p>
          ) : campaign.status === 'scheduled' ? (
            <div className="space-y-1">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5 justify-center md:justify-start">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                Scheduled for dispatch on {new Date(campaign.scheduledAt!).toLocaleString()}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                You can safely disconnect; sending triggers automatically at the designated hour.
              </p>
            </div>
          ) : campaign.status === 'completed' ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 justify-center md:justify-start">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All outbound messages processed.
            </p>
          ) : campaign.status === 'cancelled' ? (
            <p className="text-xs text-neutral-500 font-medium">Sending paused by user.</p>
          ) : (
            <p className="text-xs text-neutral-600 dark:text-neutral-300">Outreach sequence prepared and enqueued.</p>
          )}
        </div>

        <div className="w-full md:w-auto">
          {campaign.status === 'sending' ? (
            <button
              onClick={handleCancelSending}
              disabled={isActionLoading}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer"
            >
              <Ban className="h-4 w-4" />
              <span>Halt Sequence</span>
            </button>
          ) : campaign.status === 'scheduled' ? (
            <button
              onClick={handleCancelSending}
              disabled={isActionLoading}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer"
            >
              <Ban className="h-4 w-4" />
              <span>Cancel Scheduled Send</span>
            </button>
          ) : (
            <button
              onClick={handleStartSending}
              disabled={isActionLoading || needsAuth || stats.total === 0 || (campaign.status === 'completed' && stats.failed === 0)}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold py-2.5 px-5 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isActionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              <span>
                {campaign.status === 'queued' ? 'Start Outbound Dispatch' : 
                 stats.failed > 0 ? `Retry Failed (${stats.failed})` : 'Resume Dispatch'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Schedule Dispatch Options Section */}
      {['queued', 'cancelled', 'failed'].includes(campaign.status) && (
        <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h4 className="text-xs font-semibold uppercase tracking-wider">Schedule Outreach Dispatch</h4>
          </div>
          
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Choose a preset interval or select a custom timestamp to initiate outbound dispatch automatically.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'Now', value: 'now' },
              { label: 'In 1 Min', value: '1m' },
              { label: 'In 1 Hour', value: '1h' },
              { label: 'In 2 Hours', value: '2h' },
              { label: 'Tomorrow', value: '1d' },
            ].map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePresetSchedule(preset.value)}
                disabled={isActionLoading || needsAuth}
                className="text-xs font-medium px-3 py-1.5 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 rounded-lg transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <input
              type="datetime-local"
              value={customScheduleDate}
              onChange={(e) => setCustomScheduleDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs rounded-lg px-3 py-1.5 focus:border-blue-500 outline-hidden font-mono text-neutral-800 dark:text-neutral-200"
            />
            
            <button
              onClick={handleCustomSchedule}
              disabled={!customScheduleDate || isActionLoading || needsAuth}
              className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              <span>Set Schedule</span>
            </button>
          </div>
        </div>
      )}

      {/* Progress & Live Stat Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Progress Bar Panel */}
        <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            <span>Sequence Progress</span>
            <span className="text-neutral-900 dark:text-white font-mono font-bold text-sm">{progressPercent}%</span>
          </div>

          <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-neutral-500 dark:text-neutral-400">
            <span>Processed: {stats.sent + stats.failed} / {stats.total}</span>
            {pendingCount > 0 && (
              <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />
                {pendingCount} remaining
              </span>
            )}
          </div>
        </div>

        {/* Breakdown Panel */}
        <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-xs grid grid-cols-2 gap-2.5">
          <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-100 dark:border-neutral-800 text-center font-mono">
            <span className="block text-lg font-bold text-neutral-900 dark:text-white">{stats.total}</span>
            <span className="text-[10px] text-neutral-400 font-sans uppercase">Total</span>
          </div>
          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 text-center font-mono">
            <span className="block text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.sent}</span>
            <span className="text-[10px] text-emerald-600 font-sans uppercase">Sent</span>
          </div>
          <div className="bg-rose-50/60 dark:bg-rose-950/30 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900/40 text-center font-mono">
            <span className="block text-lg font-bold text-rose-600 dark:text-rose-400">{stats.failed}</span>
            <span className="text-[10px] text-rose-600 font-sans uppercase">Failed</span>
          </div>
          <div className="bg-blue-50/60 dark:bg-blue-950/30 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/40 text-center font-mono">
            <span className="block text-lg font-bold text-blue-600 dark:text-blue-400">{stats.queued}</span>
            <span className="text-[10px] text-blue-600 font-sans uppercase">Queued</span>
          </div>
        </div>
      </div>

      {/* Recipient Send Logs & Filtering */}
      <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800/80 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-white">
            Delivery Logs ({filteredRecipients.length})
          </h3>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-xs rounded-lg pl-8 pr-3 py-1 w-44 focus:border-blue-500 outline-hidden font-mono"
              />
            </div>

            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-[11px]">
              {['all', 'sent', 'failed', 'queued'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium uppercase ${
                    statusFilter === filter 
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-semibold' 
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recipients Log List */}
        {filteredRecipients.length === 0 ? (
          <div className="py-8 text-center text-neutral-400 text-xs">
            No recipients matching filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/80 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3">Email Address</th>
                  <th className="py-2.5 px-3">Target Link</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-mono">
                {filteredRecipients.map((recipient, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-900/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans font-medium text-neutral-900 dark:text-white">
                      {recipient.name || <span className="text-neutral-400 italic">None</span>}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-700 dark:text-neutral-300">
                      {recipient.email}
                    </td>
                    <td className="py-2.5 px-3">
                      {recipient.link ? (
                        <a 
                          href={recipient.link} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 max-w-[160px] truncate"
                          title={recipient.link}
                        >
                          <span className="truncate">{recipient.link.replace(/^https?:\/\//i, '')}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
                        </a>
                      ) : (
                        <span className="text-neutral-400 font-sans italic text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {recipient.status === 'sent' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          Sent
                        </span>
                      )}
                      {recipient.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Failed
                        </span>
                      )}
                      {recipient.status === 'sending' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          Sending
                        </span>
                      )}
                      {recipient.status === 'queued' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 font-medium">
                          Queued
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500 dark:text-neutral-400 text-[11px]">
                      {recipient.sentAt ? new Date(recipient.sentAt).toLocaleTimeString() : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px]">
                      {recipient.error ? (
                        <span className="text-rose-600 dark:text-rose-400 truncate max-w-xs block" title={recipient.error}>
                          {recipient.error}
                        </span>
                      ) : recipient.status === 'sent' ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Delivered</span>
                      ) : (
                        <span className="text-neutral-400">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Congratulations Completion Modal Overlay */}
      {showCongratsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#111318] rounded-2xl max-w-sm w-full border border-neutral-200 dark:border-neutral-800 shadow-xl p-6 space-y-4 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Sequence Completed
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                All outbound messages for <strong className="text-neutral-800 dark:text-neutral-200 font-semibold">{campaign.name}</strong> have been processed.
              </p>
            </div>

            {/* Campaign Summary Card inside Modal */}
            <div className="grid grid-cols-3 gap-2 bg-neutral-50 dark:bg-neutral-900/50 p-3 rounded-lg border border-neutral-100 dark:border-neutral-800 text-center font-mono">
              <div>
                <span className="block text-base font-bold text-emerald-600 dark:text-emerald-400">{stats.sent}</span>
                <span className="text-[10px] text-neutral-400 font-sans uppercase">Sent</span>
              </div>
              <div>
                <span className="block text-base font-bold text-blue-600 dark:text-blue-400">
                  {stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 100}%
                </span>
                <span className="text-[10px] text-neutral-400 font-sans uppercase">Rate</span>
              </div>
              <div>
                <span className="block text-base font-bold text-neutral-700 dark:text-neutral-300">{stats.total}</span>
                <span className="text-[10px] text-neutral-400 font-sans uppercase">Total</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCongratsModal(false)}
              className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer text-xs"
            >
              Back to Campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

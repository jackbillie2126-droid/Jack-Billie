import React from 'react';
import { Campaign, CampaignStats } from '../types.js';
import { 
  Calendar, Eye, RefreshCcw, ArrowUpRight, 
  Layers, CheckCircle2, AlertCircle, Clock, Inbox, Terminal
} from 'lucide-react';

interface DashboardProps {
  campaigns: Campaign[];
  onSelectCampaign: (id: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function getCampaignStats(campaign: Campaign): CampaignStats {
  const stats: CampaignStats = { total: campaign.recipients.length, queued: 0, sending: 0, sent: 0, failed: 0 };
  for (const r of campaign.recipients) {
    if (r.status === 'queued') stats.queued++;
    else if (r.status === 'sending') stats.sending++;
    else if (r.status === 'sent') stats.sent++;
    else if (r.status === 'failed') stats.failed++;
  }
  return stats;
}

export default function Dashboard({ campaigns, onSelectCampaign, onRefresh, isRefreshing }: DashboardProps) {
  const sortedCampaigns = React.useMemo(() => {
    return [...campaigns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [campaigns]);

  // Aggregate Metrics
  const globalMetrics = React.useMemo(() => {
    let totalContacts = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let totalActive = 0;

    for (const c of campaigns) {
      for (const r of c.recipients) {
        totalContacts++;
        if (r.status === 'sent') totalSent++;
        else if (r.status === 'failed') totalFailed++;
        else if (r.status === 'sending' || r.status === 'queued') totalActive++;
      }
    }

    const processed = totalSent + totalFailed;
    const rate = processed > 0 ? Math.round((totalSent / processed) * 100) : 100;

    return {
      sequences: campaigns.length,
      totalContacts,
      totalSent,
      totalFailed,
      totalActive,
      successRate: rate
    };
  }, [campaigns]);

  const renderStatus = (status: Campaign['status']) => {
    switch (status) {
      case 'sending':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-blue-600 dark:text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Sending</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Completed</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            <span>Paused</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-rose-600 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-amber-600 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>Queued</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-100 dark:border-neutral-800/80">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-white">
            Campaign Analytics &amp; Dispatch History
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Audit outbound sequences, delivery success rates, and lead engagement logs
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 py-1.5 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Global Telemetry Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Sequences Prepared
          </span>
          <span className="text-xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-1 block">
            {globalMetrics.sequences}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Prospects Enqueued
          </span>
          <span className="text-xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-1 block">
            {globalMetrics.totalContacts}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Delivered Contacts
          </span>
          <span className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 block">
            {globalMetrics.totalSent}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Delivery Rate
          </span>
          <span className="text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1 block">
            {globalMetrics.successRate}%
          </span>
        </div>
      </div>

      {/* Campaigns Listing */}
      {sortedCampaigns.length === 0 ? (
        <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-12 text-center space-y-3 shadow-xs">
          <div className="h-9 w-9 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
            <Inbox className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-neutral-900 dark:text-white">No campaigns dispatched yet</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              Extract target domains from the Extraction Engine or compose a sequence in Send Lists.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCampaigns.map(campaign => {
            const stats = getCampaignStats(campaign);
            const successRate = stats.sent + stats.failed > 0 
              ? Math.round((stats.sent / (stats.sent + stats.failed)) * 100) 
              : 0;

            return (
              <div
                key={campaign.id}
                onClick={() => onSelectCampaign(campaign.id)}
                className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group shadow-xs"
              >
                <div className="space-y-1.5 min-w-0 max-w-lg">
                  <div className="flex items-center gap-2">
                    {renderStatus(campaign.status)}
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                      {new Date(campaign.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                      {campaign.name}
                    </h3>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5 font-mono">
                      "{campaign.subject}"
                    </p>
                  </div>
                </div>

                {/* Right Metrics & Inspect */}
                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-neutral-100 dark:border-neutral-800 pt-3 md:pt-0">
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-sans">Total</span>
                      <span className="font-semibold text-neutral-900 dark:text-white">{stats.total}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-sans">Sent</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.sent}</span>
                    </div>
                    {stats.failed > 0 && (
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-sans">Failed</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400">{stats.failed}</span>
                      </div>
                    )}
                    {stats.queued + stats.sending > 0 && (
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-sans">Queue</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.queued + stats.sending}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-1 transition-colors">
                    <span>Inspect</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

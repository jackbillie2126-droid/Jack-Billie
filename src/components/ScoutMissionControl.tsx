import React from 'react';
import { 
  Radar, Globe, Shield, CheckCircle2, 
  Layers, Filter, Zap, Target, Trophy, ArrowUpRight
} from 'lucide-react';

export interface ScoutMissionMetrics {
  currentUrl: string;
  pagesScanned: number;
  emailsDiscovered: number;
  duplicatesRemoved: number;
  uniqueLeadsFound: number;
  scanningStatus: string;
  isScanning: boolean;
}

interface ScoutMissionControlProps {
  metrics: ScoutMissionMetrics;
  recentLeadFound?: boolean;
  milestoneReached?: {
    count: number;
    title: string;
    message: string;
  } | null;
  onDismissMilestone?: () => void;
  className?: string;
}

export const SCOUT_MILESTONES = [
  { threshold: 10, title: 'Tier 1 Secured', message: '10 verified leads indexed. Engine operational.' },
  { threshold: 50, title: 'Tier 2 Acceleration', message: '50 verified leads catalogued across targets.' },
  { threshold: 100, title: 'Century Pipeline', message: '100 leads unlocked. High-volume prospecting cadence.' },
  { threshold: 500, title: 'Command Threshold', message: '500 qualified records compiled.' },
];

export default function ScoutMissionControl({
  metrics,
  recentLeadFound = false,
  milestoneReached = null,
  onDismissMilestone,
  className = '',
}: ScoutMissionControlProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
      metrics.isScanning
        ? 'border-blue-500/40 bg-neutral-900 text-white shadow-md'
        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111318]'
    } ${className}`}>

      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/40">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${
            metrics.isScanning ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400 dark:bg-neutral-600'
          }`} />
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 tracking-tight">
            Scout Mission Control
          </span>
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
          <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
            {metrics.scanningStatus || 'Standby'}
          </span>
        </div>

        {recentLeadFound && (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50 animate-pulse">
            +1 Lead Verified
          </span>
        )}
      </div>

      {/* Milestone Notification (Minimalist Alert) */}
      {milestoneReached && (
        <div className="mx-3 mt-3 p-2.5 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 truncate">
            <Trophy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold">{milestoneReached.title}:</span>
            <span className="truncate opacity-80">{milestoneReached.message}</span>
          </div>
          {onDismissMilestone && (
            <button
              type="button"
              onClick={onDismissMilestone}
              className="text-[11px] opacity-70 hover:opacity-100 underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Primary Metrics Grid (High Density Tabular) */}
      <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Pages Scanned
          </span>
          <span className="text-lg font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-0.5 block">
            {metrics.pagesScanned}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Raw Contacts
          </span>
          <span className="text-lg font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-0.5 block">
            {metrics.emailsDiscovered}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
            Duplicates Stripped
          </span>
          <span className="text-lg font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-0.5 block">
            {metrics.duplicatesRemoved}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-700 dark:text-blue-400 block">
            Unique Leads
          </span>
          <span className="text-lg font-extrabold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-0.5 block">
            {metrics.uniqueLeadsFound}
          </span>
        </div>
      </div>

      {/* Active Target Banner */}
      <div className="px-4 py-2 bg-neutral-50/30 dark:bg-neutral-900/20 border-t border-neutral-100 dark:border-neutral-800/60 flex items-center justify-between text-xs font-mono text-neutral-500 dark:text-neutral-400">
        <div className="flex items-center gap-2 truncate">
          <span className="text-[10px] uppercase tracking-wider font-sans font-semibold text-neutral-400 dark:text-neutral-500 shrink-0">
            Target
          </span>
          <span className="truncate text-neutral-700 dark:text-neutral-300">
            {metrics.currentUrl || 'Standby'}
          </span>
        </div>
        <span className="text-[10px] text-neutral-400 shrink-0 hidden sm:inline">
          SSRF Verified
        </span>
      </div>
    </div>
  );
}

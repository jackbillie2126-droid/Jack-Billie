import React from 'react';
import { X, ExternalLink, Check, Copy, Globe, Search, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface VercelDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VercelDeploymentModal({ isOpen, onClose }: VercelDeploymentModalProps) {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-sm">
              ▲
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                Vercel Deployment &amp; Google Search Indexing Guide
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Deploy ScoutTool on Vercel and get ranking at the top of Google Search
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Why Google Stopped Showing Your Domain */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="font-semibold flex items-center gap-1.5 text-amber-950 dark:text-amber-100">
              <Search className="h-4 w-4 text-amber-600" />
              <span>Optimizing ScoutTool for Vercel &amp; Google Search</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-neutral-700 dark:text-neutral-300 leading-relaxed">
              <li>
                <strong>Dynamic Canonical Synchronization:</strong> Canonical URLs, OpenGraph tags, and Schema.org structured data automatically synchronize to your active Vercel domain or custom domain so Googlebot indexes the primary source.
              </li>
              <li>
                <strong>Dynamic SEO Synchronized:</strong> We added dynamic canonical and Schema.org resolution so your new Vercel domain or custom domain will be recognized as the authoritative primary source.
              </li>
              <li>
                <strong>Pre-Rendered Crawlable Content:</strong> Googlebot can now read all ScoutTool keywords, FAQs, and feature summaries without needing JavaScript execution.
              </li>
            </ul>
          </div>

          {/* Step-by-Step Vercel Deployment */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              3-Step Fast Vercel Deployment
            </h3>

            {/* Step 1 */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span>Push or Import Repository to Vercel</span>
                </span>
                <a
                  href="https://vercel.com/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Open Vercel Dashboard</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Log into <strong>vercel.com</strong>, click <strong>"Add New... → Project"</strong>, and import your ScoutTool GitHub repository.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>Build Settings &amp; Configuration</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  Pre-configured in vercel.json
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Vercel automatically detects the Vite framework and uses our included <code>vercel.json</code>.
              </p>
              <div className="bg-neutral-900 text-neutral-200 p-2.5 rounded-lg text-xs font-mono space-y-1">
                <div>Framework Preset: <strong>Vite</strong></div>
                <div>Build Command: <code>npm run build</code></div>
                <div>Output Directory: <code>dist</code></div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center text-[10px] font-bold">3</span>
                  <span>Submit to Google Search Console for Instant Re-Indexing</span>
                </span>
                <a
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Google Search Console</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Once deployed on Vercel (e.g. <code>https://scouttool.vercel.app</code> or your custom domain):
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                <li>Go to Google Search Console and add your Vercel URL as a property.</li>
                <li>Submit your sitemap: <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">https://your-domain.vercel.app/sitemap.xml</code></li>
                <li>Click <strong>"URL Inspection"</strong> and click <strong>"Request Indexing"</strong>. Google will recrawl your site within 24–48 hours.</li>
              </ol>
            </div>
          </div>

          {/* Firebase Whitelist Reminder for Vercel */}
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 space-y-2">
            <div className="font-semibold flex items-center gap-1.5 text-blue-950 dark:text-blue-100">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <span>Crucial: Add your Vercel domain to Firebase Authorized Domains</span>
            </div>
            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
              When deploying to a new Vercel domain, remember to add <code>your-project.vercel.app</code> under <strong>Firebase Console → Authentication → Settings → Authorized Domains</strong>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            vercel.json &amp; sitemap.xml are ready in root
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

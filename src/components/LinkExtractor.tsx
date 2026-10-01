import React from 'react';
import { 
  Zap, Compass, Download, Send, Globe, Check, Copy, AlertCircle, 
  ExternalLink, Loader2, Trash2, Search, CheckSquare, 
  Square, FileText, CheckCircle2, ShieldCheck, Terminal,
  RotateCcw, Mail, Filter, ChevronRight, Layers, ArrowUpRight
} from 'lucide-react';
import { scrapeWebsites, ScrapeApiResponse, ScrapeProgressData } from '../lib/api.js';
import { validateEmailQuality, classifyEmailProvider, isWebmailOrGmail } from '../lib/emailFilter.js';

export interface ExtractedEmailItem {
  id: string;
  email: string;
  site: string;
  url: string;
  sourceUrl: string;
  path: string;
  name: string;
  status: 'found' | 'not_found' | 'error';
  provider: string; // 'Gmail' | 'Outlook' | 'Yahoo' | 'Hotmail' | 'Webmail' | 'Custom Domain' | 'None'
  isWebmail: boolean;
  isGmail: boolean;
}

interface LinkExtractorProps {
  onExportToComposer: (recipients: { email: string; link?: string; name?: string }[]) => void;
  scoutModeActive?: boolean;
}

// Sample demo targets (optional for user to click, blank by default)
const SAMPLE_GMAIL_SITES = `https://curl.se
https://html5boilerplate.com
https://danfo.js.org
https://indiehackers.com`;

const SAMPLE_BUSINESS_SITES = `https://linudo.com
https://openai.com
https://vercel.com
https://stripe.com`;

export default function LinkExtractor({ onExportToComposer }: LinkExtractorProps) {
  // Starts completely blank - no mock leads data assumed
  const [inputText, setInputText] = React.useState<string>('');
  const [isScraping, setIsScraping] = React.useState(false);
  const [speedMode, setSpeedMode] = React.useState<'fast' | 'standard'>('fast');
  const [gmailOnly, setGmailOnly] = React.useState<boolean>(true); // default to webmail/Gmail filter
  const [singleUrlInput, setSingleUrlInput] = React.useState<string>('');

  const [scanStepMessage, setScanStepMessage] = React.useState<string>('');
  const [results, setResults] = React.useState<ExtractedEmailItem[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = React.useState<string | null>(null);
  const [justCompletedScrape, setJustCompletedScrape] = React.useState(false);

  // Live Telemetry Stats
  const [telemetry, setTelemetry] = React.useState({
    processed: 0,
    total: 0,
    pagesScanned: 0,
    emailsFound: 0,
    gmailsFound: 0,
    notGmailsCount: 0,
    activeUrl: '',
    duplicatesRemoved: 0,
  });

  const parsedWebsites = React.useMemo(() => {
    return inputText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }, [inputText]);

  const handleLoadGmailSample = () => {
    setInputText(SAMPLE_GMAIL_SITES);
    setGmailOnly(true);
    setErrorMessage(null);
    setStatusFeedback('Loaded sample target URLs for testing.');
  };

  const handleLoadBusinessSample = () => {
    setInputText(SAMPLE_BUSINESS_SITES);
    setGmailOnly(false);
    setErrorMessage(null);
    setStatusFeedback('Loaded sample business URLs.');
  };

  const handleClear = () => {
    setInputText('');
    setResults([]);
    setSelectedIds(new Set());
    setJustCompletedScrape(false);
    setTelemetry({
      processed: 0,
      total: 0,
      pagesScanned: 0,
      emailsFound: 0,
      gmailsFound: 0,
      notGmailsCount: 0,
      activeUrl: '',
      duplicatesRemoved: 0,
    });
    setErrorMessage(null);
    setStatusFeedback(null);
  };

  const runExtraction = async (targets: string[], overrideSpeed?: 'fast' | 'standard', overrideGmailOnly?: boolean) => {
    const cleanTargets = targets
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (cleanTargets.length === 0) {
      setErrorMessage('Please enter at least one target website URL to inspect.');
      return;
    }

    const currentSpeed = overrideSpeed || speedMode;
    const currentGmailOnly = overrideGmailOnly !== undefined ? overrideGmailOnly : gmailOnly;
    const isFast = currentSpeed === 'fast';

    setErrorMessage(null);
    setStatusFeedback(null);
    setIsScraping(true);
    setJustCompletedScrape(false);
    setScanStepMessage(
      isFast 
        ? `Turbo scan: inspecting ${cleanTargets.length} link${cleanTargets.length === 1 ? '' : 's'} in parallel...`
        : `Deep scan: crawling subpages across ${cleanTargets.length} target${cleanTargets.length === 1 ? '' : 's'}...`
    );

    setTelemetry({
      processed: 0,
      total: cleanTargets.length,
      pagesScanned: 0,
      emailsFound: 0,
      gmailsFound: 0,
      notGmailsCount: 0,
      activeUrl: cleanTargets[0] || '',
      duplicatesRemoved: 0,
    });

    try {
      const response: ScrapeApiResponse = await scrapeWebsites(
        cleanTargets,
        {
          speedMode: currentSpeed,
          gmailOnly: currentGmailOnly,
        },
        (progress: ScrapeProgressData) => {
          let gmailsCount = 0;
          let notGmails = 0;
          if (progress.currentBatchResults) {
            progress.currentBatchResults.forEach(r => {
              if (r.status === 'not_found' || r.email === 'No Gmail found') {
                notGmails++;
              } else if (isWebmailOrGmail(r.email)) {
                gmailsCount++;
              }
            });
          }

          setTelemetry(prev => ({
            ...prev,
            processed: progress.processed,
            total: progress.total,
            pagesScanned: progress.pagesScanned || Math.max(1, progress.processed * (isFast ? 2 : 4)),
            emailsFound: progress.emailsFound,
            activeUrl: progress.currentUrl || prev.activeUrl,
            duplicatesRemoved: progress.duplicatesRemoved || 0,
          }));

          const step = progress.processed >= progress.total
            ? 'Finalizing discovered inboxes and classifying providers...'
            : isFast
            ? `Scanning ${progress.processed + 1} of ${progress.total} in parallel (${progress.currentUrl || 'inspecting'})`
            : `Deep checking subpages on ${progress.currentUrl || 'target'}`;

          setScanStepMessage(step);

          if (progress.currentBatchResults && progress.currentBatchResults.length > 0) {
            const batchItems: ExtractedEmailItem[] = progress.currentBatchResults.map(r => {
              const isNotFound = r.status === 'not_found' || r.email === 'No Gmail found' || r.email === 'No email found';
              const cls = !isNotFound ? classifyEmailProvider(r.email) : null;
              return {
                id: r.id,
                email: isNotFound ? 'No Gmail found' : r.email,
                site: r.site,
                url: r.url,
                sourceUrl: r.sourceUrl || r.url,
                path: r.path || '/',
                name: r.name || r.site,
                status: isNotFound ? 'not_found' : 'found',
                provider: cls ? cls.providerName : 'None',
                isWebmail: cls ? cls.isWebmail : false,
                isGmail: cls ? cls.isGmail : false,
              };
            });

            setResults(prev => {
              const seen = new Set(prev.map(p => `${p.site}_${p.email.toLowerCase()}`));
              const fresh = batchItems.filter(b => !seen.has(`${b.site}_${b.email.toLowerCase()}`));
              const merged = [...prev, ...fresh];
              const validIds = new Set(merged.filter(m => m.status === 'found').map(m => m.id));
              setSelectedIds(validIds);
              return merged;
            });
          }
        }
      );

      const finalItems: ExtractedEmailItem[] = response.results.map(r => {
        const isNotFound = r.status === 'not_found' || r.email === 'No Gmail found' || r.email === 'No email found';
        const cls = !isNotFound ? classifyEmailProvider(r.email) : null;
        return {
          id: r.id,
          email: isNotFound ? 'No Gmail found' : r.email,
          site: r.site,
          url: r.url,
          sourceUrl: r.sourceUrl || r.url,
          path: r.path || '/',
          name: r.name || r.site,
          status: isNotFound ? 'not_found' : 'found',
          provider: cls ? cls.providerName : 'None',
          isWebmail: cls ? cls.isWebmail : false,
          isGmail: cls ? cls.isGmail : false,
        };
      });

      setResults(finalItems);
      const validFinalIds = new Set(finalItems.filter(item => item.status === 'found').map(item => item.id));
      setSelectedIds(validFinalIds);

      const foundGmails = finalItems.filter(i => i.status === 'found' && i.isWebmail).length;
      const foundTotal = finalItems.filter(i => i.status === 'found').length;
      const notFoundCount = finalItems.filter(i => i.status === 'not_found').length;

      setTelemetry({
        processed: response.stats.processed,
        total: response.stats.total,
        pagesScanned: response.stats.processed * (isFast ? 2 : 4),
        emailsFound: foundTotal,
        gmailsFound: foundGmails,
        notGmailsCount: notFoundCount,
        activeUrl: 'Complete',
        duplicatesRemoved: Math.max(0, response.stats.emailsFound - foundTotal),
      });

      setJustCompletedScrape(true);

      if (foundTotal > 0) {
        setStatusFeedback(
          foundGmails > 0 
            ? `Extracted ${foundGmails} public Gmail/webmail ${foundGmails === 1 ? 'inbox' : 'inboxes'}${notFoundCount > 0 ? ` (${notFoundCount} target domains had no Gmail)` : ''}.`
            : `Extracted ${foundTotal} deliverable ${foundTotal === 1 ? 'contact' : 'contacts'}${notFoundCount > 0 ? ` (${notFoundCount} had no email)` : ''}.`
        );
        setScanStepMessage('Extraction complete.');
      } else {
        setStatusFeedback('Inspection complete — no Gmails found on these target links.');
        setScanStepMessage('Completed: No Gmail found across targets.');
      }
    } catch (err: any) {
      console.error('Extraction error:', err);
      const errMsg = err?.message || 'Error executing crawl. Verify target availability.';
      setErrorMessage(errMsg);
    } finally {
      setIsScraping(false);
      setTimeout(() => {
        setScanStepMessage('');
      }, 4000);
    }
  };

  const handleStartQueueScrape = () => {
    runExtraction(parsedWebsites);
  };

  const handleSingleQuickExtract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUrlInput.trim()) return;
    runExtraction([singleUrlInput.trim()], 'fast', gmailOnly);
    setSingleUrlInput('');
  };

  const handleDownloadCsv = () => {
    if (results.length === 0) return;

    // Standard RFC-compliant CSV headers
    const headers = ['Domain', 'Source URL', 'Extracted Email', 'Inbox Provider', 'Status'];
    const rows = results.map(r => {
      const isFound = r.status === 'found';
      return [
        `"${(r.site || '').replace(/"/g, '""')}"`,
        `"${(r.sourceUrl || r.url || '').replace(/"/g, '""')}"`,
        `"${(isFound ? r.email : 'No Gmail found').replace(/"/g, '""')}"`,
        `"${(r.provider || 'None').replace(/"/g, '""')}"`,
        `"${isFound ? 'Verified' : 'No Gmail found'}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `extracted_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatusFeedback(`Downloaded ${results.length} extracted records as CSV file.`);
  };

  const handleDownloadTxt = () => {
    const validEmails = results
      .filter(r => r.status === 'found')
      .map(r => r.email);

    if (validEmails.length === 0) {
      setErrorMessage('No valid email contacts available to export as plaintext.');
      return;
    }

    const txtContent = 'data:text/plain;charset=utf-8,' + encodeURIComponent(validEmails.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', txtContent);
    link.setAttribute('download', `leads_emails_${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatusFeedback(`Exported ${validEmails.length} plaintext emails.`);
  };

  const handleExportToComposer = () => {
    // Only export verified emails (never export 'No Gmail found')
    const targetItems = results.filter(r => selectedIds.has(r.id) && r.status === 'found');
    const itemsToExport = targetItems.length > 0 ? targetItems : results.filter(r => r.status === 'found');

    const exportList = itemsToExport
      .map(r => {
        const val = validateEmailQuality(r.email);
        return {
          email: val.isValid ? val.email : r.email,
          link: r.sourceUrl || r.url,
          name: r.name,
          isValid: val.isValid
        };
      })
      .filter(r => r.isValid)
      .map(r => ({
        email: r.email,
        link: r.link,
        name: r.name
      }));

    if (exportList.length === 0) {
      setErrorMessage('No deliverable emails found to stage into Send List.');
      return;
    }

    onExportToComposer(exportList);
  };

  const toggleSelectAll = () => {
    const validResults = filteredResults.filter(r => r.status === 'found');
    if (selectedIds.size === validResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validResults.map(r => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleRemoveItem = (id: string) => {
    setResults(prev => prev.filter(item => item.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleCopyEmail = (email: string, id: string) => {
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Filter results: when gmailOnly is active, only show webmail/gmail addresses (or 'No Gmail found' reports)
  const filteredResults = React.useMemo(() => {
    let list = results;
    if (gmailOnly) {
      list = list.filter(r => r.status === 'not_found' || r.isWebmail);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(r => 
      r.email.toLowerCase().includes(q) ||
      r.site.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.provider.toLowerCase().includes(q) ||
      r.sourceUrl.toLowerCase().includes(q)
    );
  }, [results, searchQuery, gmailOnly]);

  const verifiedCount = React.useMemo(() => {
    return results.filter(r => r.status === 'found').length;
  }, [results]);

  const webmailCount = React.useMemo(() => {
    return results.filter(r => r.status === 'found' && r.isWebmail).length;
  }, [results]);

  const notFoundCount = React.useMemo(() => {
    return results.filter(r => r.status === 'not_found').length;
  }, [results]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Page Header Introduction with Clean Spacing */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-neutral-800/80 pb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Lead Extraction Engine
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Find active Gmail and webmail inboxes (gmail.com, outlook.com, yahoo.com, hotmail.uk) from websites without guessing.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 font-mono">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            SSRF Guard Protected
          </span>
        </div>
      </div>

      {/* Segment 1: Quick Single URL Fast Check Bar */}
      <div className="bg-white dark:bg-[#111318] border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>Instant Single-Link Gmail Finder</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Paste a single link below to find its public Gmail address immediately. If none exists, the engine will explicitly report "No Gmail found".
            </p>
          </div>
        </div>

        <form onSubmit={handleSingleQuickExtract} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Globe className="h-4 w-4 absolute left-3.5 top-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Paste website link (e.g. https://example.com)..."
              value={singleUrlInput}
              onChange={e => setSingleUrlInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs font-mono bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden transition-all text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <button
            type="submit"
            disabled={isScraping || !singleUrlInput.trim()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-xs bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
          >
            {isScraping ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Checking Link...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <span>Find Gmail Fast</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Main Two-Column Extraction Workspace with Generous Gap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Configuration & Targets Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-8">
          {/* Segment 2A: Target URLs Queue (Completely blank by default) */}
          <div className="bg-white dark:bg-[#111318] border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100 dark:border-neutral-800/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Target URLs Queue
              </span>
              <span className="text-xs font-mono text-neutral-400 dark:text-neutral-500">
                {parsedWebsites.length} target{parsedWebsites.length === 1 ? '' : 's'} queued
              </span>
            </div>

            {/* Optional Sample Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                Samples:
              </span>
              <button
                type="button"
                onClick={handleLoadGmailSample}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 text-neutral-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer bg-neutral-50/50 dark:bg-neutral-900/50"
              >
                Sample Creator Sites
              </button>
              <button
                type="button"
                onClick={handleLoadBusinessSample}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer bg-neutral-50/50 dark:bg-neutral-900/50"
              >
                Sample Company Sites
              </button>
              {inputText && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer ml-auto"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Blank Monospace URL Textarea */}
            <div className="space-y-1.5">
              <textarea
                id="website_urls_input"
                rows={9}
                placeholder="Paste your target website URLs here (one URL per line)&#10;https://targetcompany.com&#10;https://creatorpage.org"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className="w-full bg-neutral-50/80 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs text-neutral-900 dark:text-neutral-100 font-mono rounded-xl p-3.5 outline-hidden transition-all resize-y leading-relaxed"
              />
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-normal">
                Paste the websites you want to inspect. No mock data is assumed; each link is checked directly.
              </p>
            </div>
          </div>

          {/* Segment 2B: Extraction Speed & Inbox Filter Controls */}
          <div className="bg-white dark:bg-[#111318] border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
            <div className="pb-1 border-b border-neutral-100 dark:border-neutral-800/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Speed &amp; Inbox Classification
              </span>
            </div>

            {/* Speed Mode Selection: Fast vs Standard */}
            <div className="space-y-2.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                Extraction Speed
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSpeedMode('fast')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    speedMode === 'fast'
                      ? 'border-blue-500/80 bg-blue-50/50 dark:bg-blue-950/30 text-blue-950 dark:text-blue-200 shadow-xs'
                      : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      <span>Turbo Fast</span>
                    </span>
                    {speedMode === 'fast' && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                  </div>
                  <p className="text-[11px] opacity-75 leading-relaxed">
                    Parallel multi-target scan. Completes in 1–2 seconds.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeedMode('standard')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    speedMode === 'standard'
                      ? 'border-blue-500/80 bg-blue-50/50 dark:bg-blue-950/30 text-blue-950 dark:text-blue-200 shadow-xs'
                      : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Compass className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Deep Crawl</span>
                    </span>
                    {speedMode === 'standard' && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                  </div>
                  <p className="text-[11px] opacity-75 leading-relaxed">
                    Polite subpage crawl (/contact, /about, team paths).
                  </p>
                </button>
              </div>
            </div>

            {/* Target Filter: Gmail & Webmail (Gmail, Outlook, Yahoo, Hotmail) vs All */}
            <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                Inbox Provider Filter
              </label>

              <div className="flex items-start justify-between p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40">
                <div className="space-y-1 pr-3">
                  <div className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-rose-500" />
                    <span>Only Accept Gmail &amp; Webmail Inboxes</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                    Accepts <code className="font-mono text-neutral-700 dark:text-neutral-300">gmail.com</code>, <code className="font-mono text-neutral-700 dark:text-neutral-300">outlook.com</code>, <code className="font-mono text-neutral-700 dark:text-neutral-300">yahoo.com</code>, <code className="font-mono text-neutral-700 dark:text-neutral-300">hotmail.uk</code>, etc. Rejects custom corporate domains.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setGmailOnly(prev => !prev)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden mt-0.5 ${
                    gmailOnly ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      gmailOnly ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Execution Buttons: Run Fast vs Run Deep */}
            <div className="space-y-2.5 pt-2">
              <button
                id="scan_website_btn"
                type="button"
                onClick={handleStartQueueScrape}
                disabled={isScraping || parsedWebsites.length === 0}
                className={`w-full py-3 px-5 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                  isScraping
                    ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                    : parsedWebsites.length === 0
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                    : 'bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900'
                }`}
              >
                {isScraping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                    <span>Extracting Inboxes...</span>
                  </>
                ) : speedMode === 'fast' ? (
                  <>
                    <Zap className="h-4 w-4 text-amber-400 fill-amber-400" />
                    <span>Run Turbo Fast Scan ({parsedWebsites.length} {parsedWebsites.length === 1 ? 'Target' : 'Targets'})</span>
                  </>
                ) : (
                  <>
                    <Compass className="h-4 w-4 text-indigo-400" />
                    <span>Run Deep Precision Scan ({parsedWebsites.length} {parsedWebsites.length === 1 ? 'Target' : 'Targets'})</span>
                  </>
                )}
              </button>

              {/* Status and Error banners */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {statusFeedback && !isScraping && (
                <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{statusFeedback}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Telemetry & Results Console (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Segment 3: Live Telemetry & Progress Strip */}
          <div className="bg-white dark:bg-[#111318] border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100 dark:border-neutral-800/80">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${
                  isScraping ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400 dark:bg-neutral-600'
                }`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  Extraction Progress &amp; Telemetry
                </span>
              </div>
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                {isScraping ? (speedMode === 'fast' ? '⚡ Turbo 8x' : '🐢 Deep Walk') : 'Standby'}
              </span>
            </div>

            {/* 4-Card Metrics Deck with Tabular Figures */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800/70">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
                  Domains Processed
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-1 block">
                  {telemetry.processed} / {telemetry.total || parsedWebsites.length}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800/70">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
                  Pages Inspected
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white mt-1 block">
                  {telemetry.pagesScanned}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400 block">
                  Gmails / Webmail
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-300 mt-1 block">
                  {webmailCount}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800/70">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 block">
                  No Gmail Found
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-neutral-600 dark:text-neutral-400 mt-1 block">
                  {notFoundCount}
                </span>
              </div>
            </div>

            {/* Live Progress Bar */}
            {isScraping && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium truncate max-w-[80%] flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />
                    <span>{scanStepMessage}</span>
                  </span>
                  <span className="font-mono text-[11px]">
                    {Math.round((telemetry.processed / Math.max(1, telemetry.total)) * 100)}%
                  </span>
                </div>

                <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(5, (telemetry.processed / Math.max(1, telemetry.total)) * 100))}%`
                    }}
                  />
                </div>
              </div>
            )}

            {/* Completed Scrape Action Banner for CSV Download */}
            {justCompletedScrape && results.length > 0 && !isScraping && (
              <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Extraction complete! <strong>{verifiedCount}</strong> verified inboxes found across <strong>{results.length}</strong> target links.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Leads CSV</span>
                </button>
              </div>
            )}
          </div>

          {/* Segment 4: Extracted Records Console */}
          <div className="bg-white dark:bg-[#111318] border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl overflow-hidden flex flex-col min-h-[460px] shadow-xs">
            {/* Table Header Filter Toolbar */}
            <div className="p-4 sm:p-5 border-b border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50/40 dark:bg-neutral-900/30">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-white">
                  Extraction Results
                </span>
                <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                  ({filteredResults.length} records)
                </span>
                {gmailOnly && (
                  <span className="text-[10px] font-medium bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-md">
                    Webmail &amp; Gmail Only
                  </span>
                )}
              </div>

              {results.length > 0 && (
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Filter email, provider, domain..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg outline-hidden focus:border-blue-500 font-mono text-neutral-900 dark:text-neutral-100"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-medium px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {selectedIds.size === filteredResults.filter(r => r.status === 'found').length && selectedIds.size > 0 
                      ? 'Deselect All' 
                      : 'Select All'}
                  </button>
                </div>
              )}
            </div>

            {/* Table or Empty State */}
            {results.length === 0 ? (
              <div className="grow flex flex-col items-center justify-center p-14 text-center space-y-3">
                <div className="h-10 w-10 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-400 flex items-center justify-center">
                  <Terminal className="h-4 w-4" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {statusFeedback || 'No domain contacts extracted yet.'}
                  </p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed">
                    Paste target websites in the queue on the left and click "Run Turbo Fast Scan". Every link will be verified without assumptions.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto grow">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800/80 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider bg-neutral-50/20 dark:bg-neutral-900/10">
                      <th className="py-3 px-4 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === filteredResults.filter(r => r.status === 'found').length && selectedIds.size > 0}
                          onChange={toggleSelectAll}
                          className="rounded-xs border-neutral-300 text-blue-600 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4">Discovered Inbox</th>
                      <th className="py-3 px-4">Provider</th>
                      <th className="py-3 px-4">Target Origin Domain</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-mono">
                    {filteredResults.map(item => {
                      const isFound = item.status === 'found';
                      const isChecked = selectedIds.has(item.id);

                      return (
                        <tr 
                          key={item.id}
                          className={`hover:bg-neutral-50/70 dark:hover:bg-neutral-900/40 transition-colors ${
                            isChecked ? 'bg-blue-50/20 dark:bg-blue-950/15' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            {isFound ? (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectRow(item.id)}
                                className="rounded-xs border-neutral-300 text-blue-600 cursor-pointer"
                              />
                            ) : (
                              <span className="text-neutral-300 dark:text-neutral-700">—</span>
                            )}
                          </td>

                          {/* Email or 'No Gmail found' */}
                          <td className="py-3.5 px-4">
                            {isFound ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-900 dark:text-white">
                                  {item.email}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyEmail(item.email, item.id)}
                                  title="Copy Email"
                                  className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                                >
                                  {copiedId === item.id ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-neutral-400 dark:text-neutral-500 font-sans italic text-xs">
                                No Gmail found
                              </span>
                            )}
                            {item.name && item.name !== item.site && (
                              <span className="text-[10px] font-sans text-neutral-400 block mt-0.5">
                                {item.name}
                              </span>
                            )}
                          </td>

                          {/* Provider Badge */}
                          <td className="py-3.5 px-4 font-sans">
                            {item.provider === 'Gmail' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300">
                                Gmail
                              </span>
                            )}
                            {item.provider === 'Outlook' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-900/50 text-sky-700 dark:text-sky-300">
                                Outlook
                              </span>
                            )}
                            {item.provider === 'Hotmail' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300">
                                Hotmail
                              </span>
                            )}
                            {item.provider === 'Yahoo' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-300">
                                Yahoo
                              </span>
                            )}
                            {item.provider === 'Webmail' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300">
                                Webmail
                              </span>
                            )}
                            {item.provider === 'Custom Domain' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                Domain
                              </span>
                            )}
                            {item.provider === 'None' && (
                              <span className="text-[10px] text-neutral-400">—</span>
                            )}
                          </td>

                          {/* Source URL */}
                          <td className="py-3.5 px-4">
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 truncate max-w-[180px] inline-flex items-center gap-1"
                              title={item.sourceUrl}
                            >
                              <span className="truncate">{item.sourceUrl}</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
                            </a>
                          </td>

                          {/* Verification Status */}
                          <td className="py-3.5 px-4 font-sans">
                            {isFound ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <span>Verified</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-sans">
                                <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                                <span>No Gmail found</span>
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right font-sans">
                            <div className="flex items-center justify-end gap-2.5">
                              {isFound && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onExportToComposer([{
                                      email: item.email,
                                      link: item.sourceUrl || item.url,
                                      name: item.name,
                                    }]);
                                  }}
                                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  Send →
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                title="Remove"
                                className="text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer p-0.5"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Actions Bar (Spacious) */}
            {results.length > 0 && (
              <div className="p-4 sm:p-5 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {selectedIds.size}
                  </span> of {verifiedCount} verified inboxes selected
                  {notFoundCount > 0 && (
                    <span className="text-neutral-400 ml-2">
                      ({notFoundCount} domains had no Gmail)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    id="download_csv_btn"
                    type="button"
                    onClick={handleDownloadCsv}
                    className="py-2 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Download CSV</span>
                  </button>
                  <button
                    id="download_txt_btn"
                    type="button"
                    onClick={handleDownloadTxt}
                    disabled={verifiedCount === 0}
                    className="py-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Plaintext</span>
                  </button>

                  <button
                    id="export_to_composer_btn"
                    type="button"
                    onClick={handleExportToComposer}
                    disabled={selectedIds.size === 0 && verifiedCount === 0}
                    className="py-2 px-4 rounded-xl font-semibold text-xs bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Email to Contacts ({selectedIds.size > 0 ? selectedIds.size : verifiedCount})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

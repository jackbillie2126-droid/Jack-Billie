import React from 'react';
import Header from './components/Header.tsx';
import NewCampaign from './components/NewCampaign.tsx';
import Dashboard from './components/Dashboard.tsx';
import CampaignDetails from './components/CampaignDetails.tsx';
import LinkExtractor from './components/LinkExtractor.tsx';
import { initAuth, User, isTokenExpired } from './lib/firebase.ts';
import { 
  Globe, Send, List, BookOpen, ShieldCheck, 
  FileSpreadsheet, Sparkles, Smartphone, Terminal, HelpCircle
} from 'lucide-react';

import { Campaign } from './types.ts';
import { getCampaigns } from './lib/api.ts';
import { useAppMode } from './hooks/useAppMode.ts';
import MobileAppDock from './components/MobileAppDock.tsx';
import EntrySplash from './components/EntrySplash.tsx';

type Tab = 'scraper' | 'composer' | 'history' | 'guide';

export default function App() {
  const { isAppMode, triggerHaptic } = useAppMode();
  const [showSplash, setShowSplash] = React.useState<boolean>(true);

  const [user, setUser] = React.useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('scout_user_session') || sessionStorage.getItem('scout_user_session');
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [token, setToken] = React.useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('scout_access_token') || sessionStorage.getItem('scout_access_token') || null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('app-theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('app-theme', theme);
    }
  }, [theme]);

  const [activeTab, setActiveTab] = React.useState<Tab>('scraper');
  const [scrapedRecipients, setScrapedRecipients] = React.useState<{ email: string; link?: string; name?: string }[] | undefined>(undefined);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Initialize auth state observer
  React.useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, cachedToken) => {
        setUser(authedUser);
        setToken(cachedToken);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchCampaignsList = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    const handleLocalSync = () => {
      fetchCampaignsList();
    };
    window.addEventListener('campaigns-updated', handleLocalSync);
    return () => window.removeEventListener('campaigns-updated', handleLocalSync);
  }, [fetchCampaignsList]);

  React.useEffect(() => {
    if (user) {
      fetchCampaignsList();
    }
  }, [user, fetchCampaignsList]);

  const handleLoginSuccess = (authedUser: User, accessToken: string) => {
    setUser(authedUser);
    setToken(accessToken);
    fetchCampaignsList();
  };

  const handleLogoutSuccess = () => {
    setUser(null);
    setToken(null);
    setCampaigns([]);
    setSelectedCampaignId(null);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#090A0F] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans antialiased transition-colors duration-150">
      {/* 30-Second App Entry Splash Screen with Official Logo */}
      {showSplash && (
        <EntrySplash onComplete={() => setShowSplash(false)} durationSeconds={30} />
      )}

      {/* Universal Top Navigation Header */}
      <Header
        user={user}
        onLoginSuccess={handleLoginSuccess}
        onLogoutSuccess={handleLogoutSuccess}
        theme={theme}
        onToggleTheme={() => {
          const nextTheme = theme === 'light' ? 'dark' : 'light';
          setTheme(nextTheme);
        }}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          triggerHaptic?.(8);
          setSelectedCampaignId(null);
          setActiveTab(tab);
        }}
      />

      {/* Main Container with Comfortable Breathing Room */}
      <main className="grow max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col space-y-8">
        {/* Breadcrumb Context Bar (Clean, unboxed typography) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-white">Workspace</span>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {activeTab === 'scraper' && 'Find Emails'}
              {activeTab === 'composer' && 'Send Emails'}
              {activeTab === 'history' && 'Campaigns'}
              {activeTab === 'guide' && 'Help & Docs'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500 font-mono">
            {user ? (
              <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>{user.email}</span>
              </span>
            ) : (
              <span>Sender Disconnected</span>
            )}
          </div>
        </div>

        {/* Selected Campaign Detailed View */}
        {selectedCampaignId ? (
          <CampaignDetails
            campaignId={selectedCampaignId}
            accessToken={token}
            onBack={() => {
              setSelectedCampaignId(null);
              fetchCampaignsList();
            }}
            needsAuth={!user || !token || isTokenExpired()}
            onTriggerAuth={() => {}}
          />
        ) : (
          /* Active Tabs */
          <div className="space-y-8">
            {activeTab === 'scraper' && (
              <LinkExtractor
                onExportToComposer={(exportedList) => {
                  setScrapedRecipients(exportedList);
                  setActiveTab('composer');
                }}
              />
            )}

            {activeTab === 'composer' && (
              <NewCampaign
                userEmail={user?.email || 'sender@example.com'}
                initialRecipients={scrapedRecipients}
                onCampaignCreated={(newCamp) => {
                  setCampaigns(prev => [newCamp, ...prev]);
                  setSelectedCampaignId(newCamp.id);
                }}
              />
            )}

            {activeTab === 'history' && (
              <Dashboard
                campaigns={campaigns}
                onSelectCampaign={(id) => setSelectedCampaignId(id)}
                onRefresh={fetchCampaignsList}
                isRefreshing={isRefreshing}
              />
            )}

            {activeTab === 'guide' && (
              <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 sm:p-8 space-y-8">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">
                    ScoutTool — Technical Architecture &amp; System Guide
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    System specifications, public website crawling mechanisms, SSRF controls, and outreach standards.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
                    <h3 className="font-semibold text-neutral-900 dark:text-white text-xs flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      1. Public Website Scraping Engine
                    </h3>
                    <p>
                      ScoutTool takes target domains, verifies protocol correctness, and crawls public pages (Contact, About, Team, Support). It parses HTML DOM trees, extracts <code>mailto:</code> attributes and visible plaintext addresses, normalizes case, and strips duplicates.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
                    <h3 className="font-semibold text-neutral-900 dark:text-white text-xs flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      2. SSRF Protection &amp; Robots Politeness
                    </h3>
                    <p>
                      Internal IP ranges (RFC 1918), loopback interfaces (127.0.0.1), carrier NAT, and cloud metadata endpoints (169.254.169.254) are filtered and blocked before any HTTP connection is attempted. Polite <code>robots.txt</code> path checking prevents unauthorized indexing.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
                    <h3 className="font-semibold text-neutral-900 dark:text-white text-xs flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      3. Data Attribution &amp; Export Formats
                    </h3>
                    <p>
                      Every discovered contact is mapped with its verified source URL. Results can be filtered, verified, and exported into RFC 4180 compliant CSV format, plaintext TXT lists, or staged directly into Send Lists for personalized email campaigns.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 space-y-1.5">
                    <h3 className="font-semibold text-neutral-900 dark:text-white text-xs flex items-center gap-2">
                      <Send className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      4. Paced Outreach &amp; Deliverability
                    </h3>
                    <p>
                      Outbound sequences inject dynamic tags (<code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>), enforce anti-spam pacing intervals, and adhere to CAN-SPAM opt-out standards to maintain high inbox deliverability.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-400 dark:text-neutral-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span>Official Application: ScoutTool</span>
                  <span className="text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                    Lead Intelligence &amp; Outreach Platform
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Clean Technical Footer */}
      <footer className="border-t border-neutral-200/80 dark:border-neutral-800/80 py-4 px-4 sm:px-6 text-xs text-neutral-400 dark:text-neutral-500 bg-white/50 dark:bg-[#090A0F]/50 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">ScoutTool</span>
            <span>·</span>
            <span>Lead Intelligence &amp; Outreach Engine</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span>© {new Date().getFullYear()}</span>
            <span>·</span>
            <span className="font-mono">SSRF Enforced</span>
            <span>·</span>
            <span>Verified Public Inboxes</span>
          </div>
        </div>
      </footer>

      {/* Mobile App Dock for touch screens */}
      {isAppMode && (
        <div className="md:hidden">
          <MobileAppDock
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            scrapedCount={scrapedRecipients?.length || 0}
            campaignsCount={campaigns.length}
            onHaptic={() => triggerHaptic(12)}
          />
        </div>
      )}
    </div>
  );
}

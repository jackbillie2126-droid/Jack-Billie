import React from 'react';
import { User } from '../lib/firebase.js';
import { 
  Sun, Moon, Radar, Radio, Shield, 
  ExternalLink, LogOut, User as UserIcon
} from 'lucide-react';
import AuthModal from './AuthModal.js';
import VercelDeploymentModal from './VercelDeploymentModal.js';
import { scoutMusic } from '../lib/scoutMusic.js';

interface HeaderProps {
  user: User | null;
  onLoginSuccess: (user: User, token: string) => void;
  onLogoutSuccess: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  activeTab?: 'scraper' | 'composer' | 'history' | 'guide';
  onSelectTab?: (tab: 'scraper' | 'composer' | 'history' | 'guide') => void;
  scoutMode?: boolean;
  onToggleScoutMode?: () => void;
  onToggleMusic?: () => void;
  isMusicPlaying?: boolean;
}

export default function Header({ 
  user, 
  onLoginSuccess, 
  onLogoutSuccess, 
  theme, 
  onToggleTheme,
  activeTab = 'scraper',
  onSelectTab,
  scoutMode = true,
  onToggleScoutMode,
  onToggleMusic,
  isMusicPlaying = false
}: HeaderProps) {
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [showVercelModal, setShowVercelModal] = React.useState(false);
  const [isPlayingMusic, setIsPlayingMusic] = React.useState(scoutMusic.isPlaying());

  React.useEffect(() => {
    return scoutMusic.subscribe((playing) => {
      setIsPlayingMusic(playing);
    });
  }, []);

  return (
    <header className="bg-white/95 dark:bg-[#0c0e12]/95 backdrop-blur-md border-b border-neutral-200/80 dark:border-neutral-800/80 sticky top-0 z-40 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button 
            type="button"
            onClick={() => onSelectTab?.('scraper')}
            className="flex items-center gap-2 text-left cursor-pointer group"
          >
            <div className="h-7 w-7 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-black text-xs tracking-tighter">
              S<span className="text-blue-500">T</span>
            </div>
            <span className="font-bold text-sm tracking-tight text-neutral-900 dark:text-white">
              ScoutTool
            </span>
          </button>
          <span className="hidden sm:inline-block text-neutral-300 dark:text-neutral-700">/</span>
          <span className="hidden sm:inline-block text-xs font-mono text-neutral-400 dark:text-neutral-500">
            intel · v2.4
          </span>
        </div>

        {/* Zone 2: Navigation Links (Clean text, no pill badges) */}
        {onSelectTab && (
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => onSelectTab('scraper')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'scraper'
                  ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800/70'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Find Emails
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('composer')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'composer'
                  ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800/70'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Send Emails
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('history')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800/70'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Campaigns
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('guide')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'guide'
                  ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800/70'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Help &amp; Docs
            </button>
          </nav>
        )}

        {/* Zone 3: Actions & Account */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Vercel & SEO Deployment Guide */}
          <button
            type="button"
            onClick={() => setShowVercelModal(true)}
            title="Vercel Deployment & Google Indexing Guide"
            className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="text-[11px] font-mono">▲</span>
            <span className="hidden sm:inline">Vercel &amp; SEO</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle theme"
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors flex items-center justify-center cursor-pointer"
          >
            {theme === 'light' ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Sender Account Status / Auth Button */}
          {user ? (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/60 text-neutral-800 dark:text-neutral-200 text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="max-w-[120px] truncate hidden sm:inline font-mono text-[11px]">
                {user.email || 'Connected'}
              </span>
              <span className="sm:hidden font-mono text-[11px]">Active</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="h-8 px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span>Connect Sender</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth & Diagnostic Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={user}
        onAuthSuccess={(authedUser, token) => {
          onLoginSuccess(authedUser, token);
          setShowAuthModal(false);
        }}
        onLogoutSuccess={() => {
          onLogoutSuccess();
          setShowAuthModal(false);
        }}
      />

      {/* Vercel Deployment & SEO Guide Modal */}
      <VercelDeploymentModal
        isOpen={showVercelModal}
        onClose={() => setShowVercelModal(false)}
      />
    </header>
  );
}

import React from 'react';
import { Globe, Send, List, BookOpen, Layers } from 'lucide-react';

interface MobileAppDockProps {
  activeTab: 'scraper' | 'composer' | 'history' | 'guide';
  onSelectTab: (tab: 'scraper' | 'composer' | 'history' | 'guide') => void;
  scrapedCount?: number;
  campaignsCount?: number;
  onHaptic?: () => void;
}

export default function MobileAppDock({
  activeTab,
  onSelectTab,
  scrapedCount = 0,
  campaignsCount = 0,
  onHaptic
}: MobileAppDockProps) {
  const tabs = [
    {
      id: 'scraper' as const,
      label: 'Scraper',
      icon: Globe,
      badge: null,
    },
    {
      id: 'composer' as const,
      label: 'Outreach',
      icon: Send,
      badge: scrapedCount > 0 ? scrapedCount : null,
    },
    {
      id: 'history' as const,
      label: 'Campaigns',
      icon: List,
      badge: campaignsCount > 0 ? campaignsCount : null,
    },
    {
      id: 'guide' as const,
      label: 'Guide',
      icon: BookOpen,
      badge: null,
    },
  ];

  return (
    <nav
      id="mobile_app_dock"
      aria-label="Mobile App Navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#0c0e12]/95 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 px-2 py-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg transition-transform duration-200"
    >
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onHaptic?.();
                onSelectTab(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center py-1.5 px-2 rounded-lg transition-all cursor-pointer select-none active:scale-95 ${
                isActive
                  ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800/80'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <div className="relative">
                <Icon className={`h-4 w-4 transition-transform duration-150 ${isActive ? 'scale-105' : ''}`} />
                {tab.badge !== null && (
                  <span className="absolute -top-1.5 -right-2 h-3.5 min-w-3.5 px-1 rounded-full bg-blue-600 text-white text-[8px] font-bold font-mono flex items-center justify-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

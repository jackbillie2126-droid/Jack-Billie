import React from 'react';
import { 
  Download, Smartphone, Monitor, CheckCircle, X, Sparkles, 
  ExternalLink, ArrowRight, ShieldCheck, Share, PlusSquare, HelpCircle
} from 'lucide-react';

interface InstallPromptProps {
  onInstalled?: () => void;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstallable, setIsInstallable] = React.useState(false);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const [platform, setPlatform] = React.useState<'android' | 'ios' | 'desktop' | 'other'>('other');

  React.useEffect(() => {
    // Detect if already installed (standalone mode)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect user platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/android/i.test(userAgent)) {
      setPlatform('android');
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      setPlatform('ios');
    } else if (/windows|macintosh|linux/i.test(userAgent)) {
      setPlatform('desktop');
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser's mini-infobar on mobile
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('[PWA] ScoutTool was successfully installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    deferredPrompt,
    isInstallable,
    isInstalled,
    platform,
    triggerInstall,
  };
}

export default function InstallPromptModal({
  isOpen,
  onClose,
  onInstalled
}: {
  isOpen: boolean;
  onClose: () => void;
  onInstalled?: () => void;
}) {
  const { deferredPrompt, isInstallable, isInstalled, platform, triggerInstall } = usePWAInstall();
  const [installSuccess, setInstallSuccess] = React.useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      const accepted = await triggerInstall();
      if (accepted) {
        setInstallSuccess(true);
        onInstalled?.();
        setTimeout(() => {
          onClose();
        }, 1800);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative animate-in fade-in duration-150">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon & App Title */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-bold text-sm shrink-0">
            ST
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              Install ScoutTool App
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Desktop &amp; Mobile Web Client
            </p>
          </div>
        </div>

        {installSuccess || isInstalled ? (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-center space-y-2">
            <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <h4 className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              ScoutTool Installed Successfully
            </h4>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Launch ScoutTool directly from your home screen or application launcher.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Value Highlights */}
            <div className="space-y-2 text-xs text-neutral-600 dark:text-neutral-300">
              <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-100 dark:border-neutral-800">
                <Smartphone className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Mobile Standalone:</strong> Fullscreen execution without browser chrome.
                </span>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-100 dark:border-neutral-800">
                <Monitor className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Desktop App:</strong> Run as a dedicated dock application on Mac, Windows, or Linux.
                </span>
              </div>
            </div>

            {/* Platform-Specific Install Flow */}
            {platform === 'ios' ? (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs space-y-1.5">
                <p className="font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <Share className="h-3.5 w-3.5" /> How to install on iOS Safari:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                  <li>Tap <strong>Share</strong> in Safari toolbar.</li>
                  <li>Select <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top right corner.</li>
                </ol>
              </div>
            ) : deferredPrompt || isInstallable ? (
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install Application</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs space-y-1">
                  <p className="font-semibold text-neutral-900 dark:text-white">
                    Browser Installation
                  </p>
                  <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    Click the <strong>Install icon (⊕)</strong> in your browser address bar or menu.
                  </p>
                </div>

                <a
                  href="/?source=pwa"
                  onClick={onClose}
                  className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 text-center"
                >
                  <span>Continue in Standalone Mode</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
          <span className="font-mono">PWA · v2.4</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:underline cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

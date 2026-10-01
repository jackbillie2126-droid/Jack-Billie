import React from 'react';

export function useAppMode() {
  const [isStandalone, setIsStandalone] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isPWA = 
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      window.location.search.includes('source=pwa') ||
      window.location.search.includes('mode=app');
    return isPWA;
  });

  const [isOnline, setIsOnline] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.navigator.onLine;
  });

  // User manual view switch (can force App mode or Browser mode)
  const [userModeOverride, setUserModeOverride] = React.useState<'auto' | 'app' | 'browser'>('auto');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const isPWA = 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://') ||
        window.location.search.includes('source=pwa') ||
        window.location.search.includes('mode=app');
      setIsStandalone(isPWA);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener?.('change', checkStandalone);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mediaQuery.removeEventListener?.('change', checkStandalone);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isAppMode = userModeOverride === 'app' ? true : userModeOverride === 'browser' ? false : isStandalone;

  const triggerHaptic = (pattern: number | number[] = 12) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in window.navigator) {
        window.navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors
    }
  };

  return {
    isAppMode,
    isStandalone,
    isOnline,
    userModeOverride,
    setUserModeOverride,
    triggerHaptic,
  };
}

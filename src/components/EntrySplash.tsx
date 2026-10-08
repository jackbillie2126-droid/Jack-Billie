import React from 'react';
import { Compass, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface EntrySplashProps {
  onComplete: () => void;
  durationSeconds?: number;
}

export default function EntrySplash({ onComplete, durationSeconds = 30 }: EntrySplashProps) {
  const [secondsRemaining, setSecondsRemaining] = React.useState(durationSeconds);
  const [progress, setProgress] = React.useState(0);
  const [isFading, setIsFading] = React.useState(false);

  const statusMessages = [
    'Initializing high-depth lead discovery engine...',
    'Loading deep email & Cloudflare XOR decoders...',
    'Calibrating inbox deliverability & spam filters...',
    'Syncing Google Workspace outreach engine...',
    'Connecting to verified lead channels...',
    'Preparing ScoutTool dashboard...'
  ];

  const currentStatusIndex = Math.min(
    Math.floor(((durationSeconds - secondsRemaining) / durationSeconds) * statusMessages.length),
    statusMessages.length - 1
  );

  React.useEffect(() => {
    const startTime = Date.now();
    const totalMs = durationSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));

      setProgress(pct);
      setSecondsRemaining(remaining);

      if (elapsed >= totalMs) {
        clearInterval(interval);
        handleFinish();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [durationSeconds]);

  const handleFinish = () => {
    setIsFading(true);
    setTimeout(() => {
      onComplete();
    }, 500);
  };

  return (
    <div
      className={`fixed inset-0 z-[99999] bg-[#090A0F] text-white flex flex-col items-center justify-between p-6 sm:p-10 transition-opacity duration-500 selection:bg-indigo-500 selection:text-white ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Subtle top indicator */}
      <div className="w-full flex items-center justify-between max-w-2xl text-xs text-neutral-500 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>SCOUTTOOL SYSTEM ONLINE</span>
        </div>
        <div className="flex items-center gap-1.5 text-neutral-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>v2.4 Production Engine</span>
        </div>
      </div>

      {/* Main Center Logo & Identity */}
      <div className="flex flex-col items-center text-center max-w-md w-full my-auto space-y-6">
        {/* Glow & Logo Badge */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-blue-500/20 rounded-full blur-2xl animate-pulse"></div>
          
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-[#1e1b4b] via-[#2e1065] to-[#0f172a] border border-indigo-500/40 shadow-2xl shadow-indigo-500/30 flex items-center justify-center">
            {/* Spinning ring animation */}
            <div className="absolute inset-0 rounded-3xl border border-indigo-400/20 animate-spin" style={{ animationDuration: '15s' }}></div>
            
            <div className="relative">
              <Compass className="w-12 h-12 sm:w-14 sm:h-14 text-indigo-400 drop-shadow-[0_0_12px_rgba(129,140,248,0.7)] animate-pulse" />
            </div>
          </div>
        </div>

        {/* Brand Name & Subtitle */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
            <span>ScoutTool</span>
            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 font-normal">
            Lead Intelligence &amp; Autonomous Outreach Engine
          </p>
        </div>

        {/* 30-Second Countdown & Progress Box */}
        <div className="w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-inner space-y-3.5 backdrop-blur-sm">
          {/* Progress Bar */}
          <div className="w-full bg-neutral-800/80 rounded-full h-2 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 rounded-full transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(99,102,241,0.6)]"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
            <span className="truncate pr-2 text-indigo-300 font-sans text-xs">
              {statusMessages[currentStatusIndex]}
            </span>
            <span className="font-semibold text-white whitespace-nowrap bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-700/60">
              {secondsRemaining}s
            </span>
          </div>
        </div>

        {/* Action Skip Button if user wants to enter before 30s ends */}
        <div className="pt-2">
          <button
            onClick={handleFinish}
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 cursor-pointer"
          >
            <span>Enter ScoutTool Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Footer Note */}
      <div className="w-full max-w-2xl text-center text-xs text-neutral-500">
        <span>Displaying ScoutTool launch entry • Auto-launching in {secondsRemaining} seconds</span>
      </div>
    </div>
  );
}

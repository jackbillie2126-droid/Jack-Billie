import React from 'react';
import { Volume2, VolumeX, Mic, Radio, Play } from 'lucide-react';
import { 
  subscribeVoiceState, 
  subscribeMuteState, 
  getIsMuted, 
  toggleMute, 
  speak, 
  VoiceActions 
} from '../lib/voiceNarrator.ts';

export default function VoiceIndicator() {
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [spokenText, setSpokenText] = React.useState('');
  const [isMuted, setIsMuted] = React.useState(getIsMuted());

  React.useEffect(() => {
    const unsubState = subscribeVoiceState((speaking, text) => {
      setIsSpeaking(speaking);
      setSpokenText(text);
    });
    const unsubMute = subscribeMuteState((muted) => {
      setIsMuted(muted);
    });
    return () => {
      unsubState();
      unsubMute();
    };
  }, []);

  return (
    <div className="inline-flex items-center gap-2 bg-indigo-50/90 dark:bg-slate-800/80 border border-indigo-100 dark:border-slate-700/80 px-3 py-1.5 rounded-full text-xs transition-all shadow-xs">
      <button
        type="button"
        onClick={() => toggleMute()}
        className={`flex items-center gap-1.5 font-bold transition-colors cursor-pointer ${
          isMuted 
            ? 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300' 
            : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200'
        }`}
        title={isMuted ? 'AI Voice Narrator Muted (Click to Unmute)' : 'AI Voice Narrator Active (Click to Mute)'}
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <Volume2 className={`h-4 w-4 shrink-0 ${isSpeaking ? 'text-indigo-600 dark:text-indigo-400 animate-pulse' : ''}`} />
        )}

        <span className="text-[11px] font-bold tracking-tight">
          {isMuted ? 'Voice Muted' : isSpeaking ? 'AI Speaking...' : 'AI Voice On'}
        </span>
      </button>

      {/* Animated Equalizer Visualizer when speaking */}
      {!isMuted && isSpeaking && (
        <div className="flex items-center gap-0.5 h-3 px-1">
          <span className="w-0.5 h-full bg-indigo-500 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
          <span className="w-0.5 h-full bg-indigo-600 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
          <span className="w-0.5 h-full bg-purple-500 rounded-full animate-[bounce_0.6s_infinite_200ms]" />
          <span className="w-0.5 h-full bg-indigo-400 rounded-full animate-[bounce_0.6s_infinite_400ms]" />
        </div>
      )}

      {/* Test / Replay welcome audio button */}
      <button
        type="button"
        onClick={() => VoiceActions.welcome()}
        className="text-[10px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 font-semibold px-1.5 py-0.5 rounded hover:bg-indigo-100/50 dark:hover:bg-slate-700 transition-all flex items-center gap-1 cursor-pointer"
        title="Replay Welcome Speech"
      >
        <Play className="h-2.5 w-2.5" />
        <span>Replay</span>
      </button>
    </div>
  );
}

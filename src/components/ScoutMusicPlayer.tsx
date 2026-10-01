import React from 'react';
import { 
  Play, Pause, SkipForward, Volume2, VolumeX, Volume1, 
  Radio, ChevronDown, ChevronUp
} from 'lucide-react';
import { scoutMusic, ScoutTrack, SCOUT_TRACKS } from '../lib/scoutMusic';

interface ScoutMusicPlayerProps {
  className?: string;
}

export default function ScoutMusicPlayer({ className = '' }: ScoutMusicPlayerProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [track, setTrack] = React.useState<ScoutTrack>(scoutMusic.getCurrentTrack());
  const [volume, setVolume] = React.useState(scoutMusic.getVolume());
  const [isMuted, setIsMuted] = React.useState(false);
  const [prevVolume, setPrevVolume] = React.useState(0.5);
  const [isExpanded, setIsExpanded] = React.useState(false);

  React.useEffect(() => {
    return scoutMusic.subscribe((playing, currentTrack, vol) => {
      setIsPlaying(playing);
      setTrack(currentTrack);
      setVolume(vol);
      if (vol > 0) setIsMuted(false);
    });
  }, []);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    scoutMusic.toggle();
  };

  const handleNextTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    scoutMusic.nextTrack();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    scoutMusic.setVolume(val);
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMuted || volume === 0) {
      const restored = prevVolume > 0 ? prevVolume : 0.5;
      setIsMuted(false);
      setVolume(restored);
      scoutMusic.setVolume(restored);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
      setVolume(0);
      scoutMusic.setVolume(0);
    }
  };

  return (
    <div className={`rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111318] transition-all overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2">
        {/* Play/Pause & Track Metadata */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              isPlaying
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
            }`}
            title={isPlaying ? 'Pause' : 'Play Focus Audio'}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 ml-0.5" />
            )}
          </button>

          <div className="min-w-0 truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                {track.title}
              </span>
              {isPlaying && (
                <span className="flex items-center gap-0.5 h-2.5 shrink-0">
                  <span className="w-0.5 h-1.5 bg-blue-500 animate-pulse" />
                  <span className="w-0.5 h-2.5 bg-blue-500 animate-pulse delay-75" />
                  <span className="w-0.5 h-1 bg-blue-500 animate-pulse delay-150" />
                </span>
              )}
            </div>
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
              {track.genre} · {track.bpm} BPM · Web Audio Synth
            </div>
          </div>
        </div>

        {/* Controls: Skip, Volume, Tracklist toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleNextTrack}
            title="Next Track"
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-1 pl-1.5 border-l border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : volume < 0.5 ? (
                <Volume1 className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              aria-label="Audio Volume"
              className="w-14 sm:w-16 h-1 bg-neutral-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
            title="Toggle playlist"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Tracklist */}
      {isExpanded && (
        <div className="px-3.5 py-2.5 border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/40 text-xs space-y-1">
          <div className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 tracking-wider">
            Synthesized Focus Channels
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
            {SCOUT_TRACKS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id !== track.id) {
                    scoutMusic.selectTrack(t.id);
                  }
                  if (!isPlaying) {
                    scoutMusic.play();
                  }
                }}
                className={`text-left p-1.5 px-2 rounded-md transition-colors cursor-pointer flex items-center justify-between ${
                  t.id === track.id
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="truncate">{t.title}</span>
                <span className="text-[10px] opacity-70 font-mono shrink-0 ml-1.5">
                  {t.bpm} BPM
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ScoutTool Royalty-Free Ambient Music Engine
// Uses Web Audio API for zero-bandwidth, copyright-free, relaxing focus tracks.
// Strictly OFF by default, no autoplay without user interaction.

export interface ScoutTrack {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  description: string;
  chords: number[][]; // Frequencies in Hz
}

export const SCOUT_TRACKS: ScoutTrack[] = [
  {
    id: 'deep-focus',
    title: 'Deep Focus Lo-Fi',
    genre: 'Lo-Fi Chill',
    bpm: 72,
    description: 'Warm electric chords & gentle tape warmth for deep prospecting',
    // Fmaj7 -> Em7 -> Dm7 -> Cmaj7
    chords: [
      [174.61, 220.0, 261.63, 329.63], // F3, A3, C4, E4
      [164.81, 196.0, 246.94, 293.66], // E3, G3, B3, D4
      [146.83, 174.61, 220.0, 261.63], // D3, F3, A3, C4
      [130.81, 164.81, 196.0, 246.94], // C3, E3, G3, B3
    ],
  },
  {
    id: 'coffee-shop',
    title: 'Coffee Shop Ambient',
    genre: 'Neo-Soul Vibe',
    bpm: 68,
    description: 'Relaxed acoustic Rhodes chords and soft cafe background tones',
    // Abmaj7 -> Gm7 -> Fm7 -> Ebmaj7
    chords: [
      [207.65, 261.63, 311.13, 392.00], // Ab3, C4, Eb4, G4
      [196.00, 233.08, 293.66, 349.23], // G3, Bb3, D4, F4
      [174.61, 207.65, 261.63, 311.13], // F3, Ab3, C4, Eb4
      [155.56, 196.00, 233.08, 293.66], // Eb3, G3, Bb3, D4
    ],
  },
  {
    id: 'cosmic-prospector',
    title: 'Cosmic Prospector',
    genre: 'Ambient Space Pad',
    bpm: 60,
    description: 'Ethereal synth textures & celestial pentatonic harmonies',
    // Dmaj9 -> Bm9 -> Gmaj9 -> A7sus4
    chords: [
      [146.83, 220.0, 277.18, 329.63], // D3, A3, C#4, E4
      [123.47, 185.0, 220.0, 277.18],  // B2, F#3, A3, C#4
      [98.00, 146.83, 196.0, 246.94],  // G2, D3, G3, B3
      [110.00, 164.81, 220.0, 293.66], // A2, E3, A3, D4
    ],
  },
  {
    id: 'midnight-hunter',
    title: 'Midnight Hunter',
    genre: 'Downtempo Synth',
    bpm: 78,
    description: 'Subtle low-pass bass pulse and shimmering nighttime bells',
    // Am7 -> D9 -> Fmaj7 -> Em7
    chords: [
      [110.0, 164.81, 220.0, 261.63],  // A2, E3, A3, C4
      [146.83, 220.0, 277.18, 329.63], // D3, A3, C#4, E4
      [174.61, 220.0, 261.63, 329.63], // F3, A3, C4, E4
      [164.81, 196.0, 246.94, 293.66], // E3, G3, B3, D4
    ],
  },
];

class ScoutMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private currentTrackIndex = 0;
  private volume = 0.5;
  private isPlayingState = false;
  private stepInterval: any = null;
  private currentChordIndex = 0;
  private activeVoices: OscillatorNode[] = [];
  private listeners: Set<(playing: boolean, track: ScoutTrack, vol: number) => void> = new Set();

  constructor() {
    // Restore saved settings
    try {
      const savedVol = localStorage.getItem('scout_music_volume');
      if (savedVol !== null) {
        this.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
      }
      const savedTrack = localStorage.getItem('scout_music_track_idx');
      if (savedTrack !== null) {
        const idx = parseInt(savedTrack, 10);
        if (idx >= 0 && idx < SCOUT_TRACKS.length) {
          this.currentTrackIndex = idx;
        }
      }
    } catch {
      // localStorage fallback
    }
  }

  public subscribe(cb: (playing: boolean, track: ScoutTrack, vol: number) => void) {
    this.listeners.add(cb);
    cb(this.isPlayingState, SCOUT_TRACKS[this.currentTrackIndex], this.volume);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const track = SCOUT_TRACKS[this.currentTrackIndex];
    this.listeners.forEach(cb => cb(this.isPlayingState, track, this.volume));
  }

  private initAudio() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume * 0.28, this.ctx.currentTime); // Soft background level

      // Lo-Fi Lowpass Filter for warmth
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(950, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.2, this.ctx.currentTime);

      this.filterNode.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
  }

  public async play(): Promise<void> {
    this.initAudio();
    if (!this.ctx || !this.masterGain || !this.filterNode) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isPlayingState = true;
    this.notify();

    this.startSequencer();
  }

  public pause(): void {
    this.isPlayingState = false;
    this.stopActiveNotes();
    if (this.stepInterval) {
      clearInterval(this.stepInterval);
      this.stepInterval = null;
    }
    this.notify();
  }

  public toggle(): void {
    if (this.isPlayingState) {
      this.pause();
    } else {
      this.play();
    }
  }

  public nextTrack(): void {
    this.currentTrackIndex = (this.currentTrackIndex + 1) % SCOUT_TRACKS.length;
    try {
      localStorage.setItem('scout_music_track_idx', this.currentTrackIndex.toString());
    } catch {}

    if (this.isPlayingState) {
      this.stopActiveNotes();
      this.currentChordIndex = 0;
      this.playChordStep();
    }
    this.notify();
  }

  public selectTrack(trackId: string): void {
    const idx = SCOUT_TRACKS.findIndex(t => t.id === trackId);
    if (idx !== -1) {
      this.currentTrackIndex = idx;
      try {
        localStorage.setItem('scout_music_track_idx', this.currentTrackIndex.toString());
      } catch {}

      if (this.isPlayingState) {
        this.stopActiveNotes();
        this.currentChordIndex = 0;
        this.playChordStep();
      }
      this.notify();
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('scout_music_volume', this.volume.toString());
    } catch {}

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.28, this.ctx.currentTime, 0.05);
    }
    this.notify();
  }

  public getVolume(): number {
    return this.volume;
  }

  public isPlaying(): boolean {
    return this.isPlayingState;
  }

  public getCurrentTrack(): ScoutTrack {
    return SCOUT_TRACKS[this.currentTrackIndex];
  }

  private stopActiveNotes() {
    this.activeVoices.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeVoices = [];
  }

  private startSequencer() {
    if (this.stepInterval) clearInterval(this.stepInterval);

    this.currentChordIndex = 0;
    this.playChordStep();

    const track = SCOUT_TRACKS[this.currentTrackIndex];
    // Each chord lasts for 4 beats
    const chordDurationMs = (60 / track.bpm) * 4 * 1000;

    this.stepInterval = setInterval(() => {
      if (!this.isPlayingState) return;
      this.currentChordIndex = (this.currentChordIndex + 1) % track.chords.length;
      this.playChordStep();
    }, chordDurationMs);
  }

  private playChordStep() {
    if (!this.ctx || !this.filterNode || !this.isPlayingState) return;
    const track = SCOUT_TRACKS[this.currentTrackIndex];
    const chord = track.chords[this.currentChordIndex];
    const now = this.ctx.currentTime;
    const duration = (60 / track.bpm) * 3.8;

    this.stopActiveNotes();

    chord.forEach((freq, idx) => {
      if (!this.ctx || !this.filterNode) return;
      try {
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        // Waveform: warm sine + triangle for mellow lo-fi richness
        osc.type = idx === 0 ? 'sine' : idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        // Soft slow envelope (attack 0.4s, gentle sustain, soft release)
        noteGain.gain.setValueAtTime(0.001, now);
        noteGain.gain.linearRampToValueAtTime(0.12 / Math.sqrt(chord.length), now + 0.35);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(noteGain);
        noteGain.connect(this.filterNode);

        osc.start(now);
        osc.stop(now + duration);

        this.activeVoices.push(osc);
      } catch {}
    });

    // Add gentle melodic pentatonic shimmer note
    if (Math.random() > 0.3) {
      const chimeFreq = chord[chord.length - 1] * 2;
      try {
        const chime = this.ctx.createOscillator();
        const chimeGain = this.ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(chimeFreq, now + 1.2);
        chimeGain.gain.setValueAtTime(0.001, now + 1.2);
        chimeGain.gain.linearRampToValueAtTime(0.04, now + 1.3);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

        chime.connect(chimeGain);
        chimeGain.connect(this.filterNode);
        chime.start(now + 1.2);
        chime.stop(now + 2.6);
        this.activeVoices.push(chime);
      } catch {}
    }
  }
}

export const scoutMusic = new ScoutMusicEngine();

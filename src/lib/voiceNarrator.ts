// Voice Narrator utility using Web Speech API with event listener support for UI visual animations

type VoiceStateListener = (isSpeaking: boolean, lastSpokenText: string) => void;
type MuteStateListener = (isMuted: boolean) => void;

let isMutedState = true;
if (typeof window !== 'undefined') {
  const storedMute = localStorage.getItem('voice_narrator_muted');
  isMutedState = storedMute !== 'false'; // Muted by default unless explicitly unmuted
}

let isSpeakingState = false;
let currentText = '';
const stateListeners: Set<VoiceStateListener> = new Set();
const muteListeners: Set<MuteStateListener> = new Set();

function notifyStateChange() {
  stateListeners.forEach(listener => listener(isSpeakingState, currentText));
}

function notifyMuteChange() {
  muteListeners.forEach(listener => listener(isMutedState));
}

export function subscribeVoiceState(listener: VoiceStateListener): () => void {
  stateListeners.add(listener);
  // Send initial state
  listener(isSpeakingState, currentText);
  return () => {
    stateListeners.delete(listener);
  };
}

export function subscribeMuteState(listener: MuteStateListener): () => void {
  muteListeners.add(listener);
  listener(isMutedState);
  return () => {
    muteListeners.delete(listener);
  };
}

export function getIsMuted(): boolean {
  return isMutedState;
}

export function setIsMuted(muted: boolean) {
  isMutedState = muted;
  if (typeof window !== 'undefined') {
    localStorage.setItem('voice_narrator_muted', String(muted));
  }
  if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    isSpeakingState = false;
    notifyStateChange();
  }
  notifyMuteChange();
}

export function toggleMute(): boolean {
  setIsMuted(!isMutedState);
  return isMutedState;
}

// Track last spoken text to avoid duplicate speech spamming within short intervals
let lastSpokenText = '';
let lastSpokenTime = 0;

export function speak(text: string, options: { force?: boolean; rate?: number; pitch?: number } = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis API not supported in this environment');
    return;
  }

  if (isMutedState && !options.force) {
    return;
  }

  const now = Date.now();
  // Prevent repeating exact same text within 1.2s unless forced
  if (text === lastSpokenText && now - lastSpokenTime < 1200 && !options.force) {
    return;
  }

  lastSpokenText = text;
  lastSpokenTime = now;

  try {
    // Cancel any active utterance so we give instant voice feedback on user actions
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate || 1.05; // Slightly lively rate
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = 1.0;

    // Try finding a clean English voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const preferredVoice = voices.find(
        v => (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel') || v.lang.startsWith('en')) && v.lang.includes('US')
      ) || voices.find(v => v.lang.startsWith('en'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }

    utterance.onstart = () => {
      isSpeakingState = true;
      currentText = text;
      notifyStateChange();
    };

    utterance.onend = () => {
      isSpeakingState = false;
      notifyStateChange();
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      isSpeakingState = false;
      notifyStateChange();
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('Failed to trigger speech synthesis:', err);
    isSpeakingState = false;
    notifyStateChange();
  }
}

// Convenience voice actions
export const VoiceActions = {
  welcome: () => speak('Welcome to Scpout and Send, login to proceed'),
  loginSuccess: () => speak('Logged in successfully! Welcome to Scpout and Send.'),
  emailInserted: () => speak('Email inserted'),
  linkInserted: () => speak('Target URL inserted'),
  campaignNameSet: () => speak('Campaign name set'),
  nicheSelected: () => speak('Niche selected'),
  mergeTagInserted: () => speak('Merge tag inserted'),
  csvUploaded: () => speak('CSV file uploaded and parsed'),
  composerOpened: () => speak('Composer opened'),
  dashboardOpened: () => speak('Dashboard opened'),
  campaignLaunched: () => speak('Outreach campaign launched'),
  gmailSentCongrats: () => speak('Gmail sent congrats!'),
  scraperOpened: () => speak('Scoutool bulk email scraper opened'),
  websiteListInserted: () => speak('Website links inserted'),
  scrapingStarted: () => speak('Website email scraping started'),
  scrapingCompleted: (count: number) => speak(`Scraping finished. ${count} email${count === 1 ? '' : 's'} found.`),
  emailsExportedToComposer: (count: number) => speak(`Exported ${count} scraped contact${count === 1 ? '' : 's'} to email sender`),
  csvDownloaded: () => speak('Scraped results CSV downloaded'),
  emailsFiltered: (goodCount: number, badCount: number) => 
    speak(badCount > 0 
      ? `Email filter active. ${goodCount} good email${goodCount === 1 ? '' : 's'} ready, ${badCount} bad or PNG item${badCount === 1 ? '' : 's'} filtered.`
      : `All ${goodCount} emails verified and good to send.`
    ),
  badEmailsCleaned: (removedCount: number) => 
    speak(`Cleaned ${removedCount} invalid items. Only valid good emails retained.`),
};

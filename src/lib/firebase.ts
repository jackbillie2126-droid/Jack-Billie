import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  hasGmailSendScope?: boolean;
}

export interface AppPasswordSenderConfig {
  email: string;
  appPassword: string; // 16-character Google App Password
  senderName?: string;
  isActive: boolean;
}

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

// Persistent auth and token management for ScoutTool
const SESSION_STORAGE_KEY = 'scout_user_session';
const TOKEN_STORAGE_KEY = 'scout_access_token';
const TOKEN_EXPIRY_KEY = 'scout_token_expiry';
const HAS_GMAIL_SCOPE_KEY = 'scout_has_gmail_scope';
const APP_PASSWORD_CONFIG_KEY = 'scout_app_password_config';

let cachedAccessToken: string | null = null;
let cachedTokenExpiry: number | null = null;
let isSigningIn = false;

// Try to initialize token from session/local storage
if (typeof window !== 'undefined') {
  try {
    cachedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const expStr = localStorage.getItem(TOKEN_EXPIRY_KEY) || sessionStorage.getItem(TOKEN_EXPIRY_KEY);
    if (expStr) {
      cachedTokenExpiry = Number(expStr);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export function isTokenExpired(): boolean {
  if (!cachedAccessToken) return true;
  if (!cachedTokenExpiry) return false;
  return Date.now() > cachedTokenExpiry - 60000;
}

export function hasGmailSendingAuthorized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(HAS_GMAIL_SCOPE_KEY) === 'true';
}

export function getAppPasswordSender(): AppPasswordSenderConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(APP_PASSWORD_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAppPasswordSender(config: AppPasswordSenderConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APP_PASSWORD_CONFIG_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('sender-config-updated'));
}

export function removeAppPasswordSender(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(APP_PASSWORD_CONFIG_KEY);
  window.dispatchEvent(new CustomEvent('sender-config-updated'));
}

export async function testGmailConnection(token: string): Promise<{ valid: boolean; email?: string; error?: string; isAuthError?: boolean }> {
  if (!token) {
    return { valid: false, error: 'No Google OAuth token available. Please sign in with Google.', isAuthError: true };
  }

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `HTTP ${res.status} Authentication Failure`;
      return { valid: false, error: msg, isAuthError: true };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { valid: false, error: errData?.error?.message || `HTTP ${res.status}`, isAuthError: false };
    }

    const data = await res.json();
    return { valid: true, email: data.emailAddress };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Network connection failed while verifying Gmail credentials.', isAuthError: false };
  }
}

export const auth = {
  signOut: async () => {
    await logout();
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check if we already have a saved session in local storage for instant zero-flicker restoration
  if (typeof window !== 'undefined') {
    try {
      const storedSession = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (storedSession && onAuthSuccess) {
        const userObj: User = JSON.parse(storedSession);
        cachedAccessToken = storedToken || '';
        onAuthSuccess(userObj, cachedAccessToken);
      }
    } catch {
      // Continue to Firebase Auth observer
    }
  }

  return onAuthStateChanged(firebaseAuth, async (user) => {
    if (user) {
      const storedToken = cachedAccessToken || (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY) : null);
      const hasGmail = hasGmailSendingAuthorized();
      const userObj: User = {
        uid: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Authorized User',
        email: user.email,
        photoURL: user.photoURL,
        hasGmailSendScope: hasGmail
      };

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userObj));
        } catch {
          // Ignore
        }
      }

      if (onAuthSuccess) {
        onAuthSuccess(userObj, storedToken || '');
      }
    } else if (!isSigningIn) {
      let hasStoredSession = false;
      if (typeof window !== 'undefined') {
        try {
          hasStoredSession = Boolean(localStorage.getItem(SESSION_STORAGE_KEY));
        } catch {
          hasStoredSession = false;
        }
      }

      if (!hasStoredSession) {
        cachedAccessToken = null;
        cachedTokenExpiry = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const signInSandbox = (
  email = 'jackbillie.2126@gmail.com',
  name = 'Jack Billie'
): { user: User; accessToken: string } => {
  const userObj: User = {
    uid: 'sandbox_' + Math.random().toString(36).substring(2, 9),
    displayName: name,
    email: email,
    photoURL: null,
    hasGmailSendScope: true,
  };

  cachedAccessToken = 'sandbox_token_' + Math.random().toString(36).substring(2, 12);
  cachedTokenExpiry = Date.now() + 3600 * 1000 * 24; // 24 hours

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userObj));
      localStorage.setItem(TOKEN_STORAGE_KEY, cachedAccessToken);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(cachedTokenExpiry));
      localStorage.setItem(HAS_GMAIL_SCOPE_KEY, 'true');
    } catch {
      // Ignore
    }
  }

  return { user: userObj, accessToken: cachedAccessToken };
};

/**
 * Standard Google Sign-In: Requests standard identity scopes (email, profile).
 * By decoupling gmail.send from standard login, USERS NEVER GET "ACCESS BLOCKED"
 * when signing up or signing into ScoutTool.
 */
export const googleSignIn = async (
  requestGmailScope = false
): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');

    // Only add gmail.send if explicitly requested by user for outreach dispatch
    if (requestGmailScope) {
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
    }
    
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Auth.');
    }

    cachedAccessToken = credential.accessToken;
    // Expire 60s before 1 hour
    cachedTokenExpiry = Date.now() + 3540 * 1000;
    
    if (requestGmailScope) {
      localStorage.setItem(HAS_GMAIL_SCOPE_KEY, 'true');
    }

    const userObj: User = {
      uid: result.user.uid,
      displayName: result.user.displayName || result.user.email?.split('@')[0] || 'Authorized User',
      email: result.user.email,
      photoURL: result.user.photoURL,
      hasGmailSendScope: requestGmailScope || hasGmailSendingAuthorized(),
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userObj));
        localStorage.setItem(TOKEN_STORAGE_KEY, cachedAccessToken);
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(cachedTokenExpiry));
      } catch {
        // Ignore
      }
    }

    return { user: userObj, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign in error details:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Request Gmail Dispatch Scope specifically when ready to send campaigns
 */
export const requestGmailSendScope = async (): Promise<{ success: boolean; accessToken?: string; error?: string }> => {
  try {
    const result = await googleSignIn(true);
    if (result) {
      return { success: true, accessToken: result.accessToken };
    }
    return { success: false, error: 'Sign in was cancelled.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to authorize Gmail send scope' };
  }
};

export const getCachedToken = (): string | null => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    try {
      cachedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
      const expStr = localStorage.getItem(TOKEN_EXPIRY_KEY) || sessionStorage.getItem(TOKEN_EXPIRY_KEY);
      if (expStr) cachedTokenExpiry = Number(expStr);
    } catch {
      // Ignore
    }
  }
  return cachedAccessToken;
};

export const logout = async () => {
  try {
    await firebaseSignOut(firebaseAuth);
  } catch {
    // Ignore
  }
  cachedAccessToken = null;
  cachedTokenExpiry = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      localStorage.removeItem(HAS_GMAIL_SCOPE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch {
      // Ignore
    }
  }
};
